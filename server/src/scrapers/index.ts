import { detectPlatform } from '../../../shared/src/utils/platform-detection';
import { scrapeTokopedia } from './tokopedia';
import { scrapeShopee } from './shopee';
import type { ProductData } from '../../../shared/src/types';

/**
 * Scrapes product data from a given URL by detecting the platform
 * and routing to the appropriate scraper.
 *
 * @param url - The product URL to scrape
 * @returns Scraped product data
 * @throws Error if the platform is not supported
 */
export async function scrapeProduct(url: string): Promise<ProductData> {
  const platform = detectPlatform(url);

  switch (platform) {
    case 'tokopedia':
      return scrapeTokopedia(url);
    case 'shopee':
      return scrapeShopee(url);
    case 'unknown':
      throw new Error('URL tidak dikenali. Hanya Tokopedia & Shopee yang didukung.');
  }
}

export { detectPlatform };
