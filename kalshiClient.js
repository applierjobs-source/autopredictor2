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
const CLIMATE_CATEGORY = process.env.KALSHI_CLIMATE_CATEGORY || "climate";
const CLIMATE_FREQUENCY = process.env.KALSHI_CLIMATE_FREQUENCY || "daily";
const CLIMATE_TAG = process.env.KALSHI_CLIMATE_TAG || "climate";
const CLIMATE_TRADE_AMOUNT_CENTS = Number(
  process.env.CLIMATE_TRADE_AMOUNT_CENTS || 2000
);
const WEATHERCOMPANY_API_KEY = process.env.WEATHERCOMPANY_API_KEY;
const WEATHERCOMPANY_API_BASE =
  process.env.WEATHERCOMPANY_API_BASE || "https://api.weather.com";
const WEATHERCOMPANY_UNITS = process.env.WEATHERCOMPANY_UNITS || "e";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

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

const CITY_GEOCODES = [
  { name: "New York City", aliases: ["nyc", "new york city", "new york"], geocode: "40.7128,-74.0060" },
  { name: "Chicago", aliases: ["chicago"], geocode: "41.8781,-87.6298" },
  { name: "Miami", aliases: ["miami"], geocode: "25.7617,-80.1918" },
  { name: "Los Angeles", aliases: ["los angeles", "la"], geocode: "34.0522,-118.2437" },
  { name: "Phoenix", aliases: ["phoenix"], geocode: "33.4484,-112.0740" },
  { name: "Denver", aliases: ["denver"], geocode: "39.7392,-104.9903" },
  { name: "Austin", aliases: ["austin"], geocode: "30.2672,-97.7431" },
  { name: "Philadelphia", aliases: ["philadelphia"], geocode: "39.9526,-75.1652" },
  { name: "Seattle", aliases: ["seattle"], geocode: "47.6062,-122.3321" },
  { name: "San Francisco", aliases: ["san francisco", "sf"], geocode: "37.7749,-122.4194" },
  { name: "Dallas", aliases: ["dallas"], geocode: "32.7767,-96.7970" },
  { name: "Atlanta", aliases: ["atlanta"], geocode: "33.7490,-84.3880" },
  { name: "Las Vegas", aliases: ["las vegas", "vegas"], geocode: "36.1699,-115.1398" },
  { name: "Houston", aliases: ["houston"], geocode: "29.7604,-95.3698" },
  { name: "Boston", aliases: ["boston"], geocode: "42.3601,-71.0589" },
  { name: "Washington DC", aliases: ["washington dc", "washington d.c.", "dc"], geocode: "38.9072,-77.0369" },
  { name: "New Orleans", aliases: ["new orleans"], geocode: "29.9511,-90.0715" },
  { name: "Minneapolis", aliases: ["minneapolis"], geocode: "44.9778,-93.2650" },
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCityFromTitle(title) {
  const normalized = normalizeText(title);
  return CITY_GEOCODES.find((entry) =>
    entry.aliases.some((alias) => normalized.includes(alias))
  );
}

function parseTemperatureRange(label) {
  const cleaned = String(label || "").replace(/[^\d\w\s.-]/g, "");
  const rangeMatch = cleaned.match(/(-?\d+)\s*to\s*(-?\d+)/i);
  if (rangeMatch) {
    return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  }
  const belowMatch = cleaned.match(/(-?\d+)\s*or\s*below/i);
  if (belowMatch) {
    return { min: Number.NEGATIVE_INFINITY, max: Number(belowMatch[1]) };
  }
  const aboveMatch = cleaned.match(/(-?\d+)\s*or\s*above/i);
  if (aboveMatch) {
    return { min: Number(aboveMatch[1]), max: Number.POSITIVE_INFINITY };
  }
  return null;
}

function pickMarketByForecast(markets, forecastValue) {
  if (!Number.isFinite(forecastValue)) return null;
  const scored = markets
    .map((market) => {
      const label = market?.yes_sub_title || market?.title || market?.ticker;
      const range = parseTemperatureRange(label);
      if (!range) return null;
      const inRange = forecastValue >= range.min && forecastValue <= range.max;
      const distance =
        forecastValue < range.min
          ? range.min - forecastValue
          : forecastValue > range.max
          ? forecastValue - range.max
          : 0;
      return { market, inRange, distance };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.inRange && !b.inRange) return -1;
      if (!a.inRange && b.inRange) return 1;
      return a.distance - b.distance;
    });

  return scored[0]?.market || null;
}

function selectForecastValue(eventTitle, forecast) {
  const normalized = normalizeText(eventTitle);
  if (normalized.includes("lowest") || normalized.includes("low temperature")) {
    return forecast?.lowTemp;
  }
  return forecast?.highTemp;
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

async function getSeriesList({ category } = {}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  const path = `/trade-api/v2/series?${params.toString()}`;
  const data = await kalshiRequest({ method: "GET", path });
  return Array.isArray(data?.series) ? data.series : [];
}

async function getEventsPage({ seriesTicker, cursor, limit = 200 }) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("with_nested_markets", "true");
  params.set("status", "open");
  if (seriesTicker) params.set("series_ticker", seriesTicker);
  if (cursor) params.set("cursor", cursor);

  const path = `/trade-api/v2/events?${params.toString()}`;
  return kalshiRequest({ method: "GET", path });
}

async function getEventsForSeries(seriesTicker) {
  const events = [];
  let cursor = null;
  let pageCount = 0;

  while (pageCount < 10) {
    const data = await getEventsPage({ seriesTicker, cursor });
    if (Array.isArray(data?.events)) {
      events.push(...data.events);
    }
    cursor = data?.cursor || null;
    if (!cursor) break;
    pageCount += 1;
  }

  return events;
}

