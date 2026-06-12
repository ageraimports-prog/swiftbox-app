import "server-only";

/**
 * Bridge-backed query interface.
 *
 * MySQL :3306 is firewalled on the legacy host, so all DB access POSTs
 * { sql, params } to the PHP bridge (which runs on the host, where
 * localhost MySQL is reachable) and returns { rows, affectedRows, insertId }.
 *
 *   URL    — process.env.BRIDGE_URL
 *   Header — X-Bridge-Secret: process.env.BRIDGE_SECRET
 *
 * The bridge speaks positional `?` placeholders only. `:named` placeholders
 * in an object params arg are rewritten to positional + an ordered value
 * array before the request goes out. Array params pass through unchanged.
 *
 * Target DB is MySQL 5.6 — no window functions, no CTEs.
 */

function toPositional(
  sql: string,
  params?: Record<string, unknown> | unknown[]
): { sql: string; values: unknown[] } {
  if (params == null) return { sql, values: [] };
  if (Array.isArray(params)) return { sql, values: params };

  const values: unknown[] = [];
  let out = "";
  let quote: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (quote) {
      out += ch;
      if (ch === "\\" && i + 1 < sql.length) {
        out += sql[i + 1];
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }

    if (ch === ":" && /[A-Za-z0-9_]/.test(sql[i + 1] ?? "")) {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j++;
      const name = sql.slice(i + 1, j);
      if (!(name in params)) {
        throw new Error(`Missing value for named parameter :${name}`);
      }
      values.push((params as Record<string, unknown>)[name]);
      out += "?";
      i = j - 1;
      continue;
    }

    out += ch;
  }

  return { sql: out, values };
}

export type ResultSetHeader = {
  affectedRows: number;
  insertId: number;
};

type BridgeResponse = {
  rows?: unknown[];
  affectedRows?: number;
  insertId?: number;
  error?: string;
};

async function callBridge(
  sql: string,
  params?: Record<string, unknown> | unknown[]
): Promise<BridgeResponse> {
  const url = process.env.BRIDGE_URL;
  const secret = process.env.BRIDGE_SECRET;
  if (!url) throw new Error("BRIDGE_URL is not set");
  if (!secret) throw new Error("BRIDGE_SECRET is not set");

  const { sql: positionalSql, values } = toPositional(sql, params);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bridge-Secret": secret,
    },
    body: JSON.stringify({ sql: positionalSql, params: values }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bridge HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as BridgeResponse;
  if (data?.error) throw new Error(`Bridge error: ${data.error}`);
  return data;
}

/** Run a SELECT and return typed rows. Use :named placeholders. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, unknown> | unknown[]
): Promise<T[]> {
  const data = await callBridge(sql, params);
  return (data.rows ?? []) as T[];
}

/** Run an INSERT/UPDATE/DELETE and return the raw result header. */
export async function execute(
  sql: string,
  params?: Record<string, unknown> | unknown[]
): Promise<ResultSetHeader> {
  const data = await callBridge(sql, params);
  return {
    affectedRows: data.affectedRows ?? 0,
    insertId: data.insertId ?? 0,
  };
}
