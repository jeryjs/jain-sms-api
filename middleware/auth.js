// middleware/auth.js
// API authentication middleware

function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const validKey = process.env.API_SECRET_KEY;

  if (!validKey) {
    console.error('[Auth] WARNING: API_SECRET_KEY not set in environment');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'API security not configured'
    });
  }

  if (!apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required. Provide via X-API-Key header or Authorization: Bearer token'
    });
  }

  if (apiKey !== validKey) {
    console.warn('[Auth] Invalid API key attempt from:', req.ip);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key'
    });
  }

  next();
}

module.exports = { authenticate };
