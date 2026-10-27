import { redirect } from "next/navigation";
import TestimoniosResumen from "@/components/TestimoniosResumen";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Avance testimonios · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function ResumenTestimoniosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "testimonios_resumen")) redirect(puede(user.rol, "testimonios_ver") ? "/testimonios" : inicioPorRol(user.rol));
  return <TestimoniosResumen user={user} />;
}
