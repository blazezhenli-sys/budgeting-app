"use client";

import { useState } from "react";

type ImportResult = {
  rows: number;
  validRows?: number;
  importedCount?: number;
  duplicateCount?: number;
  errors?: Array<{
    row: number;
    field: string;
    reason: string;
  }>;
};

export function ImportManager() {
  const [fileName, setFileName] = useState("transactions.csv");
  const [csvText, setCsvText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(commit: boolean) {
    setError(null);

    const response = await fetch("/api/import/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, csvText, commit }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "CSV import request failed");
      return;
    }

    setResult(payload);
  }

  return (
    <div className="grid two">
      <section className="card">
        <h2>CSV import</h2>
        <p className="muted">
          Required columns: <span className="code">date,account,payee,memo,amount,category</span> (status optional)
        </p>
        <label>
          File name
          <input value={fileName} onChange={(event) => setFileName(event.target.value)} />
        </label>
        <label>
          CSV content
          <textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} rows={16} />
        </label>
        <div className="inline-row">
          <button type="button" className="secondary" onClick={() => submit(false)}>
            Dry run
          </button>
          <button type="button" onClick={() => submit(true)}>
            Commit valid rows
          </button>
        </div>
        {error ? <p className="alert">{error}</p> : null}
      </section>

      <section className="card">
        <h2>Import result</h2>
        {result ? (
          <div className="grid">
            <p className="muted">Rows: {result.rows}</p>
            {result.validRows !== undefined ? <p className="muted">Valid rows: {result.validRows}</p> : null}
            {result.importedCount !== undefined ? <p className="muted">Imported: {result.importedCount}</p> : null}
            {result.duplicateCount !== undefined ? <p className="muted">Duplicates: {result.duplicateCount}</p> : null}

            <h3>Errors</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Field</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.errors ?? []).map((item) => (
                    <tr key={`${item.row}-${item.field}-${item.reason}`}>
                      <td>{item.row}</td>
                      <td>{item.field}</td>
                      <td>{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="muted">Run a dry parse first, then commit.</p>
        )}
      </section>
    </div>
  );
}
