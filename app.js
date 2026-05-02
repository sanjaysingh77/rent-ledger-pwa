const storageKey = "rent-ledger-pwa-v1";
const today = new Date();
const currentMonth = monthKey(today);

const starterProperties = Array.from({ length: 7 }, (_, index) => ({
  id: createId(),
  name: `Property ${index + 1}`,
  tenant: `Tenant ${index + 1}`,
  rent: 0,
  dueDay: 1,
  reminderEvery: 2,
  method: "",
  notes: ""
}));

let state = loadState();
let activeMonth = state.activeMonth || currentMonth;
let deferredInstallPrompt = null;

const els = {
  monthCaption: document.querySelector("#monthCaption"),
  monthLabel: document.querySelector("#monthLabel"),
  expectedTotal: document.querySelector("#expectedTotal"),
  collectedTotal: document.querySelector("#collectedTotal"),
  remainingTotal: document.querySelector("#remainingTotal"),
  paidTotal: document.querySelector("#paidTotal"),
  reminderPanel: document.querySelector("#reminderPanel"),
  reminderTitle: document.querySelector("#reminderTitle"),
  reminderText: document.querySelector("#reminderText"),
  enableNotifications: document.querySelector("#enableNotifications"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  propertyList: document.querySelector("#propertyList"),
  restorePanel: document.querySelector("#restorePanel"),
  restoreInput: document.querySelector("#restoreInput"),
  restoreFile: document.querySelector("#restoreFile"),
  propertyDialog: document.querySelector("#propertyDialog"),
  propertyForm: document.querySelector("#propertyForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  deleteProperty: document.querySelector("#deleteProperty"),
  installButton: document.querySelector("#installButton"),
  toast: document.querySelector("#toast")
};

document.querySelector("#prevMonth").addEventListener("click", () => changeMonth(-1));
document.querySelector("#nextMonth").addEventListener("click", () => changeMonth(1));
document.querySelector("#addProperty").addEventListener("click", () => openDialog());
document.querySelector("#copyUnpaid").addEventListener("click", copyUnpaid);
document.querySelector("#exportBackup").addEventListener("click", exportBackup);
document.querySelector("#restoreToggle").addEventListener("click", toggleRestore);
document.querySelector("#cancelRestore").addEventListener("click", toggleRestore);
document.querySelector("#restoreBackup").addEventListener("click", restoreBackup);
els.restoreFile.addEventListener("change", loadRestoreFile);
document.querySelector("#closeDialog").addEventListener("click", closeDialog);
document.querySelector("#cancelDialog").addEventListener("click", closeDialog);
els.deleteProperty.addEventListener("click", deleteProperty);
els.enableNotifications.addEventListener("click", enableNotifications);
els.searchInput.addEventListener("input", render);
els.statusFilter.addEventListener("change", render);
els.propertyForm.addEventListener("submit", saveProperty);
els.installButton.addEventListener("click", installApp);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  els.installButton.hidden = false;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js?v=8");
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) {
    return { activeMonth: currentMonth, properties: starterProperties, payments: {}, notificationLog: {} };
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      activeMonth: parsed.activeMonth || currentMonth,
      properties: Array.isArray(parsed.properties) ? parsed.properties : starterProperties,
      payments: parsed.payments && typeof parsed.payments === "object" ? parsed.payments : {},
      notificationLog: parsed.notificationLog && typeof parsed.notificationLog === "object" ? parsed.notificationLog : {}
    };
  } catch {
    return { activeMonth: currentMonth, properties: starterProperties, payments: {}, notificationLog: {} };
  }
}

function saveState() {
  state.activeMonth = activeMonth;
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthDate(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function formatMonth(key) {
  return monthDate(key).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function changeMonth(offset) {
  const date = monthDate(activeMonth);
  date.setMonth(date.getMonth() + offset);
  activeMonth = monthKey(date);
  saveState();
  render();
}

function money(value) {
  return Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });
}

function paymentFor(propertyId) {
  const monthPayments = state.payments[activeMonth];
  return monthPayments && monthPayments[propertyId] ? monthPayments[propertyId] : {
    status: "due",
    paidDate: "",
    amountPaid: 0
  };
}

function setPayment(propertyId, payment) {
  state.payments[activeMonth] = state.payments[activeMonth] || {};
  state.payments[activeMonth][propertyId] = Object.assign({}, paymentFor(propertyId), payment);
  saveState();
}

function dueDateFor(property) {
  const date = monthDate(activeMonth);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(Number(property.dueDay || 1), lastDay));
  return date;
}

function dayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(start, end) {
  return Math.floor((dayStart(end) - dayStart(start)) / 86400000);
}

function statusFor(property) {
  const payment = paymentFor(property.id);
  if (payment.status === "paid") return "paid";

  const dueDate = dueDateFor(property);
  if (monthDate(activeMonth) <= monthDate(currentMonth) && dueDate < dayStart(today)) return "late";
  return "due";
}

function shouldRemind(property) {
  if (statusFor(property) === "paid") return false;
  if (activeMonth !== currentMonth) return false;

  const daysLate = daysBetween(dueDateFor(property), today);
  if (daysLate < 0) return false;
  const interval = Math.max(Number(property.reminderEvery || 2), 1);
  return daysLate % interval === 0;
}

function nextReminderText(property) {
  if (statusFor(property) === "paid") return "Paid";
  const dueDate = dueDateFor(property);
  const daysLate = daysBetween(dueDate, today);
  const interval = Math.max(Number(property.reminderEvery || 2), 1);

  if (daysLate < 0) {
    return `First reminder ${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }

  if (daysLate % interval === 0) return "Reminder due today";

  const nextDays = interval - (daysLate % interval);
  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + nextDays);
  return `Next reminder ${nextDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function filteredProperties() {
  const search = els.searchInput.value.trim().toLowerCase();
  const filter = els.statusFilter.value;

  return state.properties
    .filter((property) => {
      const status = statusFor(property);
      const text = [property.name, property.tenant, property.method, property.notes].join(" ").toLowerCase();
      const matchesSearch = !search || text.includes(search);
      const matchesFilter = filter === "all" || (filter === "unpaid" ? status !== "paid" : status === filter);
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      const statusSort = statusFor(a).localeCompare(statusFor(b));
      return statusSort || dueDateFor(a) - dueDateFor(b) || a.name.localeCompare(b.name);
    });
}

function render() {
  els.monthLabel.textContent = formatMonth(activeMonth);
  els.monthCaption.textContent = `${state.properties.length} properties tracked for ${formatMonth(activeMonth)}`;

  const paid = state.properties.filter((property) => statusFor(property) === "paid");
  const expected = state.properties.reduce((sum, property) => sum + Number(property.rent || 0), 0);
  const collected = paid.reduce((sum, property) => {
    const payment = paymentFor(property.id);
    return sum + Number(payment.amountPaid || property.rent || 0);
  }, 0);

  els.expectedTotal.textContent = money(expected);
  els.collectedTotal.textContent = money(collected);
  els.remainingTotal.textContent = money(Math.max(expected - collected, 0));
  els.paidTotal.textContent = `${paid.length}/${state.properties.length}`;

  renderReminderPanel();
  renderProperties();
  maybeNotify();
}

function renderReminderPanel() {
  const dueReminders = state.properties.filter(shouldRemind);
  const unpaid = state.properties.filter((property) => statusFor(property) !== "paid");
  els.reminderPanel.hidden = unpaid.length === 0;

  if (!unpaid.length) return;

  els.reminderTitle.textContent = dueReminders.length
    ? `${dueReminders.length} reminder${dueReminders.length === 1 ? "" : "s"} due today`
    : `${unpaid.length} unpaid propert${unpaid.length === 1 ? "y" : "ies"}`;
  els.reminderText.textContent = dueReminders.length
    ? dueReminders.map((property) => `${property.name} (${property.tenant})`).join(", ")
    : "No reminder is due today, but unpaid rent remains on the board.";

  if (!("Notification" in window) || Notification.permission === "granted") {
    els.enableNotifications.hidden = true;
  } else {
    els.enableNotifications.hidden = false;
  }
}

function renderProperties() {
  const properties = filteredProperties();
  els.propertyList.innerHTML = "";

  if (!properties.length) {
    els.propertyList.innerHTML = '<div class="empty">No properties match this view.</div>';
    return;
  }

  properties.forEach((property) => {
    const payment = paymentFor(property.id);
    const status = statusFor(property);
    const dueDate = dueDateFor(property);
    const card = document.createElement("article");
    card.className = `property-card ${status}`;
    card.innerHTML = `
      <div class="card-top">
        <div>
          <div class="property-name"></div>
          <p class="tenant-line"></p>
          <p class="meta-line"></p>
        </div>
        <span class="badge ${status}">${statusLabel(status)}</span>
      </div>
      <div class="card-money">
        <div class="money-box"><span>Rent</span><strong>${money(property.rent)}</strong></div>
        <div class="money-box"><span>Due</span><strong>${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</strong></div>
        <div class="money-box"><span>Reminder</span><strong></strong></div>
      </div>
      <p class="note-line"></p>
      <div class="card-actions">
        <button class="secondary-button edit-button" type="button">Edit</button>
        <button class="${status === "paid" ? "secondary-button" : "primary-button"} pay-button" type="button">${status === "paid" ? "Mark Due" : "Confirm Paid"}</button>
      </div>
    `;

    card.querySelector(".property-name").textContent = property.name;
    card.querySelector(".tenant-line").textContent = property.tenant;
    card.querySelector(".meta-line").textContent = `${property.method || "No payment method"}${payment.paidDate ? ` - Paid ${payment.paidDate}` : ""}`;
    card.querySelector(".money-box:last-child strong").textContent = nextReminderText(property);
    card.querySelector(".note-line").textContent = property.notes || "No notes";
    card.querySelector(".edit-button").addEventListener("click", () => openDialog(property.id));
    card.querySelector(".pay-button").addEventListener("click", () => togglePaid(property.id));
    els.propertyList.appendChild(card);
  });
}

function statusLabel(status) {
  if (status === "paid") return "Paid";
  if (status === "late") return "Late";
  return "Due";
}

function togglePaid(propertyId) {
  const property = state.properties.find((item) => item.id === propertyId);
  const payment = paymentFor(propertyId);

  if (payment.status === "paid") {
    setPayment(propertyId, { status: "due", paidDate: "", amountPaid: 0 });
    showToast(`${property.name} marked due.`);
  } else {
    setPayment(propertyId, {
      status: "paid",
      paidDate: new Date().toISOString().slice(0, 10),
      amountPaid: Number(property.rent || 0)
    });
    showToast(`${property.name} confirmed paid.`);
  }

  render();
}

function openDialog(propertyId = "") {
  const property = state.properties.find((item) => item.id === propertyId);
  els.dialogTitle.textContent = property ? "Edit Property" : "Add Property";
  document.querySelector("#propertyId").value = property ? property.id : "";
  document.querySelector("#propertyName").value = property ? property.name : "";
  document.querySelector("#tenantName").value = property ? property.tenant : "";
  document.querySelector("#rentAmount").value = property ? property.rent : "";
  document.querySelector("#dueDay").value = property ? property.dueDay : 1;
  document.querySelector("#reminderEvery").value = property ? property.reminderEvery : 2;
  document.querySelector("#paymentMethod").value = property ? property.method : "";
  document.querySelector("#propertyNotes").value = property ? property.notes : "";
  els.deleteProperty.style.display = property ? "inline-flex" : "none";
  openModal(els.propertyDialog);
  document.querySelector("#propertyName").focus();
}

function closeDialog() {
  closeModal(els.propertyDialog);
  els.propertyForm.reset();
}

function openModal(dialog) {
  dialog.hidden = false;
  dialog.classList.add("is-open");
  document.body.classList.add("fallback-modal-open");
}

function closeModal(dialog) {
  dialog.hidden = true;
  dialog.classList.remove("is-open");
  document.body.classList.remove("fallback-modal-open");
}

function saveProperty(event) {
  event.preventDefault();
  const id = document.querySelector("#propertyId").value || createId();
  const property = {
    id,
    name: document.querySelector("#propertyName").value.trim(),
    tenant: document.querySelector("#tenantName").value.trim(),
    rent: Number(document.querySelector("#rentAmount").value || 0),
    dueDay: Number(document.querySelector("#dueDay").value || 1),
    reminderEvery: Number(document.querySelector("#reminderEvery").value || 2),
    method: document.querySelector("#paymentMethod").value.trim(),
    notes: document.querySelector("#propertyNotes").value.trim()
  };

  const existingIndex = state.properties.findIndex((item) => item.id === id);
  if (existingIndex >= 0) {
    state.properties[existingIndex] = property;
  } else {
    state.properties.push(property);
  }

  saveState();
  closeDialog();
  render();
  showToast("Property saved.");
}

function deleteProperty() {
  const id = document.querySelector("#propertyId").value;
  const property = state.properties.find((item) => item.id === id);
  if (!property) return;
  if (!confirm(`Delete ${property.name}? This removes it from every month.`)) return;

  state.properties = state.properties.filter((item) => item.id !== id);
  Object.keys(state.payments).forEach((monthKey) => delete state.payments[monthKey][id]);
  saveState();
  closeDialog();
  render();
  showToast("Property deleted.");
}

function copyUnpaid() {
  const unpaid = state.properties.filter((property) => statusFor(property) !== "paid");
  if (!unpaid.length) {
    showToast("All properties are paid.");
    return;
  }

  const lines = unpaid.map((property) => `${property.name} - ${property.tenant} - ${money(property.rent)} - due ${property.dueDay}`);
  const text = `Unpaid rent for ${formatMonth(activeMonth)}:\n${lines.join("\n")}`;
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    showToast("Copy is not available in this browser.");
    return;
  }

  navigator.clipboard.writeText(text).then(
    () => showToast("Unpaid list copied."),
    () => showToast("Copy is not available in this browser.")
  );
}

function exportBackup() {
  const backup = JSON.stringify(state, null, 2);
  downloadFile(`rent-ledger-backup-${activeMonth}.json`, backup, "application/json");

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(backup).then(
      () => showToast("Backup downloaded and copied."),
      () => showToast("Backup downloaded.")
    );
  } else {
    els.restoreInput.value = backup;
    els.restorePanel.hidden = false;
    showToast("Backup text is ready below.");
  }
}

function toggleRestore() {
  els.restorePanel.hidden = !els.restorePanel.hidden;
}

function loadRestoreFile() {
  const file = els.restoreFile.files && els.restoreFile.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    els.restoreInput.value = String(reader.result || "");
    showToast("Backup file loaded.");
  });
  reader.addEventListener("error", () => showToast("Backup file could not be read."));
  reader.readAsText(file);
}

