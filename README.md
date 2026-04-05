# 🏠 Dartech Payment System

> InstaPay manual verification payment flow for the Dartech AI Smart Home app.

---

## 📁 Project Structure

```
dartech-payment/
├── backend/                  ← Node.js + Express API
│   ├── index.js              ← Server entry point
│   ├── routes/
│   │   ├── payment.js        ← /create-payment, /payment/:id, /upload-proof
│   │   └── admin.js          ← /admin/* routes
│   ├── middleware/
│   │   └── auth.js           ← Admin password middleware
│   ├── lib/
│   │   ├── supabase.js       ← Supabase client
│   │   └── cloudinary.js     ← Cloudinary + Multer config
│   ├── package.json
│   ├── .env.example
│   └── railway.json          ← Railway deployment config
│
├── frontend/                 ← Static HTML pages (deployed to Vercel)
│   ├── checkout.html         ← WebView checkout page
│   ├── success.html          ← Post-submission success screen
│   └── admin.html            ← Admin dashboard
│
├── supabase/
│   └── schema.sql            ← Database schema (run in Supabase SQL Editor)
│
├── vercel.json               ← Vercel routing config
└── README.md
```

---

## 🔁 Payment Flow

```
Mobile App
    │
    ▼
POST /create-payment  ─────────────────────► Supabase (creates payment row)
    │ { payment_id, reference, checkout_url }
    │
    ▼
Open WebView: /checkout.html?payment_id=XXX
    │
    ▼
GET /payment/:payment_id  ─────────────────► Returns: amount, reference, InstaPay account
    │
    ▼
User pays via InstaPay app
    │
    ▼
User fills form + uploads screenshot
    │
    ▼
POST /upload-proof  ───────────────────────► Cloudinary (image) + Supabase (data)
    │
    ▼
/success.html (shown to user)
    │
    ▼
Admin opens /admin.html → reviews → Approve / Reject
    │
    ▼
POST /admin/approve  ──────────────────────► Supabase: payment=approved, user subscription=active
```

---

## ⚙️ Setup Instructions

### 1. Supabase Setup

