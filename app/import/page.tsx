import { ImportManager } from "@/lib/components/import-manager";
import { requireSessionUser } from "@/lib/server/auth";

export default async function ImportPage() {
  await requireSessionUser();

  return (
    <div className="grid">
      <h1>CSV Import</h1>
      <ImportManager />
    </div>
  );
}