function restoreBackup() {
  try {
    const restored = JSON.parse(els.restoreInput.value);
    if (!Array.isArray(restored.properties) || !restored.payments) throw new Error("Invalid backup");
    state = {
      activeMonth: restored.activeMonth || currentMonth,
      properties: restored.properties,
      payments: restored.payments,
      notificationLog: restored.notificationLog || {}
    };
    activeMonth = state.activeMonth;
    saveState();
    els.restoreInput.value = "";
    els.restoreFile.value = "";
    els.restorePanel.hidden = true;
    render();
    showToast("Backup restored.");
  } catch {
    showToast("That backup could not be restored.");
  }
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function enableNotifications() {
  if (!("Notification" in window)) {
    showToast("Notifications are not available in this browser.");
    return;
  }

  Notification.requestPermission().then((permission) => {
    if (permission === "granted") {
      showToast("Reminders enabled.");
      maybeNotify(true);
    } else {
      showToast("Notifications were not enabled.");
    }
    renderReminderPanel();
  });
}

function maybeNotify(force = false) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const dueReminders = state.properties.filter(shouldRemind);
  if (!dueReminders.length) return;

  const todayKey = new Date().toISOString().slice(0, 10);
  const logKey = `${activeMonth}:${todayKey}`;
  if (!force && state.notificationLog[logKey]) return;

  state.notificationLog[logKey] = true;
  saveState();
  const title = `${dueReminders.length} rent reminder${dueReminders.length === 1 ? "" : "s"}`;
  const body = dueReminders.map((property) => `${property.name}: ${property.tenant}`).join(", ");

  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "notify", title, body });
  } else {
    new Notification(title, { body });
  }
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(() => {
    deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

render();
