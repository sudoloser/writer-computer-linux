import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { detectPlatform, isAndroid } from "../src/lib/platform";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function setUserAgent(ua: string) {
  vi.stubGlobal("navigator", { userAgent: ua });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isAndroid", () => {
  test("true for an Android webview UA", () => {
    setUserAgent(ANDROID_UA);
    expect(isAndroid()).toBe(true);
  });

  test("false for a desktop UA", () => {
    setUserAgent(MAC_UA);
    expect(isAndroid()).toBe(false);
  });

  test("false when navigator is undefined", () => {
    expect(isAndroid()).toBe(false);
  });
});

describe("detectPlatform", () => {
  test("Android UA falls through to linux", () => {
    setUserAgent(ANDROID_UA);
    expect(detectPlatform()).toBe("linux");
  });
});
