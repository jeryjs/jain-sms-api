// controllers/smsController.js
// SMS sending logic and Pragati API integration

const fs = require('fs');
const path = require('path');

// --- Token cache file path ---
const TOKEN_CACHE_FILE = path.join(__dirname, '..', '.token-cache.json');

// --- Load token from disk on startup ---
let cachedToken = loadTokenFromDisk();

// --- Promise lock to prevent duplicate token fetches ---
let tokenRefreshPromise = null;

function loadTokenFromDisk() {
  try {
    if (fs.existsSync(TOKEN_CACHE_FILE)) {
      const data = fs.readFileSync(TOKEN_CACHE_FILE, 'utf8');
      const token = JSON.parse(data);
      console.log('[SMS] Loaded cached token from disk');
      return token;
    }
  } catch (error) {
    console.warn('[SMS] Failed to load token from disk:', error.message);
  }
  return { token: null, expiry: 0 };
}

function saveTokenToDisk(token) {
  try {
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(token, null, 2), 'utf8');
    console.log('[SMS] Saved token to disk');
  } catch (error) {
    console.error('[SMS] Failed to save token to disk:', error.message);
  }
}

/**
 * Get or refresh authentication token from Pragati API
 * Prevents race conditions when multiple requests arrive simultaneously
 */
async function getAuthToken() {
  // Return cached token if still valid
  if (cachedToken.token && Date.now() < cachedToken.expiry) {
    console.log('[SMS] Using cached auth token');
    return cachedToken.token;
  }

  // If another request is already fetching a token, wait for it
  if (tokenRefreshPromise) {
    console.log('[SMS] Token refresh in progress, waiting...');
    await tokenRefreshPromise;
    // After waiting, the token should be cached, return it
    if (cachedToken.token && Date.now() < cachedToken.expiry) {
      console.log('[SMS] Using newly refreshed token');
      return cachedToken.token;
    }
  }

  // Start token refresh and store the promise
  console.log('[SMS] Fetching new auth token...');
  const API_BASE_URL = process.env.PRAGATI_API_BASE_URL;
  const API_KEY = process.env.PRAGATI_API_KEY;

  if (!API_BASE_URL || !API_KEY) {
    throw new Error('PRAGATI_API_BASE_URL or PRAGATI_API_KEY not configured');
  }

  const tokenUrl = `${API_BASE_URL}/api/sendsms/token?action=generate`;

  // Create a promise for this token refresh
  tokenRefreshPromise = (async () => {
    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'apikey': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ old_token: cachedToken.token || '' }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get auth token: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const token = data.token;

      if (!token) {
        throw new Error('Token not found in API response');
      }

      // Enable the token
      const enableResponse = await fetch(
        `${API_BASE_URL}/api/sendsms/token?action=enable&token=${token}`,
        { method: 'POST', headers: { 'apikey': API_KEY } }
      );

      if (!enableResponse.ok) {
        console.warn('[SMS] Error: Failed to enable token...');
        const errorText = await enableResponse.text();
        throw new Error(`Failed to enable token: ${enableResponse.status} ${errorText}`);
      }


      // Cache for 6 days (safe margin, docs say 7 days)
      const expiryTimestamp = Date.now() + (6 * 24 * 60 * 60 * 1000);
      cachedToken = { token, expiry: expiryTimestamp };

      // Persist to disk
      saveTokenToDisk(cachedToken);

      console.log('[SMS] Successfully cached new auth token');
      return token;
    } catch (error) {
      console.error('[SMS] Error fetching auth token:', error);
      throw error;
    } finally {
      // Clear the promise lock after completion (success or failure)
      tokenRefreshPromise = null;
    }
  })();

  // Wait for and return the result
  return await tokenRefreshPromise;
}

/**
 * Replace {#var#} placeholders in template with provided values
 */
function applyTemplate(template, vars = []) {
  let idx = 0;
  return template.replace(/\{\#var\#\}/g, () => {
    const v = vars[idx++] ?? '';
    return String(v);
  });
}

/**
 * Validate phone number (Indian format)
 */
function validatePhoneNumber(phone) {
  const cleaned = phone.replace(/\D/g, '');
  // Indian mobile: 10 digits starting with 6-9
  return /^[6-9]\d{9}$/.test(cleaned);
}

