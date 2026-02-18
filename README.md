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
- `KALSHI_CLIMATE_CATEGORY`: Kalshi category for climate series (default `climate`).
- `KALSHI_CLIMATE_FREQUENCY`: Kalshi series frequency filter (default `daily`).
- `TRADE_AMOUNT_CENTS`: Trade size in cents (default `1000`).
- `CLIMATE_TRADE_AMOUNT_CENTS`: Trade size per climate event (default `2000`).
- `SCHEDULED_TRADES_ENABLED`: Set to `false` to disable 9am CST scheduling.
- `WEATHERCOMPANY_API_KEY`: Weather Company API key.
- `WEATHERCOMPANY_API_BASE`: Weather Company API base URL (default `https://api.weather.com`).
- `WEATHERCOMPANY_UNITS`: Weather Company units (default `e`).
- `OPENAI_API_KEY`: OpenAI API key.
- `OPENAI_MODEL`: OpenAI model to use (default `gpt-4o-mini`).

## Railway Notes

- Set the same environment variables in Railway.
- The scheduled trade runs in the same process as the web server. If you scale
  to multiple instances, multiple trades could be placed. Use a single instance
  or add a distributed lock if you need multi-instance scaling.
