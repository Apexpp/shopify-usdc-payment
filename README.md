# Shopify USDC Payment Page

A minimal Node.js server that shows customers how to pay with USDC after placing a Shopify order via the **Manual Payment** method.

No Shopify API complexity. No webhooks. No payment sessions. Just a clean page showing the wallet address and USDC amount.

---

## How It Works

1. Customer checks out and selects your manual payment option (e.g. "Pay with USDC")
2. Shopify confirms the order and shows the standard "thank you" page
3. Customer clicks the link in their confirmation email → lands on **this page**
4. Page shows: wallet address, exact USDC amount, network, copy button, and instructions
5. You manually mark the order as paid in Shopify once you see the transfer

---

## Setup

### 1. Install & Configure

```bash
npm install
cp .env.example .env
```

Edit `.env`:
```
USDC_WALLET_ADDRESS=0xYourWalletHere
USDC_NETWORK=polygon        # or ethereum / base
SHOPIFY_STORE=your-store.myshopify.com
SHOPIFY_ADMIN_API_TOKEN=shpat_xxxx   # only needed for /order/:name route
PAYMENT_DEADLINE_HOURS=24
```

### 2. Run the Server

```bash
npm start          # production
npm run dev        # development with auto-reload
```

Deploy to any Node.js host: Railway, Render, Fly.io, DigitalOcean, etc.

---

## Two Ways to Link to the Payment Page

### Option A — Simple link (no API needed) ✅ Recommended

Add a link to your **Shopify order confirmation email template** using Liquid:

```
https://your-domain.com/pay?order={{ order.order_number }}&total={{ order.total_price }}&currency={{ order.currency }}&name={{ customer.first_name }}+{{ customer.last_name }}
```

This passes order details in the URL. No Shopify API token required.

**Where to add this in Shopify:**
1. Shopify Admin → Settings → Notifications
2. Click **Order confirmed**
3. Find the section for additional payment instructions
4. Add the link as a button or inline text

### Option B — Full order lookup (requires API token)

```
https://your-domain.com/order/1042
```

Fetches the order directly from Shopify's Admin API. Requires `SHOPIFY_ADMIN_API_TOKEN` in `.env`.

To get an API token:
1. Shopify Admin → Settings → Apps and sales channels → Develop apps
2. Create an app → Admin API access → grant `read_orders` scope
3. Install the app → copy the **Admin API access token**

---

## Setting Up the Manual Payment Option in Shopify

1. Shopify Admin → **Settings → Payments**
2. Scroll to **Manual payment methods** → click **Add manual payment method**
3. Choose **Create custom payment method**
4. Fill in:
   - **Name**: `Pay with USDC`
   - **Additional details**: 
     ```
     After placing your order, you will receive an email with your USDC wallet address and exact payment amount.
     Your order will ship once payment is confirmed on-chain (usually within 1 hour).
     ```
   - **Payment instructions** (shown on thank-you page):
     ```
     Check your email for USDC payment instructions, or click the link below.
     ```
5. Save

---

## Currency Conversion

- For **USD** orders: amount is shown 1:1 as USDC (no conversion needed)
- For **other currencies**: uses [exchangerate-api.com](https://exchangerate-api.com) free tier to convert to USD equivalent
- Fallback: if the API is unreachable, shows the original amount as-is

---

## File Structure

```
usdc-payment-page/
├── server.js          # Everything — routes, conversion, HTML rendering
├── .env.example       # Config template
├── package.json
└── README.md
```

---

## Deployment (Render — free tier)

1. Push to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your repo
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables from `.env`
7. Done — you get a public HTTPS URL
