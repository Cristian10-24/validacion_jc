import ClausuraFlujo from "@/components/ClausuraFlujo";
import { clausura } from "@/lib/clausura/db";
import { eventoVista, formularioActivo } from "@/lib/clausura/evento";
import { preguntasFrecuentes } from "@/lib/clausura/presentacion";

export const metadata = { title: "Clausura 2026 · Confirmación de asistencia · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

/**
 * Portada general: tarjetas de los eventos ABIERTOS (los cerrados y los borradores no se muestran), pasos,
 * preguntas frecuentes según la configuración de esos eventos y el formulario del documento.
 */
export default async function ClausuraInicio() {
  const { eventos } = await clausura();
  const abiertos = await eventos.find({ estado: "abierto" }).sort({ inicio: 1 }).toArray();
  const ahora = new Date();
  const lista = abiertos.map((e) => {
    const { formulario: _f, ...v } = eventoVista(e, ahora);
    return v;
  });
  const faq = preguntasFrecuentes(abiertos.map((e) => ({ formulario: formularioActivo(e, e.formulario), permitirEdicion: e.permitirEdicion })));
  return <ClausuraFlujo evento={null} eventos={lista} faq={faq} privacyUrl={process.env.NEXT_PUBLIC_PRIVACY_URL || "https://tocaunavida.org"} />;
}
