import { redirect } from "next/navigation";
import MonitorPanel from "@/components/MonitorPanel";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Panel de monitores · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // APP_URL: dirección pública para el mensaje de WhatsApp (en producción, https://validacion.tocaunavida.org).
  return <MonitorPanel user={user} appUrl={(process.env.APP_URL ?? "").replace(/\/+$/, "")} />;
}