async function getClimateDailyEvents({ timeZone = MARKET_TIMEZONE } = {}) {
  let series = await getSeriesList({ category: CLIMATE_CATEGORY });
  if (!series.length) {
    series = await getSeriesList({});
  }

  const dailySeries = series.filter((item) => {
    const frequencyMatches = normalizeText(item?.frequency).includes(
      CLIMATE_FREQUENCY
    );
    if (!frequencyMatches) return false;

    const categoryMatches = normalizeText(item?.category).includes(
      normalizeText(CLIMATE_CATEGORY)
    );
    const tagMatches = Array.isArray(item?.tags)
      ? item.tags.some((tag) =>
          normalizeText(tag).includes(normalizeText(CLIMATE_TAG))
        )
      : false;
    const titleMatches = normalizeText(item?.title).includes("climate");

    return categoryMatches || tagMatches || titleMatches;
  });

  const todayKey = formatDateInTimeZone(new Date(), timeZone);
  const events = [];

  for (const entry of dailySeries) {
    const seriesEvents = await getEventsForSeries(entry.ticker);
    seriesEvents.forEach((event) => {
      const closeAt = event?.close_time;
      if (!closeAt) return;
      const closeKey = formatDateInTimeZone(new Date(closeAt), timeZone);
      if (closeKey !== todayKey) return;
      events.push(event);
    });
  }

  return events;
}

async function getWeatherForecastForCity(title) {
  if (!WEATHERCOMPANY_API_KEY) {
    throw new Error("Missing WEATHERCOMPANY_API_KEY");
  }
  const match = findCityFromTitle(title);
  if (!match) {
    const error = new Error("Unable to map city from event title");
    error.details = { title };
    throw error;
  }

  const url = new URL(
    "/v3/wx/forecast/daily/1day",
    WEATHERCOMPANY_API_BASE
  );
  url.searchParams.set("geocode", match.geocode);
  url.searchParams.set("format", "json");
  url.searchParams.set("units", WEATHERCOMPANY_UNITS);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("apiKey", WEATHERCOMPANY_API_KEY);

  const response = await fetch(url.toString(), {
    headers: { "Accept-Encoding": "gzip" },
  });
  if (!response.ok) {
    const error = new Error("WeatherCompany request failed");
    error.details = await response.text();
    throw error;
  }
  const data = await response.json();

  const highTemp = Array.isArray(data?.temperatureMax)
    ? data.temperatureMax[0]
    : data?.temperatureMax;
  const lowTemp = Array.isArray(data?.temperatureMin)
    ? data.temperatureMin[0]
    : data?.temperatureMin;

  return {
    city: match.name,
    geocode: match.geocode,
    highTemp: toNumber(highTemp),
    lowTemp: toNumber(lowTemp),
    raw: data,
  };
}

async function pickMarketWithOpenAI({ eventTitle, markets, forecast }) {
  if (!OPENAI_API_KEY) return null;
  if (!Array.isArray(markets) || markets.length === 0) return null;

  const candidates = markets.map((market) => ({
    ticker: market.ticker,
    label: market.yes_sub_title || market.title || market.ticker,
  }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You choose the most likely temperature range market for a weather forecast. Respond with JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            eventTitle,
            forecast,
            candidates,
            instructions:
              "Pick the single best candidate ticker. Respond as JSON: {\"ticker\":\"...\",\"reason\":\"...\"}.",
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;

  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    return parsed?.ticker || null;
  } catch (error) {
    return null;
  }
}

async function decideClimateMarketForEvent(event) {
  const markets = Array.isArray(event?.markets) ? event.markets : [];
  if (!markets.length) {
    const error = new Error("No markets on event");
    error.details = { eventTicker: event?.event_ticker };
    throw error;
  }

  const forecast = await getWeatherForecastForCity(event?.title || "");
  const forecastValue = selectForecastValue(event?.title, forecast);
  let chosen = pickMarketByForecast(markets, forecastValue);
  const aiTicker = await pickMarketWithOpenAI({
    eventTitle: event?.title,
    markets,
    forecast: {
      ...forecast,
      targetValue: forecastValue,
    },
  });

  if (aiTicker) {
    const aiMarket = markets.find((market) => market.ticker === aiTicker);
    if (aiMarket) chosen = aiMarket;
  }

  if (!chosen) {
    const error = new Error("Unable to choose market");
    error.details = { eventTicker: event?.event_ticker };
    throw error;
  }

  return { chosen, forecast, aiTicker };
}

async function placeClimateDailyTrades() {
  const events = await getClimateDailyEvents();
  const trades = [];

  for (const event of events) {
    try {
      const decision = await decideClimateMarketForEvent(event);
      const trade = await placeKalshiTrade({
        amountCents: CLIMATE_TRADE_AMOUNT_CENTS,
        ticker: decision.chosen.ticker,
        side: "yes",
        action: "buy",
        type: "market",
      });
      trades.push({
        eventTicker: event.event_ticker,
        eventTitle: event.title,
        marketTicker: decision.chosen.ticker,
        marketLabel:
          decision.chosen.yes_sub_title ||
          decision.chosen.title ||
          decision.chosen.ticker,
        forecast: {
          highTemp: decision.forecast?.highTemp,
          lowTemp: decision.forecast?.lowTemp,
          city: decision.forecast?.city,
        },
        trade,
      });
    } catch (error) {
      trades.push({
        eventTicker: event?.event_ticker,
        eventTitle: event?.title,
        error: {
          message: error?.message || "Trade failed",
          details: error?.details || null,
        },
      });
    }
  }

  return trades;
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
  getClimateDailyEvents,
  placeClimateDailyTrades,
};
