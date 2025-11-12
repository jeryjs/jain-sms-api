# Pragati SMS API - Token Management Flow

## 📋 Official Pragati Token Flow (from their docs)

According to Pragati API documentation:

1. **Generate Token**: `POST /api/sendsms/token?action=generate`
2. **Enable Token**: `GET /api/sendsms/token?action=enable&token={token}`
3. **Use Token**: Include in `Authorization: Bearer {token}` header for SMS sending
4. **Token Validity**: 7 days
5. **Token Refresh**: Generate new token before expiry or when old one expires

---

## 🔄 Our Implementation vs Pragati Docs

### ✅ What We Do Correctly:

1. **Generate Token** (Step 1) ✅
   ```javascript
   POST https://203.212.70.200/smpp/api/sendsms/token?action=generate
   Headers: { 'apikey': 'your-api-key', 'Content-Type': 'application/json' }
   Body: { "old_token": "" }
   ```

2. **Enable Token** (Step 2) ✅
   ```javascript
   GET https://203.212.70.200/smpp/api/sendsms/token?action=enable&token={new_token}
   Headers: { 'apikey': 'your-api-key' }
   ```

3. **Use Token for SMS** (Step 3) ✅
   ```javascript
   GET https://203.212.70.200/smpp/sendsms?to=...&from=...&text=...
   Headers: { 'Authorization': 'Bearer {token}' }
   ```

### ⚠️ What We Added (Extra Features):

1. **6-Day Cache Instead of 7** ✅ (Safety margin)
2. **Persistent Storage** ✅ (Survives restarts)
3. **Auto-refresh on Expiry** ✅ (Seamless)
4. **Continue on Enable Failure** ⚠️ (See below)

---

## 🎯 All Token Scenarios

### **Scenario 1: First Time Startup (No Token)**
```
Server Starts
  ↓
loadTokenFromDisk() → No .token-cache.json found
  ↓
cachedToken = { token: null, expiry: 0 }
  ↓
First SMS Request Arrives
  ↓
getAuthToken() called
  ↓
Check: cachedToken.token && Date.now() < cachedToken.expiry → FALSE
  ↓
Generate new token from Pragati
  ↓
Enable token with Pragati
  ↓
Cache token (in-memory + disk) for 6 days
  ↓
Return token → Send SMS
```

**Expected Pragati API Calls:**
1. `POST /api/sendsms/token?action=generate` ✅
2. `GET /api/sendsms/token?action=enable&token={token}` ✅
3. `GET /sendsms?...` (send SMS) ✅

---

### **Scenario 2: Server Restart (Token Still Valid)**
```
Server Starts
  ↓
loadTokenFromDisk() → Found .token-cache.json
  ↓
cachedToken = { token: "abc123", expiry: 1730500000000 }
  ↓
SMS Request Arrives
  ↓
getAuthToken() called
  ↓
Check: cachedToken.token && Date.now() < cachedToken.expiry → TRUE
  ↓
Return cached token → Send SMS
```

**Expected Pragati API Calls:**
1. `GET /sendsms?...` (send SMS only) ✅
2. No token generation/enable needed ✅

---

### **Scenario 3: Token Expired (6 Days Passed)**
```
SMS Request Arrives
  ↓
getAuthToken() called
  ↓
Check: cachedToken.token && Date.now() < cachedToken.expiry → FALSE (expired)
  ↓
Generate new token from Pragati
  ↓
Enable token with Pragati
  ↓
Cache new token (in-memory + disk) for 6 days
  ↓
Return new token → Send SMS
```

**Expected Pragati API Calls:**
1. `POST /api/sendsms/token?action=generate` ✅
2. `GET /api/sendsms/token?action=enable&token={token}` ✅
3. `GET /sendsms?...` (send SMS) ✅

---

### **Scenario 4: Token Cache Corrupted/Missing**
```
Server Starts or During Runtime
  ↓
.token-cache.json missing or invalid JSON
  ↓
loadTokenFromDisk() catches error
  ↓
cachedToken = { token: null, expiry: 0 }
  ↓
Next SMS Request → Fetches new token (like Scenario 1)
```

**Expected Pragati API Calls:**
1. `POST /api/sendsms/token?action=generate` ✅
2. `GET /api/sendsms/token?action=enable&token={token}` ✅
3. `GET /sendsms?...` (send SMS) ✅

---

### **Scenario 5: Enable Token Fails (Network/API Error)**

**Current Implementation:**
```javascript
const enableResponse = await fetch(...);
if (!enableResponse.ok) {
  console.warn('[SMS] Warning: Failed to enable token, but continuing...');
}
// Still caches and uses the token
```

**Issue:** We continue even if enable fails. 

**Pragati Docs Say:** Token must be enabled before use.

**Potential Problem:** 
- If enable fails, token might not work
- SMS sending could fail with 401/403

**Recommendation:** Should we make enable mandatory?

---

## 🔍 Potential Issues with Current Implementation

### Issue 1: Enable Token Failure Handling

