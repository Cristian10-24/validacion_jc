import { redirect } from "next/navigation";
import MonitorPanel from "@/components/MonitorPanel";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Panel de monitores · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function MonitorPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  return (
    <MonitorPanel
      user={user}
      // APP_URL: dirección pública para el mensaje de WhatsApp (en producción, https://validacion.tocaunavida.org).
      appUrl={(process.env.APP_URL ?? "").replace(/\/+$/, "")}
      // Filtros guardados en la URL (?estado=&ciudad=&q=), para que sobrevivan a una recarga.
      inicial={{ estado: uno(sp.estado), ciudad: uno(sp.ciudad), q: uno(sp.q).slice(0, 100) }}
    />
  );
}
