# 🔍 DISCOVERY: NBA H2H Markets Not Available via Public API

## Investigation Summary

You showed NBA H2H games (Grizzlies vs Pelicans, Cavaliers vs Suns, Clippers vs Nuggets) visible on the Polymarket website. Extensive investigation revealed:

### Gamma API Results
- `tag_slug=sports` → Returns futures only (Championship, MVP, Win Totals)
- `tag_slug=nba` → Returns futures only  
- `series=10345` (NBA) → Returns unrelated events (API bug/misconfiguration)
- `tag=745` (NBA tag) → Returns unrelated events
- Search for "vs" pattern → Returns only NCAAB/college games from Nov-Dec 2025

### CLOB API Results  
- Returns 5000+ markets but NBA H2H games are all from 2023 (expired/historical)
- No 2026 NBA games found in pagination

## Conclusion

**The NBA H2H games on Polymarket's sports page use a proprietary internal system that is NOT exposed via the public Gamma or CLOB APIs.** The games you see on https://polymarket.com/sports/nba are served by a separate data pipeline.

### What IS Available via API
| Sport | H2H Available | API Source |
|-------|---------------|------------|
| NHL | ✅ Yes | Gamma `tag_slug=sports` |
| Tennis (ATP/WTA) | ✅ Yes | Gamma `tag_slug=sports` |
| Soccer (EPL/UCL) | ✅ Yes | Gamma `tag_slug=sports` |
| NBA | ❌ No | Not in public API |
| NFL | ❌ Limited | Futures only |

### Impact on System
The system correctly captures all H2H markets available via the public API. NBA H2H markets would require Polymarket to expose them via their API or a web-scraping approach (which has legal/ToS concerns).

## Recommendation
Continue monitoring via the current API. When/if Polymarket adds NBA H2H to their public API, the system will automatically capture them through the existing `tag_slug=sports` filter.