1. Go to [supabase.com](https://supabase.com) → Create new project
2. In the dashboard: **Database → SQL Editor**
3. Paste the contents of `supabase/schema.sql` and click **Run**
4. Go to **Settings → API**:
   - Copy `Project URL` → `SUPABASE_URL`
   - Copy `service_role` key → `SUPABASE_SERVICE_KEY`
   - ⚠️ **Never expose the service_role key on the frontend**

### 2. Cloudinary Setup

1. Go to [cloudinary.com](https://cloudinary.com) → Create account (free tier is fine)
2. Dashboard → copy **Cloud name**, **API Key**, **API Secret**
3. These go into your backend `.env` file

### 3. Backend — Run Locally

```bash
cd backend
npm install
cp .env.example .env
# Fill in .env with your actual keys
npm run dev
```

Test the health endpoint:
```
curl http://localhost:3000/health
```

Test payment creation:
```bash
curl -X POST http://localhost:3000/create-payment \
  -H "Content-Type: application/json" \
  -d '{"user_id": "00000000-0000-0000-0000-000000000001"}'
```

### 4. Frontend — Run Locally

The frontend is just static HTML — open with VS Code Live Server or:
```bash
cd frontend
npx serve .
# Visit: http://localhost:3000/checkout.html?payment_id=<id-from-above>
```

**Important:** Update `API_BASE` in each HTML file to point to your backend:
```javascript
// In checkout.html, success.html, admin.html:
const API_BASE = 'http://localhost:3000'; // local dev
// or:
const API_BASE = 'https://your-backend.up.railway.app'; // production
```

### 5. Deploy Backend → Railway

1. Push your repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Select the `backend` folder as the root (or set **Root Directory** to `backend`)
4. Add all environment variables from `.env.example` in the **Variables** tab
5. Railway auto-deploys on push. Copy the generated URL (e.g. `https://dartech-xxx.up.railway.app`)

> **Alternative:** You can also deploy the backend to [Render.com](https://render.com) (free tier) — same process.

### 6. Deploy Frontend → Vercel

1. Push the full repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. **No build step needed** — Vercel serves static files
4. The `vercel.json` handles all routing
5. After deploy, update `API_BASE` in your HTML files to the Railway backend URL
6. Push again → Vercel auto-redeploys

**Access URLs after deploy:**
- Checkout: `https://your-app.vercel.app/checkout?payment_id=XXX`
- Admin:    `https://your-app.vercel.app/admin`

### 7. Connect Mobile App

In your mobile app, call the backend to create a payment:

```javascript
// React Native / Flutter example
const res = await fetch('https://your-backend.up.railway.app/create-payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: currentUser.id }),
});
const { checkout_url } = await res.json();

// Open WebView
openWebView(checkout_url);
```

**Receiving completion event (React Native WebView):**
```javascript
<WebView
  source={{ uri: checkoutUrl }}
  onMessage={(event) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.action === 'PAYMENT_SUBMITTED') {
      // Close WebView, show "pending review" UI in app
    }
  }}
/>
```

---

## 🔐 API Reference

### `POST /create-payment`
Initialize a payment session.

**Body:** `{ user_id: string }`

**Response:**
```json
{
  "success": true,
  "payment_id": "uuid",
  "reference": "DTX-AB12CD34",
  "checkout_url": "https://your-app.vercel.app/checkout?payment_id=..."
}
```

---

### `GET /payment/:payment_id`
Fetch payment details for checkout page.

**Response:**
```json
{
  "success": true,
  "payment": {
    "id": "...",
    "reference": "DTX-AB12CD34",
    "status": "pending",
    "amount": 20,
    "currency": "USD",
    "instapay_account": "dartech@instapay",
    "instapay_holder": "Dartech Technologies"
  }
}
```

---

### `POST /upload-proof`
Submit payment proof (multipart/form-data).

**Fields:**
| Field | Type | Required |
|-------|------|----------|
| payment_id | string | ✅ |
| name | string | ✅ |
| last4digits | string (4 digits) | ✅ |
| transfer_time | string | ✅ |
| proof_image | file (image) | ✅ |

---

### `GET /admin/payments?status=under_review`
List payments (admin only).

**Header:** `Authorization: Bearer <ADMIN_PASSWORD>`

---

### `POST /admin/approve`
Approve a payment + activate subscription.

**Header:** `Authorization: Bearer <ADMIN_PASSWORD>`  
**Body:** `{ payment_id: string }`

---

### `POST /admin/reject`
Reject a payment.

**Header:** `Authorization: Bearer <ADMIN_PASSWORD>`  
**Body:** `{ payment_id: string, reason?: string }`

---

## 🔒 Security Notes

- The **service_role** Supabase key only lives in the backend `.env` — never in HTML/JS files
- Admin routes require a password header on every request
- All inputs are validated server-side (never trust the client)
- Rate limiting is applied: 10 payment creations/hour, 100 general requests/15min
- Images are filtered by MIME type, max 10MB
- Reference codes are cryptographically random (8 alphanumeric chars)

---

## 🚀 Production Checklist

- [ ] Set strong `ADMIN_PASSWORD` in Railway env vars
- [ ] Update `FRONTEND_URL` in backend env to your Vercel domain
- [ ] Update `API_BASE` in all 3 HTML files to your Railway URL
- [ ] Run `schema.sql` in Supabase SQL Editor
- [ ] Test the full flow end-to-end before going live
- [ ] Set up Supabase backups (Settings → Database → Backups)
- [ ] Consider adding email notifications on approval (Supabase Edge Functions + Resend)

---

## 📞 Support

Built for Dartech AI Smart Home. For issues, check Supabase logs and Railway logs first.
