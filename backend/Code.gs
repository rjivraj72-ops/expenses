// Granola Kid Finance — Google Apps Script backend.
//
// The PIN is NOT stored in this file. In the Apps Script editor go to
// Project Settings → Script Properties and add:  APP_PIN = <your PIN>
// See backend/README.md for deploy steps.

const SS = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1YfY7Eqni5P_E5ILboDAw-BCPIPNTKhHThnIcvKrKrrQ/edit");
const GST_RATE = 0.05;

// Wrong-PIN protection: after MAX_PIN_FAILURES wrong PINs within LOCKOUT_SECONDS,
// every PIN attempt is refused until the window passes. Apps Script can't see who
// is calling, so the lockout applies to everyone (including you) — that's the
// trade-off for making guessing the PIN impractical.
const MAX_PIN_FAILURES = 10;
const LOCKOUT_SECONDS = 15 * 60;

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function moneyValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return isNaN(parsed) ? 0 : parsed;
}

function isPaid(value) {
  return String(value || "").trim().toLowerCase() === "yes";
}

function yearOf(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.getFullYear();
}

function roundedMoney(value) {
  return Math.round(moneyValue(value) * 100) / 100;
}

// The app sends gst > 0 when "GST charged" is picked and 0 for "No GST".
// The rate is always worked out here so the Sheet stays consistent.
// Older versions of the app don't send gst at all — they get 5% like before.
function expenseGst(p, amount) {
  const charged = p.gst === undefined || p.gst === null || p.gst === "" ? true : moneyValue(p.gst) > 0;
  return charged ? roundedMoney(amount * GST_RATE) : 0;
}

// ---------- PIN ----------

function checkPin(pin) {
  const expected = PropertiesService.getScriptProperties().getProperty("APP_PIN");
  if (!expected) return "pin_not_configured";

  const cache = CacheService.getScriptCache();
  const failures = parseInt(cache.get("pin_failures") || "0", 10);
  if (failures >= MAX_PIN_FAILURES) return "locked";

  if (String(pin || "") === expected) return "";

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const current = parseInt(cache.get("pin_failures") || "0", 10);
    cache.put("pin_failures", String(current + 1), LOCKOUT_SECONDS);
  } finally {
    lock.releaseLock();
  }
  return "invalid_pin";
}

// ---------- Reading ----------

function getFolder() {
  const folders = DriveApp.getFoldersByName("Granola Kid Receipts");
  return folders.hasNext() ? folders.next() : DriveApp.createFolder("Granola Kid Receipts");
}

function getIncomeRows() {
  const sheet = SS.getSheetByName("Income");
  const data = sheet.getDataRange().getValues();
  data.shift();
  return data.map((r, i) => ({
    row: i + 2,
    date: r[0],
    source: r[1],
    customer: r[2],
    amount: r[3],
    paid: r[4],
    receipt: r[5],
    fulfilled: r[6] || ""
  }));
}

function getExpenseRows() {
  const sheet = SS.getSheetByName("Expenses");
  const data = sheet.getDataRange().getValues();
  data.shift();
  return data.map((r, i) => ({
    row: i + 2,
    date: r[0],
    description: r[1],
    category: r[2],
    amount: r[3],
    gst: r[4],
    total: r[5],
    paid: r[6],
    receipt: r[7]
  }));
}

function getOrderRows() {
  const sheet = SS.getSheetByName("Orders");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  data.shift();
  return data.map((r, i) => ({
    row: i + 2,
    date: r[0],
    Naked: r[1],
    GoNuts: r[2],
    CocoYummy: r[3],
    CranCinnyBliss: r[4],
    DarkDreamy: r[5],
    BulkContainer: r[6]
  }));
}

function getFinanceSummary(incomeRows, expenseRows, capital) {
  const thisYear = new Date().getFullYear();

  const paidIncome = incomeRows.reduce((sum, row) => {
    return sum + (isPaid(row.paid) ? moneyValue(row.amount) : 0);
  }, 0);

  const paidExpenses = expenseRows.reduce((sum, row) => {
    if (!isPaid(row.paid)) return sum;
    const total = moneyValue(row.total);
    return sum + (total > 0 ? total : moneyValue(row.amount));
  }, 0);

  const gstPaidYtd = expenseRows.reduce((sum, row) => {
    if (!isPaid(row.paid)) return sum;
    if (yearOf(row.date) !== thisYear) return sum;
    return sum + moneyValue(row.gst);
  }, 0);

  return {
    cashBalance: roundedMoney(moneyValue(capital) + paidIncome - paidExpenses),
    gstPaidYtd: roundedMoney(gstPaidYtd)
  };
}

function buildPayload() {
  const settings = SS.getSheetByName("The Managers Office");
  const capital = settings.getRange("B1").getValue() || 0;
  const pricing = {
    dtcPrice: settings.getRange("B3").getValue() || 13.29,
    dtcCogs: settings.getRange("D3").getValue() || 5.50,
    wsPrice: settings.getRange("B4").getValue() || 9.30,
    wsCogs: settings.getRange("D4").getValue() || 5.42,
    bulkPrice: settings.getRange("B5").getValue() || 65.00,
    bulkCogs: settings.getRange("D5").getValue() || 44.70
  };

  let cashWave = [];
  const cwSheet = SS.getSheetByName("Cash Wave");
  if (cwSheet && cwSheet.getLastRow() > 1) {
    const cwData = cwSheet.getDataRange().getValues();
    cwData.shift();
    cashWave = cwData.map(function(r) {
      return { date: r[0], mff: r[1], wholesale: r[2], notes: r[3] };
    });
  }

  const income = getIncomeRows();
  const expense = getExpenseRows();
  const orders = getOrderRows();
  const summary = getFinanceSummary(income, expense, capital);

  return {
    income: income,
    expense: expense,
    capital: capital,
    pricing: pricing,
    cashWave: cashWave,
    orders: orders,
    gstPaidYtd: summary.gstPaidYtd,
    cashBalance: summary.cashBalance,
    summary: summary
  };
}

