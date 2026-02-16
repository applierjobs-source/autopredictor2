const statusEl = document.getElementById("status");
const buyButton = document.getElementById("buyButton");
const bestButton = document.getElementById("bestButton");
const refreshBetsButton = document.getElementById("refreshBets");
const betsStatusEl = document.getElementById("betsStatus");
const betsBodyEl = document.getElementById("betsBody");

function renderStatus(payload) {
  if (!payload) {
    statusEl.textContent = "Waiting for trade...";
    return;
  }

  if (payload.error) {
    statusEl.textContent = `Trade failed:\n${JSON.stringify(
      payload.error,
      null,
      2
    )}`;
    return;
  }

  if (payload.trade) {
    statusEl.textContent = `Trade placed:\n${JSON.stringify(
      payload.trade,
      null,
      2
    )}`;
  }
}

async function fetchLastTrade() {
  const response = await fetch("/api/trade/last");
  const data = await response.json();
  renderStatus(data);
}

async function placeTrade() {
  buyButton.disabled = true;
  buyButton.textContent = "Placing trade...";

  try {
    const response = await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: 1000 }),
    });

    const data = await response.json();
    renderStatus(data);
  } catch (error) {
    renderStatus({ error: { message: error?.message || "Request failed" } });
  } finally {
    buyButton.disabled = false;
    buyButton.textContent = "Buy $10 (default)";
  }
}

async function placeBestTrade() {
  bestButton.disabled = true;
  bestButton.textContent = "Placing trade...";

  try {
    const response = await fetch("/api/trade/highest-odds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: 1000 }),
    });

    const data = await response.json();
    renderStatus(data);
  } catch (error) {
    renderStatus({ error: { message: error?.message || "Request failed" } });
  } finally {
    bestButton.disabled = false;
    bestButton.textContent = "Buy $10 (highest odds)";
  }
}

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function renderBets(markets) {
  betsBodyEl.innerHTML = "";
  if (!markets.length) {
    betsStatusEl.textContent = "No markets expiring today.";
    return;
  }

  betsStatusEl.textContent = `${markets.length} markets expiring today.`;

  markets.forEach((market) => {
    const row = document.createElement("tr");
    const tradeCell = document.createElement("td");
    const tradeButton = document.createElement("button");
    tradeButton.className = "secondary";
    tradeButton.textContent = "Trade $10";
    tradeButton.addEventListener("click", () => placeTradeForTicker(market));
    tradeCell.appendChild(tradeButton);

    row.innerHTML = `
      <td></td>
      <td>${formatCell(market.ticker)}</td>
      <td>${formatCell(market.title)}</td>
      <td>${formatCell(market.closeTime)}</td>
      <td>${formatCell(market.yesAskDollars)}</td>
      <td>${formatCell(market.yesBidDollars)}</td>
      <td>${formatCell(market.lastPriceDollars)}</td>
    `;
    row.children[0].replaceWith(tradeCell);
    betsBodyEl.appendChild(row);
  });
}

async function fetchBets() {
  betsStatusEl.textContent = "Loading markets...";
  betsBodyEl.innerHTML = "";

  try {
    const response = await fetch("/api/bets/expiring-today");
    const data = await response.json();
    if (data.error) {
      betsStatusEl.textContent = data.error.message || "Failed to load markets.";
      return;
    }
    renderBets(data.markets || []);
  } catch (error) {
    betsStatusEl.textContent = error?.message || "Failed to load markets.";
  }
}

async function placeTradeForTicker(market) {
  if (!market?.ticker) return;
  betsStatusEl.textContent = `Placing trade for ${market.ticker}...`;

  try {
    const response = await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: 1000, ticker: market.ticker }),
    });
    const data = await response.json();
    renderStatus(data);
    betsStatusEl.textContent = `Placed trade for ${market.ticker}.`;
  } catch (error) {
    betsStatusEl.textContent = error?.message || "Trade failed.";
  }
}

buyButton.addEventListener("click", placeTrade);
bestButton.addEventListener("click", placeBestTrade);
refreshBetsButton.addEventListener("click", fetchBets);
fetchLastTrade();
fetchBets();