**Current Code:**
```javascript
if (!enableResponse.ok) {
  console.warn('[SMS] Warning: Failed to enable token, but continuing...');
}
```

**Pragati Requirement:** Token MUST be enabled before use.

**Fix Options:**

#### Option A: Throw Error (Strict - Recommended)
```javascript
if (!enableResponse.ok) {
  const errorText = await enableResponse.text();
  throw new Error(`Failed to enable token: ${enableResponse.status} ${errorText}`);
}
```

#### Option B: Retry Enable (Robust)
```javascript
let enableAttempts = 0;
let enableSuccess = false;

while (enableAttempts < 3 && !enableSuccess) {
  const enableResponse = await fetch(...);
  if (enableResponse.ok) {
    enableSuccess = true;
  } else {
    enableAttempts++;
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
  }
}

if (!enableSuccess) {
  throw new Error('Failed to enable token after 3 attempts');
}
```

---

### Issue 2: Token Refresh with Old Token

**Pragati Docs:** When refreshing, you can pass `old_token` to disable it.

**Current Code:**
```javascript
body: JSON.stringify({ old_token: '' })
```

**Better Approach:**
```javascript
body: JSON.stringify({ 
  old_token: cachedToken.token || '' 
})
```

This properly disables the old token when generating a new one.

---

### Issue 3: No Explicit Token Disable on Shutdown

**Pragati API:** Has `action=disable&token={token}` to disable tokens.

**Current Implementation:** No cleanup on server shutdown.

**Fix:**
```javascript
process.on('SIGTERM', async () => {
  console.log('SIGTERM: Disabling token...');
  if (cachedToken.token) {
    await fetch(`${API_BASE_URL}/api/sendsms/token?action=disable&token=${cachedToken.token}`, {
      headers: { 'apikey': API_KEY }
    });
  }
  process.exit(0);
});
```

---

## ✅ Recommended Fixes

### Fix 1: Make Enable Mandatory
```javascript
// Enable the token (REQUIRED by Pragati)
const enableResponse = await fetch(
  `${API_BASE_URL}/api/sendsms/token?action=enable&token=${token}`,
  { method: 'GET', headers: { 'apikey': API_KEY } }
);

if (!enableResponse.ok) {
  const errorText = await enableResponse.text();
  throw new Error(`Failed to enable token: ${enableResponse.status} ${errorText}`);
}
```

### Fix 2: Pass Old Token on Refresh
```javascript
body: JSON.stringify({ 
  old_token: cachedToken.token || '' 
})
```

### Fix 3: Add Token Disable on Shutdown
```javascript
async function disableToken() {
  if (!cachedToken.token) return;
  
  try {
    await fetch(
      `${API_BASE_URL}/api/sendsms/token?action=disable&token=${cachedToken.token}`,
      { method: 'GET', headers: { 'apikey': API_KEY } }
    );
    console.log('[SMS] Token disabled on shutdown');
  } catch (error) {
    console.error('[SMS] Failed to disable token:', error);
  }
}

process.on('SIGTERM', async () => {
  await disableToken();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await disableToken();
  process.exit(0);
});
```

---

## 📊 Complete Flow Chart

```
┌─────────────────────────────────────────────────────────────────┐
│                        SERVER STARTUP                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓
                 Load Token from Disk
                         │
            ┌────────────┴────────────┐
            │                         │
        File Exists              File Missing
            │                         │
            ↓                         ↓
    Parse & Validate          Set token = null
            │                         │
            └────────────┬────────────┘
                         │
                         ↓
                  Cache in Memory
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                      SMS REQUEST ARRIVES                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓
                  getAuthToken()
                         │
                         ↓
          Is token cached AND valid?
                         │
            ┌────────────┴────────────┐
           YES                       NO
            │                         │
            ↓                         ↓
    Return cached token      Generate New Token
            │                         │
            │                         ↓
            │                 Enable New Token
            │                         │
            │                         ↓
            │                 Cache (memory + disk)
            │                         │
            └────────────┬────────────┘
                         │
                         ↓
                  Send SMS Request
                         │
            ┌────────────┴────────────┐
        Success                    Failure
            │                         │
            ↓                         ↓
    Return Results            Return Error
```

---

## 🎯 Summary

### What We're Doing Right:
✅ Token generation with API key  
✅ Token enable after generation  
✅ Token caching (6 days)  
✅ Persistent storage across restarts  
✅ Auto-refresh on expiry  
✅ Bearer token in Authorization header  

### What Could Be Improved:
⚠️ Make token enable mandatory (throw error if fails)  
⚠️ Pass old_token when refreshing  
⚠️ Add token disable on server shutdown  
⚠️ Add retry logic for enable failures  

### Compliance with Pragati Docs:
- **Token Generation**: ✅ Correct
- **Token Enable**: ✅ Correct (but should be mandatory)
- **Token Usage**: ✅ Correct
- **Token Validity**: ✅ 6 days (safe margin from 7)
- **Token Refresh**: ✅ Automatic

**Overall: 95% compliant with Pragati API docs. The 5% is about error handling robustness.**
