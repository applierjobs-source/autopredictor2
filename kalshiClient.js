const crypto = require("crypto");

const API_BASE = process.env.KALSHI_API_BASE || "https://api.kalshi.com";
const SANDBOX_API_BASE = process.env.KALSHI_SANDBOX_API_BASE;
const ACCESS_KEY = process.env.KALSHI_ACCESS_KEY;
const PRIVATE_KEY_RAW = process.env.KALSHI_PRIVATE_KEY;
const SANDBOX_ACCESS_KEY = process.env.KALSHI_SANDBOX_ACCESS_KEY;
const SANDBOX_PRIVATE_KEY_RAW = process.env.KALSHI_SANDBOX_PRIVATE_KEY;
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
const CLIMATE_CATEGORY =
  process.env.KALSHI_CLIMATE_CATEGORY || "Climate and Weather";
const CLIMATE_FREQUENCY = process.env.KALSHI_CLIMATE_FREQUENCY || "daily";
const CLIMATE_TAGS_RAW =
  process.env.KALSHI_CLIMATE_TAGS ||
  "Daily temperature,High temp,Low temp,Snow and rain";
const CLIMATE_TRADE_AMOUNT_CENTS = Number(
  process.env.CLIMATE_TRADE_AMOUNT_CENTS || 2000
);
const WEATHERCOMPANY_API_KEY = process.env.WEATHERCOMPANY_API_KEY;
const WEATHERCOMPANY_API_BASE =
  process.env.WEATHERCOMPANY_API_BASE || "https://api.weather.com";
const WEATHERCOMPANY_UNITS = process.env.WEATHERCOMPANY_UNITS || "e";
const WEATHERCOMPANY_USER_AGENT =
  process.env.WEATHERCOMPANY_USER_AGENT || "AutoPredictor/1.0";
const WEATHERCOMPANY_DAILY_DAYS = Number(
  process.env.WEATHERCOMPANY_DAILY_DAYS || 7
);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const KALSHI_MAX_RETRIES = Number(process.env.KALSHI_MAX_RETRIES || 3);
const KALSHI_RETRY_BASE_DELAY_MS = Number(
  process.env.KALSHI_RETRY_BASE_DELAY_MS || 800
);
const CLIMATE_EVENTS_CACHE_TTL_MS = Number(
  process.env.CLIMATE_EVENTS_CACHE_TTL_MS || 300000
);
const CLIMATE_MAX_SERIES = Number(process.env.CLIMATE_MAX_SERIES || 20);

const climateEventsCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPrivateKey(useSandbox) {
  const raw = useSandbox ? SANDBOX_PRIVATE_KEY_RAW : PRIVATE_KEY_RAW;
  if (!raw) return null;
  return raw.replace(/\\n/g, "\n");
}

function createSignature({ timestamp, method, path, useSandbox }) {
  const privateKey = getPrivateKey(useSandbox);
  if (!privateKey) {
    throw new Error(
      useSandbox ? "Missing KALSHI_SANDBOX_PRIVATE_KEY" : "Missing KALSHI_PRIVATE_KEY"
    );
  }

  const message = `${timestamp}${method}${path}`;
  const signature = crypto.sign("sha256", Buffer.from(message), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });

  return signature.toString("base64");
}

function getAccessKey(useSandbox) {
  return useSandbox ? SANDBOX_ACCESS_KEY : ACCESS_KEY;
}

