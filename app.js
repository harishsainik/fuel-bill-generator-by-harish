/* global html2canvas, JSZip */

const GST_NO = "06AAACH1118D1ZG";
const STATION_LINES = [
  "Bharat Petroleum Block A,",
  "Sector 30, Gurugram, Haryana",
  "122003",
];

const $ = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));
const pv = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @typedef {"single" | "bulk"} ActiveTab */
/** @type {ActiveTab} */
let activeTab = "single";

function parseNum(s) {
  const v = Number(String(s).trim());
  return Number.isFinite(v) ? v : 0;
}

function parseIntClamped(s, min) {
  const raw = String(s === undefined || s === null ? "" : s).trim();
  const v = Number.parseInt(raw, 10);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, v);
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
  return v.replace(/\//g, "-");
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

function renderPreviewFromState(s, { writeVolumeInput } = { writeVolumeInput: false }) {
  pv("pvReceiptNo").textContent = s.receiptNo;
  pv("pvProduct").textContent = String(s.product).toLowerCase();
  pv("pvPrice").textContent = fmt2(s.pricePerL);
  pv("pvAmount").textContent = fmtMoney(s.amount);
  pv("pvVolume").textContent = fmt2(s.volume);
  if (writeVolumeInput) $("volume").value = fmt2(s.volume);
  pv("pvVehType").textContent = String(s.vehType).toLowerCase();
  pv("pvVehNo").textContent = s.vehNo;

  // In the preview image, customer name wraps to the next line naturally.
  pv("pvCustomerName").textContent = splitCustomerName(s.customerName).join("\n");

  pv("pvDate").textContent = formatDateDDMMYYYY(s.date);
  pv("pvTime").textContent = s.time;
  pv("pvMode").textContent = String(s.mode).toLowerCase();
  pv("pvFooterMsg").textContent = s.footerMsg;
}

function renderPreview() {
  const s = getState();
  renderPreviewFromState(s, { writeVolumeInput: true });
}

function recalcVolume() {
  // Kept for UX parity, but volume is always auto-derived.
  if (activeTab === "single") renderPreview();
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

function attachNativePicker(el) {
  if (!el || typeof el.showPicker !== "function") return;
  el.addEventListener("click", () => el.showPicker());
  el.addEventListener("focus", () => el.showPicker());
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

function saveBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
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

async function receiptToRgbBytes() {
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
  // Avoid JPEG compression artifacts by extracting raw RGB pixels.
  // We also flatten onto a solid background to guarantee exact background color.
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const flatCtx = flat.getContext("2d");
  if (!flatCtx) throw new Error("Canvas 2D context unavailable");
  flatCtx.fillStyle = "rgb(246, 247, 247)";
  flatCtx.fillRect(0, 0, flat.width, flat.height);
  flatCtx.drawImage(canvas, 0, 0);

  const img = flatCtx.getImageData(0, 0, flat.width, flat.height).data;
  const rgbBytes = new Uint8Array(flat.width * flat.height * 3);
  for (let i = 0, p = 0; i < img.length; i += 4, p += 3) {
    rgbBytes[p] = img[i];
    rgbBytes[p + 1] = img[i + 1];
    rgbBytes[p + 2] = img[i + 2];
  }
  return {
    rgbBytes,
    imgWidth: flat.width,
    imgHeight: flat.height,
    cssWidth: rect.width,
    cssHeight: rect.height,
  };
}

function buildMinimalPdfFromRgb({ rgbBytes, imgWidth, imgHeight, pageWidth, pageHeight, deflatedBytes }) {
  const encoder = new TextEncoder();
  /** @type {Uint8Array[]} */
  const parts = [];
  let len = 0;
  const offsets = new Array(6).fill(0);

  const addBytes = (b) => {
    parts.push(b);
    len += b.length;
  };
  const addStr = (s) => addBytes(encoder.encode(s));

  // PDF header + binary comment line
  addBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xff, 0xff, 0xff, 0xff, 0x0a]));

  const beginObj = (n) => {
    offsets[n] = len;
    addStr(`${n} 0 obj\n`);
  };
  const endObj = () => addStr("endobj\n");

  beginObj(1);
  addStr("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObj();

  beginObj(2);
  addStr("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n");
  endObj();

  beginObj(3);
  addStr(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n`,
  );
  endObj();

  beginObj(4);
  const imgStream = deflatedBytes || rgbBytes;
  const filter = deflatedBytes ? " /Filter /FlateDecode" : "";
  addStr(
    `<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8${filter} /Length ${imgStream.length} >>\nstream\n`,
  );
  addBytes(imgStream);
  addStr("\nendstream\n");
  endObj();

  const contentBytes = encoder.encode(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`);
  beginObj(5);
  addStr(`<< /Length ${contentBytes.length} >>\nstream\n`);
  addBytes(contentBytes);
  addStr("endstream\n");
  endObj();

  const xrefOffset = len;
  addStr("xref\n0 6\n");
  addStr("0000000000 65535 f \n");
  for (let i = 1; i <= 5; i += 1) {
    addStr(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  addStr("trailer\n<< /Size 6 /Root 1 0 R >>\n");
  addStr(`startxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(len);
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

async function receiptPreviewToPdfBytes() {
  const { rgbBytes, imgWidth, imgHeight, cssWidth, cssHeight } = await receiptToRgbBytes();
  const pageWidth = Math.max(1, Math.round(cssWidth));
  const pageHeight = Math.max(1, Math.round(cssHeight));
  return buildMinimalPdfFromRgb({
    rgbBytes,
    imgWidth,
    imgHeight,
    pageWidth,
    pageHeight,
    deflatedBytes: null,
  });
}

async function downloadPdf() {
  // Ensure preview is synced so capture matches latest inputs
  renderPreview();

  const receiptNo = $("receiptNo").value.trim();
  if (!receiptNo) throw new Error("Receipt No is required.");

  const pdfBytes = await receiptPreviewToPdfBytes();
  const filename = `${receiptNo.replace(/\//g, "-")}-${dateForFilename($("date").value)}.pdf`;
  await saveBytesWithPicker(pdfBytes, filename);
}

function setBulkProgress(msg) {
  const el = document.getElementById("bulkProgress");
  if (!el) return;
  el.textContent = msg || "";
}

function setActiveTab(next) {
  activeTab = next;

  const btnSingle = document.getElementById("tabBtnSingle");
  const btnBulk = document.getElementById("tabBtnBulk");
  const panelSingle = document.getElementById("tabPanelSingle");
  const panelBulk = document.getElementById("tabPanelBulk");
  const singleTitle = document.getElementById("singleTitle");
  if (singleTitle) singleTitle.hidden = next !== "single";

  if (next === "single") {
    btnSingle.classList.add("tab--active");
    btnBulk.classList.remove("tab--active");
    btnSingle.setAttribute("aria-selected", "true");
    btnBulk.setAttribute("aria-selected", "false");
    panelSingle.hidden = false;
    panelBulk.hidden = true;
    renderPreview();
  } else {
    btnBulk.classList.add("tab--active");
    btnSingle.classList.remove("tab--active");
    btnBulk.setAttribute("aria-selected", "true");
    btnSingle.setAttribute("aria-selected", "false");
    panelBulk.hidden = false;
    panelSingle.hidden = true;
    renderPreviewBulkFirst();
  }
}

function bulkCountValue() {
  const el = /** @type {HTMLInputElement} */ (document.getElementById("bulkCount"));
  return parseIntClamped(el ? el.value : "", 1);
}

function clampAndWriteBulkCount() {
  const el = /** @type {HTMLInputElement} */ (document.getElementById("bulkCount"));
  const v = bulkCountValue();
  if (el) el.value = String(v);
  return v;
}

function bulkDateId(i) {
  return `bulkDate_${i}`;
}

function bulkTimeId(i) {
  return `bulkTime_${i}`;
}

function buildBulkDateTimeList(n) {
  const list = document.getElementById("bulkDateTimeList");
  if (!list) return;

  list.innerHTML = "";
  const today = todayYYYYMMDD();
  const defaultTime = "10:20";

  for (let i = 0; i < n; i += 1) {
    const row = document.createElement("div");
    row.className = "bulkRow";

    const title = document.createElement("div");
    title.className = "bulkRow__title";
    title.textContent = `Receipt ${i + 1}`;

    /** @type {HTMLInputElement & { showPicker?: () => void }} */
    const date = document.createElement("input");
    date.className = "field__input";
    date.type = "date";
    date.value = today;
    date.id = bulkDateId(i);

    /** @type {HTMLInputElement & { showPicker?: () => void }} */
    const time = document.createElement("input");
    time.className = "field__input";
    time.type = "time";
    time.value = defaultTime;
    time.step = "60";
    time.id = bulkTimeId(i);

    attachNativePicker(date);
    attachNativePicker(time);

    // Preview must always show only 1 receipt (receipt #1).
    const maybeRender = () => {
      if (activeTab !== "bulk") return;
      if (i !== 0) return;
      renderPreviewBulkFirst();
    };
    date.addEventListener("input", maybeRender);
    time.addEventListener("input", maybeRender);

    row.appendChild(title);
    row.appendChild(date);
    row.appendChild(time);
    list.appendChild(row);
  }
}

function randIntInclusive(min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function randMoney2(min, max) {
  const minC = Math.round(parseNum(min) * 100);
  const maxC = Math.round(parseNum(max) * 100);
  const cents = randIntInclusive(minC, maxC);
  return cents / 100;
}

function buildBulkStateForIndex(i, receiptNo) {
  const dateEl = /** @type {HTMLInputElement | null} */ (document.getElementById(bulkDateId(i)));
  const timeEl = /** @type {HTMLInputElement | null} */ (document.getElementById(bulkTimeId(i)));
  const date = dateEl && dateEl.value ? dateEl.value.trim() : "";
  const time = timeEl && timeEl.value ? timeEl.value.trim() : "";

  const product = $("bulkProduct").value.trim() || "petrol";
  const vehType = $("bulkVehType").value.trim() || "petrol";
  const vehNo = $("bulkVehNo").value.trim();
  const customerName = $("bulkCustomerName").value.trim();
  const mode = $("bulkMode").value.trim() || "Cash";
  const footerMsg = $("bulkFooterMsg").value.trim();

  const amount = parseNum($("bulkAmount").value);
  const pricePerL = randMoney2($("bulkPriceMin").value, $("bulkPriceMax").value);
  const volume = computeVolume({ amount, pricePerL });

  return {
    receiptNo: String(receiptNo === undefined || receiptNo === null ? "" : receiptNo),
    product,
    pricePerL,
    amount,
    volume,
    vehType,
    vehNo,
    customerName,
    date,
    time,
    mode,
    footerMsg,
  };
}

function renderPreviewBulkFirst() {
  // Bulk preview is ALWAYS receipt #1
  const n = clampAndWriteBulkCount();
  setBulkProgress(`Previewing receipt 1 of ${n}`);

  const start = parseIntClamped($("bulkStartInvoice").value, 1);
  const s = buildBulkStateForIndex(0, start);
  renderPreviewFromState(s, { writeVolumeInput: false });
}

async function downloadBulkZip() {
  const n = clampAndWriteBulkCount();
  if (n < 1) throw new Error("Number of receipts must be at least 1.");

  const start = parseIntClamped($("bulkStartInvoice").value, 1);
  const diffMin = parseIntClamped($("bulkInvDiffMin").value, 0);
  const diffMax = parseIntClamped($("bulkInvDiffMax").value, diffMin);

  const receiptNos = [];
  let cur = start;
  for (let i = 0; i < n; i += 1) {
    receiptNos.push(cur);
    const diff = randIntInclusive(diffMin, diffMax);
    cur += diff;
  }

  setBulkProgress(`Generating ${n} receipt(s)… (preview always shows receipt 1)`);
  const zip = new JSZip();

  for (let i = 0; i < n; i += 1) {
    setBulkProgress(`Generating PDF ${i + 1}/${n}…`);
    const state = buildBulkStateForIndex(i, receiptNos[i]);
    renderPreviewFromState(state, { writeVolumeInput: false });
    // eslint-disable-next-line no-await-in-loop
    const pdfBytes = await receiptPreviewToPdfBytes();

    const safeReceipt = String(receiptNos[i]).replace(/\//g, "-");
    const safeDate = dateForFilename(state.date);
    zip.file(`${safeReceipt}-${safeDate}.pdf`, pdfBytes);
  }

  setBulkProgress("Zipping…");
  const blob = await zip.generateAsync({ type: "blob" });
  const zipName = `bulk-receipts-${dateForFilename(todayYYYYMMDD())}.zip`;
  saveBlob(blob, zipName);
  setBulkProgress(`Done. Downloaded ${zipName}`);

  // Restore preview to receipt #1 after bulk run.
  renderPreviewBulkFirst();
}

function wireBulk() {
  // Count stepper
  $("bulkCountMinus").addEventListener("click", () => {
    const cur = clampAndWriteBulkCount();
    $("bulkCount").value = String(Math.max(1, cur - 1));
  });
  $("bulkCountPlus").addEventListener("click", () => {
    const cur = clampAndWriteBulkCount();
    $("bulkCount").value = String(cur + 1);
  });
  $("bulkCount").addEventListener("blur", () => {
    clampAndWriteBulkCount();
  });
  $("bulkCount").addEventListener("input", () => {
    const v = String($("bulkCount").value || "").replace(/[^\d]/g, "");
    $("bulkCount").value = v || "1";
  });
  $("bulkCountOk").addEventListener("click", () => {
    const n = clampAndWriteBulkCount();
    buildBulkDateTimeList(n);
    if (activeTab === "bulk") renderPreviewBulkFirst();
  });

  // Common inputs: if bulk tab active, keep preview synced to receipt #1 only.
  const bulkInputsThatAffectPreview = [
    "bulkStartInvoice",
    "bulkAmount",
    "bulkInvDiffMin",
    "bulkInvDiffMax",
    "bulkProduct",
    "bulkVehType",
    "bulkPriceMin",
    "bulkPriceMax",
    "bulkVehNo",
    "bulkCustomerName",
    "bulkMode",
    "bulkFooterMsg",
  ];
  for (const id of bulkInputsThatAffectPreview) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener("input", () => {
      if (activeTab !== "bulk") return;
      renderPreviewBulkFirst();
    });
  }

  document.getElementById("bulkPreviewFirst").addEventListener("click", () => {
    if (activeTab !== "bulk") setActiveTab("bulk");
    renderPreviewBulkFirst();
  });

  document.getElementById("bulkDownloadZip").addEventListener("click", () => {
    downloadBulkZip().catch((e) => {
      // eslint-disable-next-line no-alert
      alert((e && typeof e === "object" && "message" in e && e.message) || String(e));
      setBulkProgress("");
    });
  });

  // Initial list: always at least 1
  buildBulkDateTimeList(1);
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
    $(id).addEventListener("input", () => {
      if (activeTab !== "single") return;
      renderPreview();
    });
  }
  document.getElementById("recalc").addEventListener("click", recalcVolume);
  document.getElementById("download").addEventListener("click", () => {
    downloadPdf().catch((e) => {
      // Keep UI minimal; show a direct message if something fails.
      // eslint-disable-next-line no-alert
      alert((e && typeof e === "object" && "message" in e && e.message) || String(e));
    });
  });

  // Defaults on open
  $("date").value = todayYYYYMMDD();
  $("time").value = "10:20";

  renderPreview();
  wireNativePickers();

  document.getElementById("tabBtnSingle").addEventListener("click", () => setActiveTab("single"));
  document.getElementById("tabBtnBulk").addEventListener("click", () => setActiveTab("bulk"));

  wireBulk();
}

wire();

