// lib/cloudinary.js — Cloudinary config + Multer upload middleware
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary with env credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage: uploads go to the 'dartech/payment-proofs' folder
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'dartech/payment-proofs',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'heic'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    // Use the payment reference as the public_id for easy identification
    public_id: `proof_${req.body.payment_id || Date.now()}`,
  }),
});

// File filter — only images allowed
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
});

module.exports = { upload, cloudinary };
