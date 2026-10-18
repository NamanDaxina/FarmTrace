/* FarmTrace – live Google Sheet connection.
   Add this line to index.html just before </body>:   <script src="sheet-sync.js"></script>
   Upload index.html and sheet-sync.js together to Netlify. */
(function () {
  const SYNC = {
    csv: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQf5KepcNqN6J_d00pArS5ykwf7xw7KcNYeEPDtZ51scidOiBa3NMcESn4Kdo372SXsAsREdK7TC64c/pub?output=csv",
    known: ["TOM-001", "TOM-002", "TOM-003", "TOM-004", "TOM-005"],
    everyMs: 60000
  };
  let sheetRows = [];

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
  function parseTS(s) {
    const m = (s || "").match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+)/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) : null;
  }
  function stamp(d, raw) {
    return d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) + " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : (raw || "Not recorded");
  }
  function emptyBatch(id) {
    return { id, product: "Tomatoes", emoji: "🍅", origin: "Not provided", harvest: "Not provided",
      freshness: "Not calculated", status: "incomplete", flag: false, events: [], src: "sheet" };
  }

  function ensure(id) {
    id = String(id || "").toUpperCase();
    if (!id || !/^TOM-/.test(id) && !sheetRows.some(r => r.batch === id)) return;
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
      if (!b.flag) b.status = b.events.length >= 2 ? "recorded" : "incomplete";
    }
  }
  function ensureAll() {
    SYNC.known.forEach(ensure);
    Array.from(new Set(sheetRows.map(r => r.batch))).forEach(ensure);
  }

  const $ = id => document.getElementById(id);
  function tidyConsumer(id) {
    const b = batches[String(id || currentBatch).toUpperCase()];
    if (!b || b.src !== "sheet" || !$("consumerSubtitle")) return;
    $("consumerSubtitle").textContent = "Batch " + b.id + (b.events.length ? " · Live data from Google Sheet (self-reported)" : " · Journey details not yet supplied");
  }
  function tidyTrace(id) {
    const out = $("lookupResult"); if (!out) return;
    const n = out.querySelector(".notice"); if (!n) return;
    const b = batches[id];
    if (/No batch found/.test(n.textContent)) n.innerHTML = n.innerHTML.replace(/try FT[^.]*\./, "try TOM-001.");
    else if (b && b.src === "sheet" && /demonstration journey/.test(n.textContent))
      n.textContent = "This journey is built from scans recorded in the team Google Form. Scans are self-reported and do not independently prove farm origin or food safety.";
  }

  const _trace = window.traceBatch, _cons = window.renderConsumer, _stats = window.renderStats;
  window.renderStats = function () { ensureAll(); return _stats.apply(this, arguments); };
  window.renderConsumer = function (id) { ensure(id || currentBatch); const r = _cons.apply(this, arguments); tidyConsumer(id); return r; };
  window.traceBatch = function (id) {
    id = String(id || ($("batchSearch") && $("batchSearch").value) || "").trim().toUpperCase();
    ensure(id); const r = _trace.call(this, id); tidyTrace(id); return r;
  };

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
    } catch (e) {
      setStatus("Could not read the Google Sheet (" + e.message + "). Check that the first tab is published as CSV.");
    }
    ensureAll(); window.renderStats();
    if (typeof renderConnectedBatches === "function") renderConnectedBatches();
    const cur = (($("batchSearch") && $("batchSearch").value) || "").trim().toUpperCase();
    if (cur && batches[cur]) window.traceBatch(cur); else window.renderConsumer(currentBatch);
  }

  const link = document.querySelector("#dataConnect a.button");
  if (link) link.href = SYNC.csv;
  const help = document.querySelector("#dataConnect .helper");
  if (help) help.textContent = "Scans load automatically from the team Google Sheet. You can also import a downloaded CSV.";
  sync(); setInterval(sync, SYNC.everyMs);
})();
