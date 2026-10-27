const state = { data: null, toastTimer: null, initialized: false };
const pageNames = {
  dashboard: "Dashboard",
  menu: "Menu management",
  sales: "Daily sales",
  events: "Event planner",
  forecast: "Demand forecast",
  reports: "Evaluation & reports"
};

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});
document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.go));
});
document.getElementById("mobileMenu").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

document.getElementById("menuForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitForm(event.currentTarget, "/api/menu", "name");
});
document.getElementById("salesForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitForm(event.currentTarget, "/api/sales", null, (form) => {
    form.set("specialEvent", document.querySelector('#salesForm [name="specialEvent"]').checked);
  });
});
document.getElementById("eventForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitForm(event.currentTarget, "/api/events", "name");
});
document.getElementById("forecastForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new URLSearchParams(new FormData(event.currentTarget));
  try {
    const selectedItem = state.data.menu.find((item) => item.id === Number(form.get("itemId")));
    const forecastDate = form.get("date");
    const windowSize = Number(form.get("window"));
    const previous = state.data.sales
      .filter((sale) => sale.itemId === Number(form.get("itemId")) && sale.date < forecastDate)
      .sort((first, second) => second.date.localeCompare(first.date))
      .slice(0, windowSize);
    if (!selectedItem) throw new Error("Choose a menu item.");
    if (!previous.length) throw new Error("Add a sales record before the forecast date first.");
    const average = previous.reduce((sum, sale) => sum + sale.quantity, 0) / previous.length;
    const eventDay = state.data.events.some((collegeEvent) => collegeEvent.date === forecastDate);
    const predicted = Math.round(average * (eventDay ? 1.1 : 1));
    await request("/api/forecasts", { method: "POST", body: form });
    renderForecastResult(selectedItem, forecastDate, average, predicted, previous.length, eventDay);
    await refresh();
    showToast("Forecast calculated and saved.");
  } catch (error) {
    showToast(error.message, true);
  }
});
document.getElementById("actualForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const [itemId, date] = formElement.elements.forecast.value.split("|");
  const form = new URLSearchParams({
    itemId,
    date,
    quantity: formElement.elements.quantity.value
  });
  try {
    await request("/api/actual", { method: "POST", body: form });
    formElement.reset();
    await refresh();
    showToast("Actual sales saved. Your report is up to date.");
  } catch (error) {
    showToast(error.message, true);
  }
});

