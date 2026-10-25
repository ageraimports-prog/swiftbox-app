import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import * as t from "./tobago-delivery";

const copy = [t.TOBAGO_DELIVERY_SHORT, t.TOBAGO_DELIVERY_LONG, t.TOBAGO_DELIVERY_FAQ_Q, t.TOBAGO_DELIVERY_LINE_LABEL];

describe("Tobago delivery wording (Brent, 25 Oct 2026)", () => {
  it("is Brent's standard wording, verbatim", () => {
    expect(t.TOBAGO_DELIVERY_SHORT).toBe(
      "Door delivery in Trinidad included. Tobago TT$30 per delivery; Consolidated Billing puts all your packages in one (up to 50 lb)"
    );
    expect(t.TOBAGO_DELIVERY_LONG).toBe(
      "Door delivery in Trinidad is included. Tobago is TT$30 per delivery, and with Consolidated Billing (free) all your packages go in one delivery for that TT$30, up to 50 lb combined. Over 50 lb, a higher Tobago delivery fee applies."
    );
    expect(t.TOBAGO_DELIVERY_LINE_LABEL).toBe("Tobago delivery (per delivery)");
  });
  it("the only money figure is TT$30 — no amount for over 50 lb", () => {
    for (const s of copy) {
      const amounts = s.match(/(TT|US)\$\s?\d+(\.\d+)?|\$\d+/g) ?? [];
      expect(amounts.every((a) => a === "TT$30")).toBe(true);
    }
  });
  it("never names a partner, its price, a subsidy, or a delivery time", () => {
    for (const s of copy) {
      expect(s).not.toMatch(/partner|subsid|cost(s)? us|we pay|ferry|courier|\bdays?\b|\bhours?\b|business|within|guarantee/i);
    }
  });
  it("no Tobago delivery-time promise in the app's source", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".test.ts")) {
          for (const line of fs.readFileSync(p, "utf8").split("\n")) {
            if (/tobago/i.test(line) && /business days|\d\s*[–-]\s*\d+\s*days/i.test(line)) hits.push(`${p}: ${line.trim()}`);
          }
        }
      }
    };
    walk(path.join(__dirname, ".."));
    expect(hits).toEqual([]);
  });
});

describe("isTobagoCustomer", () => {
  it("users.zone decides when set", () => {
    expect(t.isTobagoCustomer({ zone: "Tobago" })).toBe(true);
    expect(t.isTobagoCustomer({ zone: "TOBAGO " })).toBe(true);
    expect(t.isTobagoCustomer({ zone: "Central", city: "Scarborough" })).toBe(false);
    expect(t.isTobagoCustomer({ zone: "SOE", address: "Tobago" })).toBe(false);
    expect(t.isTobagoCustomer({ zone: "North West" })).toBe(false);
  });
  it("blank or non-zone values fall back to the address text", () => {
    expect(t.isTobagoCustomer({ zone: "", city: "Scarborough" })).toBe(true);
    expect(t.isTobagoCustomer({ zone: null, address: "12 Main Rd, Bon Accord" })).toBe(true);
    expect(t.isTobagoCustomer({ zone: "EAST", address: "LP 4, Signal Hill, Tobago" })).toBe(true);
    expect(t.isTobagoCustomer({ zone: "", city: "Chaguanas" })).toBe(false);
    expect(t.isTobagoCustomer({})).toBe(false);
  });
  it("the country name 'Trinidad and Tobago' is not Tobago", () => {
    expect(t.isTobagoCustomer({ address: "5 High St, San Fernando, Trinidad and Tobago" })).toBe(false);
    expect(t.isTobagoCustomer({ address: "Arima, Trinidad & Tobago" })).toBe(false);
    expect(t.isTobagoCustomer({ address: "Republic of Trinidad and Tobago" })).toBe(false);
  });
});

describe("customerChargeLabel", () => {
  it("relabels a Tobago charge, leaves the rest", () => {
    expect(t.customerChargeLabel("Tobago surcharge")).toBe("Tobago delivery (per delivery)");
    expect(t.customerChargeLabel("TOBAGO DELIVERY")).toBe("Tobago delivery (per delivery)");
    expect(t.customerChargeLabel("Freight")).toBe("Freight");
    expect(t.customerChargeLabel("Storage, Trinidad and Tobago")).toBe("Storage, Trinidad and Tobago");
  });
});
