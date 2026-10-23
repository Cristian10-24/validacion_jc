import { redirect } from "next/navigation";
import StudentFlow from "@/components/StudentFlow";
import { studentPortalOpen } from "@/lib/portal";

export const dynamic = "force-dynamic";

export default function Home() {
  if (!studentPortalOpen()) redirect("/cerrado");
  return <StudentFlow privacyUrl={process.env.NEXT_PUBLIC_PRIVACY_URL || "https://tocaunavida.org"} />;
}
