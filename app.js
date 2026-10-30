// app.js — UI only. All time math lives in clocks.js.
import {
  computeAll, dayTables, fmtCountdown, tattvaRingSegments,
  TATTVAS, PLANET_GLYPHS, DEFAULT_SETTINGS, PRASAD_DURATIONS, NADI_INFO, HOUR, DAY, MIN,
} from './clocks.js';
import { tattvaSymbol, ringSVG } from './symbols.js';
import { loadSettings, saveSettings, loadLog, saveLog } from './store.js';

const $ = (id) => document.getElementById(id);

// ───────────── state ─────────────
let settings = loadSettings();
let log = loadLog();
let view = 'now';
let tlOffsetDays = 0; // timeline: 0 = the current solar day
let tlSelected = null; // ms of the tapped moment
let lastError = null;

// ───────────── formatting ─────────────
const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtTimeS = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const fmtDate = (ms) => new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const fmtDateTime = (ms) => `${fmtDate(ms)} ${fmtTime(ms)}`;
const sideFor = (nadi) => NADI_INFO[nadi]?.side ?? '—';

function safeCompute(date) {
  try {
    const r = computeAll(date, settings);
    lastError = null;
    return r;
  } catch (e) {
    lastError = e.message;
    return null;
  }
}

// ───────────── NOW view ─────────────
let ringCache = { key: null, segments: null };

function renderNow() {
  const r = safeCompute(new Date());
  if (!r) {
    $('sunline').textContent = `⚠ ${lastError}`;
    return;
  }
  const { day, planetary: p, tattva: t, nadi: n } = r;

  // masthead
  $('sunline').textContent = `${settings.locationName || `${settings.lat.toFixed(2)}, ${settings.lon.toFixed(2)}`} · ↑ ${fmtTime(day.sunrise)} · ↓ ${fmtTime(day.sunset)} · ${fmtTimeS(r.now)}`;

  // day bar
  const span = day.nextSunrise - day.sunrise;
  $('daybar-day').style.left = '0%';
  $('daybar-day').style.width = `${((day.sunset - day.sunrise) / span) * 100}%`;
  $('daybar-now').style.left = `${((r.now - day.sunrise) / span) * 100}%`;
  $('daybar-rise').textContent = `↑ ${fmtTime(day.sunrise)}`;
  $('daybar-set').textContent = `↓ ${fmtTime(day.sunset)}`;
  $('daybar-nextrise').textContent = `↑ ${fmtTime(day.nextSunrise)}`;

  // planetary
  $('pl-glyph').textContent = p.glyph;
  $('pl-planet').textContent = p.planet;
  $('pl-hour').textContent = `${p.isNight ? 'Night' : 'Day'} hour ${p.number} of 12 · ${Math.round(p.hourLengthMs / MIN)} min hours`;
  $('pl-meta').textContent = `${p.weekdayName} · day of ${p.dayRuler} ${PLANET_GLYPHS[p.dayRuler]}`;
  $('pl-left').textContent = fmtCountdown(p.msLeft);
  $('pl-next').innerHTML = `<span class="glyph-inline">${p.nextGlyph}</span>${p.nextPlanet} at ${fmtTime(p.hourEnd)}`;

  // tattva
  const ringKey = `${settings.tattvaOrder}|${settings.tattvaDurationMode}`;
  if (ringCache.key !== ringKey) ringCache = { key: ringKey, segments: tattvaRingSegments(settings) };
  $('tt-ring').innerHTML = ringSVG(ringCache.segments, t.cycleFraction, t.main);
  $('tt-sym-main').innerHTML = tattvaSymbol(t.main);
  $('tt-sym-sub').innerHTML = tattvaSymbol(t.sub);
  $('tt-label').textContent = t.label;
  $('tt-elements').textContent = `${t.subInfo.element} of ${t.mainInfo.element} · cycle ${Math.round(t.cycleMs / MIN)} min from ↑`;
  $('tt-meta').textContent = settings.tattvaDurationMode === 'prasad' ? 'Prasad unequal ⚠' : 'Golden Dawn · 24 min';
  $('tt-left-sub').textContent = fmtCountdown(t.msLeftSub);
  $('tt-left-main').textContent = fmtCountdown(t.msLeftMain);
  $('tt-next').textContent = `${t.nextSub} of ${t.main}, then ${t.nextMain} at ${fmtTime(t.mainEnd)}`;

  // nadi
  const el = $('nd-nadi');
  el.textContent = n.predicted === 'Sushumna' ? 'Sushumna' : `${n.predicted} · ${sideFor(n.predicted)}`;
  el.classList.toggle('sushumna', n.predicted === 'Sushumna');
  $('nd-quality').textContent = n.predicted === 'Sushumna'
    ? `window · ${n.scheduled} → ${n.nextScheduled}`
    : `${n.info.quality} · then ${n.nextScheduled}`;
  document.querySelectorAll('#nd-sides .side').forEach((s) => s.classList.toggle('on', s.dataset.side === sideFor(n.predicted)));
  $('nd-left-label').textContent = n.inSushumnaWindow ? 'window ends' : 'switch in';
  $('nd-left').textContent = fmtCountdown(n.inSushumnaWindow ? n.msToWindowEnd : n.msToSwitch);
  $('nd-tithi').textContent = `${n.paksha} ${n.pakshaTithi} · ${n.tithiName}`;
  $('nd-meta').textContent = `${n.waxing ? 'waxing' : 'waning'} · ↑ ${n.sunriseNadi} · every ${settings.nadiSwitchMin} min`;
}

