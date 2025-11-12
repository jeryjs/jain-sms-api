# 📚 Jain SMS API Documentation

Complete documentation for the standalone SMS API.

## 📄 Documents

### **README.md** - Quick Start & API Reference
- Installation & setup
- API endpoints with examples
- Pragati error codes reference
- Basic usage examples

### **DEPLOYMENT.md** - Production Deployment Guide
- Complete VM setup instructions
- PM2 configuration
- Caddy reverse proxy setup (HTTPS)
- Firewall configuration
- Troubleshooting guide
- Security checklist

### **TOKEN-FLOW-ANALYSIS.md** - Technical Deep Dive
- Token management flow diagrams
- All token scenarios (startup, expiry, cache, etc.)
- Race condition handling
- Implementation vs Pragati docs comparison
- Recommended improvements

## 🚀 Quick Links

- **Deploy to production:** See [DEPLOYMENT.md](DEPLOYMENT.md)
- **API usage:** See [README.md](README.md)
- **Token internals:** See [TOKEN-FLOW-ANALYSIS.md](TOKEN-FLOW-ANALYSIS.md)

## 📝 Key Features

✅ **Secure** - API key auth + CORS + rate limiting  
✅ **Reliable** - Persistent token cache, race-condition safe  
✅ **Smart** - Pragati error code parsing, template mismatch detection  
✅ **Production-ready** - PM2, Caddy HTTPS, comprehensive logging  

## 🔗 URLs

- Local: `http://localhost:3101`
- Production (if using Caddy): `https://sms-api.your-domain.com`

## 🛠️ Quick Commands

```bash
# Development
npm run dev

# Production
npm run pm2:start
pm2 logs jain-sms-api

# Test
curl -H "X-API-Key: your-key" http://localhost:3101/health
```
