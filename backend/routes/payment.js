// routes/payment.js — All payment-related endpoints
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../lib/supabase');
const { upload } = require('../lib/cloudinary');

// ─── Helper: generate a human-readable unique reference ─────
function generateReference() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `DTX-${code}`; // e.g. DTX-AB12CD34
}

// ─── Helper: sanitize string input ──────────────────────────
function sanitize(str, maxLen = 255) {
  if (typeof str !== 'string') return null;
  return str.trim().slice(0, maxLen);
}

// ────────────────────────────────────────────────────────────
// POST /create-payment
// Called by mobile app to initialize a payment session
// Body: { user_id }  (passed from your app's auth context)
// ────────────────────────────────────────────────────────────
router.post('/create-payment', async (req, res) => {
  try {
    const { user_id } = req.body;

    // Validate user_id
    if (!user_id || typeof user_id !== 'string' || user_id.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required',
      });
    }

    const reference = generateReference();
    const payment_id = uuidv4();

    // Insert a pending payment record
    const { data, error } = await supabase
      .from('payments')
      .insert({
        id: payment_id,
        user_id: sanitize(user_id),
        reference,
        status: 'pending',
        amount: parseFloat(process.env.SUBSCRIPTION_PRICE_USD || '20'),
        currency: 'USD',
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      payment_id: data.id,
      reference: data.reference,
      checkout_url: `${process.env.FRONTEND_URL}/checkout.html?payment_id=${data.id}`,
    });
  } catch (err) {
    console.error('[POST /create-payment]', err);
    return res.status(500).json({ success: false, error: 'Failed to create payment' });
  }
});

// ────────────────────────────────────────────────────────────
// GET /payment/:payment_id
// Fetches payment details for the checkout page
// Returns ONLY safe fields — never expose user PII unnecessarily
// ────────────────────────────────────────────────────────────
router.get('/payment/:payment_id', async (req, res) => {
  try {
    const { payment_id } = req.params;

    if (!payment_id) {
      return res.status(400).json({ success: false, error: 'payment_id required' });
    }

    const { data, error } = await supabase
      .from('payments')
      .select('id, reference, status, amount, currency, created_at')
      .eq('id', payment_id)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    // Return checkout-safe fields plus static InstaPay info from env
    return res.json({
      success: true,
      payment: {
        id: data.id,
        reference: data.reference,
        status: data.status,
        amount: data.amount,
        currency: data.currency,
        created_at: data.created_at,
        instapay_account: process.env.INSTAPAY_ACCOUNT,
        instapay_holder: process.env.INSTAPAY_HOLDER,
      },
    });
  } catch (err) {
    console.error('[GET /payment/:id]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch payment' });
  }
});

// ────────────────────────────────────────────────────────────
// POST /upload-proof
// User submits their payment proof after paying via InstaPay
// Accepts: multipart/form-data
// Fields: payment_id, name, last4digits, transfer_time, proof_image (file)
// ────────────────────────────────────────────────────────────
router.post('/upload-proof', upload.single('proof_image'), async (req, res) => {
  try {
    const { payment_id, name, last4digits, transfer_time } = req.body;

    // ── Validate required fields ─────────────────────────────
    if (!payment_id) {
      return res.status(400).json({ success: false, error: 'payment_id is required' });
    }
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Valid name is required' });
    }
    if (!last4digits || !/^\d{4}$/.test(last4digits)) {
      return res.status(400).json({ success: false, error: 'last4digits must be exactly 4 digits' });
    }
    if (!transfer_time || transfer_time.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'transfer_time is required' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'proof_image is required' });
    }

    // ── Verify payment exists and is still pending ────────────
    const { data: payment, error: fetchErr } = await supabase
      .from('payments')
      .select('id, status')
      .eq('id', payment_id)
      .single();

    if (fetchErr || !payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }
    if (payment.status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: `Payment is already ${payment.status}`,
      });
    }

    // req.file.path = Cloudinary secure URL (set by multer-storage-cloudinary)
    const proof_image_url = req.file.path;

    // ── Update payment record with proof details ──────────────
    const { error: updateErr } = await supabase
      .from('payments')
      .update({
        name: sanitize(name, 100),
        last4digits: last4digits.trim(),
        transfer_time: sanitize(transfer_time, 50),
        proof_image_url,
        proof_submitted_at: new Date().toISOString(),
        status: 'under_review', // moves from pending → under_review
      })
      .eq('id', payment_id);

    if (updateErr) throw updateErr;

    return res.json({
      success: true,
      message: 'Payment proof submitted successfully. Your subscription will be activated after review.',
    });
  } catch (err) {
    console.error('[POST /upload-proof]', err);
    return res.status(500).json({ success: false, error: 'Failed to upload proof' });
  }
});

module.exports = router;
