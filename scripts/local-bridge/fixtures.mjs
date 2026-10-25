/**
 * LOCAL FIXTURE DATA for scripts/local-bridge/server.mjs — an in-memory SQLite
 * database that stands in for the PHP bridge on 127.0.0.1, so the app can be run
 * and screenshotted with NO real database (not production, not swiftbox_dev).
 *
 * Only the tables the screens below need exist; everything here is invented.
 * Test sign-ins (local fixture only — these accounts exist nowhere else):
 *   Tobago customer    tobago.fixture@test.swiftbox.local   / account 9901
 *   Trinidad customer  trinidad.fixture@test.swiftbox.local / account 9902
 *   Password (both):   FIXTURE_PASSWORD below
 */
import bcrypt from "bcryptjs";

export const FIXTURE_PASSWORD = "local-fixture-Tob4go!";

export const SCHEMA = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY, type TEXT DEFAULT 'member', email TEXT, ac TEXT, hash TEXT,
  active TEXT DEFAULT 'y', fname TEXT, lname TEXT, consolidated_billing INTEGER DEFAULT 0,
  zone TEXT, city TEXT, address TEXT, phone TEXT, alt_phones TEXT, country TEXT,
  referral_code TEXT, created_at TEXT, created TEXT
);
CREATE TABLE swiftbox_invoices (
  invoice_id INTEGER PRIMARY KEY, invoice_no TEXT, user_id INTEGER, scope TEXT, ship_no TEXT,
  status TEXT, billing_mode TEXT, roe TEXT, shipping_ttd TEXT, customs_total_ttd TEXT,
  total_ttd TEXT, amount_paid TEXT, created_at TEXT, lifecycle TEXT, house_account INTEGER DEFAULT 0
);
CREATE TABLE swiftbox_invoice_lines (
  line_id INTEGER PRIMARY KEY, invoice_id INTEGER, line_type TEXT, description TEXT, currency TEXT,
  amount TEXT, amount_ttd TEXT, qty TEXT, unit TEXT, rate TEXT, basis TEXT, sort_order INTEGER
);
CREATE TABLE swiftbox_invoice_payments (
  payment_id INTEGER PRIMARY KEY, invoice_id INTEGER, amount TEXT, method TEXT, paid_date TEXT, reference TEXT
);
CREATE TABLE swiftbox_invoice_packages (invoice_id INTEGER, pk_id INTEGER);
CREATE TABLE mod_packages (
  pk_id INTEGER PRIMARY KEY, user_id INTEGER, wr TEXT, tracking TEXT, commodities TEXT, shipper TEXT,
  weight TEXT, pcs INTEGER, ship_no TEXT, ship_status TEXT, date TEXT
);
CREATE TABLE swiftbox_cb_groups (
  group_id INTEGER PRIMARY KEY, user_id INTEGER, state TEXT, first_miami_entry_at TEXT,
  window_ends_at TEXT, close_reason TEXT, bill_id INTEGER, off_bill_reason TEXT
);
CREATE TABLE swiftbox_cb_group_packages (group_id INTEGER, pk_id INTEGER, user_id INTEGER, removed_at TEXT, off_bill_reason TEXT);
CREATE TABLE swiftbox_cb_bills (bill_id INTEGER PRIMARY KEY, bill_no TEXT, user_id INTEGER, lifecycle TEXT, issued_at TEXT, created_at TEXT);
CREATE TABLE swiftbox_cb_bill_invoices (bill_id INTEGER, invoice_id INTEGER);
CREATE TABLE swiftbox_bfm_packages (pk_id INTEGER);
CREATE TABLE swiftbox_settings (name TEXT, value TEXT);
`;

export function seed(db) {
  const hash = bcrypt.hashSync(FIXTURE_PASSWORD, 10);
  const user = db.prepare(
    `INSERT INTO users (id, email, ac, hash, fname, lname, consolidated_billing, zone, city, address, phone, country, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, '868-555-0100', 'Trinidad and Tobago', '2026-10-25 09:00:00')`
  );
  user.run(9901, "tobago.fixture@test.swiftbox.local", "9901", hash, "Tobago", "Fixture", "Tobago", "Scarborough", "1 Fixture Street, Scarborough");
  user.run(9902, "trinidad.fixture@test.swiftbox.local", "9902", hash, "Trinidad", "Fixture", "Central", "Chaguanas", "2 Fixture Road, Chaguanas");

  // An issued invoice for the Tobago customer with an office-typed Tobago line,
  // which the app relabels "Tobago delivery (per delivery)".
  db.prepare(
    `INSERT INTO swiftbox_invoices (invoice_id, invoice_no, user_id, scope, ship_no, status, billing_mode, roe,
       shipping_ttd, customs_total_ttd, total_ttd, amount_paid, created_at, lifecycle)
     VALUES (900001, 'INV-900001', 9901, 'shipment', '20-10-2026-AIR-1', 'unpaid', 'air', '6.80',
       '127.43', '0.00', '127.43', '0.00', '2026-10-24 10:00:00', 'issued')`
  ).run();
  const line = db.prepare(
    `INSERT INTO swiftbox_invoice_lines (invoice_id, line_type, description, currency, amount, amount_ttd, qty, unit, rate, basis, sort_order)
     VALUES (900001, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  line.run("freight", "Freight", "USD", "11.94", "81.19", "6", "lb", "1.99", null, 1);
  line.run("fuel", "Fuel surcharge (20%)", "USD", "2.39", "16.24", "11.94", null, "0.2", "20% of freight", 2);
  line.run("other", "Tobago delivery", "TTD", "30.00", "30.00", null, null, null, null, 3);
}
