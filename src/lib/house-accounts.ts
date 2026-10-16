import "server-only";
import { cache } from "react";
import { query } from "./db";

/** Read the invoice snapshot, never the customer's current setting.
 * Confirmed absence is supported; bridge/auth failures propagate. */
const invoiceColumnExists = cache(async () => {
  const rows = await query<{ COLUMN_NAME: string }>(`SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'swiftbox_invoices' AND COLUMN_NAME = 'house_account'`);
  return rows.length > 0;
});

export async function invoiceHouseColumn(alias = ""): Promise<string> {
  const p = alias ? `${alias}.` : "";
  return `IF(${await invoiceColumnExists() ? `COALESCE(${p}house_account,0) = 1 OR ` : ""}${p}status = 'house',1,0) AS house_account`;
}

export const NO_CHARGE_MESSAGE = "No charge — covered by Swiftbox";
