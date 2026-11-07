import { redirect } from "next/navigation";
import ClausuraPanel from "@/components/ClausuraPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Clausura · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ClausuraPanelPage({ searchParams }: { searchParams: SP }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "clausura_ver")) redirect(inicioPorRol(user.rol));
  const sp = await searchParams;
  return <ClausuraPanel user={user} inicial={{ evento: uno(sp.evento).slice(0, 24), estado: uno(sp.estado), asistencia: uno(sp.asistencia).slice(0, 40), ciudad: uno(sp.ciudad).slice(0, 60), q: uno(sp.q).slice(0, 100) }} />;
}
