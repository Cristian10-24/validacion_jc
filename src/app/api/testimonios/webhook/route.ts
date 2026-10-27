import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { registrarRespuestas } from "@/lib/testimonios/registro";

// Webhook del Google Sheet de testimonios (lo llama el Apps Script).
// Protegido con TESTIMONIOS_WEBHOOK_SECRET en la cabecera X-Testimonios-Secret.
// Sin la variable configurada rechaza todo (503). Idempotente: reenviar una respuesta no la duplica.

const MAX_BYTES = 1024 * 1024; // 1 MB por petición
const Valor = z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]);
const Item = z.object({ fila: z.number().int().positive().max(1_000_000).nullable().optional(), respuesta: z.record(z.string().max(300), Valor) });
const Body = z.union([
  Item.strict(),                                               // una respuesta (activador "Al enviar el formulario")
  z.object({ respuestas: z.array(Item).min(1).max(500) }).strict(), // varias (carga inicial y reintentos)
]);

/** Compara el secreto en tiempo constante (también si las longitudes difieren). */
function secretoValido(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false;
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const esperado = process.env.TESTIMONIOS_WEBHOOK_SECRET;
  if (!esperado || esperado.length < 24) return NextResponse.json({ error: "no_configurado" }, { status: 503 });
  if (!secretoValido(req.headers.get("x-testimonios-secret"), esperado)) return NextResponse.json({ error: "no_autorizado" }, { status: 401 });

  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES) return NextResponse.json({ error: "muy_grande" }, { status: 413 });
  const texto = await req.text();
  if (texto.length > MAX_BYTES) return NextResponse.json({ error: "muy_grande" }, { status: 413 });

  let json: unknown;
  try { json = JSON.parse(texto); } catch { return NextResponse.json({ error: "json_invalido" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });

  const items = "respuestas" in parsed.data ? parsed.data.respuestas : [parsed.data];
  const resultados = await registrarRespuestas(items.map((i) => ({ respuesta: i.respuesta, fila: i.fila ?? null })));
  return NextResponse.json({
    ok: true,
    nuevas: resultados.filter((r) => r.estado === "nueva").length,
    duplicadas: resultados.filter((r) => r.estado === "duplicada").length,
    invalidas: resultados.filter((r) => r.estado === "invalida").length,
    resultados: resultados.map((r, i) => ({ fila: items[i].fila ?? null, ...r })),
  });
}