/**
 * Format phone number with country code
 */
function formatPhoneWithCountryCode(phone) {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.startsWith('91') ? cleaned : `91${cleaned}`;
}

/**
 * Parse Pragati API response with comma-separated error codes
 * Response format: guid=...&errorcode=0,0,7,0&seqno=919...,919...
 * @param {string} responseText - Raw response from Pragati API
 * @param {number} recipientCount - Number of recipients in the request
 * @returns {Array<{success: boolean, guid: string|null, errorCode: string, errorMessage: string|null, seqno: string|null}>}
 */
function parsePragatiResponse(responseText, recipientCount) {
  const guidMatch = responseText.match(/guid=([^&]+)/);
  const errorCodesMatch = responseText.match(/errorcode=([^&]+)/);
  const seqnosMatch = responseText.match(/seqno=([^&]+)/);

  const guid = guidMatch ? guidMatch[1] : null;
  const errorCodesStr = errorCodesMatch ? errorCodesMatch[1] : '0';
  const seqnos = seqnosMatch ? seqnosMatch[1].split(',') : [];

  // Split comma-separated error codes
  const errorCodes = errorCodesStr.split(',');

  const errorMessages = {
    '1': 'Invalid Receiver - Mobile number is invalid or greater than 16 digits',
    '2': 'Invalid Sender - Wrong sender ID or greater than 16 digits',
    '3': 'Invalid Message - Blank message or template does not match DLT template ID',
    '4': 'Service not available - Operator or server down',
    '5': 'Authorization failed - Wrong credentials',
    '6': 'Contract Expired',
    '7': 'Credit Expired - Account balance is zero',
    '8': 'Empty Receiver - No recipient number provided',
    '14': 'Non-compliant message - Violates TRAI guidelines or template mismatch'
  };

  // Return array of results for each recipient
  return errorCodes.map((code, index) => ({
    success: code === '0',
    guid: code === '0' ? guid : null,
    errorCode: code,
    errorMessage: code !== '0' ? (errorMessages[code] || `Unknown error code: ${code}`) : null,
    seqno: seqnos[index] || null
  }));
}

/**
 * @typedef {Object} SmsResult
 * @property {string} phone - Recipient phone number
 * @property {boolean} success - Whether SMS was sent successfully
 * @property {string} [guid] - Pragati API GUID for successful messages
 * @property {string} [error] - Error message if failed
 * @property {string} [errorCode] - Pragati error code if failed
 */

