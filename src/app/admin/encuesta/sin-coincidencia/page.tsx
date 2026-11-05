import { redirect } from "next/navigation";
import EncuestaSinCoincidencia from "@/components/EncuestaSinCoincidencia";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Sin coincidencia · Encuesta final" };
export const dynamic = "force-dynamic";

export default async function SinCoincidenciaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "encuesta_sin_coincidencia")) redirect(puede(user.rol, "encuesta_ver") ? "/encuesta" : inicioPorRol(user.rol));
  return <EncuestaSinCoincidencia user={user} />;
}
