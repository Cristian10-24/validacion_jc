import { redirect } from "next/navigation";
import EncuestaPanel from "@/components/EncuestaPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Encuesta final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function EncuestaPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "encuesta_ver")) redirect(inicioPorRol(user.rol));
  const sp = await searchParams;
  return <EncuestaPanel user={user} inicial={{ estado: uno(sp.estado), ciudad: uno(sp.ciudad), q: uno(sp.q).slice(0, 100) }} />;
}
