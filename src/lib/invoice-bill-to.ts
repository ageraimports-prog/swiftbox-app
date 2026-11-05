import { query } from "@/lib/db";
import { swiftCode } from "@/lib/buy-for-me-core";
import { billToView, type BillToView } from "@/lib/invoice-bill-to-core";

/**
 * The signed-in customer's "Bill to" block, read from their record each time. Same
 * rules as the admin's PDF and email (invoice-bill-to-core.ts). The primary address
 * only: a second address is the office's. Never throws — an invoice still opens
 * without the block.
 */
export async function billToForUser(userId: number): Promise<BillToView | null> {
  try {
    const [u] = await query<{
      fname: string | null; lname: string | null; cname: string | null; ac: string | null;
      address: string | null; city: string | null; phone: string | null; alt_phones: string | null;
    }>(
      "SELECT fname, lname, cname, ac, address, city, phone, alt_phones FROM users WHERE id = :id LIMIT 1",
      { id: userId }
    );
    if (!u) return null;
    return billToView(
      {
        name: (u.cname ?? "").trim() || `${(u.fname ?? "").trim()} ${(u.lname ?? "").trim()}`.trim(),
        swiftCode: swiftCode(u.ac),
        address: u.address,
        city: u.city,
        phone: u.phone,
        altPhones: u.alt_phones,
      },
      "customer"
    );
  } catch (e) {
    console.error(`[invoice-bill-to] user ${userId}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