// ───────────── TIMELINE view ─────────────
const PX_PER_HOUR = 110;
const LANE_H = 44, LANE_GAP = 6, TOP = 26, LABEL_H = 20;

function tlAnchorDate() {
  return new Date(Date.now() + tlOffsetDays * DAY);
}

function renderTimeline() {
  let tables;
  try { tables = dayTables(tlAnchorDate(), settings); } catch (e) { $('tl-strip').textContent = e.message; return; }
  const { day, planetary, tattva, nadi } = tables;
  const span = day.nextSunrise - day.sunrise;
  const W = Math.ceil((span / HOUR) * PX_PER_HOUR);
  const H = TOP + 3 * (LANE_H + LANE_GAP) + LABEL_H;
  const x = (ms) => ((ms - day.sunrise) / span) * W;

  $('tl-title').textContent = `${fmtDate(day.sunrise)} ↑${fmtTime(day.sunrise)} → ${fmtDate(day.nextSunrise)} ↑${fmtTime(day.nextSunrise)}`;

  let s = `<svg id="tl-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, Helvetica, Arial, sans-serif">`;
  // night shading
  s += `<rect x="${x(day.sunset)}" y="0" width="${W - x(day.sunset)}" height="${H}" fill="rgba(255,255,255,0.025)"/>`;
  // clock-hour ticks
  const firstTick = Math.ceil(day.sunrise / HOUR) * HOUR;
  for (let t = firstTick; t < day.nextSunrise; t += HOUR) {
    const hr = new Date(t).getHours();
    const major = hr % 3 === 0;
    s += `<line x1="${x(t)}" y1="${TOP - 6}" x2="${x(t)}" y2="${H - LABEL_H}" stroke="rgba(201,168,76,${major ? 0.25 : 0.1})" stroke-width="1"/>`;
    if (major) s += `<text x="${x(t) + 3}" y="${TOP - 10}" font-size="11" fill="#9a927f">${fmtTime(t)}</text>`;
  }
  // sunrise / sunset lines
  for (const [ms, label] of [[day.sunrise, '↑ sunrise'], [day.sunset, '↓ sunset']]) {
    s += `<line x1="${x(ms)}" y1="0" x2="${x(ms)}" y2="${H}" stroke="#c9a84c" stroke-width="1" opacity="0.8"/>`;
    s += `<text x="${x(ms) + 4}" y="${H - 6}" font-size="11" fill="#c9a84c">${label} ${fmtTime(ms)}</text>`;
  }

  // lane 1: planetary hours (shades of gold, glyphs)
  let y = TOP;
  for (const h of planetary) {
    const w = x(h.end) - x(h.start);
    const shade = 0.10 + 0.045 * (6 - ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'].indexOf(h.planet));
    s += `<rect x="${x(h.start)}" y="${y}" width="${w - 1}" height="${LANE_H}" fill="rgba(201,168,76,${shade.toFixed(3)})" stroke="rgba(201,168,76,0.3)" stroke-width="0.5"/>`;
    s += `<text x="${x(h.start) + w / 2}" y="${y + 20}" text-anchor="middle" font-size="18" fill="#e9e2d0" font-family="Georgia, serif">${h.glyph}</text>`;
    s += `<text x="${x(h.start) + w / 2}" y="${y + 36}" text-anchor="middle" font-size="10" fill="#9a927f">${h.planet} ${h.number}${h.isNight ? 'n' : 'd'}</text>`;
  }
  // lane 2: tattvas
  y += LANE_H + LANE_GAP;
  for (const t of tattva) {
    const w = x(t.end) - x(t.start);
    s += `<rect x="${x(t.start)}" y="${y}" width="${Math.max(0, w - 1)}" height="${LANE_H}" fill="${t.info.color}" opacity="0.85" stroke="${t.name === 'Akasha' ? t.info.ink : 'none'}" stroke-width="0.5"/>`;
    if (w > 30) s += `<text x="${x(t.start) + w / 2}" y="${y + 27}" text-anchor="middle" font-size="11" fill="${t.name === 'Prithvi' || t.name === 'Apas' ? '#111' : '#f3eee0'}">${t.name.slice(0, 2)}</text>`;
  }
  // lane 3: nadi (+ sushumna windows)
  y += LANE_H + LANE_GAP;
  const win = settings.sushumnaWindowMin * MIN;
  for (const n of nadi) {
    const w = x(n.end) - x(n.start);
    s += `<rect x="${x(n.start)}" y="${y}" width="${w - 1}" height="${LANE_H}" fill="${n.name === 'Ida' ? 'rgba(185,192,200,0.22)' : 'rgba(201,168,76,0.30)'}" stroke="rgba(201,168,76,0.25)" stroke-width="0.5"/>`;
    s += `<text x="${x(n.start) + w / 2}" y="${y + 20}" text-anchor="middle" font-size="13" fill="#e9e2d0" font-family="Georgia, serif">${n.name}</text>`;
    s += `<text x="${x(n.start) + w / 2}" y="${y + 36}" text-anchor="middle" font-size="10" fill="#9a927f">${sideFor(n.name)}</text>`;
    const wx = x(n.start + win) - x(n.start);
    s += `<rect x="${x(n.start) - wx}" y="${y}" width="${2 * wx}" height="${LANE_H}" fill="rgba(233,226,208,0.5)" opacity="0.5"/>`;
  }
  // lane labels
  for (const [i, name] of ['Planet', 'Tattva', 'Nadi'].entries()) {
    s += `<text x="4" y="${TOP + i * (LANE_H + LANE_GAP) + 10}" font-size="9" fill="#9a927f" letter-spacing="1">${name.toUpperCase()}</text>`;
  }
  // now marker
  const now = Date.now();
  if (now >= day.sunrise && now < day.nextSunrise) {
    s += `<line id="tl-now" x1="${x(now)}" y1="0" x2="${x(now)}" y2="${H}" stroke="#c9a84c" stroke-width="2"/>`;
  }
  // selection marker
  if (tlSelected !== null && tlSelected >= day.sunrise && tlSelected < day.nextSunrise) {
    s += `<line x1="${x(tlSelected)}" y1="0" x2="${x(tlSelected)}" y2="${H}" stroke="#e9e2d0" stroke-width="1" stroke-dasharray="3 3"/>`;
  }
  s += '</svg>';
  $('tl-strip').innerHTML = s;
  $('tl-strip').dataset.sunrise = day.sunrise;
  $('tl-strip').dataset.span = span;
  $('tl-strip').dataset.w = W;
  renderTimelineDetail();
}

function renderTimelineDetail() {
  const box = $('tl-detail');
  if (tlSelected === null) { box.innerHTML = '<div class="empty">Tap the strip to inspect a moment.</div>'; return; }
  const r = safeCompute(new Date(tlSelected));
  if (!r) { box.textContent = lastError; return; }
  const { planetary: p, tattva: t, nadi: n } = r;
  box.innerHTML = `
    <div class="when">${fmtDateTime(tlSelected)}</div>
    <div class="line"><span>Planetary hour</span><b>${p.glyph} ${p.planet} · ${p.isNight ? 'night' : 'day'} ${p.number} · ${fmtTime(p.hourStart)}–${fmtTime(p.hourEnd)}</b></div>
    <div class="line"><span>Tattva</span><b><span class="sym">${tattvaSymbol(t.sub, { title: false })}</span>${t.label} · ${fmtTime(t.subStart)}–${fmtTime(t.subEnd)}</b></div>
    <div class="line"><span>Nadi</span><b>${n.predicted}${n.predicted !== 'Sushumna' ? ` · ${sideFor(n.predicted)}` : ''} · switch ${fmtTime(n.slotEnd)}</b></div>
    <div class="line"><span>Tithi</span><b>${n.paksha} ${n.pakshaTithi} · ${n.tithiName}</b></div>`;
}

function scrollTimelineToNow() {
  const strip = $('tl-strip');
  const sunrise = +strip.dataset.sunrise, span = +strip.dataset.span, W = +strip.dataset.w;
  const now = Date.now();
  const sc = $('tl-scroll');
  if (now >= sunrise && now < sunrise + span) {
    sc.scrollLeft = Math.max(0, ((now - sunrise) / span) * W - sc.clientWidth / 2);
  } else {
    sc.scrollLeft = 0;
  }
}

$('tl-strip').addEventListener('click', (e) => {
  const strip = $('tl-strip');
  const rect = strip.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const sunrise = +strip.dataset.sunrise, span = +strip.dataset.span, W = +strip.dataset.w;
  tlSelected = sunrise + (px / W) * span;
  renderTimeline();
});
$('tl-prev').addEventListener('click', () => { tlOffsetDays--; tlSelected = null; renderTimeline(); $('tl-scroll').scrollLeft = 0; });
$('tl-next').addEventListener('click', () => { tlOffsetDays++; tlSelected = null; renderTimeline(); $('tl-scroll').scrollLeft = 0; });
$('tl-today').addEventListener('click', () => { tlOffsetDays = 0; tlSelected = Date.now(); renderTimeline(); scrollTimelineToNow(); });

// ───────────── LOG view ─────────────
const ACTUAL_TO_NADI = { LEFT: 'Ida', RIGHT: 'Pingala', BOTH: 'Sushumna' };

function addEntry(actual) {
  const r = safeCompute(new Date());
  if (!r) return;
  const { planetary: p, tattva: t, nadi: n } = r;
  const entry = {
    ts: r.now,
    iso: new Date(r.now).toISOString(),
    actual,
    actualNadi: ACTUAL_TO_NADI[actual],
    predicted: {
      nadi: n.predicted,
      scheduledNadi: n.scheduled,
      inSushumnaWindow: n.inSushumnaWindow,
      tithi: n.tithi,
      pakshaTithi: n.pakshaTithi,
      paksha: n.paksha,
      sunriseNadi: n.sunriseNadi,
      planet: p.planet,
      hourNumber: p.number,
      isNight: p.isNight,
      dayRuler: p.dayRuler,
      tattva: t.main,
      subTattva: t.sub,
    },
    settings: {
      lat: settings.lat, lon: settings.lon, tattvaOrder: settings.tattvaOrder,
      tattvaDurationMode: settings.tattvaDurationMode, subTattvaStart: settings.subTattvaStart,
      nadiSwitchMin: settings.nadiSwitchMin, sushumnaWindowMin: settings.sushumnaWindowMin,
    },
  };
  log.push(entry);
  saveLog(log);
  const match = entry.actualNadi === n.predicted;
  $('log-feedback').textContent = `${fmtTime(r.now)} · body ${actual} · predicted ${n.predicted} ${match ? '✓ match' : '✗'}`;
  renderLog();
}

function isMatch(e) { return e.actualNadi === e.predicted.nadi; }
function isSideMatch(e) {
  // ignore the Sushumna window: compare left/right against the scheduled side
  if (e.actual === 'BOTH') return e.predicted.nadi === 'Sushumna';
  return e.actualNadi === e.predicted.scheduledNadi;
}

function rate(entries, fn) {
  if (!entries.length) return null;
  return entries.filter(fn).length / entries.length;
}

function statRow(key, entries, fn = isMatch) {
  const r = rate(entries, fn);
  const pct = r === null ? '—' : `${Math.round(r * 100)}%`;
  return `<div class="stat-row"><span class="key">${key}</span><span class="bar"><i style="width:${r === null ? 0 : r * 100}%"></i></span><span class="pct">${pct}</span><span class="n">n=${entries.length}</span></div>`;
}

function timeOfDayBucket(ts) {
  const h = new Date(ts).getHours();
  if (h < 6) return 'Night 0–6';
  if (h < 12) return 'Morning 6–12';
  if (h < 18) return 'Afternoon 12–18';
  return 'Evening 18–24';
}

function renderLog() {
  const statsEl = $('stats');
  if (!log.length) {
    statsEl.innerHTML = '<div class="empty">No entries yet.</div>';
    $('entries').innerHTML = '<div class="empty">Tap LEFT, RIGHT or BOTH above when you have checked your breath.</div>';
    return;
  }
  let html = statRow('Overall', log);
  html += statRow('Side only', log, isSideMatch);
  html += '<h3>By time of day</h3>';
  for (const b of ['Morning 6–12', 'Afternoon 12–18', 'Evening 18–24', 'Night 0–6']) {
    const es = log.filter((e) => timeOfDayBucket(e.ts) === b);
    if (es.length) html += statRow(b, es);
  }
  html += '<h3>By tithi</h3>';
  for (const paksha of ['Shukla', 'Krishna']) {
    for (let t = 1; t <= 15; t++) {
      const es = log.filter((e) => e.predicted.paksha === paksha && e.predicted.pakshaTithi === t);
      if (es.length) html += statRow(`${paksha} ${t}`, es);
    }
  }
  html += '<h3>By predicted nadi</h3>';
  for (const nd of ['Ida', 'Pingala', 'Sushumna']) {
    const es = log.filter((e) => e.predicted.nadi === nd);
    if (es.length) html += statRow(nd, es);
  }
  statsEl.innerHTML = html;

  const recent = [...log].sort((a, b) => b.ts - a.ts).slice(0, 40);
  $('entries').innerHTML = recent.map((e) => `
    <div class="entry">
      <span class="when">${fmtDateTime(e.ts)}</span>
      <span>${e.actual}</span>
      <span class="${isMatch(e) ? 'ok' : 'bad'}">${e.predicted.nadi} ${isMatch(e) ? '✓' : '✗'}</span>
      <button class="del" data-ts="${e.ts}" aria-label="Delete entry">×</button>
    </div>`).join('');
}

$('entries').addEventListener('click', (e) => {
  const btn = e.target.closest('.del');
  if (!btn) return;
  const ts = +btn.dataset.ts;
  log = log.filter((x) => x.ts !== ts);
  saveLog(log);
  renderLog();
});

document.querySelectorAll('.log-btn').forEach((b) => b.addEventListener('click', () => addEntry(b.dataset.actual)));

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

$('export-csv').addEventListener('click', () => {
  const cols = [
    ['timestamp_iso', (e) => e.iso],
    ['local_time', (e) => new Date(e.ts).toLocaleString()],
    ['actual', (e) => e.actual],
    ['actual_nadi', (e) => e.actualNadi],
    ['predicted_nadi', (e) => e.predicted.nadi],
    ['scheduled_nadi', (e) => e.predicted.scheduledNadi],
    ['in_sushumna_window', (e) => e.predicted.inSushumnaWindow],
    ['match', (e) => isMatch(e)],
    ['side_match', (e) => isSideMatch(e)],
    ['tithi', (e) => e.predicted.tithi],
    ['paksha', (e) => e.predicted.paksha],
    ['paksha_tithi', (e) => e.predicted.pakshaTithi],
    ['sunrise_nadi', (e) => e.predicted.sunriseNadi],
    ['planet', (e) => e.predicted.planet],
    ['planet_hour', (e) => e.predicted.hourNumber],
    ['is_night', (e) => e.predicted.isNight],
    ['day_ruler', (e) => e.predicted.dayRuler],
    ['tattva', (e) => e.predicted.tattva],
    ['sub_tattva', (e) => e.predicted.subTattva],
    ['lat', (e) => e.settings?.lat],
    ['lon', (e) => e.settings?.lon],
    ['tattva_order', (e) => e.settings?.tattvaOrder],
    ['duration_mode', (e) => e.settings?.tattvaDurationMode],
    ['sub_tattva_start', (e) => e.settings?.subTattvaStart],
    ['nadi_switch_min', (e) => e.settings?.nadiSwitchMin],
    ['sushumna_window_min', (e) => e.settings?.sushumnaWindowMin],
  ];
  const lines = [cols.map((c) => c[0]).join(',')];
  for (const e of [...log].sort((a, b) => a.ts - b.ts)) lines.push(cols.map((c) => csvEscape(c[1](e))).join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tattva-tide-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
});

$('clear-log').addEventListener('click', () => {
  if (!log.length) return;
  if (confirm(`Delete all ${log.length} log entries? Export first if you want to keep them.`)) {
    log = [];
    saveLog(log);
    renderLog();
  }
});

// ───────────── SETTINGS view ─────────────
const form = $('settings-form');

function fillSettingsForm() {
  for (const el of form.elements) {
    if (!el.name || !(el.name in settings)) continue;
    el.value = settings[el.name];
  }
  renderPrasadNote();
}

function renderPrasadNote() {
  const el = $('prasad-note');
  const m = PRASAD_DURATIONS.minutes;
  const sum = Object.values(m).reduce((a, b) => a + b, 0);
  const list = Object.entries(m).map(([k, v]) => `${k} ${v}`).join(' · ');
  if (form.elements.tattvaDurationMode.value === 'prasad') {
    el.className = 'note warn';
    el.innerHTML = `<b>Unverified.</b> ${PRASAD_DURATIONS.sourceNote}<br>Minutes: ${list} (cycle ${sum} min). Edit <code>PRASAD_DURATIONS</code> in <code>clocks.js</code>.`;
  } else {
    el.className = 'note';
    el.textContent = 'Golden Dawn mode: five equal tattvas of 24 minutes, a 2-hour cycle from sunrise.';
  }
}
form.elements.tattvaDurationMode.addEventListener('change', renderPrasadNote);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const next = { ...settings };
  for (const [k, v] of fd.entries()) {
    if (k in DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS[k] === 'number') {
      const num = parseFloat(v);
      if (!Number.isFinite(num)) continue;
      next[k] = num;
    } else {
      next[k] = v;
    }
  }
  next.lat = Math.max(-89.9, Math.min(89.9, next.lat));
  next.lon = Math.max(-180, Math.min(180, next.lon));
  settings = next;
  saveSettings(settings);
  ringCache.key = null;
  $('settings-status').textContent = 'Saved.';
  setTimeout(() => { $('settings-status').textContent = ''; }, 1500);
  renderNow();
});

