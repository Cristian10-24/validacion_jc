import { redirect } from "next/navigation";
import AdminOverview from "@/components/AdminOverview";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Coordinación · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.rol !== "admin") redirect("/monitor");
  return <AdminOverview user={user} />;
}
