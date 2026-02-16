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
const MARKET_STATUS = process.env.KALSHI_MARKET_STATUS || "open";
const MARKET_PAGE_LIMIT = Number(process.env.KALSHI_MARKET_PAGE_LIMIT || 500);
const MARKET_TIMEZONE = process.env.KALSHI_MARKET_TIMEZONE || "America/Chicago";

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

function requireAccessKey() {
  if (!ACCESS_KEY) {
    throw new Error("Missing KALSHI_ACCESS_KEY");
  }
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateInTimeZone(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function kalshiRequest({ method, path, body }) {
  requireAccessKey();
  const timestamp = Date.now().toString();
  const signature = createSignature({ timestamp, method, path });
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "KALSHI-ACCESS-KEY": ACCESS_KEY,
      "KALSHI-ACCESS-SIGNATURE": signature,
      "KALSHI-ACCESS-TIMESTAMP": timestamp,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorDetails = null;
    try {
      errorDetails = await response.json();
    } catch (err) {
      errorDetails = await response.text();
    }

    const error = new Error("Kalshi request failed");
    error.details = errorDetails;
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function extractYesPriceDollars(market) {
  return (
    toNumber(market?.yes_ask_dollars) ??
    toNumber(market?.last_price_dollars) ??
    toNumber(market?.yes_ask) ??
    toNumber(market?.last_price) ??
    null
  );
}

async function getMarketsPage({ cursor }) {
  const params = new URLSearchParams();
  params.set("status", MARKET_STATUS);
  params.set("limit", String(MARKET_PAGE_LIMIT));
  params.set("mve_filter", "exclude");
  if (cursor) params.set("cursor", cursor);

  const path = `/trade-api/v2/markets?${params.toString()}`;
  return kalshiRequest({ method: "GET", path });
}

async function getMarkets() {
  const markets = [];
  let cursor = null;
  let pageCount = 0;

  while (pageCount < 10) {
    const data = await getMarketsPage({ cursor });
    if (Array.isArray(data?.markets)) {
      markets.push(...data.markets);
    }

    cursor = data?.cursor || null;
    if (!cursor) break;
    pageCount += 1;
  }

  return markets;
}

async function getMarketsExpiringToday({ timeZone = MARKET_TIMEZONE } = {}) {
  const todayKey = formatDateInTimeZone(new Date(), timeZone);
  const markets = await getMarkets();

  return markets.filter((market) => {
    const closeAt = market?.close_time || market?.latest_expiration_time;
    if (!closeAt) return false;
    const closeKey = formatDateInTimeZone(new Date(closeAt), timeZone);
    return closeKey === todayKey;
  });
}

async function placeKalshiTrade({
  amountCents,
  ticker,
  side,
  action,
  type,
  count,
  price,
  contractPriceCents,
} = {}) {
  if (!ticker && !MARKET_TICKER) {
    throw new Error("Missing KALSHI_MARKET_TICKER");
  }

  const resolvedAmountCents =
    Number(amountCents || 0) || Number(process.env.TRADE_AMOUNT_CENTS || 1000);
  const priceCents = Number(contractPriceCents || CONTRACT_PRICE_CENTS);
  const resolvedCount =
    Number(count) || Math.max(1, Math.floor(resolvedAmountCents / priceCents));

  const path = "/trade-api/v2/portfolio/orders";
  const body = {
    ticker: ticker || MARKET_TICKER,
    side: side || ORDER_SIDE,
    action: action || ORDER_ACTION,
    type: type || ORDER_TYPE,
    count: resolvedCount,
    client_order_id: crypto.randomUUID(),
  };

  if (body.type === "limit") {
    const fallbackPrice = process.env.KALSHI_LIMIT_PRICE;
    const resolvedPrice = price ?? fallbackPrice;
    if (resolvedPrice !== undefined && resolvedPrice !== null && resolvedPrice !== "") {
      body.price = Number(resolvedPrice);
    }
  }

  const data = await kalshiRequest({ method: "POST", path, body });

  return {
    amountCents: resolvedAmountCents,
    count: resolvedCount,
    ticker: body.ticker,
    side: body.side,
    action: body.action,
    type: body.type,
    order: data,
    placedAt: new Date().toISOString(),
  };
}

async function placeHighestOddsTrade({ amountCents } = {}) {
  const markets = await getMarketsExpiringToday();
  if (!markets.length) {
    const error = new Error("No markets expiring today");
    error.details = { reason: "empty_list" };
    throw error;
  }

  const marketsWithOdds = markets
    .map((market) => ({
      market,
      odds: extractYesPriceDollars(market),
    }))
    .filter((entry) => entry.odds !== null)
    .sort((a, b) => b.odds - a.odds);

  if (!marketsWithOdds.length) {
    const error = new Error("No markets with odds available");
    error.details = { reason: "missing_odds" };
    throw error;
  }

  const top = marketsWithOdds[0];
  const priceCents = Math.max(1, Math.round(top.odds * 100));
  const trade = await placeKalshiTrade({
    amountCents,
    ticker: top.market.ticker,
    side: "yes",
    action: "buy",
    type: "market",
    contractPriceCents: priceCents,
  });

  return {
    ...trade,
    strategy: "highest-odds",
    oddsDollars: top.odds,
    closeTime: top.market.close_time || top.market.latest_expiration_time,
    title: top.market.title || top.market.yes_sub_title || top.market.ticker,
  };
}

module.exports = {
  placeKalshiTrade,
  placeHighestOddsTrade,
  getMarketsExpiringToday,
};
