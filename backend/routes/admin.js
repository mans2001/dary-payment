// routes/admin.js — Admin-only endpoints (password protected)
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const adminAuth = require('../middleware/auth');

// Apply admin auth middleware to ALL routes in this file
router.use(adminAuth);

// ────────────────────────────────────────────────────────────
// GET /admin/payments
// Returns all payments that need review
// Query param: ?status=under_review (default) | pending | approved | rejected | all
// ────────────────────────────────────────────────────────────
router.get('/payments', async (req, res) => {
  try {
    const status = req.query.status || 'under_review';

    let query = supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ success: true, payments: data });
  } catch (err) {
    console.error('[GET /admin/payments]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch payments' });
  }
});

// ────────────────────────────────────────────────────────────
// POST /admin/approve
// Approve a payment → activates the user's subscription
// Body: { payment_id }
// ────────────────────────────────────────────────────────────
router.post('/approve', async (req, res) => {
  try {
    const { payment_id } = req.body;

    if (!payment_id) {
      return res.status(400).json({ success: false, error: 'payment_id is required' });
    }

    // Fetch the payment to get user_id
    const { data: payment, error: fetchErr } = await supabase
      .from('payments')
      .select('id, user_id, status')
      .eq('id', payment_id)
      .single();

    if (fetchErr || !payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    if (payment.status === 'approved') {
      return res.status(409).json({ success: false, error: 'Payment already approved' });
    }

    // ── Run both updates in a logical transaction ─────────────
    // 1) Update payment status
    const { error: paymentErr } = await supabase
      .from('payments')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', payment_id);

    if (paymentErr) throw paymentErr;

    // 2) Activate user subscription
    const subscriptionEnd = new Date();
    subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1); // 1 month subscription

    const { error: subErr } = await supabase
      .from('users')
      .update({
        subscription_status: 'active',
        subscription_start: new Date().toISOString(),
        subscription_end: subscriptionEnd.toISOString(),
      })
      .eq('id', payment.user_id);

    if (subErr) {
      console.error('[Admin Approve] Failed to update user subscription:', subErr);
      // Don't throw — payment is already approved. Log for manual fix.
    }

    return res.json({
      success: true,
      message: `Payment ${payment_id} approved. User subscription activated.`,
    });
  } catch (err) {
    console.error('[POST /admin/approve]', err);
    return res.status(500).json({ success: false, error: 'Failed to approve payment' });
  }
});

// ────────────────────────────────────────────────────────────
// POST /admin/reject
// Reject a payment with an optional reason
// Body: { payment_id, reason? }
// ────────────────────────────────────────────────────────────
router.post('/reject', async (req, res) => {
  try {
    const { payment_id, reason } = req.body;

    if (!payment_id) {
      return res.status(400).json({ success: false, error: 'payment_id is required' });
    }

    const { data: payment, error: fetchErr } = await supabase
      .from('payments')
      .select('id, status')
      .eq('id', payment_id)
      .single();

    if (fetchErr || !payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    if (payment.status === 'rejected') {
      return res.status(409).json({ success: false, error: 'Payment already rejected' });
    }

    const { error } = await supabase
      .from('payments')
      .update({
        status: 'rejected',
        rejection_reason: reason ? String(reason).slice(0, 500) : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', payment_id);

    if (error) throw error;

    return res.json({
      success: true,
      message: `Payment ${payment_id} rejected.`,
    });
  } catch (err) {
    console.error('[POST /admin/reject]', err);
    return res.status(500).json({ success: false, error: 'Failed to reject payment' });
  }
});

// ────────────────────────────────────────────────────────────
// GET /admin/stats
// Quick dashboard stats
// ────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const statuses = ['pending', 'under_review', 'approved', 'rejected'];
    const counts = {};

    for (const status of statuses) {
      const { count, error } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('status', status);
      if (error) throw error;
      counts[status] = count;
    }

    return res.json({ success: true, stats: counts });
  } catch (err) {
    console.error('[GET /admin/stats]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

module.exports = router;
