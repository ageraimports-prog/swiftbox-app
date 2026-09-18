import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGNUP_BASE_URL, whatsappShareUrl } from "@/lib/referral";

/**
 * The share link is the one URL in the product a NON-customer clicks, usually
 * on a phone, usually once. If it 404s the referral is simply lost — there is
 * no retry and no error we ever see. So the contract these tests pin down is
 * narrow and absolute: whatever `signupBaseUrl` is handed in, the link that
 * comes out points at the marketing signup page.
 */

const CODE = "J924PM";
const CANONICAL_LINK = `${SIGNUP_BASE_URL}/signup?ref=${CODE}`;

/**
 * Pull the signup link back out of a wa.me deep link the way WhatsApp does:
 * read the `text` param (which decodes the percent-encoding) and take the last
 * line of the message. Asserting through this path rather than against the raw
 * string is the point — it is what the friend actually ends up tapping.
 */
function signupLinkFrom(shareUrl: string): string {
  expect(shareUrl.startsWith("https://wa.me/?text=")).toBe(true);

  const text = new URL(shareUrl).searchParams.get("text");
  expect(text).not.toBeNull();

  const lines = text!.split("\n");
  return lines[lines.length - 1];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("whatsappShareUrl", () => {
  it("uses the hardcoded website base when no override is given", () => {
    expect(signupLinkFrom(whatsappShareUrl(CODE))).toBe(CANONICAL_LINK);
  });

  it("always returns a wa.me deep link whose message ends with the signup URL", () => {
    const share = whatsappShareUrl(CODE);

    expect(share.startsWith("https://wa.me/?text=")).toBe(true);

    const text = new URL(share).searchParams.get("text")!;
    const lines = text.split("\n");
    expect(lines[lines.length - 1]).toBe(CANONICAL_LINK);
    // The link is its own line — a trailing space or stray character would
    // break WhatsApp's autolinking and the friend would get plain text.
    expect(text).toContain(`\n${CANONICAL_LINK}`);
    expect(text).toContain(CODE);
  });

  describe("accepted same-site overrides", () => {
    it("strips a trailing slash instead of emitting a double slash", () => {
      const link = signupLinkFrom(whatsappShareUrl(CODE, "https://swiftboxtt.com/"));

      expect(link).toBe(CANONICAL_LINK);
      expect(link).not.toContain("//signup");
    });

    it("strips repeated trailing slashes", () => {
      expect(signupLinkFrom(whatsappShareUrl(CODE, "https://swiftboxtt.com///"))).toBe(
        CANONICAL_LINK
      );
    });

    it("accepts the www host", () => {
      expect(signupLinkFrom(whatsappShareUrl(CODE, "https://www.swiftboxtt.com"))).toBe(
        `https://www.swiftboxtt.com/signup?ref=${CODE}`
      );
    });

    it("tolerates surrounding whitespace on an otherwise valid value", () => {
      expect(
        signupLinkFrom(whatsappShareUrl(CODE, "  https://www.swiftboxtt.com  "))
      ).toBe(`https://www.swiftboxtt.com/signup?ref=${CODE}`);
    });
  });

  describe("rejected overrides fall back to the website", () => {
    // The regression this whole change exists to prevent: app.swiftboxtt.com
    // has no /signup page, so a stale SIGNUP_URL pointing there used to win and
    // hand the friend a 404.
    it("rejects app.swiftboxtt.com and warns", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(signupLinkFrom(whatsappShareUrl(CODE, "https://app.swiftboxtt.com"))).toBe(
        CANONICAL_LINK
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("https://app.swiftboxtt.com");
    });

    it.each([
      ["a malformed value", "not a url"],
      ["plain http", "http://swiftboxtt.com"],
      ["localhost", "http://localhost:3005"],
      ["https localhost", "https://localhost:3005"],
      ["an unrelated host", "https://evil.example.com"],
      ["a lookalike host", "https://swiftboxtt.com.evil.example.com"],
      ["a bare hostname with no scheme", "swiftboxtt.com"],
      ["a non-http scheme", "javascript:alert(1)"],
    ])("rejects %s and warns naming the value", (_label, override) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(signupLinkFrom(whatsappShareUrl(CODE, override))).toBe(CANONICAL_LINK);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain(override.trim());
    });

    // Unset/blank is the normal configuration, not a deployment bug, so it
    // falls back QUIETLY — this runs on every dashboard render and a warning
    // per render would be noise that buries the real one above.
    it.each([
      ["undefined", undefined],
      ["an empty string", ""],
      ["whitespace only", "   "],
    ])("falls back silently for %s", (_label, override) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(signupLinkFrom(whatsappShareUrl(CODE, override))).toBe(CANONICAL_LINK);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it("percent-encodes a code containing characters that need it", () => {
    const messy = "A B&C/D?E#F";

    expect(signupLinkFrom(whatsappShareUrl(messy))).toBe(
      `${SIGNUP_BASE_URL}/signup?ref=A%20B%26C%2FD%3FE%23F`
    );
  });

  it("round-trips an encoded code back to the original through the query string", () => {
    const messy = "A B&C/D?E#F";
    const link = signupLinkFrom(whatsappShareUrl(messy));

    expect(new URL(link).searchParams.get("ref")).toBe(messy);
  });
});
