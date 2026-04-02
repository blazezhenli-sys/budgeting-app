import crypto from "node:crypto";

export function checksum(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function dedupeHash(input: {
  date: string;
  amount: number;
  payee: string;
  account: string;
  memo: string;
}): string {
  const normalized = [
    input.date.trim(),
    input.amount.toString(),
    input.payee.trim().toLowerCase(),
    input.account.trim().toLowerCase(),
    input.memo.trim().toLowerCase(),
  ].join("|");

  return checksum(normalized);
}
