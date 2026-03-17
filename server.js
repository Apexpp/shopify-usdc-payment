require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const USDC_WALLET = process.env.USDC_WALLET_ADDRESS;
const NETWORK = process.env.USDC_NETWORK || "polygon";
const DEADLINE_HOURS = process.env.PAYMENT_DEADLINE_HOURS || 24;
const STORE = process.env.SHOPIFY_STORE;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

const NETWORK_INFO = {
  polygon:  { label: "Polygon",  note: "Send USDC on the Polygon network only",  color: "#7B3FE4" },
  ethereum: { label: "Ethereum", note: "Send USDC on the Ethereum mainnet only",  color: "#627EEA" },
  base:     { label: "Base",     note: "Send USDC on the Base network only",      color: "#0052FF" },
};

// Cache token so we don't request a new one every time
let cachedToken = null;
let tokenExpiresAt = 0;

async function getShopifyToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  const response = await axios.post(
    `https://${STORE}.myshopify.com/admin/oauth/access_token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  cachedToken = response.data.access_token;
  tokenExpiresAt = Date.now() + response.data.expires_in * 1000;
  return cachedToken;
}

app.get("/order/:orderNumber", async (req, res) => {
  try {
    const orderNumber = req.params.orderNumber.replace("#", "").trim();
    const order = await fetchOrderFromShopify(orderNumber);
    if (!order) return res.status(404).send("Order not found");
    const usdcAmount = await toUsdc(parseFloat(order.total_price), order.currency);
    const net = NETWORK_INFO[NETWORK] || NETWORK_INFO.polygon;
    const firstName = order.customer?.first_name || "";
    res.send(paymentPage(order.order_number, order.total_price, order.currency, usdcAmount, net, firstName));
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong: " + err.message);
  }
});

app.get("/pay", async (req, res) => {
  const { order, total, currency = "USD", name = "" } = req.query;
  if (!order || !total) return res.status(400).send("Missing ?order= and ?total= parameters");
  const usdcAmount = await toUsdc(parseFloat(total), currency);
  const net = NETWORK_INFO[NETWORK] || NETWORK_INFO.polygon;
  const firstName = name.split(" ")[0] || "";
  res.send(paymentPage(order, total, currency, usdcAmount, net, firstName));
});

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));

async function fetchOrderFromShopify(orderNumber) {
  const token = await getShopifyToken();
  const url = `https://${STORE}.myshopify.com/admin/api/2025-04/orders.json?name=%23${orderNumber}&status=any`;
  const response = await axios.get(url, {
    headers: { "X-Shopify-Access-Token": token },
  });
  return response.data.orders?.[0] || null;
}

async function toUsdc(amount, currency) {
  if (currency === "USD") return amount.toFixed(2);
  try {
    const res = await axios.get("https://api.exchangerate-api.com/v4/latest/USD");
    const rate = res.data.rates[currency];
    if (!rate) return amount.toFixed(2);
    return (amount / rate).toFixed(2);
  } catch {
    return amount.toFixed(2);
  }
}

