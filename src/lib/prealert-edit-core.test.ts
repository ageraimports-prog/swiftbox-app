import { describe, it } from "vitest";
import { PREALERT_EDIT_CASES } from "./prealert-edit-core.cases";

/**
 * The shared pre-alert edit rules. prealert-edit-core.ts, its cases file and
 * package-description.ts are byte-identical twins of SwiftboxAdmin's
 * lib/prealert-edit-core.ts, lib/prealert-edit-core.cases.ts and
 * lib/package-description.ts — the admin runs the same cases with
 * `npx tsx scripts/test-prealert-edit.ts`. Change them together.
 */
describe("prealert-edit-core (shared with SwiftboxAdmin)", () => {
  for (const [name, fn] of PREALERT_EDIT_CASES) it(name, fn);
});
