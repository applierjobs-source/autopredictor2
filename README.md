# AutoPredictor - Kalshi Trade Bot

This project places $20 trades across daily climate events using live Weather
Company forecasts and an OpenAI decision to pick the best temperature range.
It includes a frontend to trigger the batch trade and see the daily climate
event list. It uses the Kalshi Trade API with RSA-PSS authentication.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `env.example` to `.env` and fill in your Kalshi values.

3. Start the server:

   ```bash
   npm start
   ```

4. Visit `http://localhost:3000`.

## Environment Variables

- `KALSHI_ACCESS_KEY`: API Key ID from Kalshi.
- `KALSHI_PRIVATE_KEY`: PEM private key content (replace newlines with `\n`).
- `KALSHI_MARKET_TICKER`: Market ticker to trade when using fixed-ticker mode.
- `KALSHI_API_BASE`: Optional API base (default `https://api.kalshi.com`).
- `KALSHI_ORDER_SIDE`: `yes` or `no` (default `yes`).
- `KALSHI_ORDER_ACTION`: `buy` or `sell` (default `buy`).
- `KALSHI_ORDER_TYPE`: `market` or `limit` (default `market`).
- `KALSHI_LIMIT_PRICE`: Required if order type is `limit`.
- `KALSHI_CONTRACT_PRICE_CENTS`: Contract price used to approximate $10 trades (default `100`).
- `KALSHI_MARKET_STATUS`: Market status filter for lists (default `open`).
- `KALSHI_MARKET_PAGE_LIMIT`: Page size for market lists (default `500`).
- `KALSHI_MARKET_TIMEZONE`: Timezone for "expiring today" filters (default `America/Chicago`).
- `KALSHI_AUTO_STRATEGY`: `climate-daily` (default), `highest-odds`, or `fixed-ticker`.
- `KALSHI_CLIMATE_CATEGORY`: Kalshi category for climate series (default `Climate and Weather`).
- `KALSHI_CLIMATE_FREQUENCY`: Kalshi series frequency filter (default `daily`).
- `KALSHI_CLIMATE_TAGS`: Comma-separated tags for climate series matching.
- `TRADE_AMOUNT_CENTS`: Trade size in cents (default `1000`).
- `CLIMATE_TRADE_AMOUNT_CENTS`: Trade size per climate event (default `2000`).
- `SCHEDULED_TRADES_ENABLED`: Set to `false` to disable 9am CST scheduling.
- `KALSHI_USE_SANDBOX`: Use sandbox by default for scheduled trades (default `false`).
- `KALSHI_SANDBOX_API_BASE`: Base URL for Kalshi sandbox API.
- `KALSHI_SANDBOX_ACCESS_KEY`: Sandbox API key ID.
- `KALSHI_SANDBOX_PRIVATE_KEY`: Sandbox private key PEM (\\n for newlines).
- `DRY_RUN_TRADES`: Skip placing orders and return picks only.
- `WEATHERCOMPANY_API_KEY`: Weather Company API key.
- `WEATHERCOMPANY_API_BASE`: Weather Company API base URL (default `https://api.weather.com`).
- `WEATHERCOMPANY_UNITS`: Weather Company units (default `e`).
- `WEATHERCOMPANY_USER_AGENT`: User-Agent header for Weather Company requests.
- `WEATHERCOMPANY_DAILY_DAYS`: Daily forecast days (3-15, default `7`).
- `NOAA_NWS_BASE`: NOAA NWS API base (default `https://api.weather.gov`).
- `NOAA_USER_AGENT`: User-Agent header for NOAA requests (include contact).
- `NOAA_HISTORY_DAYS`: Days of observations for NOAA error model.
- `NOAA_MODEL_MAX_SAMPLES`: Max NOAA error samples to retain.
- `NOAA_STD_DEFAULT`: Default std dev for NOAA model (F).
- `TWC_STD_DEFAULT`: Default std dev for TWC (F).
- `NOAA_WEIGHT`: Weight for NOAA probability in mixture.
- `TWC_WEIGHT`: Weight for TWC probability in mixture.
- `KALSHI_EDGE_THRESHOLD`: Minimum edge required (default `0.03`).
- `KALSHI_FEE_BUFFER`: Fee buffer subtracted from edge (default `0.01`).
- `KALSHI_MAX_DIVERGENCE_F`: Skip trades when NOAA/TWC differ by more than this (F).
- `PRECIP_DISAGREE_THRESHOLD`: Min precip prob diff for rain trades (default `0.1`).
- `OPENAI_API_KEY`: OpenAI API key.
- `OPENAI_MODEL`: OpenAI model to use (default `gpt-4o-mini`).
- `KALSHI_MAX_RETRIES`: Retry attempts on 429s (default `3`).
- `KALSHI_RETRY_BASE_DELAY_MS`: Base delay for 429 retries (default `800`).
- `CLIMATE_EVENTS_CACHE_TTL_MS`: Cache TTL for events (default `300000`).
- `CLIMATE_MAX_SERIES`: Max series to scan per run (default `20`).

## Railway Notes

- Set the same environment variables in Railway.
- The scheduled trade runs in the same process as the web server. If you scale
  to multiple instances, multiple trades could be placed. Use a single instance
  or add a distributed lock if you need multi-instance scaling.