$('reset-settings').addEventListener('click', () => {
  settings = { ...DEFAULT_SETTINGS };
  saveSettings(settings);
  fillSettingsForm();
  ringCache.key = null;
  renderNow();
  $('settings-status').textContent = 'Defaults restored (Los Angeles).';
});

function geolocate(silent = false) {
  const status = $('geo-status');
  if (!navigator.geolocation) { if (!silent) status.textContent = 'Geolocation not available.'; return; }
  if (!silent) status.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      settings = {
        ...settings,
        lat: +pos.coords.latitude.toFixed(4),
        lon: +pos.coords.longitude.toFixed(4),
        locationName: 'My location',
      };
      saveSettings(settings);
      fillSettingsForm();
      renderNow();
      status.textContent = `Set to ${settings.lat}, ${settings.lon}.`;
    },
    (err) => { if (!silent) status.textContent = `Could not locate (${err.message}). Enter lat/long below.`; },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
  );
}
$('geo-btn').addEventListener('click', () => geolocate(false));

// ───────────── HELP view ─────────────
function renderHelp() {
  $('tattva-key').innerHTML = Object.values(TATTVAS).map((t) =>
    `<li>${tattvaSymbol(t.name)}<span><b>${t.name}</b> <span class="el">· ${t.element} · ${describeShape(t)}</span></span></li>`).join('');
}
function describeShape(t) {
  return { egg: 'black/indigo egg', circle: 'blue circle', triangle: 'red triangle', square: 'yellow square', crescent: 'silver crescent' }[t.shape];
}

