// routes/sms.js
// SMS API routes

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { sendBulkSMS, sendSingleSMS, getTokenStatus } = require('../controllers/smsController');

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/sms/send
 * Send SMS to single or multiple recipients
 * 
 * Body:
 * {
 *   "recipients": [
 *     { "phone": "9876543210", "message": "Your custom message" }
 *   ],
 *   "template": "optional_template_string_with_{#var#}_placeholders",
 *   "templateVars": ["value1", "value2"]
 * }
 */
router.post('/send', sendBulkSMS);

/**
 * POST /api/sms/send-single
 * Send SMS to a single recipient (convenience endpoint)
 * 
 * Body:
 * {
 *   "phone": "9876543210",
 *   "message": "Your message here"
 * }
 */
router.post('/send-single', sendSingleSMS);

/**
 * GET /api/sms/token-status
 * Check if the cached API token is still valid
 */
router.get('/token-status', getTokenStatus);

module.exports = router;
