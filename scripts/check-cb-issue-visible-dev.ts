/**
 * Issue = visible and payable (Brent, 2026-11-12) — the customer app's OWN SQL against
 * the admin's dev fixtures. DEV database only (src/lib/db-guard.ts). Read only.
 *
 *   (admin)  KEEP_FILE=<f> AIRDROP_SCHEMA_READY=true npx tsx --conditions=react-server --env-file=.env.local scripts/verify-cb-issue-visible-dev.ts
 *   (app)    npx tsx --conditions=react-server --env-file=.env.local scripts/check-cb-issue-visible-dev.ts <f>
 *   (admin)  CLEANUP_FROM=<f> npx tsx --conditions=react-server --env-file=.env.local scripts/verify-cb-issue-visible-dev.ts
 *
 * For every kept customer: each ISSUED invoice must be in the app's list (not hidden),
 * its detail rule must not 404 it, and any bill it sits on must read issued — except an
 * invoice whose packages are genuinely held (an open group), which must stay hidden.
 */
import { readFileSync } from "node:fs";
import { query } from "../src/lib/db";
import { cbHiddenInvoiceIds, cbBillForInvoice, listCbBills, getCbBill } from "../src/lib/consolidated-billing";

let passes = 0, failures = 0;
const ok = (label: string, cond: boolean, detail?: unknown) => {
  if (cond) { passes++; console.log(`  ✓ ${label}`); } else { failures++; console.log(`  ✗ ${label}`, detail === undefined ? "" : JSON.stringify(detail)); }
};

(async () => {
  const kept = JSON.parse(readFileSync(process.argv[2], "utf8")) as { users: number[] };
  const [db] = await query<{ d: string }>("SELECT DATABASE() AS d");
  console.log(`Database: ${db?.d}; customers ${kept.users.join(",")}`);
  for (const uid of kept.users) {
    const invoices = await query<{ invoice_id: number; invoice_no: string; held: number }>(
      `SELECT i.invoice_id, i.invoice_no,
              EXISTS (SELECT 1 FROM swiftbox_invoice_packages ip JOIN swiftbox_cb_group_packages m ON m.pk_id = ip.pk_id AND m.removed_at IS NULL
                        JOIN swiftbox_cb_groups g ON g.group_id = m.group_id AND g.state IN ('open','closed') WHERE ip.invoice_id = i.invoice_id) AS held
         FROM swiftbox_invoices i WHERE i.user_id = :u AND i.lifecycle = 'issued'`, { u: uid });
    if (!invoices.length) continue;
    const hidden = await cbHiddenInvoiceIds(uid);
    const bills = await listCbBills(uid);
    for (const inv of invoices) {
      const bill = await cbBillForInvoice(Number(inv.invoice_id));
      const listed = !hidden.has(Number(inv.invoice_id));
      const detailOk = !(bill && !bill.issued) && !(!bill && hidden.has(Number(inv.invoice_id)));
      if (Number(inv.held)) {
        ok(`${inv.invoice_no} (packages in an open group) stays hidden`, !listed && !detailOk, { listed, detailOk });
        continue;
      }
      ok(`${inv.invoice_no} is listed as an invoice`, listed);
      ok(`${inv.invoice_no} opens (detail route would not 404)`, detailOk, bill);
      if (bill) {
        ok(`${bill.billNo} reads issued`, bill.issued);
        const detail = await getCbBill(uid, bill.billNo);
        ok(`${bill.billNo} page loads and offers Pay for ${inv.invoice_no}`, !!detail && detail.invoices.some((i) => i.invoiceNo === inv.invoice_no), detail?.invoices);
        ok(`${bill.billNo} is not ALSO listed as a bill card (one invoice)`, !bills.filter((b) => b.invoices.length > 1).some((b) => b.billNo === bill.billNo));
      }
    }
  }
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
