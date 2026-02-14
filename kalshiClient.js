const crypto = require("crypto");

const API_BASE = process.env.KALSHI_API_BASE || "https://api.kalshi.com";
const ACCESS_KEY = process.env.KALSHI_ACCESS_KEY;
const PRIVATE_KEY_RAW = process.env.KALSHI_PRIVATE_KEY;
const MARKET_TICKER = process.env.KALSHI_MARKET_TICKER;
const ORDER_SIDE = process.env.KALSHI_ORDER_SIDE || "yes";
const ORDER_ACTION = process.env.KALSHI_ORDER_ACTION || "buy";
const ORDER_TYPE = process.env.KALSHI_ORDER_TYPE || "market";
const CONTRACT_PRICE_CENTS = Number(
  process.env.KALSHI_CONTRACT_PRICE_CENTS || 100
);

function getPrivateKey() {
  if (!PRIVATE_KEY_RAW) return null;
  return PRIVATE_KEY_RAW.replace(/\\n/g, "\n");
}

function createSignature({ timestamp, method, path }) {
  const privateKey = getPrivateKey();
  if (!privateKey) {
    throw new Error("Missing KALSHI_PRIVATE_KEY");
  }

  const message = `${timestamp}${method}${path}`;
  const signature = crypto.sign("sha256", Buffer.from(message), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });

  return signature.toString("base64");
}

async function placeKalshiTrade({ amountCents }) {
  if (!ACCESS_KEY) {
    throw new Error("Missing KALSHI_ACCESS_KEY");
  }
  if (!MARKET_TICKER) {
    throw new Error("Missing KALSHI_MARKET_TICKER");
  }

  const timestamp = Date.now().toString();
  const path = "/trade-api/v2/portfolio/orders";
  const url = `${API_BASE}${path}`;

  const count = Math.max(1, Math.floor(amountCents / CONTRACT_PRICE_CENTS));

  const body = {
    ticker: MARKET_TICKER,
    side: ORDER_SIDE,
    action: ORDER_ACTION,
    type: ORDER_TYPE,
    count,
    client_order_id: crypto.randomUUID(),
  };

  if (ORDER_TYPE === "limit" && process.env.KALSHI_LIMIT_PRICE) {
    body.price = Number(process.env.KALSHI_LIMIT_PRICE);
  }

  const signature = createSignature({
    timestamp,
    method: "POST",
    path,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "KALSHI-ACCESS-KEY": ACCESS_KEY,
      "KALSHI-ACCESS-SIGNATURE": signature,
      "KALSHI-ACCESS-TIMESTAMP": timestamp,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorDetails = null;
    try {
      errorDetails = await response.json();
    } catch (err) {
      errorDetails = await response.text();
    }

    const error = new Error("Kalshi order failed");
    error.details = errorDetails;
    throw error;
  }

  const data = await response.json();

  return {
    amountCents,
    count,
    ticker: MARKET_TICKER,
    side: ORDER_SIDE,
    action: ORDER_ACTION,
    type: ORDER_TYPE,
    order: data,
    placedAt: new Date().toISOString(),
  };
}

module.exports = { placeKalshiTrade };
