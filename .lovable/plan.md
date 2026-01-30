

## Reset Daily API Counter

### What I'll Do

Reset your `daily_requests_used` counter back to 0 so you can continue scanning immediately.

### Database Change

**Update `scan_config` table:**
```sql
UPDATE scan_config 
SET daily_requests_used = 0
WHERE id = '29f25db2-f085-4901-b4eb-1fbe35dc9f11'
```

### Result

| Before | After |
|--------|-------|
| 105/100 requests | 0/100 requests |
| ❌ Scanning blocked | ✅ Scanning enabled |

After this change, you'll be able to run Full Scan immediately.