// ---------- Row safety ----------

// Deleting a row moves every row below it up by one. If the app is working from
// an older list, its row number can point at a different transaction. The app
// sends what it expects to find (amount + description/customer); refuse the
// change if the row doesn't match. Older app versions don't send `match`.
function rowMatches(sheet, p) {
  if (!p.match) return true;
  if (!p.row || p.row < 2 || p.row > sheet.getLastRow()) return false;
  const r = sheet.getRange(p.row, 1, 1, 4).getValues()[0];
  const sameAmount = Math.abs(moneyValue(r[3]) - moneyValue(p.match.amount)) < 0.005;
  const label = String((p.type === "income" ? r[2] : r[1]) || "").trim().toLowerCase();
  const sameLabel = label === String(p.match.label || "").trim().toLowerCase();
  return sameAmount && sameLabel;
}

// ---------- Endpoints ----------

// The app only uses POST. GET is kept so an old bookmark gets a clear answer,
// but it no longer accepts a PIN in the URL (URLs end up in browser history).
function doGet() {
  return jsonOutput({ error: "use_post" });
}

function doPost(e) {
  let p;
  try {
    p = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput({ error: "bad_request" });
  }

  const pinError = checkPin(p.pin);
  if (pinError) return jsonOutput({ error: pinError });

  if (p.action === "fetch") return jsonOutput(buildPayload());

  // One change at a time, so two quick saves can't land on the same row.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return jsonOutput({ error: "busy_try_again" });
  }

  try {
    return jsonOutput(handleChange(p));
  } catch (err) {
    console.error(err);
    return jsonOutput({ error: "server_error: " + (err && err.message ? err.message : err) });
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function handleChange(p) {
  const sheetFor = type => SS.getSheetByName(type === "income" ? "Income" : "Expenses");

  if (p.action === "add") {
    if (p.type === "income") {
      const sheet = SS.getSheetByName("Income");
      const row = sheet.getLastRow() + 1;
      sheet.getRange(row, 1, 1, 7).setValues([[p.date, p.source, "", moneyValue(p.amount), p.paid, "", p.fulfilled || ""]]);
      sheet.getRange(row, 3).setNumberFormat("@").setValue(p.customer);
    } else {
      const amount = moneyValue(p.amount);
      const gst = expenseGst(p, amount);
      const total = roundedMoney(amount + gst);
      SS.getSheetByName("Expenses").appendRow([p.date, p.description, p.category, amount, gst, total, p.paid, ""]);

      if (p.category && p.category.includes("Co-Packing")) {
        const cwSheet = SS.getSheetByName("Cash Wave");
        if (cwSheet) {
          const incSheet = SS.getSheetByName("Income");
          const incData = incSheet.getDataRange().getValues();
          incData.shift();
          const prodDate = new Date(p.date);
          const monEnd = new Date(prodDate);
          monEnd.setDate(monEnd.getDate() - (monEnd.getDay() + 6) % 7);
          const monStart = new Date(monEnd);
          monStart.setDate(monStart.getDate() - 7);
          let estWS = 0;
          incData.forEach(function(r) {
            const d = new Date(r[0]);
            if (d >= monStart && d < monEnd) estWS += moneyValue(r[3]);
          });
          cwSheet.appendRow([p.date, total, estWS, p.description]);
        }
      }
    }
    return { ok: true };
  }

  if (p.action === "setCapital") {
    SS.getSheetByName("The Managers Office").getRange("B1").setValue(moneyValue(p.amount));
    return { ok: true };
  }

  if (p.action === "order") {
    SS.getSheetByName("Orders").appendRow([
      p.date,
      p.Naked,
      p.GoNuts,
      p.CocoYummy,
      p.CranCinnyBliss,
      p.DarkDreamy,
      p.BulkContainer
    ]);
    return { ok: true };
  }

  // Everything below changes an existing row.
  if (!["delete", "pay", "receipt", "edit"].includes(p.action)) return { error: "unknown_action" };
  const sheet = sheetFor(p.type);
  if (!rowMatches(sheet, p)) return { error: "row_changed" };

  if (p.action === "delete") {
    sheet.deleteRow(p.row);
    return { ok: true };
  }

  if (p.action === "pay") {
    sheet.getRange(p.row, p.type === "income" ? 5 : 7).setValue("yes");
    return { ok: true };
  }

  if (p.action === "receipt") {
    const blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.mime, p.filename);
    const file = getFolder().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const link = "https://drive.google.com/uc?id=" + file.getId();
    sheet.getRange(p.row, p.type === "income" ? 6 : 8).setValue(link);
    return { ok: true, link: link };
  }

  // edit
  if (p.type === "income") {
    sheet.getRange(p.row, 1).setValue(p.date);
    sheet.getRange(p.row, 2).setValue(p.source);
    sheet.getRange(p.row, 3).setNumberFormat("@").setValue(p.customer);
    sheet.getRange(p.row, 4).setValue(moneyValue(p.amount));
    sheet.getRange(p.row, 5).setValue(p.paid);
    if (p.fulfilled !== undefined) sheet.getRange(p.row, 7).setValue(p.fulfilled);
  } else {
    const amount = moneyValue(p.amount);
    const gst = expenseGst(p, amount);
    const total = roundedMoney(amount + gst);
    sheet.getRange(p.row, 1, 1, 7).setValues([[p.date, p.description, p.category, amount, gst, total, p.paid]]);
  }
  return { ok: true };
}