function paymentPage(order, total, currency, usdcAmount, net, firstName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pay with USDC — #${order}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f4f0; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 48px 16px 64px; color: #111; }
    .wrap { width: 100%; max-width: 480px; }
    .logo { text-align: center; margin-bottom: 32px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #aaa; }
    .card { background: #fff; border-radius: 16px; overflow: hidden; border: 1px solid #e8e8e4; }
    .card-header { padding: 28px 28px 24px; border-bottom: 1px solid #f0f0ec; }
    .order-tag { display: inline-block; background: #f0f0ec; color: #555; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 10px; border-radius: 6px; margin-bottom: 12px; }
    .card-header h1 { font-size: 20px; font-weight: 700; color: #111; margin-bottom: 4px; }
    .card-header p { font-size: 14px; color: #888; }
    .section { padding: 24px 28px; border-bottom: 1px solid #f0f0ec; }
    .section:last-child { border-bottom: none; }
    .section-label { font-size: 11px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: #aaa; margin-bottom: 10px; }
    .amount-row { display: flex; align-items: baseline; gap: 10px; }
    .usdc-amount { font-size: 38px; font-weight: 800; letter-spacing: -0.02em; color: #111; line-height: 1; }
    .usdc-label { font-size: 16px; font-weight: 600; color: #888; }
    .fiat-equiv { margin-top: 6px; font-size: 13px; color: #aaa; }
    .network-pill { display: inline-flex; align-items: center; gap: 6px; background: #f0f0ec; border-radius: 20px; padding: 5px 12px; font-size: 12px; font-weight: 600; color: #555; margin-top: 10px; }
    .network-dot { width: 7px; height: 7px; border-radius: 50%; background: ${net.color}; }
    .address-block { background: #f7f7f4; border: 1px solid #e8e8e4; border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
    .address-text { font-family: "SF Mono", "Fira Code", "Courier New", monospace; font-size: 13px; color: #111; word-break: break-all; flex: 1; line-height: 1.5; }
    .copy-btn { flex-shrink: 0; background: #111; color: #fff; border: none; border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer; }
    .copy-btn.copied { background: #22a06b; }
    .warning { margin-top: 12px; display: flex; gap: 8px; align-items: flex-start; font-size: 12px; color: #e67e00; line-height: 1.5; }
    .warning-icon { flex-shrink: 0; width: 15px; height: 15px; border-radius: 50%; background: #e67e00; color: #fff; font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
    .steps { list-style: none; display: flex; flex-direction: column; gap: 14px; }
    .steps li { display: flex; gap: 12px; align-items: flex-start; font-size: 14px; color: #444; line-height: 1.5; }
    .step-num { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; background: #f0f0ec; color: #666; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
    .deadline { background: #fff8ed; border-left: 3px solid #f4a100; border-radius: 0 8px 8px 0; padding: 12px 14px; font-size: 13px; color: #7a4f00; line-height: 1.5; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #bbb; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">Payment Instructions</div>
    <div class="card">
      <div class="card-header">
        <div class="order-tag">Order #${order}</div>
        <h1>${firstName ? `Hi ${firstName},` : "Your order is confirmed"}</h1>
        <p>Complete your USDC payment below to process your order.</p>
      </div>
      <div class="section">
        <div class="section-label">Amount to send</div>
        <div class="amount-row">
          <span class="usdc-amount">${usdcAmount}</span>
          <span class="usdc-label">USDC</span>
        </div>
        <div class="fiat-equiv">${parseFloat(total).toFixed(2)} ${currency}</div>
        <div class="network-pill">
          <span class="network-dot"></span>
          ${net.label} network
        </div>
      </div>
      <div class="section">
        <div class="section-label">Send to this wallet</div>
        <div class="address-block">
          <span class="address-text" id="walletAddr">${USDC_WALLET}</span>
          <button class="copy-btn" id="copyBtn" onclick="copyWallet()">Copy</button>
        </div>
        <div class="warning">
          <div class="warning-icon">!</div>
          <span>${net.note}. Sending on the wrong network means your funds cannot be recovered.</span>
        </div>
      </div>
      <div class="section">
        <div class="section-label">How to pay</div>
        <ol class="steps">
          <li><span class="step-num">1</span>Open your crypto wallet (Coinbase, MetaMask, Trust Wallet, etc.)</li>
          <li><span class="step-num">2</span>Select <strong>USDC</strong> on the <strong>${net.label}</strong> network</li>
          <li><span class="step-num">3</span>Send exactly <strong>${usdcAmount} USDC</strong> to the address above</li>
          <li><span class="step-num">4</span>Once we confirm receipt, your order will be processed and shipped</li>
        </ol>
      </div>
      <div class="section">
        <div class="deadline">
          Please complete payment within <strong>${DEADLINE_HOURS} hours</strong> to secure your order.
          If we don't receive payment, the order will be cancelled automatically.
        </div>
      </div>
    </div>
    <div class="footer">Questions? Reply to your order confirmation email.</div>
  </div>
  <script>
    function copyWallet() {
      const addr = document.getElementById("walletAddr").textContent.trim();
      const btn = document.getElementById("copyBtn");
      navigator.clipboard.writeText(addr).then(() => {
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 2500);
      });
    }
  </script>
</body>
</html>`;
}