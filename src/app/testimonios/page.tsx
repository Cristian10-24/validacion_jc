import { redirect } from "next/navigation";
import TestimoniosPanel from "@/components/TestimoniosPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Testimonios · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TestimoniosPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "testimonios_ver")) redirect(inicioPorRol(user.rol));
  const sp = await searchParams;
  return <TestimoniosPanel user={user} inicial={{ estado: uno(sp.estado), ciudad: uno(sp.ciudad), q: uno(sp.q).slice(0, 100) }} />;
}
