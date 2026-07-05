/* global PDFLib, html2canvas */

const GST_NO = "06AAACH1118D1ZG";
const STATION_LINES = [
  "Bharat Petroleum Block A,",
  "Sector 30, Gurugram, Haryana",
  "122003",
];

const $ = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));
const pv = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

function parseNum(s) {
  const v = Number(String(s).trim());
  return Number.isFinite(v) ? v : 0;
}

function fmtMoney(n) {
  const v = parseNum(n);
  // Keep as minimal as the sample (no commas)
  return v % 1 === 0 ? String(Math.trunc(v)) : v.toFixed(2);
}

function fmt2(n) {
  return parseNum(n).toFixed(2);
}

function computeVolume({ amount, pricePerL }) {
  const a = parseNum(amount);
  const p = parseNum(pricePerL);
  if (!p) return 0;
  return a / p;
}

function getState() {
  const draft = {
    receiptNo: $("receiptNo").value.trim(),
    product: $("product").value.trim() || "petrol",
    pricePerL: parseNum($("pricePerL").value),
    amount: parseNum($("amount").value),
    volume: 0,
    vehType: $("vehType").value.trim() || "petrol",
    vehNo: $("vehNo").value.trim(),
    customerName: $("customerName").value.trim(),
    date: $("date").value.trim(),
    time: $("time").value.trim(),
    mode: $("mode").value.trim() || "Cash",
    footerMsg: $("footerMsg").value.trim(),
  };

  // Volume is always derived from amount / price (MVP requirement)
  draft.volume = computeVolume({ amount: draft.amount, pricePerL: draft.pricePerL });
  return draft;
}

