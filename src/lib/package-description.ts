/**
 * How a package description from Airdrop (the Hialeah warehouse) is stored in
 * mod_packages.commodities: trimmed, every run of whitespace (tabs and line
 * breaks included) collapsed to one space, then upper-cased — so Airdrop
 * descriptions read the same as the ones the office types in capitals.
 *
 * Case and spacing ONLY. No rewording, no punctuation stripping, no synonym or
 * plural folding — that is the customs code memory's job and stays in
 * lib/customs-descriptions.ts (`normalizeCommodityDesc`), which already ignores
 * case, so an upper-cased description finds the same HS code it did before.
 *
 * Pure (no server-only import) so scripts/test-package-description.ts can run it.
 */
export function normalizePackageDescription(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * True when the stored description already says what Airdrop sent — either as
 * sent (a row imported before descriptions were upper-cased, or a Send-to-Airdrop
 * package typed in the office) or in its normalised form. The importer uses this
 * so a case-only difference is never mistaken for a conflicting edit.
 */
export function sameAirdropDescription(local: string | null | undefined, remote: string | null | undefined): boolean {
  const stored = String(local ?? "");
  const sent = String(remote ?? "");
  return stored === sent || stored === normalizePackageDescription(sent);
}
