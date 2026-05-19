import type { ProductData } from "@shared/types";
import { getBrowser, UA } from "./browser";

/**
 * Extracts shop ID and item ID from a Shopee product URL.
 * Supports patterns:
 *   - /product/{shopid}/{itemid}
 *   - /i.{shopid}.{itemid}
 *
 * Returns null if IDs cannot be extracted.
 */
export function extractShopeeIds(url: string): { shopId: string; itemId: string } | null {
  const productMatch = url.match(/\/product\/(\d+)\/(\d+)/);
  if (productMatch) {
    return { shopId: productMatch[1], itemId: productMatch[2] };
  }

  const shortMatch = url.match(/\/i\.(\d+)\.(\d+)/);
  if (shortMatch) {
    return { shopId: shortMatch[1], itemId: shortMatch[2] };
  }

  return null;
}

/**
 * Formats a Shopee price value (in micro-units) to a localized "Rp" currency string.
 * Shopee API returns price in units of 100,000 (price / 100000 = actual price).
 */
function formatPrice(price: number): string {
  const actual = price / 100000;
  return `Rp ${actual.toLocaleString("id-ID")}`;
}

/**
 * Formats a rating number to one decimal place.
 */
function formatRating(rating: number): string {
  return rating.toFixed(1);
}

/**
 * Scrapes product data from a Shopee product page.
 *
 * Strategy:
 * 1. Navigate to the URL with Playwright + stealth plugin
 * 2. Extract shop ID and item ID from the URL
 * 3. If IDs found, attempt v4/item/get API fetch within browser context
 * 4. If API fails or IDs not found, fall back to DOM-based extraction
 * 5. Detect anti-bot blocking (no title after load + scroll)
 */
export async function scrapeShopee(url: string): Promise<ProductData> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: "id-ID",
  });
  const page = await ctx.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);

    // Scroll to trigger lazy-loaded content
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(500);
    }

    // Attempt API-based extraction if IDs are available
    const ids = extractShopeeIds(url);
    let apiData: any = null;

    if (ids) {
      try {
        apiData = await page.evaluate(
          async ({ shopId, itemId }: { shopId: string; itemId: string }) => {
            const res = await fetch(
              `/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`,
              { headers: { "X-Requested-With": "XMLHttpRequest" } }
            );
            if (!res.ok) return null;
            return await res.json();
          },
          { shopId: ids.shopId, itemId: ids.itemId }
        );
      } catch {
        // API fetch failed, will fall back to DOM extraction
      }
    }

    // If API returned valid data, use it
    if (apiData?.data) {
      const d = apiData.data;
      const images: string[] = (d.images || [])
        .map((id: string) => `https://down-id.img.susercontent.com/file/${id}`)
        .slice(0, 12);

      return {
        platform: "shopee",
        url,
        title: d.name || "",
        description: d.description || "",
        price: d.price ? formatPrice(d.price) : undefined,
        rating: d.item_rating?.rating_star
          ? formatRating(d.item_rating.rating_star)
          : undefined,
        images,
        scrapedAt: Date.now(),
      };
    }

    // DOM-based fallback extraction
    const data = await page.evaluate(() => {
      const pickText = (sel: string): string =>
        (document.querySelector(sel) as HTMLElement | null)?.innerText?.trim() || "";

      const title =
        pickText('div[class*="product-briefing"] span[class*="VCNVHn"]') ||
        pickText("h1") ||
        document.title;

      const price =
        pickText('div[class*="pqTWkA"]') ||
        pickText('div[class*="IZPeQz"]') ||
        "";

      const description =
        pickText('div[class*="f7AU53"]') ||
        pickText('section[class*="I_DV_3"]') ||
        "";

      // Collect images from Shopee CDN
      const imgSet = new Set<string>();
      document.querySelectorAll("img").forEach((img) => {
        const src = (img as HTMLImageElement).src || "";
        if (
          /susercontent/.test(src) &&
          /\.(jpg|jpeg|png|webp)/i.test(src)
        ) {
          imgSet.add(src);
        }
      });

      // Also check og:image meta tag
      const og = document.querySelector(
        'meta[property="og:image"]'
      ) as HTMLMetaElement | null;
      if (og?.content && /susercontent/.test(og.content)) {
        imgSet.add(og.content);
      }

      return {
        title,
        price,
        description,
        images: Array.from(imgSet).slice(0, 12),
      };
    });

    // Anti-bot detection: no title means page was likely blocked
    if (!data.title) {
      throw new Error(
        "Gagal ekstrak data Shopee (anti-bot mungkin aktif)."
      );
    }

    return {
      platform: "shopee",
      url,
      title: data.title,
      description: data.description,
      price: data.price || undefined,
      images: data.images,
      scrapedAt: Date.now(),
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}
