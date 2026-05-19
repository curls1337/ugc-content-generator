import fs from "node:fs";

/**
 * Shared user agent string for all scraper requests.
 * Mimics a real Chrome 128 browser on Windows 10.
 */
export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

let browserPromise: Promise<any> | null = null;

/**
 * Returns a singleton Playwright browser instance configured with stealth plugin.
 * Prefers real Chrome (via CHROME_PATH env or platform-specific default paths),
 * falls back to bundled Chromium.
 *
 * Environment variables:
 * - CHROME_PATH: explicit path to Chrome executable
 * - SCRAPER_HEADLESS: set to "false" for headed mode (default: true)
 */
export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright-extra");
      const stealthPkg = await import("puppeteer-extra-plugin-stealth");
      const stealth = (stealthPkg as any).default
        ? (stealthPkg as any).default()
        : (stealthPkg as any)();
      (chromium as any).use(stealth);

      const launchOpts: any = {
        headless: process.env.SCRAPER_HEADLESS !== "false",
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ],
      };

      // Candidate Chrome paths: env var first, then platform-specific defaults
      const candidatePaths = [
        process.env.CHROME_PATH,
        process.platform === "win32"
          ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
          : null,
        process.platform === "darwin"
          ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
          : null,
      ].filter(Boolean) as string[];

      try {
        for (const p of candidatePaths) {
          if (fs.existsSync(p)) {
            console.log("[scraper] launching real Chrome:", p);
            return await (chromium as any).launch({ ...launchOpts, executablePath: p });
          }
        }
      } catch (e) {
        console.log("[scraper] real Chrome launch failed, falling back to Chromium:", e);
      }

      console.log("[scraper] launching bundled Chromium");
      return (chromium as any).launch(launchOpts);
    })();
  }
  return browserPromise;
}