function formatDateDDMMYYYY(s) {
  const v = String(s || "").trim();
  // If input is yyyy-mm-dd, convert to dd/mm/yyyy
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return v;
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateForFilename(dateValue) {
  const v = String(dateValue || "").trim();
  if (!v) return "date";

  // yyyy-mm-dd -> dd-mm-yyyy
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // dd/mm/yyyy -> dd-mm-yyyy
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // dd-mm-yyyy (already)
  m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // Fallback: sanitize
  return v.replaceAll("/", "-");
}

function splitCustomerName(name) {
  const clean = String(name || "").trim().replace(/\s+/g, " ");
  if (!clean) return [""];
  if (clean.length <= 18) return [clean];

  const parts = clean.split(" ");
  const lines = [];
  let cur = "";
  for (const p of parts) {
    const next = cur ? `${cur} ${p}` : p;
    if (next.length <= 18) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = p;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

function renderPreview() {
  const s = getState();

  pv("pvReceiptNo").textContent = s.receiptNo;
  pv("pvProduct").textContent = String(s.product).toLowerCase();
  pv("pvPrice").textContent = fmt2(s.pricePerL);
  pv("pvAmount").textContent = fmtMoney(s.amount);
  pv("pvVolume").textContent = fmt2(s.volume);
  $("volume").value = fmt2(s.volume);
  pv("pvVehType").textContent = String(s.vehType).toLowerCase();
  pv("pvVehNo").textContent = s.vehNo;

  // In the preview image, customer name wraps to the next line naturally.
  pv("pvCustomerName").textContent = splitCustomerName(s.customerName).join("\n");

  pv("pvDate").textContent = formatDateDDMMYYYY(s.date);
  pv("pvTime").textContent = s.time;
  pv("pvMode").textContent = String(s.mode).toLowerCase();
  pv("pvFooterMsg").textContent = s.footerMsg;
}

function recalcVolume() {
  // Kept for UX parity, but volume is always auto-derived.
  renderPreview();
}

function wireNativePickers() {
  /** @type {HTMLInputElement & { showPicker?: () => void }} */
  const dateEl = $("date");
  /** @type {HTMLInputElement & { showPicker?: () => void }} */
  const timeEl = $("time");

  const attach = (el) => {
    if (!el || typeof el.showPicker !== "function") return;
    // Make the picker open reliably on click/focus (Chrome).
    el.addEventListener("click", () => el.showPicker());
    el.addEventListener("focus", () => el.showPicker());
  };

  attach(dateEl);
  attach(timeEl);
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function saveBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function saveBytesWithPicker(bytes, suggestedName) {
  const picker = window.showSaveFilePicker;
  if (typeof picker !== "function") {
    saveBytes(bytes, suggestedName);
    return;
  }

  try {
    const handle = await picker({
      suggestedName,
      types: [
        {
          description: "PDF",
          accept: { "application/pdf": [".pdf"] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(new Blob([bytes], { type: "application/pdf" }));
    await writable.close();
  } catch (e) {
    // User cancelled or browser disallowed the picker; fall back to default download.
    if (e && typeof e === "object" && "name" in e && e.name === "AbortError") return;
    saveBytes(bytes, suggestedName);
  }
}

function widthOf(font, text, size) {
  return font.widthOfTextAtSize(text, size);
}

function drawCenteredText({ page, font, size, xCenter, y, text }) {
  const w = widthOf(font, text, size);
  page.drawText(text, { x: xCenter - w / 2, y, size, font });
}

function drawLabelValue({ page, font, size, x, y, label, value }) {
  page.drawText(`${label}${value}`, { x, y, size, font });
}

async function waitForReceiptAssets(el) {
  // Fonts
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch {
    // ignore
  }

  // Images inside receipt
  const imgs = Array.from(el.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve(null);
          img.addEventListener("load", () => resolve(null), { once: true });
          img.addEventListener("error", () => resolve(null), { once: true });
        }),
    ),
  );
}

async function receiptToPngDataUrl() {
  const el = document.querySelector(".receiptWrap");
  if (!el) throw new Error("Receipt preview not found");

  await waitForReceiptAssets(el);

  const scale = 3; // crisp text
  const canvas = await html2canvas(el, {
    backgroundColor: "rgb(246, 247, 247)",
    scale,
    useCORS: true,
    logging: false,
  });

  const rect = el.getBoundingClientRect();
  return {
    dataUrl: canvas.toDataURL("image/png"),
    cssWidth: rect.width,
    cssHeight: rect.height,
  };
}

async function downloadPdf() {
  // Ensure preview is synced so capture matches latest inputs
  renderPreview();

  const receiptNo = $("receiptNo").value.trim();
  if (!receiptNo) throw new Error("Receipt No is required.");

  const { PDFDocument } = PDFLib;
  const { dataUrl, cssWidth, cssHeight } = await receiptToPngDataUrl();

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([cssWidth, cssHeight]); // tight page: no black area below
  const pngBytes = await fetchBytes(dataUrl);
  const png = await pdfDoc.embedPng(pngBytes);

  page.drawImage(png, { x: 0, y: 0, width: cssWidth, height: cssHeight });

  const pdfBytes = await pdfDoc.save();
  const filename = `${receiptNo.replaceAll("/", "-")}-${dateForFilename($("date").value)}.pdf`;
  await saveBytesWithPicker(pdfBytes, filename);
}

function wire() {
  const inputs = [
    "receiptNo",
    "product",
    "pricePerL",
    "amount",
    "vehType",
    "vehNo",
    "customerName",
    "date",
    "time",
    "mode",
    "footerMsg",
  ];
  for (const id of inputs) {
    $(id).addEventListener("input", renderPreview);
  }
  document.getElementById("recalc").addEventListener("click", recalcVolume);
  document.getElementById("download").addEventListener("click", () => {
    downloadPdf().catch((e) => {
      // Keep UI minimal; show a direct message if something fails.
      // eslint-disable-next-line no-alert
      alert(e?.message || String(e));
    });
  });

  // Defaults on open
  $("date").value = todayYYYYMMDD();
  $("time").value = "10:20";

  renderPreview();
  wireNativePickers();
}

wire();

