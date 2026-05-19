import { ScenarioClient } from './client';

export interface GetAssetUrlParams {
  apiKey: string;
  apiSecret: string;
  assetId: string;
}

/**
 * Retrieves asset details (download URL, type, MIME type) from the Scenario API.
 */
export async function getAssetUrl(
  params: GetAssetUrlParams
): Promise<{ url: string; type: string; mimeType: string }> {
  const { apiKey, apiSecret, assetId } = params;
  const client = new ScenarioClient(apiKey, apiSecret);
  return client.getAsset(assetId);
}
