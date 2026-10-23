import { NextResponse } from "next/server";
import { getCurrentUser, scopeFilter } from "@/lib/auth";
import { collections } from "@/lib/db";
import { correosRepetidos, monitorRow } from "@/lib/monitor-view";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sesion" }, { status: 401 });

  const { students } = await collections();
  const [docs, repetidos] = await Promise.all([students.find(scopeFilter(user)).toArray(), correosRepetidos(students)]);
  return NextResponse.json({ rows: docs.map((s) => monitorRow(s, repetidos)) });
}
