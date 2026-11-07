import ClausuraFlujo from "@/components/ClausuraFlujo";
import { clausura } from "@/lib/clausura/db";
import { textoFecha } from "@/lib/clausura/evento";

export const metadata = { title: "Clausura · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

/** Portada general: el estudiante escribe su documento y lo llevamos al evento de su ciudad. */
export default async function ClausuraInicio() {
  const { eventos } = await clausura();
  const abiertos = await eventos.find({ estado: "abierto" }, { projection: { slug: 1, nombreVisible: 1, inicio: 1, fin: 1, zonaHoraria: 1, zonaHorariaTexto: 1 } }).sort({ inicio: 1 }).toArray();
  const lista = abiertos.map((e) => ({ slug: e.slug, nombreVisible: e.nombreVisible, dia: textoFecha(e).dia }));
  return <ClausuraFlujo evento={null} eventos={lista} privacyUrl={process.env.NEXT_PUBLIC_PRIVACY_URL || "https://tocaunavida.org"} />;
}