/**
 * Send bulk SMS
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
async function sendBulkSMS(req, res, next) {
  try {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[SMS][${requestId}] === NEW REQUEST ===`);

    const { template, templateid, recipients } = req.body;

    // Validation
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'recipients must be a non-empty array'
      });
    }

    if (recipients.length > 1000) {
      return res.status(400).json({
        error: 'Too many recipients',
        message: 'Maximum 1000 recipients per request'
      });
    }

    // Validate each recipient
    for (const recipient of recipients) {
      if (!recipient.phone || !validatePhoneNumber(recipient.phone)) {
        return res.status(400).json({
          error: 'Invalid phone number',
          message: `Invalid phone number: ${recipient.phone || 'missing'}`
        });
      }

      if (!recipient.message && !template) {
        return res.status(400).json({
          error: 'Invalid recipient',
          message: 'Each recipient must have a message, or provide a template'
        });
      }
    }

    const API_BASE_URL = process.env.PRAGATI_API_BASE_URL;
    const SENDER_ID = process.env.SMS_SENDER_ID;

    if (!API_BASE_URL || !SENDER_ID || !templateid) {
      throw new Error('SMS configuration incomplete');
    }

    const token = await getAuthToken();
    /** @type {SmsResult[]} */
    const results = [];

    // Group recipients by message content for bulk efficiency
    const groupedByMessage = {};

    for (const recipient of recipients) {
      const messageText = recipient.message ||
        (template ? applyTemplate(template, recipient.templateVars || []) : '');

      if (!groupedByMessage[messageText]) {
        groupedByMessage[messageText] = [];
      }
      groupedByMessage[messageText].push(recipient);
    }

    // Split groups larger than 100 into batches (Pragati API limit)
    const batches = [];
    for (const [messageText, group] of Object.entries(groupedByMessage)) {
      if (group.length <= 100) {
        batches.push({ messageText, recipients: group });
      } else {
        // Split into chunks of 100
        for (let i = 0; i < group.length; i += 100) {
          batches.push({
            messageText,
            recipients: group.slice(i, i + 100)
          });
        }
      }
    }

    console.log(`[SMS][${requestId}] Processing ${recipients.length} recipients in ${batches.length} batches`);

    // Send each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const { messageText, recipients: group } = batches[batchIndex];
      const phoneNumbers = group
        .map(r => formatPhoneWithCountryCode(r.phone))
        .join(',');

      const params = new URLSearchParams({
        to: phoneNumbers,
        from: SENDER_ID,
        text: messageText,
        category: 'bulk',
        'dlt-templateid': templateid,
      });

      try {
        console.log(`[SMS][${requestId}] Batch ${batchIndex + 1}/${batches.length}: Sending to ${group.length} recipients`);

        const response = await fetch(`${API_BASE_URL}/sendsms?${params.toString()}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const responseText = await response.text();
        const parsedResults = parsePragatiResponse(responseText, group.length);

        if (!response.ok) {
          console.error(`[SMS][${requestId}] HTTP Error: ${response.status}`);
          group.forEach(recipient => {
            results.push({
              phone: recipient.phone,
              success: false,
              error: `HTTP ${response.status}: ${responseText}`
            });
          });
        } else {
          // Match each parsed result to each recipient
          const successCount = parsedResults.filter(r => r.success).length;
          const failedCount = parsedResults.length - successCount;

          if (failedCount > 0) {
            console.log(`[SMS][${requestId}] Partial success: ${successCount} sent, ${failedCount} failed | Response: ${responseText.split('&seqno=')[0]}`);
          } else {
            console.log(`[SMS][${requestId}] All ${successCount} SMS sent successfully | Response: ${responseText.split('&seqno=')[0]}`);
          }

          group.forEach((recipient, index) => {
            const parsed = parsedResults[index] || parsedResults[0]; // Fallback to first if mismatch

            if (parsed.success) {
              results.push({
                phone: recipient.phone,
                success: true,
                guid: parsed.guid,
                seqno: parsed.seqno
              });
            } else {
              console.error(`[SMS][${requestId}] Error for ${recipient.phone}: [${parsed.errorCode}] ${parsed.errorMessage}`);
              results.push({
                phone: recipient.phone,
                success: false,
                error: parsed.errorMessage,
                errorCode: parsed.errorCode
              });
            }
          });
        }
      } catch (error) {
        console.error(`[SMS][${requestId}] Send error:`, error);

        group.forEach(recipient => {
          results.push({
            phone: recipient.phone,
            success: false,
            error: error.message
          });
        });
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Response
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;

    res.json({
      success: true,
      message: `Sent ${successCount} SMS, ${failedCount} failed`,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failedCount
      },
      results
    });

  } catch (error) {
    next(error);
  }
}

/**
 * Send single SMS (convenience endpoint)
 */
async function sendSingleSMS(req, res, next) {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'phone and message are required'
      });
    }

    if (!validatePhoneNumber(phone)) {
      return res.status(400).json({
        error: 'Invalid phone number',
        message: 'Phone number must be a valid 10-digit Indian mobile number'
      });
    }

    // Reuse bulk endpoint logic
    req.body = {
      recipients: [{ phone, message }]
    };

    return sendBulkSMS(req, res, next);

  } catch (error) {
    next(error);
  }
}

/**
 * Get token status
 */
function getTokenStatus(req, res) {
  const isValid = cachedToken.token && Date.now() < cachedToken.expiry;
  const expiresIn = isValid ? Math.floor((cachedToken.expiry - Date.now()) / 1000) : 0;

  res.json({
    valid: isValid,
    expiresIn: expiresIn > 0 ? `${Math.floor(expiresIn / 3600)}h ${Math.floor((expiresIn % 3600) / 60)}m` : 'expired',
    expiresAt: isValid ? new Date(cachedToken.expiry).toISOString() : null
  });
}

module.exports = {
  sendBulkSMS,
  sendSingleSMS,
  getTokenStatus
};
