import { redirect } from "next/navigation";
import EncuestaResumen from "@/components/EncuestaResumen";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Avance encuesta · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function ResumenEncuestaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "encuesta_resumen")) redirect(puede(user.rol, "encuesta_ver") ? "/encuesta" : inicioPorRol(user.rol));
  return <EncuestaResumen user={user} />;
}
