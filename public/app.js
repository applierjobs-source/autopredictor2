const statusEl = document.getElementById("status");
const runButton = document.getElementById("runButton");
const refreshEventsButton = document.getElementById("refreshEvents");
const eventsStatusEl = document.getElementById("eventsStatus");
const eventsBodyEl = document.getElementById("eventsBody");
const amountInput = document.getElementById("amountInput");
const sandboxToggle = document.getElementById("sandboxToggle");
const dryRunToggle = document.getElementById("dryRunToggle");

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

function renderEvents(events) {
  eventsBodyEl.innerHTML = "";
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

    row.innerHTML = `
      <td>${formatCell(event.eventTicker)}</td>
      <td>${formatCell(event.closeTime)}</td>
      <td>${formatCell(event.title)}</td>
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
    renderEvents(data.events || []);
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
