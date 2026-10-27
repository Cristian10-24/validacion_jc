import { redirect } from "next/navigation";
import TestimoniosSinDuenio from "@/components/TestimoniosSinDuenio";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Sin dueño · Testimonios" };
export const dynamic = "force-dynamic";

export default async function SinDuenioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "testimonios_sin_duenio")) redirect(puede(user.rol, "testimonios_ver") ? "/testimonios" : inicioPorRol(user.rol));
  return <TestimoniosSinDuenio user={user} />;
}
