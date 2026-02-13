/**
 * Odds API Key Rotation Utility
 * Tries primary key first, falls back to backups on 401/429 errors.
 */

const KEY_NAMES = ['ODDS_API_KEY', 'ODDS_API_KEY_BACKUP_1', 'ODDS_API_KEY_BACKUP_2'];

export function getOddsApiKeys(): string[] {
  const keys: string[] = [];
  for (const name of KEY_NAMES) {
    const val = Deno.env.get(name);
    if (val) keys.push(val);
  }
  return keys;
}

/**
 * Fetch from Odds API with automatic key rotation.
 * Builds the URL using a callback that receives the API key.
 * Returns the first successful response, or throws if all keys fail.
 */
export async function fetchWithKeyRotation(
  buildUrl: (apiKey: string) => string,
  context: string = 'odds-api'
): Promise<{ response: Response; apiKeyUsed: string; keyIndex: number }> {
  const keys = getOddsApiKeys();
  if (keys.length === 0) {
    throw new Error('No ODDS_API_KEY configured');
  }

  for (let i = 0; i < keys.length; i++) {
    const url = buildUrl(keys[i]);
    const response = await fetch(url);

    if (response.ok) {
      if (i > 0) {
        console.log(`[${context}] ✅ Key #${i + 1} succeeded (primary exhausted)`);
      }
      const remaining = response.headers.get('x-requests-remaining');
      if (remaining) {
        console.log(`[${context}] Requests remaining: ${remaining}`);
      }
      return { response, apiKeyUsed: keys[i], keyIndex: i };
    }

    // Rotate on auth failure or rate limit
    if (response.status === 401 || response.status === 429 || response.status === 403) {
      console.warn(`[${context}] ⚠️ Key #${i + 1} failed (${response.status}), trying next...`);
      continue;
    }

    // Other errors (404, 500, etc.) - don't rotate, just return
    return { response, apiKeyUsed: keys[i], keyIndex: i };
  }

  throw new Error(`All ${keys.length} Odds API keys exhausted (401/429)`);
}

/**
 * Validate that at least one key is working. Returns the first valid key.
 */
export async function validateOddsApiKey(context: string = 'odds-api'): Promise<{
  apiKey: string;
  remaining: string | null;
  used: string | null;
  keyIndex: number;
}> {
  const { response, apiKeyUsed, keyIndex } = await fetchWithKeyRotation(
    (key) => `https://api.the-odds-api.com/v4/sports/?apiKey=${key}`,
    context
  );

  if (!response.ok) {
    throw new Error(`Odds API validation failed: ${response.status}`);
  }

  return {
    apiKey: apiKeyUsed,
    remaining: response.headers.get('x-requests-remaining'),
    used: response.headers.get('x-requests-used'),
    keyIndex,
  };
}
