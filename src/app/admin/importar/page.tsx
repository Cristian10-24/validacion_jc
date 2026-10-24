import { redirect } from "next/navigation";
import ImportPanel from "@/components/ImportPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Subir lista · Coordinación · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "subir_lista")) redirect(inicioPorRol(user.rol));
  return <ImportPanel user={user} />;
}
