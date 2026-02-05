 // ============================================================================
 // TEAM MAPPING CACHE
 // ============================================================================
 // Fetches user-defined team mappings from the database and caches them.
 // These mappings take HIGHEST PRIORITY over hardcoded aliases.
 // This closes the self-healing loop: manual corrections are immediately used.
 // ============================================================================
 
 interface CachedMappings {
   data: Map<string, string>;  // normalized source_name → canonical_name
   fetchedAt: number;
   sportCode: string;
 }
 
 // Per-sport cache to avoid cross-contamination
 const cacheByCode: Map<string, CachedMappings> = new Map();
 const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
 
 /**
  * Normalize a source name for lookup (lowercase, remove punctuation, trim).
  */
 function normalizeKey(name: string): string {
   return name
     .toLowerCase()
     .replace(/[^a-z0-9\s]/g, '')
     .replace(/\s+/g, ' ')
     .trim();
 }
 
 /**
  * Fetch user-defined team mappings from the database.
  * Returns a Map of normalized source_name → canonical_name.
  * Cached for 5 minutes per sport code.
  * 
  * @param supabase - Supabase client instance
  * @param sportCode - Sport code (e.g., "basketball_nba", "icehockey_nhl")
  * @returns Map of source names to canonical names
  */
 export async function getTeamMappings(
   supabase: any,
   sportCode: string
 ): Promise<Map<string, string>> {
   const now = Date.now();
   
   // Check cache validity
   const cached = cacheByCode.get(sportCode);
   if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
     return cached.data;
   }
   
   try {
     // Fetch from database
     const { data, error } = await supabase
       .from('team_mappings')
       .select('source_name, canonical_name')
       .eq('sport_code', sportCode);
     
     if (error) {
       console.warn(`[team-mapping-cache] Failed to fetch mappings for ${sportCode}:`, error.message);
       // Return empty map on error, don't cache
       return cached?.data || new Map();
     }
     
     // Build the lookup map
     const map = new Map<string, string>();
     for (const row of data || []) {
       const key = normalizeKey(row.source_name);
       map.set(key, row.canonical_name);
     }
     
     // Store in cache
     cacheByCode.set(sportCode, {
       data: map,
       fetchedAt: now,
       sportCode,
     });
     
     console.log(`[team-mapping-cache] Loaded ${map.size} mappings for ${sportCode}`);
     return map;
     
   } catch (err) {
     console.error(`[team-mapping-cache] Error fetching mappings for ${sportCode}:`, err);
     return cached?.data || new Map();
   }
 }
 
 /**
  * Fetch mappings for ALL sport codes at once (useful for batch operations).
  * Returns a Map keyed by "sportCode|normalizedSourceName" → canonical_name.
  * 
  * @param supabase - Supabase client instance
  * @returns Map of composite keys to canonical names
  */
 export async function getAllTeamMappings(
   supabase: any
 ): Promise<Map<string, string>> {
   try {
     const { data, error } = await supabase
       .from('team_mappings')
       .select('source_name, canonical_name, sport_code');
     
     if (error) {
       console.warn(`[team-mapping-cache] Failed to fetch all mappings:`, error.message);
       return new Map();
     }
     
     const map = new Map<string, string>();
     for (const row of data || []) {
       const key = `${row.sport_code}|${normalizeKey(row.source_name)}`;
       map.set(key, row.canonical_name);
     }
     
     console.log(`[team-mapping-cache] Loaded ${map.size} total mappings across all sports`);
     return map;
     
   } catch (err) {
     console.error(`[team-mapping-cache] Error fetching all mappings:`, err);
     return new Map();
   }
 }
 
 /**
  * Clear the cache (useful for testing or after bulk updates).
  */
 export function clearMappingCache(): void {
   cacheByCode.clear();
 }