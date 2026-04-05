// index.js — Dartech Payment System Backend Entry Point
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS ────────────────────────────────────────────────────
// Allow requests from your Vercel frontend + local dev
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body parsers ────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Rate limiting ───────────────────────────────────────────
// General API limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

// Stricter limit for payment creation
const createPaymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, error: 'Too many payment attempts. Please wait before trying again.' },
});

app.use(generalLimiter);

// ─── Health check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'dartech-payment', timestamp: new Date().toISOString() });
});

// ─── Routes ──────────────────────────────────────────────────
// Rate-limit payment creation specifically
app.post('/create-payment', createPaymentLimiter);

app.use('/', paymentRoutes);        // /create-payment, /payment/:id, /upload-proof
app.use('/admin', adminRoutes);     // /admin/payments, /admin/approve, /admin/reject

// ─── 404 handler ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Global error handler ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);

  // Handle multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: 'File too large. Max 10MB.' });
  }

  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

// ─── Start server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   Dartech Payment Server                 ║
║   Running on port ${PORT}                   ║
║   ENV: ${process.env.NODE_ENV || 'development'}                     ║
╚══════════════════════════════════════════╝
  `);
});