// ───────────── navigation & tick ─────────────
function showView(name) {
  view = name;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== name));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'now') renderNow();
  if (name === 'timeline') { renderTimeline(); requestAnimationFrame(scrollTimelineToNow); }
  if (name === 'log') renderLog();
  if (name === 'settings') fillSettingsForm();
  try { localStorage.setItem('tattva-tide:view', name); } catch { /* ignore */ }
}
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (b) showView(b.dataset.view);
});

let tlLastNowUpdate = 0;
function tick() {
  if (document.hidden) return;
  if (view === 'now') renderNow();
  else if (view === 'timeline' && Date.now() - tlLastNowUpdate > 30_000) {
    tlLastNowUpdate = Date.now();
    const strip = $('tl-strip');
    const line = document.getElementById('tl-now');
    if (line && strip.dataset.sunrise) {
      const xNow = ((Date.now() - +strip.dataset.sunrise) / +strip.dataset.span) * +strip.dataset.w;
      line.setAttribute('x1', xNow); line.setAttribute('x2', xNow);
    }
  }
}
setInterval(tick, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

// ───────────── boot ─────────────
renderHelp();
fillSettingsForm();
renderNow();
renderLog();
showView((() => { try { return localStorage.getItem('tattva-tide:view') || 'now'; } catch { return 'now'; } })());
if (settings._fresh) geolocate(true); // first run: try to replace Los Angeles with the real location, quietly

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