async function submitForm(formElement, endpoint, requiredField, prepare) {
  const form = new URLSearchParams(new FormData(formElement));
  if (prepare) prepare(form);
  try {
    await request(endpoint, { method: "POST", body: form });
    formElement.reset();
    setDefaultDates();
    await refresh();
    showToast(requiredField === "name" && endpoint === "/api/menu"
      ? "Menu item added."
      : endpoint === "/api/events" ? "Event added to your calendar." : "Sales entry saved.");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result;
}

async function refresh() {
  try {
    state.data = await request("/api/data");
    if (!state.initialized) {
      setDefaultDates();
      state.initialized = true;
    }
    renderAll();
  } catch (error) {
    showToast(`Could not load the canteen data: ${error.message}`, true);
  }
}

function renderAll() {
  renderDashboard();
  renderMenu();
  renderSales();
  renderEvents();
  renderForecasts();
  renderReports();
  populateSelects();
}

function renderDashboard() {
  const { data } = state;
  const today = data.today;
  const todaySales = data.sales.filter((sale) => sale.date === today);
  const todayMeals = todaySales.reduce((total, sale) => total + sale.quantity, 0);
  const predictedToday = data.menu.reduce((total, item) => {
    const records = data.sales.filter((sale) => sale.itemId === item.id && sale.date < today)
      .sort((first, second) => second.date.localeCompare(first.date)).slice(0, 7);
    if (!records.length) return total;
    const average = records.reduce((sum, sale) => sum + sale.quantity, 0) / records.length;
    return total + Math.round(average * (data.events.some((collegeEvent) => collegeEvent.date === today) ? 1.1 : 1));
  }, 0);
  const upcoming = data.events.filter((collegeEvent) => collegeEvent.date >= today)
    .sort((first, second) => first.date.localeCompare(second.date));
  document.getElementById("todayLabel").textContent = new Date(`${today}T00:00:00`)
    .toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
  document.getElementById("todayMeals").textContent = number(todayMeals);
  document.getElementById("todayForecast").textContent = predictedToday ? number(predictedToday) : "—";
  document.getElementById("forecastStatus").textContent = predictedToday ? "Average-based estimate" : "Add sales history";
  document.getElementById("menuCount").textContent = data.menu.length;
  document.getElementById("eventCount").textContent = upcoming.length;
  document.getElementById("nextEventFoot").textContent = upcoming.length ? `Next: ${shortDate(upcoming[0].date)}` : "No events planned";

  const days = Array.from({ length: 7 }, (_, index) => dateOffset(today, index - 6));
  const totals = days.map((date) => data.sales.filter((sale) => sale.date === date)
    .reduce((sum, sale) => sum + sale.quantity, 0));
  const max = Math.max(...totals, 1);
  document.getElementById("weekTotal").textContent = number(totals.reduce((sum, total) => sum + total, 0));
  document.getElementById("salesChart").innerHTML = days.map((date, index) => {
    const height = Math.max(totals[index] ? 7 : 2, Math.round(totals[index] / max * 91));
    return `<div class="bar-day"><div class="bar${date === today ? " today" : ""}" style="height:${height}%"><span class="bar-value">${totals[index] ? number(totals[index]) : ""}</span></div><small>${escapeHtml(new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }))}</small></div>`;
  }).join("");

  document.getElementById("dashboardEvents").innerHTML = upcoming.length
    ? upcoming.slice(0, 3).map((collegeEvent) => eventPreview(collegeEvent)).join("")
    : '<div class="empty-small">No upcoming events on your calendar.</div>';

  document.getElementById("recentSales").innerHTML = data.sales.slice()
    .sort((first, second) => second.date.localeCompare(first.date))
    .slice(0, 5)
    .map((sale) => {
      const item = itemById(sale.itemId);
      return `<tr><td>${escapeHtml(item ? item.name : "Removed item")}</td><td>${formatDate(sale.date)}</td><td>${number(sale.quantity)}</td><td><span class="tag${sale.specialEvent ? " event-tag" : ""}">${sale.specialEvent ? "Event day" : "Regular day"}</span></td></tr>`;
    }).join("") || emptyRow(4, "No sales have been recorded yet.");
}

function renderMenu() {
  const menu = state.data.menu;
  document.getElementById("menuTotal").textContent = menu.length;
  document.getElementById("menuPill").textContent = `${menu.length} item${menu.length === 1 ? "" : "s"}`;
  document.getElementById("menuDescription").textContent = `${menu.length} food item${menu.length === 1 ? "" : "s"} available for daily operations.`;
  document.getElementById("menuList").innerHTML = menu.length ? menu.map((item, index) => `
    <div class="menu-card">
      <span class="food-icon">${["🍛", "🥗", "🌯", "🍲", "🥞", "🍜"][index % 6]}</span>
      <div class="menu-copy"><strong>${escapeHtml(item.name)}</strong><small>Menu item #${item.id}</small></div>
      <button class="icon-button" type="button" aria-label="Delete ${escapeHtml(item.name)}" title="Delete item" data-delete-menu="${item.id}">×</button>
    </div>`).join("") : '<div class="empty-state">Your menu is empty. Add a food item above to get started.</div>';
  document.querySelectorAll("[data-delete-menu]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = itemById(Number(button.dataset.deleteMenu));
      if (!item || !window.confirm(`Delete ${item.name}? Its sales and forecasts will also be removed.`)) return;
      try {
        await request(`/api/menu?id=${item.id}`, { method: "DELETE" });
        await refresh();
        showToast("Menu item deleted.");
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

function renderSales() {
  const sales = state.data.sales.slice().sort((first, second) => second.date.localeCompare(first.date));
  document.getElementById("salesRecordCount").textContent = sales.length;
  document.getElementById("salesPill").textContent = `${sales.length} record${sales.length === 1 ? "" : "s"}`;
  document.getElementById("salesTable").innerHTML = sales.length ? sales.map((sale) => `
    <tr><td>${escapeHtml((itemById(sale.itemId) || {}).name || "Removed item")}</td>
      <td>${formatDate(sale.date)}</td>
      <td>${escapeHtml(new Date(`${sale.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" }))}</td>
      <td>${number(sale.quantity)}</td>
      <td><span class="tag${sale.specialEvent ? " event-tag" : ""}">${sale.specialEvent ? "Event day" : "Regular day"}</span></td></tr>`).join("")
    : emptyRow(5, "No sales entries yet. Add your first daily total above.");
}

function renderEvents() {
  const events = state.data.events.slice().sort((first, second) => first.date.localeCompare(second.date));
  document.getElementById("eventsPill").textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
  document.getElementById("eventList").innerHTML = events.length ? events.map((collegeEvent) => `
    <div class="event-row">
      ${dateTile(collegeEvent.date)}
      <div class="event-copy"><strong>${escapeHtml(collegeEvent.name)}</strong><small>${escapeHtml(collegeEvent.details || "College event")}</small></div>
      <span class="event-date-text">${formatDate(collegeEvent.date)}</span>
      <button class="icon-button" type="button" aria-label="Delete ${escapeHtml(collegeEvent.name)}" title="Delete event" data-delete-event="${collegeEvent.id}">×</button>
    </div>`).join("") : '<div class="empty-state">No events saved yet. Add a campus event above.</div>';
  document.querySelectorAll("[data-delete-event]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Remove this event from the calendar?")) return;
      try {
        await request(`/api/events?id=${button.dataset.deleteEvent}`, { method: "DELETE" });
        await refresh();
        showToast("Event removed.");
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

function renderForecasts() {
  const forecasts = state.data.forecasts.slice().sort((first, second) => second.date.localeCompare(first.date));
  document.getElementById("forecastsPill").textContent = `${forecasts.length} forecast${forecasts.length === 1 ? "" : "s"}`;
  document.getElementById("forecastsTable").innerHTML = forecasts.length ? forecasts.map((forecast) => `
    <tr><td>${escapeHtml(forecast.itemName)}</td><td>${formatDate(forecast.date)}</td>
      <td>${number(Math.round(forecast.baseline))} meals</td><td><strong>${number(forecast.predicted)}</strong></td>
      <td><span class="tag${forecast.specialEvent ? " event-tag" : ""}">${forecast.specialEvent ? "Yes" : "No"}</span></td>
      <td><span class="tag ${forecast.actual === null ? "pending-tag" : "done-tag"}">${forecast.actual === null ? "Pending actual" : "Evaluated"}</span></td></tr>`).join("")
    : emptyRow(6, "No forecasts saved yet. Create your first forecast above.");
}

function renderReports() {
  const forecasts = state.data.forecasts.slice().sort((first, second) => second.date.localeCompare(first.date));
  const evaluated = forecasts.filter((forecast) => forecast.actual !== null);
  const pending = forecasts.filter((forecast) => forecast.actual === null);
  const errors = evaluated.map((forecast) => Math.abs(forecast.actual - forecast.predicted));
  const accuracyValues = evaluated.filter((forecast) => forecast.actual !== 0)
    .map((forecast) => Math.max(0, 100 - Math.abs(forecast.actual - forecast.predicted) / forecast.actual * 100));
  document.getElementById("evaluatedCount").textContent = evaluated.length;
  document.getElementById("averageError").textContent = errors.length
    ? `${(errors.reduce((sum, value) => sum + value, 0) / errors.length).toFixed(1)}`
    : "—";
  document.getElementById("averageAccuracy").textContent = accuracyValues.length
    ? `${(accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length).toFixed(0)}%`
    : "—";
  document.getElementById("pendingCount").textContent = pending.length;
  document.getElementById("reportsPill").textContent = `${forecasts.length} report${forecasts.length === 1 ? "" : "s"}`;
  document.getElementById("reportsTable").innerHTML = forecasts.length ? forecasts.map((forecast) => {
    const error = forecast.actual === null ? null : Math.abs(forecast.actual - forecast.predicted);
    const accuracy = forecast.actual === null ? "Pending"
      : forecast.actual === 0 ? "N/A"
        : `${Math.max(0, 100 - error / forecast.actual * 100).toFixed(1)}%`;
    return `<tr><td>${escapeHtml(forecast.itemName)}</td><td>${formatDate(forecast.date)}</td>
      <td>${number(forecast.predicted)} meals</td><td>${forecast.actual === null ? '<span class="table-muted">Not entered</span>' : `${number(forecast.actual)} meals`}</td>
      <td>${error === null ? "—" : `${number(error)} meals`}</td><td>${accuracy}</td></tr>`;
  }).join("") : emptyRow(6, "Your comparison reports will appear here after you create a forecast.");
}

function populateSelects() {
  const menuOptions = state.data.menu.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("");
  ["salesItem", "forecastItem"].forEach((id) => {
    const select = document.getElementById(id);
    const current = select.value;
    select.innerHTML = menuOptions || '<option value="">Add a menu item first</option>';
    if (state.data.menu.some((item) => String(item.id) === current)) select.value = current;
    select.disabled = state.data.menu.length === 0;
  });
  const pending = state.data.forecasts.filter((forecast) => forecast.actual === null)
    .sort((first, second) => first.date.localeCompare(second.date));
  const actualSelect = document.getElementById("actualForecast");
  const currentForecast = actualSelect.value;
  actualSelect.innerHTML = pending.length ? pending.map((forecast) => {
    const future = forecast.date > state.data.today;
    return `<option value="${forecast.itemId}|${forecast.date}" ${future ? "disabled" : ""}>${escapeHtml(forecast.itemName)} · ${formatDate(forecast.date)} · ${number(forecast.predicted)} predicted${future ? " (future)" : ""}</option>`;
  }).join("") : '<option value="">No forecasts are waiting for actuals</option>';
  if (pending.some((forecast) => `${forecast.itemId}|${forecast.date}` === currentForecast)) {
    actualSelect.value = currentForecast;
  }
  actualSelect.disabled = pending.every((forecast) => forecast.date > state.data.today);
}

function renderForecastResult(item, date, average, predicted, recordCount, eventDay) {
  const scale = Math.max(predicted, average, 1);
  document.getElementById("forecastResult").innerHTML = `
    <div class="result-content">
      <div class="result-kicker">YOUR MEAL PLAN</div>
      <div class="result-food">${escapeHtml(item.name)}</div>
      <div class="result-date">${formatDate(date)}${eventDay ? " · College event" : ""}</div>
      <div class="result-number"><strong>${number(predicted)}</strong><span>meals predicted</span></div>
      <div class="result-bar"><span style="width:${Math.min(100, Math.max(9, predicted / scale * 100))}%"></span></div>
      <div class="result-meta"><span>Baseline average: <strong>${average.toFixed(1)}</strong></span><span>Records used: <strong>${recordCount}</strong></span></div>
      ${eventDay ? '<div class="result-event">✳ Includes an illustrative +10% event uplift</div>' : "" }
    </div>`;
}

function eventPreview(collegeEvent) {
  return `<div class="event-preview">${dateTile(collegeEvent.date)}<div class="event-preview-copy"><strong>${escapeHtml(collegeEvent.name)}</strong><small>${formatDate(collegeEvent.date)}${collegeEvent.details ? ` · ${escapeHtml(collegeEvent.details)}` : ""}</small></div></div>`;
}

function dateTile(date) {
  const parsed = new Date(`${date}T00:00:00`);
  return `<div class="date-tile"><strong>${parsed.getDate()}</strong><small>${escapeHtml(parsed.toLocaleDateString(undefined, { month: "short" }))}</small></div>`;
}

function itemById(id) {
  return state.data.menu.find((item) => item.id === id);
}

function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function shortDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dateOffset(date, offset) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function setDefaultDates() {
  if (!state.data) return;
  document.getElementById("salesDate").value = state.data.today;
  document.getElementById("forecastDate").value = dateOffset(state.data.today, 1);
  document.getElementById("eventDate").value = dateOffset(state.data.today, 1);
}

function emptyRow(columns, message) {
  return `<tr><td class="table-muted" colspan="${columns}">${message}</td></tr>`;
}

function number(value) {
  return new Intl.NumberFormat().format(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function showPage(page) {
  if (!pageNames[page]) return;
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active", section.id === `page-${page}`);
  });
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  document.getElementById("breadcrumb").textContent = pageNames[page];
  document.getElementById("sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

setDefaultDates();
refresh();
