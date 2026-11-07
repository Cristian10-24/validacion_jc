import { notFound } from "next/navigation";
import ClausuraFlujo from "@/components/ClausuraFlujo";
import { clausura } from "@/lib/clausura/db";
import { eventoVista } from "@/lib/clausura/evento";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

async function buscar(slug: string) {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const { eventos } = await clausura();
  const e = await eventos.findOne({ slug });
  return e && e.estado !== "borrador" ? e : null; // los borradores no se publican
}

export async function generateMetadata({ params }: Params) {
  const e = await buscar((await params).slug);
  return { title: e ? `${e.titulo} · ${e.nombreVisible}` : "Clausura · Jóvenes creaTIvos" };
}

/** Portada de un evento (/clausura/cali-2026). Si el estudiante es de otra ciudad, al entrar lo llevamos al suyo. */
export default async function ClausuraEvento({ params }: Params) {
  const e = await buscar((await params).slug);
  if (!e) notFound();
  return <ClausuraFlujo evento={eventoVista(e)} privacyUrl={process.env.NEXT_PUBLIC_PRIVACY_URL || "https://tocaunavida.org"} />;
}
