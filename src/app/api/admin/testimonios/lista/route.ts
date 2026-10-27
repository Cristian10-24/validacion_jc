import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { readRowsFromBuffer } from "@/lib/excel";
import { aplicarLista, vistaPreviaLista } from "@/lib/testimonios/lista-aplicar";

const MAX_BYTES = 5 * 1024 * 1024;
const Eliminar = z.array(z.string().regex(/^[0-9a-f]{24}$/)).max(5000);

/**
 * Lista de participantes de testimonios (solo admin). multipart/form-data:
 *   archivo: .xlsx o .csv con Nombres, Apellidos, Celular, Correo, Documento y Ciudad
 *   modo: "vista" (no escribe nada) | "aplicar"
 *   eliminar: JSON con los ids de los ausentes que se deben borrar (solo en "aplicar")
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("testimonios_subir_lista");
  if (g.error) return g.error;

  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "archivo", mensaje: "Elige un archivo .xlsx o .csv." }, { status: 400 });
  if (!/\.(xlsx|csv)$/i.test(archivo.name)) return NextResponse.json({ error: "archivo", mensaje: "El archivo debe ser .xlsx o .csv." }, { status: 400 });
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: "archivo", mensaje: "El archivo pesa más de 5 MB." }, { status: 400 });

  let rows: Record<string, string>[];
  try {
    rows = await readRowsFromBuffer(Buffer.from(await archivo.arrayBuffer()), archivo.name);
  } catch {
    return NextResponse.json({ error: "archivo", mensaje: "No pudimos leer el archivo. Revisa que sea un Excel o CSV válido." }, { status: 400 });
  }
  if (rows.length === 0) return NextResponse.json({ error: "archivo", mensaje: "El archivo no tiene filas (la primera fila deben ser los encabezados)." }, { status: 400 });

  if (form!.get("modo") !== "aplicar") return NextResponse.json({ plan: await vistaPreviaLista(rows) });

  let ids: unknown;
  try { ids = JSON.parse(String(form!.get("eliminar") ?? "[]")); } catch { ids = null; }
  const eliminar = Eliminar.safeParse(ids);
  if (!eliminar.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const r = await aplicarLista(rows, eliminar.data, g.user.usuario);
  return NextResponse.json({ resultado: { insertados: r.insertados, actualizados: r.actualizados, eliminados: r.eliminados, recruzadas: r.recruzadas } });
}
