import { redirect } from "next/navigation";
import TestimoniosListaPanel from "@/components/TestimoniosListaPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Lista de testimonios · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function TestimoniosListaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "testimonios_subir_lista")) redirect(inicioPorRol(user.rol));
  return <TestimoniosListaPanel user={user} />;
}
