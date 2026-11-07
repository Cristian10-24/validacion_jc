import { redirect } from "next/navigation";
import ClausuraEventos from "@/components/ClausuraEventos";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Eventos clausura · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

/** Eventos por ciudad. Admin: crear, editar, abrir/cerrar. Monitor y coordinación: solo lectura. */
export default async function ClausuraEventosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "clausura_ver")) redirect(inicioPorRol(user.rol));
  return <ClausuraEventos user={user} />;
}
