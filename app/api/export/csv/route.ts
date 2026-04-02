import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/api";
import {
  exportAssignmentsCsv,
  exportCategoryBalancesCsv,
  exportTransactionsCsv,
} from "@/lib/server/export";

export async function GET(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "transactions";

  let csvText = "";
  let fileName = "export.csv";

  if (type === "transactions") {
    csvText = await exportTransactionsCsv(user.id);
    fileName = "transactions.csv";
  } else if (type === "assignments") {
    csvText = await exportAssignmentsCsv(user.id);
    fileName = "budget-assignments.csv";
  } else if (type === "balances") {
    csvText = await exportCategoryBalancesCsv(user.id);
    fileName = "category-balances.csv";
  } else {
    return NextResponse.json({ error: "Unsupported export type" }, { status: 400 });
  }

  return new NextResponse(csvText, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${fileName}\"`,
    },
  });
}