function requireAccessKey(useSandbox) {
  if (!getAccessKey(useSandbox)) {
    throw new Error(
      useSandbox ? "Missing KALSHI_SANDBOX_ACCESS_KEY" : "Missing KALSHI_ACCESS_KEY"
    );
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

function resolveApiBase(useSandbox) {
  if (!useSandbox) return API_BASE;
  if (!SANDBOX_API_BASE) {
    throw new Error("Missing KALSHI_SANDBOX_API_BASE");
  }
  return SANDBOX_API_BASE;
}

async function kalshiRequest({ method, path, body, useSandbox }, attempt = 0) {
  requireAccessKey(useSandbox);
  const timestamp = Date.now().toString();
  const signature = createSignature({ timestamp, method, path, useSandbox });
  const apiBase = resolveApiBase(useSandbox);
  const url = `${apiBase}${path}`;
  const accessKey = getAccessKey(useSandbox);

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "KALSHI-ACCESS-KEY": accessKey,
      "KALSHI-ACCESS-SIGNATURE": signature,
      "KALSHI-ACCESS-TIMESTAMP": timestamp,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 429 && attempt < KALSHI_MAX_RETRIES) {
    const retryAfter = Number(response.headers.get("retry-after")) || 0;
    const delay =
      (retryAfter ? retryAfter * 1000 : KALSHI_RETRY_BASE_DELAY_MS) *
      Math.max(1, attempt + 1);
    await sleep(delay);
    return kalshiRequest({ method, path, body, useSandbox }, attempt + 1);
  }

  if (!response.ok) {
    let errorDetails = null;
    try {
      errorDetails = await response.json();
    } catch (err) {
      errorDetails = await response.text();
    }

    const errorCode = errorDetails?.error?.code;
    if (
      attempt < KALSHI_MAX_RETRIES &&
      (response.status >= 500 || errorCode === "service_unavailable")
    ) {
      const delay = KALSHI_RETRY_BASE_DELAY_MS * Math.max(1, attempt + 1);
      await sleep(delay);
      return kalshiRequest({ method, path, body, useSandbox }, attempt + 1);
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
  {
    name: "San Antonio",
    aliases: ["san antonio"],
    geocode: "29.4241,-98.4936",
  },
  {
    name: "Oklahoma City",
    aliases: ["oklahoma city", "okc"],
    geocode: "35.4676,-97.5164",
  },
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

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseEventDateFromTitle(title) {
  const match = String(title || "").match(
    /on\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i
  );
  if (!match) return null;
  const month = match[1].slice(0, 3).toLowerCase();
  const day = Number(match[2]);
  const year = Number(match[3]);
  const months = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  if (!(month in months) || !day || !year) return null;
  return new Date(Date.UTC(year, months[month], day));
}

function parseEventDateFromTicker(ticker) {
  const match = String(ticker || "").match(/-(\d{2})([A-Z]{3})(\d{2})$/);
  if (!match) return null;
  const year = 2000 + Number(match[1]);
  const month = match[2].toLowerCase();
  const day = Number(match[3]);
  const months = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  if (!(month in months) || !day || !year) return null;
  return new Date(Date.UTC(year, months[month], day));
}

function extractEventDate(event) {
  return (
    parseEventDateFromTitle(event?.title) ||
    parseEventDateFromTicker(event?.event_ticker)
  );
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

async function getMarketsPage({ cursor, useSandbox }) {
  const params = new URLSearchParams();
  params.set("status", MARKET_STATUS);
  params.set("limit", String(MARKET_PAGE_LIMIT));
  params.set("mve_filter", "exclude");
  if (cursor) params.set("cursor", cursor);

  const path = `/trade-api/v2/markets?${params.toString()}`;
  return kalshiRequest({ method: "GET", path, useSandbox });
}

async function getMarkets({ useSandbox } = {}) {
  const markets = [];
  let cursor = null;
  let pageCount = 0;

  while (pageCount < 10) {
    const data = await getMarketsPage({ cursor, useSandbox });
    if (Array.isArray(data?.markets)) {
      markets.push(...data.markets);
    }

    cursor = data?.cursor || null;
    if (!cursor) break;
    pageCount += 1;
  }

  return markets;
}

async function getMarketsExpiringToday({
  timeZone = MARKET_TIMEZONE,
  useSandbox,
} = {}) {
  const todayKey = formatDateInTimeZone(new Date(), timeZone);
  const markets = await getMarkets({ useSandbox });

  return markets.filter((market) => {
    const closeAt = market?.close_time || market?.latest_expiration_time;
    if (!closeAt) return false;
    const closeKey = formatDateInTimeZone(new Date(closeAt), timeZone);
    return closeKey === todayKey;
  });
}

async function getSeriesList({ category, useSandbox } = {}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  const path = `/trade-api/v2/series?${params.toString()}`;
  const data = await kalshiRequest({ method: "GET", path, useSandbox });
  return Array.isArray(data?.series) ? data.series : [];
}

async function getEventsPage({
  seriesTicker,
  cursor,
  limit = 200,
  useSandbox,
}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("with_nested_markets", "true");
  if (seriesTicker) params.set("series_ticker", seriesTicker);
  if (cursor) params.set("cursor", cursor);

  const path = `/trade-api/v2/events?${params.toString()}`;
  return kalshiRequest({ method: "GET", path, useSandbox });
}

async function getEventsForSeries(seriesTicker, { useSandbox } = {}) {
  const events = [];
  let cursor = null;
  let pageCount = 0;

  while (pageCount < 10) {
    const data = await getEventsPage({ seriesTicker, cursor, useSandbox });
    if (Array.isArray(data?.events)) {
      events.push(...data.events);
    }
    cursor = data?.cursor || null;
    if (!cursor) break;
    pageCount += 1;
  }

  return events;
}

async function getClimateDailyEvents({
  timeZone = MARKET_TIMEZONE,
  useSandbox,
} = {}) {
  const now = Date.now();
  const cacheKey = useSandbox ? "sandbox" : "prod";
  const cached = climateEventsCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }

  let series = await getSeriesList({ category: CLIMATE_CATEGORY, useSandbox });
  if (!series.length) {
    series = await getSeriesList({ useSandbox });
  }

  const climateTags = parseCsv(CLIMATE_TAGS_RAW).map(normalizeText);
  const categoryCandidates = parseCsv(CLIMATE_CATEGORY).map(normalizeText);

  const dailySeries = series.filter((item) => {
    const frequencyMatches = normalizeText(item?.frequency).includes(
      CLIMATE_FREQUENCY
    );
    if (!frequencyMatches) return false;

    const categoryValue = normalizeText(item?.category);
    const categoryMatches = categoryCandidates.some((candidate) =>
      candidate ? categoryValue.includes(candidate) : false
    );
    const tagMatches = Array.isArray(item?.tags)
      ? item.tags.some((tag) =>
          climateTags.some((candidate) =>
            candidate ? normalizeText(tag).includes(candidate) : false
          )
        )
      : false;
    const titleValue = normalizeText(item?.title);
    const titleMatches =
      titleValue.includes("climate") ||
      titleValue.includes("temperature") ||
      titleValue.includes("rain") ||
      titleValue.includes("snow");

    return categoryMatches || tagMatches || titleMatches;
  });

  const todayKey = formatDateInTimeZone(new Date(), timeZone);
  const events = [];

  const limitedSeries = dailySeries.slice(0, Math.max(1, CLIMATE_MAX_SERIES));

  for (const entry of limitedSeries) {
    const seriesEvents = await getEventsForSeries(entry.ticker, { useSandbox });
    seriesEvents.forEach((event) => {
      const closeAt =
        event?.close_time ||
        event?.latest_expiration_time ||
        event?.expected_expiration_time;
      const eventDate = closeAt ? new Date(closeAt) : extractEventDate(event);
      if (!eventDate) return;
      const closeKey = formatDateInTimeZone(eventDate, timeZone);
      if (closeKey !== todayKey) return;
      events.push(event);
    });
    await sleep(120);
  }

  if (!events.length) {
    const upcoming = [];
    for (const entry of limitedSeries) {
      const seriesEvents = await getEventsForSeries(entry.ticker, {
        useSandbox,
      });
      seriesEvents.forEach((event) => {
        const closeAt =
          event?.close_time ||
          event?.latest_expiration_time ||
          event?.expected_expiration_time;
        const eventDate = closeAt ? new Date(closeAt) : extractEventDate(event);
        if (!eventDate) return;
        upcoming.push({ event, closeAt: eventDate.toISOString() });
      });
      await sleep(60);
    }
    upcoming
      .sort((a, b) => new Date(a.closeAt) - new Date(b.closeAt))
      .slice(0, 50)
      .forEach((entry) => events.push(entry.event));
  }

  climateEventsCache.set(cacheKey, {
    value: events,
    expiresAt: now + CLIMATE_EVENTS_CACHE_TTL_MS,
  });
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

  const buildWeatherUrl = (base) => {
    const days = Number.isFinite(WEATHERCOMPANY_DAILY_DAYS)
      ? Math.max(3, Math.min(15, WEATHERCOMPANY_DAILY_DAYS))
      : 7;
    const url = new URL(`/v3/wx/forecast/daily/${days}day`, base);
    url.searchParams.set("geocode", match.geocode);
    url.searchParams.set("format", "json");
    url.searchParams.set("units", WEATHERCOMPANY_UNITS);
    url.searchParams.set("language", "en-US");
    url.searchParams.set("apiKey", WEATHERCOMPANY_API_KEY);
    return url;
  };

  const fetchWeather = async (base) => {
    const url = buildWeatherUrl(base);
    const response = await fetch(url.toString(), {
      headers: {
        "Accept-Encoding": "gzip",
        Accept: "application/json",
        "User-Agent": WEATHERCOMPANY_USER_AGENT,
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    if (!response.ok || !isJson) {
      const bodyText = await response.text();
      return {
        ok: false,
        details: {
          status: response.status,
          contentType,
          body: bodyText.slice(0, 500),
          base,
        },
      };
    }
    try {
      const data = await response.json();
      return { ok: true, data };
    } catch (error) {
      return {
        ok: false,
        details: { contentType, base, message: "invalid json" },
      };
    }
  };

  const primary = await fetchWeather(WEATHERCOMPANY_API_BASE);
  if (!primary.ok) {
    const isTWC = WEATHERCOMPANY_API_BASE.includes("twcapi.co");
    if (isTWC) {
      const fallback = await fetchWeather("https://api.weather.com");
      if (fallback.ok) {
        return {
          city: match.name,
          geocode: match.geocode,
          highTemp: toNumber(
            Array.isArray(fallback.data?.temperatureMax)
              ? fallback.data.temperatureMax[0]
              : fallback.data?.temperatureMax
          ),
          lowTemp: toNumber(
            Array.isArray(fallback.data?.temperatureMin)
              ? fallback.data.temperatureMin[0]
              : fallback.data?.temperatureMin
          ),
          raw: fallback.data,
        };
      }
      const error = new Error("WeatherCompany request failed");
      error.details = { primary: primary.details, fallback: fallback.details };
      throw error;
    }

    const error = new Error("WeatherCompany request failed");
    error.details = primary.details;
    throw error;
  }

  const data = primary.data;

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

async function placeClimateDailyTrades({ amountCents, useSandbox } = {}) {
  const events = await getClimateDailyEvents({ useSandbox });
  const trades = [];

  for (const event of events) {
    try {
      const decision = await decideClimateMarketForEvent(event);
      const priceDollars = extractYesPriceDollars(decision.chosen);
      if (!priceDollars) {
        const error = new Error("Missing market price for order");
        error.details = { ticker: decision.chosen?.ticker };
        throw error;
      }
      const trade = await placeKalshiTrade({
        amountCents: amountCents || CLIMATE_TRADE_AMOUNT_CENTS,
        ticker: decision.chosen.ticker,
        side: "yes",
        action: "buy",
        type: "market",
        priceDollars,
        useSandbox,
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
  priceDollars,
  contractPriceCents,
  useSandbox,
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

  if (priceDollars !== undefined && priceDollars !== null && priceDollars !== "") {
    if (body.side === "yes") {
      body.yes_price_dollars = String(priceDollars);
    } else if (body.side === "no") {
      body.no_price_dollars = String(priceDollars);
    }
  }

  if (body.type === "limit") {
    const fallbackPrice = process.env.KALSHI_LIMIT_PRICE;
    const resolvedPrice = price ?? fallbackPrice;
    if (resolvedPrice !== undefined && resolvedPrice !== null && resolvedPrice !== "") {
      body.price = Number(resolvedPrice);
    }
  }

  const data = await kalshiRequest({ method: "POST", path, body, useSandbox });

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

async function placeHighestOddsTrade({ amountCents, useSandbox } = {}) {
  const markets = await getMarketsExpiringToday({ useSandbox });
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
    priceDollars: top.odds,
    useSandbox,
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
  getSeriesList,
  getEventsForSeries,
};
