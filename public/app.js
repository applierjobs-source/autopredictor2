const statusEl = document.getElementById("status");
const buyButton = document.getElementById("buyButton");

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
    buyButton.textContent = "Buy $10";
  }
}

buyButton.addEventListener("click", placeTrade);
fetchLastTrade();
