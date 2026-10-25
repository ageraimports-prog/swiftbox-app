/**
 * LOCAL FIXTURE BRIDGE — speaks the PHP bridge's protocol (POST {sql, params} →
 * {rows | affectedRows, insertId | error}) on 127.0.0.1, backed by an IN-MEMORY
 * SQLite database seeded from ./fixtures.mjs. Nothing is persisted and no real
 * database (production or swiftbox_dev) is ever contacted.
 *
 * src/lib/db-guard.ts allows a loopback bridge, and lib/db.ts still checks
 * SELECT DATABASE() — this answers "swiftbox_test_local".
 *
 * Usage (Git Bash), from the repo root:
 *   node scripts/local-bridge/server.mjs            # listens on 127.0.0.1:8787
 *   BRIDGE_URL=http://127.0.0.1:8787/bridge.php BRIDGE_SECRET=local-fixture-only \
 *   SESSION_SECRET=local-fixture-session-secret-0123456789abcdef \
 *   ADMIN_URL=http://127.0.0.1:9 npx next dev -p 3100
 * Move any .env.local aside first so no real credential is loaded. Sign-ins:
 * see fixtures.mjs. Only for screenshots / manual checks of a few screens —
 * MySQL-only SQL is translated where those screens need it; anything else errors.
 */
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA, seed } from "./fixtures.mjs";

const PORT = Number(process.env.LOCAL_BRIDGE_PORT || 8787);
const SECRET = process.env.LOCAL_BRIDGE_SECRET || "local-fixture-only";
const DB_NAME = "swiftbox_test_local";

const db = new DatabaseSync(":memory:");
db.exec(SCHEMA);
seed(db);

// information_schema, the parts the app reads (TABLES / COLUMNS for this schema).
db.exec(`ATTACH DATABASE ':memory:' AS information_schema;
  CREATE TABLE information_schema.TABLES (TABLE_SCHEMA TEXT, TABLE_NAME TEXT);
  CREATE TABLE information_schema.COLUMNS (TABLE_SCHEMA TEXT, TABLE_NAME TEXT, COLUMN_NAME TEXT);`);
for (const { name } of db.prepare("SELECT name FROM main.sqlite_master WHERE type = 'table'").all()) {
  db.prepare("INSERT INTO information_schema.TABLES VALUES (?, ?)").run(DB_NAME, name);
  for (const c of db.prepare(`PRAGMA main.table_info(${name})`).all())
    db.prepare("INSERT INTO information_schema.COLUMNS VALUES (?, ?, ?)").run(DB_NAME, name, c.name);
}

// MySQL functions the screens use.
const pad2 = (n) => String(n).padStart(2, "0");
const mysqlNow = () => {
  const d = new Date(Date.now() - 4 * 3_600_000); // Trinidad, UTC-4
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
};
db.function("DATABASE", () => DB_NAME);
db.function("NOW", () => mysqlNow());
db.function("UTC_TIMESTAMP", () => new Date().toISOString().slice(0, 19).replace("T", " "));
db.function("CURDATE", () => mysqlNow().slice(0, 10));
db.function("LPAD", (s, n, p) => String(s ?? "").padStart(Number(n), String(p)).slice(0, Number(n)));

function translate(sql) {
  return sql
    .replace(/GROUP_CONCAT\(([^()]*?)\s+SEPARATOR\s+('[^']*')\)/gi, "GROUP_CONCAT($1, $2)")
    .replace(/\bFOR UPDATE\b/gi, "");
}

function run(sql, params) {
  const s = translate(sql);
  const stmt = db.prepare(s);
  const values = (params ?? []).map((v) => (typeof v === "boolean" ? Number(v) : v));
  if (/^\s*(\(?\s*SELECT|SHOW|WITH)/i.test(s)) return { rows: stmt.all(...values) };
  const r = stmt.run(...values);
  return { affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) };
}

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.method !== "POST" || req.headers["x-bridge-secret"] !== SECRET) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: "forbidden" }));
      }
      let out;
      try {
        const { sql, params } = JSON.parse(body);
        out = run(sql, params);
      } catch (e) {
        out = { error: String(e?.message ?? e) };
        console.log("[bridge] ERROR", out.error, "\n   SQL:", body.slice(0, 400).replace(/\s+/g, " "));
      }
      res.end(JSON.stringify(out));
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`[bridge] local fixture bridge on http://127.0.0.1:${PORT}/bridge.php (${DB_NAME}, in memory)`));
