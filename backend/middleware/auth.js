// middleware/auth.js — Simple password-based admin auth for MVP
// In production, replace with JWT or session-based auth

const adminAuth = (req, res, next) => {
  // Accept password from Authorization header OR request body
  const authHeader = req.headers['authorization'];
  const bodyPassword = req.body?.admin_password;

  let password = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    password = authHeader.slice(7);
  } else if (bodyPassword) {
    password = bodyPassword;
  }

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Invalid admin password.',
    });
  }

  next();
};

module.exports = adminAuth;
