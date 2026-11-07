import { redirect } from "next/navigation";
import ClausuraResumen from "@/components/ClausuraResumen";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Avance clausura · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function ClausuraResumenPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "clausura_resumen")) redirect(inicioPorRol(user.rol));
  return <ClausuraResumen user={user} />;
}
