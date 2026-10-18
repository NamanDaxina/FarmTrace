/* FarmTrace – live Sheet connection + public tracking first, login only to record a stop.
   Keep this line in index.html just before </body>:   <script src="sheet-sync.js"></script>
   Upload index.html and sheet-sync.js together to Netlify. */
(function () {
  const SYNC = {
    csv: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQf5KepcNqN6J_d00pArS5ykwf7xw7KcNYeEPDtZ51scidOiBa3NMcESn4Kdo372SXsAsREdK7TC64c/pub?output=csv",
    known: ["TOM-001", "TOM-002", "TOM-003", "TOM-004", "TOM-005"],
    everyMs: 60000
  };
  let sheetRows = [], firstLoad = true;
  const $ = id => document.getElementById(id);
  const isDemo = id => /^FT-/i.test(id);

  /* ---------- style: login hidden until "Record a stop"; QR scan opens tracking first ---------- */
  const st = document.createElement("style");
  st.textContent = "#loginGate{display:none!important}body.show-login #loginGate{display:grid!important}" +
    "body.scan-view #home,body.scan-view #overview,body.scan-view #how{display:none!important}" +
    ".rec-row{margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}.rec-row small{color:var(--muted);font-size:11px}";
  document.head.appendChild(st);

  /* ---------- CSV parsing ---------- */
  function parseCSV(t) {
    const R = []; let r = [], c = "", q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { r.push(c); c = ""; }
      else if (ch === "\n") { r.push(c); R.push(r); r = []; c = ""; }
      else if (ch !== "\r") c += ch;
    }
    if (c || r.length) { r.push(c); R.push(r); }
    return R;
  }
  function parseTS(s) { const m = (s || "").match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+)/); return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) : null; }
  function stamp(d, raw) {
    return d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) + " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : (raw || "Not recorded");
  }
  function emptyBatch(id) {
    return { id, product: "Tomatoes", emoji: "🍅", origin: "Not provided", harvest: "Not provided",
      freshness: "Not calculated", status: "incomplete", flag: false, events: [], src: "sheet" };
  }

  /* ---------- build batches from Sheet rows, drop demo batches ---------- */
  function ensure(id) {
    id = String(id || "").toUpperCase();
    if (!id || isDemo(id)) return;
    if (!/^TOM-/.test(id) && !sheetRows.some(r => r.batch === id)) return;
    const b = batches[id] || (batches[id] = emptyBatch(id));
    b.src = "sheet";
    const mine = sheetRows.filter(r => r.batch === id);
    b.events = (b.events || []).filter(e => e.src !== "sheet").concat(mine.map(r => ({
      type: r.stop || "Scan", place: r.place || "Place not recorded", date: stamp(r.ts, r.raw), role: r.who || "—",
      notes: [r.q ? "Grade " + r.q : "", /^https?:\/\//.test(r.loc) ? "Map link recorded" : "", r.notes].filter(Boolean).join(" · ") || "Scan recorded",
      verified: false, src: "sheet" })));
    if (mine.length) {
      const farm = mine.find(r => /farm/i.test(r.stop));
      b.origin = farm && farm.place ? farm.place + " (reported in scan)" : "Not provided";
      const first = mine[0], days = first.ts ? Math.max(0, Math.floor((Date.now() - first.ts) / 864e5)) : null;
      b.freshness = days === null ? "Not calculated" : "≈ " + Math.max(0, 100 - 4 * days) + "/100 (estimate, " + days + " day" + (days === 1 ? "" : "s") + " since first scan)";
    }
    if (!b.flag) b.status = b.events.length >= 2 ? "recorded" : "incomplete";
  }
  function ensureAll() {
    Object.keys(batches).forEach(k => { if (isDemo(k)) delete batches[k]; });
    if (isDemo(currentBatch)) currentBatch = "TOM-001";
    audit = audit.filter(a => !isDemo(a.batch || ""));
    SYNC.known.forEach(ensure);
    Array.from(new Set(sheetRows.map(r => r.batch))).forEach(ensure);
  }

  /* ---------- wording: remove demo text ---------- */
  function setT(sel, txt) { const e = document.querySelector(sel); if (e) e.textContent = txt; }
  function patchStaticText() {
    const bs = $("batchSearch"); if (bs) bs.placeholder = "Enter batch ID, e.g. TOM-001";
    setT("#trace .helper", "Batch IDs look like TOM-001 to TOM-005. Scan the QR tag on a crate to open its journey.");
    setT("#overview .section-head p", "Live counts from scans recorded in the team Google Sheet and the shared FarmTrace records.");
    setT("#overview .disclaimer", "Scans are self-reported by the people who handle each crate. A confirmed checkpoint means a designated operator confirmed it, not independently certified food origin.");
    const labs = document.querySelectorAll("#overview .stat span");
    if (labs[0]) labs[0].textContent = "Batches";
    if (labs[2]) labs[2].textContent = "Batches with confirmed checkpoints";
    setT("#dataConnect .section-head p", "Scans load automatically from the team Google Sheet. You can also import a downloaded CSV.");
    setT("#dataConnect .helper", "Scans load automatically from the team Google Sheet. You can also import a downloaded CSV.");
    const dl = document.querySelector("#dataConnect a.button"); if (dl) dl.href = SYNC.csv;
    setT("#operator .section-head p", "Record a handover for a batch. Sign-in is required, and every record keeps the operator role and time.");
    setT("#operator .form-panel .disclaimer", "Only record information you are authorised to record. Entries are stored as records and are not independently verified.");
    setT(".consumer-left .disclaimer", "Scanning this QR opens this batch's journey on this website.");
    const conf = $("confirmRecord") && $("confirmRecord").parentElement;
    if (conf && conf.lastChild && conf.lastChild.nodeType === 3) conf.lastChild.textContent = " I confirm this record is accurate and I am authorised to record it.";
    const sb = document.querySelector("#checkpointForm button[type=submit]"); if (sb) sb.textContent = "Add checkpoint →";
    const card = document.querySelector("#loginForm");
    if (card && !$("backToTrack")) {
      const back = document.createElement("button");
      back.type = "button"; back.id = "backToTrack"; back.className = "button secondary"; back.style.cssText = "width:100%;margin-top:10px";
      back.textContent = "← Back to tracking";
      back.onclick = () => document.body.classList.remove("show-login");
      const note = card.querySelector(".demo-credentials"); card.insertBefore(back, note || null);
    }
  }
  function tidyConsumer(id) {
    const b = batches[String(id || currentBatch).toUpperCase()]; if (!b) return;
    if (b.src === "sheet" && $("consumerSubtitle"))
      $("consumerSubtitle").textContent = "Batch " + b.id + (b.events.length ? " · Live data from Google Sheet (self-reported)" : " · Journey details not yet supplied");
    setT(".consumer-left p", "Batch " + b.id + " · " + b.product);
    setT(".float-a strong", b.id);
    setT(".float-b strong", b.events.length + " checkpoint" + (b.events.length === 1 ? "" : "s") + " recorded");
  }

  /* ---------- Record a stop: login only when needed ---------- */
  function startRecord(id) {
    location.hash = "#trace=" + encodeURIComponent(id);
    if (typeof activeFarmTraceRole !== "undefined" && activeFarmTraceRole) { activateQrEntryMode(); addBackButton(id); }
    else { document.body.classList.add("show-login"); const u = $("loginUser"); if (u) setTimeout(() => u.focus(), 50); }
  }
  function addBackButton(id) {
    const panel = $("qrEntryPanel"); if (!panel || $("viewTrackingBtn")) return;
    const btn = document.createElement("button");
    btn.type = "button"; btn.id = "viewTrackingBtn"; btn.className = "button secondary"; btn.style.marginRight = "8px";
    btn.textContent = "← View tracking";
    btn.onclick = () => {
      document.body.classList.remove("qr-entry-mode");
      const form = $("checkpointForm"), orig = document.querySelector("#operator .form-panel"); if (form && orig) orig.appendChild(form);
      document.body.classList.add("scan-view"); window.traceBatch(id); window.scrollTo(0, 0);
    };
    const out = panel.querySelector("button[onclick*=farmTraceLogout]"); panel.insertBefore(btn, out || null);
  }
  function tidyTrace(id) {
    const out = $("lookupResult"); if (!out) return;
    const n = out.querySelector(".notice"); const b = batches[id];
    if (n && /No batch found/.test(n.textContent)) { n.innerHTML = n.innerHTML.replace(/try FT[^.]*\./, "try TOM-001."); return; }
    if (n && b && b.src === "sheet" && /demonstration journey/.test(n.textContent))
      n.textContent = "This journey is built from scans recorded in the team Google Form. Scans are self-reported and do not independently prove farm origin or food safety.";
    if (b && !out.querySelector(".rec-row")) {
      const row = document.createElement("div"); row.className = "rec-row";
      row.innerHTML = '<button class="button primary" type="button">Record a stop for ' + id + ' →</button><small>Sign-in required for authorised handlers.</small>';
      const rb = row.querySelector("button"); if (rb) rb.onclick = () => startRecord(id);
      out.appendChild(row);
    }
  }

  /* ---------- wrap the site's own functions ---------- */
  const _trace = window.traceBatch, _cons = window.renderConsumer, _stats = window.renderStats, _list = window.renderBatchList;
  window.renderStats = function () { ensureAll(); return _stats.apply(this, arguments); };
  window.renderBatchList = function () { audit = audit.filter(a => !isDemo(a.batch || "")); return _list.apply(this, arguments); };
  window.renderConsumer = function (id) { ensureAll(); ensure(id || currentBatch); const r = _cons.apply(this, arguments); tidyConsumer(id); return r; };
  window.traceBatch = function (id) {
    id = String(id || ($("batchSearch") && $("batchSearch").value) || "").trim().toUpperCase();
    ensureAll(); ensure(id); const r = _trace.call(this, id); tidyTrace(id); return r;
  };

  /* ---------- Sheet sync ---------- */
  function setStatus(msg) { const s = $("csvStatus"); if (s) s.textContent = msg; }
  async function sync() {
    try {
      const res = await fetch(SYNC.csv + "&t=" + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);
      const R = parseCSV(await res.text());
      const h = (R[0] || []).map(x => x.trim().toLowerCase());
      const f = t => h.findIndex(t);
      const ix = { ts: f(x => x.startsWith("timestamp")), b: f(x => x.startsWith("batch")), s: f(x => x.startsWith("stop")),
        t: f(x => x.includes("time of scan") || x === "time"), w: f(x => x.includes("handler")), q: f(x => x.includes("quality")),
        p: f(x => x.includes("place")), l: f(x => x.includes("location")), n: f(x => x.includes("notes")) };
      if (ix.b < 0) throw new Error("no 'Batch ID' column found");
      const g = (r, i) => i >= 0 && r[i] ? r[i].trim() : "";
      sheetRows = R.slice(1).filter(r => g(r, ix.b)).map(r => ({ ts: parseTS(g(r, ix.ts)), raw: g(r, ix.ts), batch: g(r, ix.b).toUpperCase(),
        stop: g(r, ix.s), time: g(r, ix.t), who: g(r, ix.w), q: g(r, ix.q), place: g(r, ix.p), loc: g(r, ix.l), notes: g(r, ix.n) }));
      setStatus("Live from the Google Sheet: " + sheetRows.length + " scans across " + new Set(sheetRows.map(r => r.batch)).size +
        " batches · refreshed " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) + ". Scans are self-reported.");
    } catch (e) { setStatus("Could not read the Google Sheet (" + e.message + "). Check that the first tab is published as CSV."); }
    ensureAll(); window.renderStats();
    if (typeof renderConnectedBatches === "function") renderConnectedBatches();
    const fromHash = location.hash.startsWith("#trace=") ? decodeURIComponent(location.hash.slice(7)).toUpperCase() : "";
    const cur = fromHash || (($("batchSearch") && $("batchSearch").value) || "").trim().toUpperCase();
    if ($("batchSearch") && fromHash) $("batchSearch").value = fromHash;
    if (cur) window.traceBatch(cur); else window.renderConsumer(currentBatch);
    if (firstLoad && fromHash) { document.body.classList.add("scan-view"); window.scrollTo(0, 0); }
    firstLoad = false;
  }

  /* hide the login card again after a successful sign-in */
  const gate = $("loginGate");
  if (gate && typeof MutationObserver !== "undefined")
    new MutationObserver(() => { if (gate.classList.contains("hidden")) document.body.classList.remove("show-login"); })
      .observe(gate, { attributes: true, attributeFilter: ["class"] });

  patchStaticText();
  if (location.hash.startsWith("#trace=")) document.body.classList.add("scan-view");
  sync(); setInterval(sync, SYNC.everyMs);
})();
