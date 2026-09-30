import { describe, it, expect } from "vitest";
import {
  chromeIntentUrl,
  detectInstallEnv,
  isReminderSnoozed,
  REMINDER_SNOOZE_MS,
} from "./install-env";

/* Real-world user agents (trimmed where the tail doesn't matter). */
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85 (iPhone15,3; iOS 18_5; en_US; en; scale=3.00; 1290x2796; 745218734)",
  iphoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBBV/745;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
  iphoneMessenger:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/500.0.0.37.110;FBBV/700;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.5]",
  ipadOs:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  androidFacebook:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/520.0.0.48.109;]",
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 Instagram 390.0.0.43.81 Android (34/14; 450dpi; 1080x2340; samsung; SM-A546E; a54x; s5e8835; en_US; 745218734)",
  androidTikTok:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 trill_2023904040 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/39.4.4 ByteLocale/en BytedanceWebview/d8a21c6",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
};

describe("detectInstallEnv", () => {
  it("recognises iPhone Safari", () => {
    expect(detectInstallEnv(UA.iphoneSafari, 5)).toEqual({
      os: "ios",
      inApp: null,
      iosSafari: true,
      iosBrowser: null,
    });
  });

  it("names other iOS browsers and does not call them Safari", () => {
    const env = detectInstallEnv(UA.iphoneChrome, 5);
    expect(env.os).toBe("ios");
    expect(env.iosSafari).toBe(false);
    expect(env.iosBrowser).toBe("Chrome");
  });

  it("treats a touch-screen 'Mac' as an iPad, and a real Mac as desktop", () => {
    expect(detectInstallEnv(UA.ipadOs, 5).os).toBe("ios");
    expect(detectInstallEnv(UA.macSafari, 0).os).toBe("desktop");
  });

  it("spots the social apps' built-in browsers on both phones", () => {
    expect(detectInstallEnv(UA.iphoneInstagram, 5).inApp).toBe("Instagram");
    expect(detectInstallEnv(UA.iphoneFacebook, 5).inApp).toBe("Facebook");
    expect(detectInstallEnv(UA.iphoneMessenger, 5).inApp).toBe("Messenger");
    expect(detectInstallEnv(UA.androidFacebook, 5).inApp).toBe("Facebook");
    expect(detectInstallEnv(UA.androidInstagram, 5).inApp).toBe("Instagram");
    expect(detectInstallEnv(UA.androidTikTok, 5).inApp).toBe("TikTok");
  });

  it("never marks an in-app browser as Safari", () => {
    expect(detectInstallEnv(UA.iphoneInstagram, 5).iosSafari).toBe(false);
  });

  it("leaves real Android browsers alone", () => {
    for (const ua of [UA.androidChrome, UA.androidSamsung]) {
      expect(detectInstallEnv(ua, 5)).toMatchObject({ os: "android", inApp: null });
    }
  });

  it("calls a computer a computer", () => {
    expect(detectInstallEnv(UA.desktopChrome, 0)).toMatchObject({
      os: "desktop",
      inApp: null,
    });
  });
});

describe("chromeIntentUrl", () => {
  it("reopens the same page, query string included, in Chrome", () => {
    const href = "https://app.swiftboxtt.com/install?utm_source=instagram&utm_medium=bio";
    const intent = chromeIntentUrl(href);
    expect(intent).toBe(
      "intent://app.swiftboxtt.com/install?utm_source=instagram&utm_medium=bio" +
        "#Intent;scheme=https;package=com.android.chrome;" +
        `S.browser_fallback_url=${encodeURIComponent(href)};end`
    );
  });
});

describe("isReminderSnoozed", () => {
  const now = Date.UTC(2026, 8, 29, 12);

  it("snoozes for 14 days after the X, then shows again", () => {
    expect(isReminderSnoozed(String(now - 1000), now)).toBe(true);
    expect(isReminderSnoozed(String(now - REMINDER_SNOOZE_MS + 1000), now)).toBe(true);
    expect(isReminderSnoozed(String(now - REMINDER_SNOOZE_MS), now)).toBe(false);
  });

  it("shows the bar for anything it can't trust", () => {
    for (const v of [null, "", "junk", "-5", "0", String(now + 60_000)]) {
      expect(isReminderSnoozed(v, now)).toBe(false);
    }
  });
});
