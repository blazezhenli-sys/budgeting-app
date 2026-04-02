import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/api";
import { importCsv } from "@/lib/server/csv-import";
import { csvImportSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const payload = csvImportSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid CSV import payload" }, { status: 400 });
  }

  const result = await importCsv(user.id, payload.data);
  return NextResponse.json(result);
}
