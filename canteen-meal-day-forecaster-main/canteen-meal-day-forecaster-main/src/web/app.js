const state = { data: null, toastTimer: null, initialized: false, chartItemId: null };
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
document.getElementById("chartItemSelect").addEventListener("change", (event) => {
  state.chartItemId = event.currentTarget.value === "all" ? "all" : Number(event.currentTarget.value);
  renderForecastChart(state.data.forecasts);
});
document.getElementById("actualForecast").addEventListener("change", syncActualQuantity);

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
  if (!formElement.reportValidity()) return;
  const forecastValue = formElement.elements.forecast.value;
  const forecast = state.data.forecasts.find((saved) =>
    `${saved.itemId}|${saved.date}` === forecastValue);
  if (!forecast || forecast.date > state.data.today) {
    showToast("Choose a forecast that is ready for actual-sales entry.", true);
    return;
  }
  const [itemId, date] = forecastValue.split("|");
  const form = new URLSearchParams({
    itemId,
    date,
    quantity: formElement.elements.quantity.value
  });
  try {
    await request("/api/actual", { method: "POST", body: form });
    if (state.chartItemId !== "all") state.chartItemId = forecast.itemId;
    const updatedExistingActual = actualForForecast(forecast) !== null;
    formElement.reset();
    if (!await refresh()) return;
    showToast(updatedExistingActual
      ? "Actual sales updated. Your report is up to date."
      : "Actual sales saved. Your report is up to date.");
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
    return true;
  } catch (error) {
    showToast(`Could not load the canteen data: ${error.message}`, true);
    return false;
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
  updateGreeting();
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
      <div class="event-copy"><strong>${escapeHtml(collegeEvent.name)}</strong><small>${escapeHtml(collegeEvent.type || "Other")} · ${escapeHtml(collegeEvent.details || "No notes")}</small></div>
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

function actualForForecast(forecast) {
  if (forecast.actual !== null) return forecast.actual;
  if (forecast.date > state.data.today) return null;
  const sale = state.data.sales.find((record) =>
    record.itemId === forecast.itemId && record.date === forecast.date);
  return sale ? sale.quantity : null;
}

function renderForecasts() {
  const forecasts = state.data.forecasts.slice().sort((first, second) => second.date.localeCompare(first.date));
  document.getElementById("forecastsPill").textContent = `${forecasts.length} forecast${forecasts.length === 1 ? "" : "s"}`;
  document.getElementById("forecastsTable").innerHTML = forecasts.length ? forecasts.map((forecast) => {
    const actual = actualForForecast(forecast);
    return `<tr><td>${escapeHtml(forecast.itemName)}</td><td>${formatDate(forecast.date)}</td>
      <td>${number(Math.round(forecast.baseline))} meals</td><td><strong>${number(forecast.predicted)}</strong></td>
      <td><span class="tag${forecast.specialEvent ? " event-tag" : ""}">${forecast.specialEvent ? "Yes" : "No"}</span></td>
      <td><span class="tag ${actual === null ? "pending-tag" : "done-tag"}">${actual === null ? "Pending actual" : "Evaluated"}</span></td></tr>`;
  }).join("")
    : emptyRow(6, "No forecasts saved yet. Create your first forecast above.");
}

function renderReports() {
  const forecasts = state.data.forecasts.slice().sort((first, second) => second.date.localeCompare(first.date));
  populateChartItems(forecasts);
  renderForecastChart(forecasts);
  const eventsByDate = new Map();
  state.data.events.forEach((collegeEvent) => {
    if (!eventsByDate.has(collegeEvent.date)) eventsByDate.set(collegeEvent.date, []);
    eventsByDate.get(collegeEvent.date).push(collegeEvent);
  });
  const evaluated = forecasts.map((forecast) => ({ forecast, actual: actualForForecast(forecast) }))
    .filter((entry) => entry.actual !== null);
  const pending = forecasts.length - evaluated.length;
  const errors = evaluated.map(({ forecast, actual }) => Math.abs(actual - forecast.predicted));
  const accuracyValues = evaluated.filter(({ actual }) => actual !== 0)
    .map(({ forecast, actual }) => Math.max(0, 100 - Math.abs(actual - forecast.predicted) / actual * 100));
  document.getElementById("evaluatedCount").textContent = evaluated.length;
  document.getElementById("averageError").textContent = errors.length
    ? `${(errors.reduce((sum, value) => sum + value, 0) / errors.length).toFixed(1)}`
    : "—";
  document.getElementById("averageAccuracy").textContent = accuracyValues.length
    ? `${(accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length).toFixed(0)}%`
    : "—";
  document.getElementById("pendingCount").textContent = pending;
  document.getElementById("reportsPill").textContent = `${forecasts.length} report${forecasts.length === 1 ? "" : "s"}`;
  document.getElementById("reportsTable").innerHTML = forecasts.length ? forecasts.map((forecast) => {
    const actual = actualForForecast(forecast);
    const deviation = actual === null ? null : actual - forecast.predicted;
    const error = deviation === null ? null : Math.abs(deviation);
    const accuracy = actual === null ? "Pending"
      : actual === 0 ? "N/A"
        : `${Math.max(0, 100 - error / actual * 100).toFixed(1)}%`;
    const deviationDisplay = deviation === null ? "—"
      : forecast.specialEvent ? `${deviation > 0 ? "+" : ""}${number(deviation)} plates`
        : deviation === 0 ? "0 plates (on target)"
        : `${deviation > 0 ? "+" : ""}${number(deviation)} plates (${deviation < 0 ? "over-forecast" : "under-forecast"})`;
    const associatedEvents = forecast.specialEvent ? eventsByDate.get(forecast.date) || [] : [];
    const eventCell = forecast.specialEvent
      ? associatedEvents.length
        ? associatedEvents.map((associatedEvent) => `<span class="event-report-tag">${escapeHtml(associatedEvent.name)}<small>${escapeHtml(associatedEvent.type || "Other")}</small></span>`).join("")
        : '<span class="event-report-tag">Event details unavailable<small>Event day</small></span>'
      : '<span class="table-muted">—</span>';
    const alert = deviation === null ? '<span class="table-muted">Awaiting actual sales</span>'
      : forecast.specialEvent
        ? '<span class="event-review-tag">Event day — review required</span>'
        : error > 10
        ? `<span class="deviation-alert" role="status">⚠ ${deviation < 0 ? "Over-forecast" : "Under-forecast"} by ${number(error)} plates</span>`
        : '<span class="deviation-within">Within 10 plates</span>';
    return `<tr><td>${escapeHtml(forecast.itemName)}</td><td>${formatDate(forecast.date)}</td>
      <td>${number(forecast.predicted)} meals</td><td>${actual === null ? '<span class="table-muted">Not entered</span>' : `${number(actual)} meals`}</td>
      <td>${deviationDisplay}</td><td>${error === null ? "—" : `${number(error)} plates`}</td><td>${eventCell}</td><td>${alert}</td><td>${accuracy}</td></tr>`;
  }).join("") : emptyRow(9, "Your comparison reports will appear here after you create a forecast.");
}

function populateChartItems(forecasts) {
  const chartItemSelect = document.getElementById("chartItemSelect");
  const items = Array.from(new Map(forecasts.map((forecast) =>
    [forecast.itemId, forecast.itemName])).entries());
  const selectedItemExists = items.some(([itemId]) => itemId === state.chartItemId);
  if (state.chartItemId !== "all" && !selectedItemExists) {
    state.chartItemId = "all";
  }
  chartItemSelect.innerHTML = `<option value="all">All menu items</option>${items.map(([itemId, itemName]) =>
    `<option value="${itemId}">${escapeHtml(itemName)}</option>`).join("")}`;
  chartItemSelect.value = String(state.chartItemId);
  chartItemSelect.disabled = items.length < 2;
  chartItemSelect.hidden = items.length === 0;
  chartItemSelect.previousElementSibling.hidden = items.length === 0;
}

function renderForecastChart(forecasts) {
  const chart = document.getElementById("forecastChart");
  const allItems = state.chartItemId === "all";
  const selectedForecasts = allItems
    ? forecasts
    : forecasts.filter((forecast) => forecast.itemId === state.chartItemId);
  const selectedSales = state.data.sales.filter((sale) =>
    (allItems || sale.itemId === state.chartItemId) && sale.date <= state.data.today);
  const chartSummary = document.getElementById("chartSummary");
  const forecastsByDate = new Map();
  selectedForecasts.forEach((forecast) => {
    const point = forecastsByDate.get(forecast.date) || { predicted: 0, forecasts: [] };
    point.predicted += forecast.predicted;
    point.forecasts.push(forecast);
    forecastsByDate.set(forecast.date, point);
  });
  const salesByDate = new Map();
  selectedSales.forEach((sale) => {
    const point = salesByDate.get(sale.date) || { actual: 0, itemIds: new Set() };
    point.actual += sale.quantity;
    point.itemIds.add(sale.itemId);
    salesByDate.set(sale.date, point);
  });
  selectedForecasts.forEach((forecast) => {
    if (forecast.date > state.data.today || forecast.actual === null) return;
    const point = salesByDate.get(forecast.date) || { actual: 0, itemIds: new Set() };
    if (!point.itemIds.has(forecast.itemId)) {
      point.actual += forecast.actual;
      point.itemIds.add(forecast.itemId);
    }
    salesByDate.set(forecast.date, point);
  });
  const chartDates = new Set([...forecastsByDate.keys(), ...salesByDate.keys()]);
  const eventsByDate = new Map();
  state.data.events.forEach((collegeEvent) => {
    if (!eventsByDate.has(collegeEvent.date)) eventsByDate.set(collegeEvent.date, []);
    eventsByDate.get(collegeEvent.date).push(collegeEvent);
  });
  const itemName = allItems ? "All menu items"
    : selectedForecasts[0]?.itemName
      || state.data.menu.find((item) => item.id === state.chartItemId)?.name
      || "Selected menu item";
  const points = Array.from(chartDates, (date) => {
    const forecast = forecastsByDate.get(date) || null;
    const sale = salesByDate.get(date) || null;
    return {
      date,
      predicted: forecast ? forecast.predicted : null,
      actual: sale ? sale.actual : null,
      eventDay: selectedForecasts.some((saved) => saved.date === date && saved.specialEvent)
        || selectedSales.some((saved) => saved.date === date && saved.specialEvent),
      events: eventsByDate.get(date) || []
    };
  }).sort((first, second) => first.date.localeCompare(second.date));

  if (!points.length) {
    chartSummary.textContent = "";
    chart.innerHTML = '<div class="chart-empty">Saved forecasts will appear here.</div>';
    return;
  }

  const actualCount = points.filter((point) => point.actual !== null).length;
  chartSummary.textContent = actualCount < 2
    ? `${selectedForecasts.length} saved forecast${selectedForecasts.length === 1 ? "" : "s"} · ${actualCount} actual sales day${actualCount === 1 ? "" : "s"} recorded.`
    : `${selectedForecasts.length} saved forecasts · ${actualCount} actual sales days.`;

  const width = 540;
  const height = 310;
  const margin = { top: 42, right: 24, bottom: 58, left: 60 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxMeals = Math.max(...points.flatMap((point) =>
    [point.predicted, point.actual].filter((value) => value !== null)), 1);
  const roughStep = maxMeals / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const step = Math.max(1, (normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10) * magnitude);
  const yMax = Math.max(step, Math.ceil(maxMeals * 1.1 / step) * step);
  const firstDate = new Date(`${points[0].date}T00:00:00`).getTime();
  const lastDate = new Date(`${points[points.length - 1].date}T00:00:00`).getTime();
  const x = (index) => margin.left + (firstDate === lastDate
    ? plotWidth / 2
    : (new Date(`${points[index].date}T00:00:00`).getTime() - firstDate) / (lastDate - firstDate) * plotWidth);
  const y = (value) => margin.top + plotHeight - value / yMax * plotHeight;
  const formatTooltipDate = (date) => new Date(`${date}T00:00:00`)
    .toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const formatTickDate = (date) => {
    const parsed = new Date(`${date}T00:00:00`);
    return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
  };
  const labelCount = Math.min(points.length, 4);
  const visibleDateIndexes = new Set(Array.from({ length: labelCount }, (_, index) =>
    Math.round(index * (points.length - 1) / Math.max(1, labelCount - 1))));
  const linePath = (key) => {
    const segments = [];
    let segment = [];
    points.forEach((point, index) => {
      if (point[key] === null) {
        if (segment.length) segments.push(segment);
        segment = [];
      } else {
        segment.push({ value: point[key], index });
      }
    });
    if (segment.length) segments.push(segment);
    return segments.map((items) => items.map((point, index) =>
      `${index === 0 ? "M" : "L"} ${x(point.index)} ${y(point.value)}`).join(" ")).join(" ");
  };
  const predictedPath = linePath("predicted");
  const actualPaths = linePath("actual");
  const eventMarkers = points.map((point, index) => {
    if (!point.eventDay) return "";
    const adjacentDistances = [index > 0 ? x(index) - x(index - 1) : Infinity,
      index < points.length - 1 ? x(index + 1) - x(index) : Infinity];
    const bandWidth = points.length === 1 ? 18 : Math.min(24, Math.min(...adjacentDistances) * 0.72);
    const label = !point.events.length ? "Event day"
      : point.events.length > 1
      ? `${point.events.length} events`
      : `${point.events[0].type || "Other"} · ${point.events[0].name}`;
    const eventLabel = label.length > 22 ? `${label.slice(0, 19)}…` : label;
    const eventDescription = point.events.length
      ? point.events.map((collegeEvent) => `${collegeEvent.name} (${collegeEvent.type || "Other"})`).join("; ")
      : "Event details unavailable";
    return `<g class="chart-event-marker" aria-label="${escapeHtml(eventDescription)}">
      <title>${escapeHtml(eventDescription)}</title>
      <rect class="chart-event-band" x="${x(index) - bandWidth / 2}" y="${margin.top}" width="${bandWidth}" height="${plotHeight}"></rect>
      <line class="chart-event-line" x1="${x(index)}" y1="${margin.top}" x2="${x(index)}" y2="${margin.top + plotHeight}"></line>
      <text class="chart-event-label" x="${x(index)}" y="13" text-anchor="${index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}">${escapeHtml(eventLabel)}</text>
    </g>`;
  }).join("");
  const grid = Array.from({ length: Math.round(yMax / step) + 1 }, (_, index) => {
    const value = index * step;
    const position = y(value);
    return `<g class="chart-gridline"><line x1="${margin.left}" y1="${position}" x2="${width - margin.right}" y2="${position}"></line><text x="${margin.left - 8}" y="${position + 3}" text-anchor="end">${number(value)}</text></g>`;
  }).join("");
  const dates = points.map((point, index) => visibleDateIndexes.has(index)
    ? `<text class="chart-date" x="${x(index)}" y="${height - 31}" text-anchor="${index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}">${escapeHtml(formatTickDate(point.date))}</text>`
    : "").join("");
  const tooltipFor = (point) => [
    formatTooltipDate(point.date),
    `${itemName}: Predicted ${point.predicted === null ? "no saved forecast" : `${number(point.predicted)} meals`} · Actual ${point.actual === null ? "no saved actual" : `${number(point.actual)} meals`}`,
    point.eventDay ? `Event: ${point.events.length ? point.events.map((collegeEvent) => `${collegeEvent.name} (${collegeEvent.type || "Other"})`).join("; ") : "details unavailable"}` : ""
  ].filter(Boolean).join("\n");
  const predictedMarkers = points.map((point, index) => point.predicted === null ? "" : `
    <circle class="chart-marker predicted-marker" cx="${x(index)}" cy="${y(point.predicted)}" r="4.5" tabindex="0" aria-label="${escapeHtml(formatTooltipDate(point.date))}: ${number(point.predicted)} meals predicted">
      <title>${escapeHtml(tooltipFor(point))}</title>
    </circle>`).join("");
  const actualMarkers = points.map((point, index) => point.actual === null ? "" : `
    <circle class="chart-marker actual-marker" cx="${x(index)}" cy="${y(point.actual)}" r="5.5" tabindex="0" aria-label="${escapeHtml(formatTooltipDate(point.date))}: ${number(point.actual)} meals actual">
      <title>${escapeHtml(tooltipFor(point))}</title>
    </circle>`).join("");
  const predictedHalo = predictedPath
    ? `<path class="chart-line predicted-line-halo" d="${predictedPath}" aria-hidden="true"></path>`
    : "";

  chart.innerHTML = `<svg class="forecast-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(itemName)} predicted and actual meals by forecast date">
    ${grid}
    ${eventMarkers}
    <path class="chart-line actual-line" d="${actualPaths}"></path>
    ${predictedHalo}
    <path class="chart-line predicted-line" d="${predictedPath}"></path>
    ${actualMarkers}${predictedMarkers}${dates}
    <text class="chart-axis-label" transform="translate(12 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">Meals</text>
    <text class="chart-axis-label" x="${margin.left + plotWidth / 2}" y="${height - 5}" text-anchor="middle">Forecast date</text>
  </svg>`;
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
  const ready = state.data.forecasts.filter((forecast) => forecast.date <= state.data.today)
    .sort((first, second) => first.date.localeCompare(second.date));
  const future = state.data.forecasts.filter((forecast) => forecast.actual === null
      && forecast.date > state.data.today)
    .sort((first, second) => first.date.localeCompare(second.date));
  const actualSelect = document.getElementById("actualForecast");
  const currentForecast = actualSelect.value;
  actualSelect.innerHTML = ready.length ? ready.map((forecast) =>
    `<option value="${forecast.itemId}|${forecast.date}">${escapeHtml(forecast.itemName)} · ${formatDate(forecast.date)} · ${number(forecast.predicted)} predicted${actualForForecast(forecast) === null ? "" : ` · recorded ${number(actualForForecast(forecast))} actual`}</option>`
  ).join("") : "";
  if (ready.some((forecast) => `${forecast.itemId}|${forecast.date}` === currentForecast)) {
    actualSelect.value = currentForecast;
  } else if (ready.length) {
    actualSelect.value = `${ready[0].itemId}|${ready[0].date}`;
  } else {
    actualSelect.value = "";
  }
  actualSelect.disabled = ready.length === 0;
  document.getElementById("actualQuantity").disabled = ready.length === 0;
  document.querySelector('#actualForm button[type="submit"]').disabled = ready.length === 0;
  syncActualQuantity();
  document.getElementById("actualForecastHint").textContent = ready.length
    ? "Choose a forecast to record or update its actual sales."
    : future.length
      ? `Forecasts are not ready yet. Actual sales can be entered starting ${formatDate(future[0].date)}.`
      : "No forecasts are waiting for actual sales. Create a forecast first.";
}

function syncActualQuantity() {
  const forecastValue = document.getElementById("actualForecast").value;
  const forecast = state.data.forecasts.find((saved) =>
    `${saved.itemId}|${saved.date}` === forecastValue);
  const actual = forecast ? actualForForecast(forecast) : null;
  document.getElementById("actualQuantity").value = actual !== null
    ? actual
    : "";
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
  return `<div class="event-preview">${dateTile(collegeEvent.date)}<div class="event-preview-copy"><strong>${escapeHtml(collegeEvent.name)}</strong><small>${formatDate(collegeEvent.date)} · ${escapeHtml(collegeEvent.type || "Other")}${collegeEvent.details ? ` · ${escapeHtml(collegeEvent.details)}` : ""}</small></div></div>`;
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

function updateGreeting() {
  const hour = new Date().getHours();
  document.getElementById("dashboardGreeting").textContent = hour < 12
    ? "Good morning"
    : hour < 17 ? "Good afternoon" : "Good evening";
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
updateGreeting();
window.setInterval(updateGreeting, 60_000);
refresh();
