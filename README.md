# Jain SMS API

Standalone Express-based SMS API for Jain University using Pragati Infocom SMS gateway.

## Features

- ✅ **Secure REST API** with API key authentication
- ✅ **Bulk SMS** support (up to 100 recipients per request)
- ✅ **Token caching** (6-day cache, persisted to disk, race-condition safe)
- ✅ **Pragati error code parsing** (detects template mismatches, invalid numbers, etc.)
- ✅ **Rate limiting** to prevent abuse
- ✅ **PM2 ready** for production deployment
- ✅ **DLT compliant** for Indian SMS regulations

## Quick Start

```bash
cd sms-api
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

## API Endpoints

### Health Check
```bash
GET /health
```

### Send SMS
```bash
POST /api/sms/send
X-API-Key: your-api-secret-key
Content-Type: application/json

{
  "template": "Your message with {#var#} variables",
  "templateid": "1007384370833937775",
  "recipients": [
    {"phone": "9876543210", "templateVars": ["value1", "value2"]}
  ]
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {"phone": "9876543210", "success": true, "guid": "kpaug..."}
  ]
}
```

**Error codes:** `1`=Invalid number, `3`=Template mismatch, `14`=TRAI violation

### Token Status
```bash
GET /api/sms/token-status
X-API-Key: your-api-secret-key
```

## Deployment

```bash
npm install -g pm2
npm run pm2:start
pm2 logs jain-sms-api
```

**For HTTPS setup:** See [DEPLOYMENT.md](DEPLOYMENT.md)

## Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide with Caddy HTTPS
- **[TOKEN-FLOW-ANALYSIS.md](TOKEN-FLOW-ANALYSIS.md)** - Token management internals
- **[DOCS.md](DOCS.md)** - Documentation index

## License

AGPL-3.0-only
