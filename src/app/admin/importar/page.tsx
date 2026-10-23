import { redirect } from "next/navigation";
import ImportPanel from "@/components/ImportPanel";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Subir lista · Coordinación · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.rol !== "admin") redirect("/monitor");
  return <ImportPanel user={user} />;
}
