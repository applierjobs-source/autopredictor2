const statusEl = document.getElementById("status");
const runButton = document.getElementById("runButton");
const refreshEventsButton = document.getElementById("refreshEvents");
const eventsStatusEl = document.getElementById("eventsStatus");
const eventsBodyEl = document.getElementById("eventsBody");
const amountInput = document.getElementById("amountInput");
const sandboxToggle = document.getElementById("sandboxToggle");
const dryRunToggle = document.getElementById("dryRunToggle");
let lastRunByEvent = {};

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

  if (payload.trade || payload.trades) {
    const label = payload.trades ? "Trades placed" : "Trade placed";
    statusEl.textContent = `${label}:\n${JSON.stringify(
      payload.trades || payload.trade,
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

async function placeClimateTrades() {
  runButton.disabled = true;
  runButton.textContent = "Placing trades...";
  const amountDollars = Number(amountInput.value || 0);
  const amountCents = Number.isFinite(amountDollars)
    ? Math.max(1, Math.round(amountDollars * 100))
    : undefined;
  const sandbox = Boolean(sandboxToggle.checked);
  const dryRun = Boolean(dryRunToggle.checked);

  try {
    const response = await fetch("/api/trade/climate-daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents, sandbox, dryRun }),
    });

    const data = await response.json();
    renderStatus(data);
    lastRunByEvent = buildRunLookup(data?.trades || []);
    renderEvents(lastRunByEvent);
  } catch (error) {
    renderStatus({ error: { message: error?.message || "Request failed" } });
  } finally {
    runButton.disabled = false;
    updateRunLabel();
  }
}

function updateRunLabel() {
  const amountDollars = Number(amountInput.value || 0);
  const displayAmount = Number.isFinite(amountDollars) && amountDollars > 0
    ? amountDollars
    : 0;
  runButton.textContent = `Run climate trades ($${displayAmount} each)`;
}

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function buildRunLookup(trades) {
  return trades.reduce((acc, trade) => {
    if (trade?.eventTicker) {
      acc[trade.eventTicker] = trade;
    }
    return acc;
  }, {});
}

function renderEvents(runLookup) {
  eventsBodyEl.innerHTML = "";
  const events = window.currentEvents || [];
  if (!events.length) {
    eventsStatusEl.textContent = "No climate events found.";
    return;
  }

  eventsStatusEl.textContent = `${events.length} climate events loaded.`;

  events.forEach((event) => {
    const row = document.createElement("tr");
    const marketLabels = (event.markets || [])
      .map((market) => market.label)
      .filter(Boolean)
      .join(", ");
    const trade = runLookup?.[event.eventTicker];
    const forecastHigh =
      trade?.forecast?.highTemp !== undefined ? trade.forecast.highTemp : "—";
    const forecastLow =
      trade?.forecast?.lowTemp !== undefined ? trade.forecast.lowTemp : "—";
    const noaaHigh =
      trade?.noaa?.highTemp !== undefined ? trade.noaa.highTemp : "—";
    const divergence =
      trade?.divergence !== undefined && trade?.divergence !== null
        ? trade.divergence.toFixed(2)
        : "—";
    const edge =
      trade?.edge !== undefined && trade?.edge !== null
        ? (trade.edge * 100).toFixed(1) + "%"
        : "—";

    row.innerHTML = `
      <td>${formatCell(event.eventTicker)}</td>
      <td>${formatCell(event.closeTime)}</td>
      <td>${formatCell(event.title)}</td>
      <td>${formatCell(forecastHigh)}</td>
      <td>${formatCell(forecastLow)}</td>
      <td>${formatCell(noaaHigh)}</td>
      <td>${formatCell(divergence)}</td>
      <td>${formatCell(edge)}</td>
      <td>${formatCell(marketLabels)}</td>
    `;
    eventsBodyEl.appendChild(row);
  });
}

async function fetchEvents() {
  eventsStatusEl.textContent = "Loading events...";
  eventsBodyEl.innerHTML = "";
  const sandbox = Boolean(sandboxToggle.checked);

  try {
    const response = await fetch(
      `/api/climate/events?sandbox=${sandbox ? "true" : "false"}`
    );
    const data = await response.json();
    if (data.error) {
      eventsStatusEl.textContent = data.error.message || "Failed to load events.";
      return;
    }
    window.currentEvents = data.events || [];
    renderEvents(lastRunByEvent);
  } catch (error) {
    eventsStatusEl.textContent = error?.message || "Failed to load events.";
  }
}

runButton.addEventListener("click", placeClimateTrades);
refreshEventsButton.addEventListener("click", fetchEvents);
amountInput.addEventListener("input", updateRunLabel);
fetchLastTrade();
fetchEvents();
updateRunLabel();
