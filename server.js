const express = require("express");
const path = require("path");
const cron = require("node-cron");

const {
  placeKalshiTrade,
  placeHighestOddsTrade,
  getMarketsExpiringToday,
  getClimateDailyEvents,
  placeClimateDailyTrades,
  getSeriesList,
  getEventsForSeries,
} = require("./kalshiClient");

const app = express();
const port = process.env.PORT || 3000;

const scheduledEnabled = process.env.SCHEDULED_TRADES_ENABLED !== "false";
const tradeAmountCents = Number(process.env.TRADE_AMOUNT_CENTS || 1000);
const autoStrategy =
  process.env.KALSHI_AUTO_STRATEGY || "climate-daily";
const sandboxByDefault = process.env.KALSHI_USE_SANDBOX === "true";
const dryRunByDefault = process.env.DRY_RUN_TRADES === "true";

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

let lastTrade = null;
let lastTradeError = null;

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/trade/last", (req, res) => {
  res.json({
    trade: lastTrade,
    error: lastTradeError,
  });
});

app.get("/api/bets/expiring-today", async (req, res) => {
  try {
    const markets = await getMarketsExpiringToday();
    const payload = markets.map((market) => ({
      ticker: market.ticker,
      title: market.title || market.yes_sub_title || market.ticker,
      closeTime: market.close_time || market.latest_expiration_time,
      yesAskDollars: market.yes_ask_dollars ?? market.yes_ask ?? null,
      yesBidDollars: market.yes_bid_dollars ?? market.yes_bid ?? null,
      lastPriceDollars: market.last_price_dollars ?? market.last_price ?? null,
    }));
    res.json({ markets: payload });
  } catch (error) {
    const errorPayload = {
      message: error?.message || "Failed to load markets",
      details: error?.details || null,
    };
    res.status(500).json({ error: errorPayload });
  }
});

app.get("/api/climate/events", async (req, res) => {
  try {
    const useSandbox =
      req.query?.sandbox !== undefined
        ? parseBoolean(req.query?.sandbox)
        : sandboxByDefault;
    const daysAhead = parseInteger(req.query?.daysAhead, 1);
    const events = await getClimateDailyEvents({ useSandbox, daysAhead });
    const payload = events.map((event) => ({
      eventTicker: event.event_ticker,
      title: event.title,
      closeTime:
        event.close_time ||
        event.latest_expiration_time ||
        event.expected_expiration_time,
      markets: (event.markets || []).map((market) => ({
        ticker: market.ticker,
        label: market.yes_sub_title || market.title || market.ticker,
      })),
    }));
    res.json({ events: payload });
  } catch (error) {
    const errorPayload = {
      message: error?.message || "Failed to load climate events",
      details: error?.details || null,
    };
    res.status(500).json({ error: errorPayload });
  }
});

app.get("/api/kalshi/series", async (req, res) => {
  try {
    const useSandbox =
      req.query?.sandbox !== undefined
        ? parseBoolean(req.query?.sandbox)
        : sandboxByDefault;
    const category = req.query?.category || undefined;
    const series = await getSeriesList({ category, useSandbox });
    const payload = series.map((item) => ({
      ticker: item.ticker,
      title: item.title,
      frequency: item.frequency,
      category: item.category,
      tags: item.tags,
    }));
    res.json({ count: payload.length, series: payload.slice(0, 50) });
  } catch (error) {
    const errorPayload = {
      message: error?.message || "Failed to load series",
      details: error?.details || null,
    };
    res.status(500).json({ error: errorPayload });
  }
});

app.get("/api/kalshi/series/:ticker/events", async (req, res) => {
  try {
    const useSandbox =
      req.query?.sandbox !== undefined
        ? parseBoolean(req.query?.sandbox)
        : sandboxByDefault;
    const seriesTicker = req.params.ticker;
    const events = await getEventsForSeries(seriesTicker, { useSandbox });
    const payload = events.slice(0, 50).map((event) => ({
      eventTicker: event.event_ticker,
      title: event.title,
      closeTime:
        event.close_time ||
        event.latest_expiration_time ||
        event.expected_expiration_time,
      status: event.status,
      marketsCount: Array.isArray(event.markets) ? event.markets.length : 0,
    }));
    res.json({ count: events.length, events: payload });
  } catch (error) {
    const errorPayload = {
      message: error?.message || "Failed to load series events",
      details: error?.details || null,
    };
    res.status(500).json({ error: errorPayload });
  }
});

app.post("/api/trade", async (req, res) => {
  const amountCents = Number(req.body?.amountCents || tradeAmountCents);
  const ticker = req.body?.ticker;
  const side = req.body?.side;
  const action = req.body?.action;
  const type = req.body?.type;
  const price = req.body?.price;

  try {
    const trade = await placeKalshiTrade({
      amountCents,
      ticker,
      side,
      action,
      type,
      price,
    });
    lastTrade = trade;
    lastTradeError = null;
    res.json({ trade });
  } catch (error) {
    lastTradeError = {
      message: error?.message || "Trade failed",
      details: error?.details || null,
    };
    res.status(500).json({ error: lastTradeError });
  }
});

app.post("/api/trade/highest-odds", async (req, res) => {
  const amountCents = Number(req.body?.amountCents || tradeAmountCents);
  const useSandbox =
    req.body?.sandbox !== undefined
      ? parseBoolean(req.body?.sandbox)
      : sandboxByDefault;

  try {
    const trade = await placeHighestOddsTrade({ amountCents, useSandbox });
    lastTrade = trade;
    lastTradeError = null;
    res.json({ trade });
  } catch (error) {
    lastTradeError = {
      message: error?.message || "Trade failed",
      details: error?.details || null,
    };
    res.status(500).json({ error: lastTradeError });
  }
});

app.post("/api/trade/climate-daily", async (req, res) => {
  try {
    const amountCents = Number(req.body?.amountCents || 0) || undefined;
    const useSandbox =
      req.body?.sandbox !== undefined
        ? parseBoolean(req.body?.sandbox)
        : sandboxByDefault;
    const dryRun =
      req.body?.dryRun !== undefined
        ? parseBoolean(req.body?.dryRun)
        : dryRunByDefault;
    const daysAhead = parseInteger(req.body?.daysAhead, 1);
    const trades = await placeClimateDailyTrades({
      amountCents,
      useSandbox,
      dryRun,
      daysAhead,
    });
    lastTrade = trades;
    lastTradeError = null;
    res.json({ trades });
  } catch (error) {
    lastTradeError = {
      message: error?.message || "Climate daily trade failed",
      details: error?.details || null,
    };
    res.status(500).json({ error: lastTradeError });
  }
});

if (scheduledEnabled) {
  cron.schedule(
    "0 9 * * *",
    async () => {
      try {
        const trade =
          autoStrategy === "fixed-ticker"
            ? await placeKalshiTrade({
                amountCents: tradeAmountCents,
                useSandbox: sandboxByDefault,
              })
            : autoStrategy === "highest-odds"
            ? await placeHighestOddsTrade({
                amountCents: tradeAmountCents,
                useSandbox: sandboxByDefault,
              })
            : await placeClimateDailyTrades({
                useSandbox: sandboxByDefault,
              });
        lastTrade = trade;
        lastTradeError = null;
        console.log("[scheduler] Placed trade", trade);
      } catch (error) {
        lastTradeError = {
          message: error?.message || "Scheduled trade failed",
          details: error?.details || null,
        };
        console.error("[scheduler] Trade failed", lastTradeError);
      }
    },
    { timezone: "America/Chicago" }
  );
}

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
