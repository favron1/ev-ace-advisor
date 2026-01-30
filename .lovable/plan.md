

# Clean Up Non-Tradeable Markets ✅

## Status: COMPLETE

### Execution Results

| Action | Result |
|--------|--------|
| Deleted futures markets | ✅ 1,356 removed |
| Deleted prop markets | ✅ 75 removed |
| Deleted player_prop markets | ✅ 12 removed |
| Added NON_TRADEABLE_KEYWORDS blocklist | ✅ Done |
| Deployed updated sync function | ✅ Done |

### Final Cache State

| Market Type | Count |
|-------------|-------|
| h2h | 219 |
| total | 35 |
| spread | 1 |
| **Total** | **255** |

### Changes Made

1. **Database Cleanup**: Removed 1,443 non-tradeable entries (futures, props, player_props)

2. **Sync Hardening** (`polymarket-sync-24h/index.ts`):
   - Added `NON_TRADEABLE_KEYWORDS` blocklist (line 108-117)
   - Added filter check before upsert to skip Olympics, MVP, Championship futures
   - Added `skipped_non_tradeable` counter in response stats

### Blocklist Keywords
```
championship, champion, mvp, dpoy, opoy, award, trophy, 
coach of the year, olympic, gold medal, world series winner,
super bowl winner, winner.*202[6-9], coach.*year, rookie.*year,
division.*winner, conference.*winner, finals.*winner
```

---

Future syncs will automatically skip non-tradeable markets.
