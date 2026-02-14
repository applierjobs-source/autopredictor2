const express = require("express");
const path = require("path");
const cron = require("node-cron");

const { placeKalshiTrade } = require("./kalshiClient");

const app = express();
const port = process.env.PORT || 3000;

const scheduledEnabled = process.env.SCHEDULED_TRADES_ENABLED !== "false";
const tradeAmountCents = Number(process.env.TRADE_AMOUNT_CENTS || 1000);

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

app.post("/api/trade", async (req, res) => {
  const amountCents = Number(req.body?.amountCents || tradeAmountCents);

  try {
    const trade = await placeKalshiTrade({ amountCents });
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

if (scheduledEnabled) {
  cron.schedule(
    "0 9 * * *",
    async () => {
      try {
        const trade = await placeKalshiTrade({ amountCents: tradeAmountCents });
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
