// clocks.js — all the time math for TATTVA TIDE. Pure: no DOM, no storage, no timers.
// Given a Date, a lat/lon and a settings object, `computeAll()` returns every value
// the UI shows. Everything is anchored to the most recent local SUNRISE, because the
// astrological day runs sunrise → sunrise (before today's sunrise, yesterday's is used).

import SunCalc from './vendor/suncalc.js';

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

// ───────────────────────────── settings ─────────────────────────────

export const DEFAULT_SETTINGS = Object.freeze({
  lat: 34.05,          // Los Angeles
  lon: -118.24,
  locationName: 'Los Angeles',
  // (a) Order toggle. 'prithvi-apas' = Akasha→Vayu→Tejas→Prithvi→Apas (Golden Dawn / Regardie)
  //     'apas-prithvi' = Akasha→Vayu→Tejas→Apas→Prithvi (the other common ordering)
  tattvaOrder: 'prithvi-apas',
  // (b) Duration mode. 'equal' = Golden Dawn 24 min each (2 h cycle). 'prasad' = unequal, see PRASAD_DURATIONS.
  tattvaDurationMode: 'equal',
  // Which sub-tattva opens each tattva. 'own' = the tattva's own sub-tattva first (Vayu of Vayu, Tejas of Vayu, …).
  // 'akasha' = sub-tattvas always run from Akasha (Akasha of Vayu, Vayu of Vayu, …). Sources disagree.
  subTattvaStart: 'own',
  // Swara: dominant nostril switches every N minutes from sunrise (2.5 ghatikas = 60 min).
  nadiSwitchMin: 60,
  // Sushumna window: ± this many minutes around each switch.
  sushumnaWindowMin: 4,
});

// ───────────────────────────── planets ─────────────────────────────

// Chaldean order, slowest to fastest.
export const CHALDEAN = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'];
// Ruler of each weekday, indexed by JS getDay(): 0 = Sunday.
export const DAY_RULERS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
export const PLANET_GLYPHS = {
  Saturn: '♄', Jupiter: '♃', Mars: '♂', Sun: '☉', Venus: '♀', Mercury: '☿', Moon: '☽',
};
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ───────────────────────────── tattvas ─────────────────────────────

export const TATTVAS = {
  Akasha:  { name: 'Akasha',  element: 'Spirit', shape: 'egg',      color: '#2b1d5e', ink: '#8b7cc9' },
  Vayu:    { name: 'Vayu',    element: 'Air',    shape: 'circle',   color: '#1f5fd9', ink: '#5b8dff' },
  Tejas:   { name: 'Tejas',   element: 'Fire',   shape: 'triangle', color: '#d0222a', ink: '#ff5a5f' },
  Prithvi: { name: 'Prithvi', element: 'Earth',  shape: 'square',   color: '#e8c21a', ink: '#ffd84a' },
  Apas:    { name: 'Apas',    element: 'Water',  shape: 'crescent', color: '#b9c0c8', ink: '#e6ebf0' },
};

export function tattvaOrder(settings = DEFAULT_SETTINGS) {
  return settings.tattvaOrder === 'apas-prithvi'
    ? ['Akasha', 'Vayu', 'Tejas', 'Apas', 'Prithvi']
    : ['Akasha', 'Vayu', 'Tejas', 'Prithvi', 'Apas'];
}

// Golden Dawn: five equal tattvas of 24 min → one 2-hour cycle.
export const EQUAL_DURATIONS = Object.freeze({
  Akasha: 24, Vayu: 24, Tejas: 24, Prithvi: 24, Apas: 24,
});

// ⚠️  UNVERIFIED — CHECK AGAINST THE SOURCE BEFORE TRUSTING.
// "Rama Prasad unequal" mode. The figures below are NOT taken directly from Prasad's
// *Nature's Finer Forces*. They are the Shiva Swarodaya breath-tattva proportions
// (Prithvi 50 : Apas 40 : Tejas 30 : Vayu 20 : Akasha 10 palas, 1 pala = 24 s, total
// 150 palas = 60 min) which Prasad quotes in his Swarodaya chapters. Whether Prasad applies
// these same durations to the *day* tattvic tide (vs. only to the breath) must be confirmed.
// Edit `minutes` freely; the cycle length becomes their sum (here 60 min, not 120).
export const PRASAD_DURATIONS = {
  verified: false,
  sourceNote: 'Derived from Shiva Swarodaya pala proportions as quoted by Prasad; not confirmed against Nature’s Finer Forces.',
  minutes: { Prithvi: 20, Apas: 16, Tejas: 12, Vayu: 8, Akasha: 4 },
};

export function tattvaDurations(settings = DEFAULT_SETTINGS) {
  return settings.tattvaDurationMode === 'prasad' ? PRASAD_DURATIONS.minutes : EQUAL_DURATIONS;
}

// ───────────────────────────── sun anchors ─────────────────────────────

function timesFor(dateMs, lat, lon) {
  return SunCalc.getTimes(new Date(dateMs), lat, lon);
}

/**
 * The astrological day containing `date`: the latest sunrise ≤ date, the sunset that
 * follows it, and the next sunrise. Robust to timezone because it only compares instants.
 */
export function solarDay(date, lat, lon) {
  const now = +date;
  const candidates = [];
  for (let k = -2; k <= 2; k++) {
    const t = timesFor(now + k * DAY, lat, lon);
    if (t.sunrise && !isNaN(+t.sunrise)) candidates.push(+t.sunrise);
  }
  const rises = [...new Set(candidates)].sort((a, b) => a - b);
  const sunrise = rises.filter((r) => r <= now).at(-1);
  const nextSunrise = rises.find((r) => r > now);
  if (sunrise === undefined || nextSunrise === undefined) {
    throw new Error('No sunrise found near this date/location (polar day or night?)');
  }
  // Sunset: first sunset strictly after this sunrise.
  let sunset;
  for (let k = -1; k <= 2 && sunset === undefined; k++) {
    const t = timesFor(sunrise + k * DAY, lat, lon);
    const s = +t.sunset;
    if (!isNaN(s) && s > sunrise && s < nextSunrise) sunset = s;
  }
  if (sunset === undefined) throw new Error('No sunset found for this solar day');
  return { sunrise, sunset, nextSunrise };
}

/**
 * Weekday (0 = Sunday) of the instant `ms` in *local solar time* at longitude `lon`.
 * Timezone-independent: sunrise is never near local-solar midnight outside the poles.
 */
export function solarWeekday(ms, lon) {
  const localSolarMs = ms + lon * 240_000; // 15° per hour → 1° = 4 min = 240 000 ms
  const dayIndex = Math.floor(localSolarMs / DAY);
  return (((dayIndex + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday (4)
}

// ───────────────────────────── 1. planetary hours ─────────────────────────────

export function planetaryHour(date, day, lon) {
  const now = +date;
  const { sunrise, sunset, nextSunrise } = day;
  const weekday = solarWeekday(sunrise, lon);
  const dayRuler = DAY_RULERS[weekday];
  const startIdx = CHALDEAN.indexOf(dayRuler);

  const dayLen = (sunset - sunrise) / 12;
  const nightLen = (nextSunrise - sunset) / 12;
  const isNight = now >= sunset;
  let index; // 0..23 from sunrise
  let hourStart;
  let hourLen;
  if (!isNight) {
    index = Math.min(11, Math.floor((now - sunrise) / dayLen));
    hourStart = sunrise + index * dayLen;
    hourLen = dayLen;
  } else {
    index = 12 + Math.min(11, Math.floor((now - sunset) / nightLen));
    hourStart = sunset + (index - 12) * nightLen;
    hourLen = nightLen;
  }
  const planet = CHALDEAN[(startIdx + index) % 7];
  const nextPlanet = CHALDEAN[(startIdx + index + 1) % 7];
  return {
    weekday,
    weekdayName: WEEKDAYS[weekday],
    dayRuler,
    planet,
    glyph: PLANET_GLYPHS[planet],
    nextPlanet,
    nextGlyph: PLANET_GLYPHS[nextPlanet],
    index,                              // 0..23
    number: (index % 12) + 1,           // 1..12
    isNight,
    hourStart,
    hourEnd: hourStart + hourLen,
    hourLengthMs: hourLen,
    msLeft: hourStart + hourLen - now,
    dayHourMs: dayLen,
    nightHourMs: nightLen,
  };
}

/** All 24 planetary hours of the solar day, for the timeline. */
export function planetaryHourTable(day, lon) {
  const { sunrise, sunset, nextSunrise } = day;
  const weekday = solarWeekday(sunrise, lon);
  const startIdx = CHALDEAN.indexOf(DAY_RULERS[weekday]);
  const dayLen = (sunset - sunrise) / 12;
  const nightLen = (nextSunrise - sunset) / 12;
  const rows = [];
  for (let i = 0; i < 24; i++) {
    const isNight = i >= 12;
    const start = isNight ? sunset + (i - 12) * nightLen : sunrise + i * dayLen;
    const len = isNight ? nightLen : dayLen;
    const planet = CHALDEAN[(startIdx + i) % 7];
    rows.push({ index: i, number: (i % 12) + 1, isNight, start, end: start + len, planet, glyph: PLANET_GLYPHS[planet] });
  }
  return rows;
}

// ───────────────────────────── 2. tattva tides ─────────────────────────────

/** Cycle length in ms for the current duration mode. */
export function tattvaCycleMs(settings = DEFAULT_SETTINGS) {
  const d = tattvaDurations(settings);
  return tattvaOrder(settings).reduce((sum, t) => sum + d[t] * MIN, 0);
}

/**
 * Tattva + sub-tattva at `date`, measured from the solar day's sunrise.
 * Akasha always opens at sunrise; cycles repeat through day and night.
 */
export function tattva(date, day, settings = DEFAULT_SETTINGS) {
  const now = +date;
  const order = tattvaOrder(settings);
  const durations = tattvaDurations(settings);
  const cycleMs = tattvaCycleMs(settings);
  const elapsed = now - day.sunrise;
  const cycleIndex = Math.floor(elapsed / cycleMs);
  const cycleStart = day.sunrise + cycleIndex * cycleMs;
  let t = elapsed - cycleIndex * cycleMs; // position within the cycle

  // main tattva
  let mainIdx = 0;
  let mainStart = cycleStart;
  for (let i = 0; i < order.length; i++) {
    const len = durations[order[i]] * MIN;
    if (t < len || i === order.length - 1) { mainIdx = i; break; }
    t -= len;
    mainStart += len;
  }
  const main = order[mainIdx];
  const mainLen = durations[main] * MIN;
  const mainEnd = mainStart + mainLen;

  // sub-tattva: five equal slices of the main tattva
  const subLen = mainLen / 5;
  const subIdx = Math.min(4, Math.floor((now - mainStart) / subLen));
  const subOrderStart = settings.subTattvaStart === 'akasha' ? 0 : mainIdx;
  const sub = order[(subOrderStart + subIdx) % 5];
  const subStart = mainStart + subIdx * subLen;
  const subEnd = subStart + subLen;

  const nextMain = order[(mainIdx + 1) % 5];
  const nextSub = order[(subOrderStart + subIdx + 1) % 5];

  return {
    main, sub,
    label: `${sub} of ${main}`,
    mainInfo: TATTVAS[main], subInfo: TATTVAS[sub],
    mainStart, mainEnd, subStart, subEnd,
    msLeftMain: mainEnd - now,
    msLeftSub: subEnd - now,
    nextMain, nextSub,
    cycleStart, cycleMs,
    cycleFraction: (now - cycleStart) / cycleMs, // 0..1 position on the ring
    order, durations,
  };
}

/** Segments of one cycle (fractions of the ring) for drawing. */
export function tattvaRingSegments(settings = DEFAULT_SETTINGS) {
  const order = tattvaOrder(settings);
  const d = tattvaDurations(settings);
  const total = tattvaCycleMs(settings) / MIN;
  let acc = 0;
  return order.map((name) => {
    const start = acc / total;
    acc += d[name];
    return { name, start, end: acc / total, info: TATTVAS[name] };
  });
}

/** All main-tattva periods across the solar day, for the timeline. */
export function tattvaTable(day, settings = DEFAULT_SETTINGS) {
  const order = tattvaOrder(settings);
  const d = tattvaDurations(settings);
  const rows = [];
  let t = day.sunrise;
  while (t < day.nextSunrise) {
    for (const name of order) {
      const len = d[name] * MIN;
      if (t >= day.nextSunrise) break;
      rows.push({ name, start: t, end: Math.min(t + len, day.nextSunrise), info: TATTVAS[name] });
      t += len;
    }
  }
  return rows;
}

// ───────────────────────────── 3. swara / nadi ─────────────────────────────

/**
 * Tithi (1–30) from the Moon–Sun elongation. SunCalc's `phase` is 0 at new moon,
 * 0.5 at full, 1 at the next new; each tithi is 1/30 of that.
 */
export function tithiAt(date) {
  const { phase } = SunCalc.getMoonIllumination(new Date(date));
  return tithiFromPhase(phase);
}

export function tithiFromPhase(phase) {
  const p = ((phase % 1) + 1) % 1;
  const tithi = Math.min(30, Math.floor(p * 30) + 1); // 1..30
  const waxing = tithi <= 15;
  return {
    tithi,
    pakshaTithi: waxing ? tithi : tithi - 15, // 1..15 within the fortnight
    paksha: waxing ? 'Shukla' : 'Krishna',
    waxing,
    phase: p,
  };
}

export const TITHI_NAMES = ['Pratipada', 'Dvitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dvadashi', 'Trayodashi', 'Chaturdashi'];
export function tithiName(info) {
  if (info.pakshaTithi === 15) return info.waxing ? 'Purnima' : 'Amavasya';
  return TITHI_NAMES[info.pakshaTithi - 1];
}

/**
 * Which nadi opens the day at sunrise (Shiva Swarodaya):
 * waxing fortnight → tithis 1–3 Ida, 4–6 Pingala, 7–9 Ida, 10–12 Pingala, 13–15 Ida.
 * waning fortnight → the same pattern starting with Pingala.
 */
export function sunriseNadiForTithi(pakshaTithi, waxing) {
  const block = Math.floor((pakshaTithi - 1) / 3); // 0..4
  const idaFirst = waxing;
  const isIda = (block % 2 === 0) === idaFirst;
  return isIda ? 'Ida' : 'Pingala';
}

export const NADI_INFO = {
  Ida:      { side: 'LEFT',  nostril: 'left',  quality: 'lunar, cool, receptive' },
  Pingala:  { side: 'RIGHT', nostril: 'right', quality: 'solar, hot, active' },
  Sushumna: { side: 'BOTH',  nostril: 'both',  quality: 'central, still, liminal' },
};

export function nadi(date, day, settings = DEFAULT_SETTINGS) {
  const now = +date;
  const tithiInfo = tithiAt(day.sunrise); // the tithi *at sunrise* defines the day
  const sunriseNadi = sunriseNadiForTithi(tithiInfo.pakshaTithi, tithiInfo.waxing);
  const other = sunriseNadi === 'Ida' ? 'Pingala' : 'Ida';
  const switchMs = settings.nadiSwitchMin * MIN;
  const windowMs = settings.sushumnaWindowMin * MIN;

  const elapsed = now - day.sunrise;
  const slot = Math.floor(elapsed / switchMs);
  const slotStart = day.sunrise + slot * switchMs;
  const slotEnd = slotStart + switchMs;
  const scheduled = slot % 2 === 0 ? sunriseNadi : other;

  // nearest switch point (slot boundaries, including sunrise itself)
  const distToPrev = now - slotStart;
  const distToNext = slotEnd - now;
  const inWindow = distToPrev < windowMs || distToNext <= windowMs;
  const predicted = inWindow ? 'Sushumna' : scheduled;
  // the window around the nearer switch ends at (switch + windowMs)
  const windowEnd = distToPrev < windowMs ? slotStart + windowMs : slotEnd + windowMs;

  return {
    predicted,
    scheduled,          // what it would be ignoring the Sushumna window
    sunriseNadi,
    nextScheduled: slot % 2 === 0 ? other : sunriseNadi,
    info: NADI_INFO[predicted],
    inSushumnaWindow: inWindow,
    slot, slotStart, slotEnd,
    msToSwitch: slotEnd - now,
    msToWindowEnd: inWindow ? windowEnd - now : 0,
    msUntilWindow: Math.max(0, slotEnd - windowMs - now),
    tithi: tithiInfo.tithi,
    pakshaTithi: tithiInfo.pakshaTithi,
    paksha: tithiInfo.paksha,
    waxing: tithiInfo.waxing,
    tithiName: tithiName(tithiInfo),
    moonPhase: tithiInfo.phase,
  };
}

/** Nadi slots across the solar day, for the timeline. */
export function nadiTable(day, settings = DEFAULT_SETTINGS) {
  const tithiInfo = tithiAt(day.sunrise);
  const first = sunriseNadiForTithi(tithiInfo.pakshaTithi, tithiInfo.waxing);
  const other = first === 'Ida' ? 'Pingala' : 'Ida';
  const switchMs = settings.nadiSwitchMin * MIN;
  const rows = [];
  let t = day.sunrise;
  let i = 0;
  while (t < day.nextSunrise) {
    rows.push({ name: i % 2 === 0 ? first : other, start: t, end: Math.min(t + switchMs, day.nextSunrise) });
    t += switchMs;
    i++;
  }
  return rows;
}

// ───────────────────────────── everything ─────────────────────────────

export function computeAll(date = new Date(), settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const day = solarDay(date, s.lat, s.lon);
  return {
    now: +date,
    day,
    planetary: planetaryHour(date, day, s.lon),
    tattva: tattva(date, day, s),
    nadi: nadi(date, day, s),
    settings: s,
  };
}

/** Timeline helper: the three lane tables for the solar day containing `date`. */
export function dayTables(date, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const day = solarDay(date, s.lat, s.lon);
  return {
    day,
    planetary: planetaryHourTable(day, s.lon),
    tattva: tattvaTable(day, s),
    nadi: nadiTable(day, s),
  };
}

/** Format ms as h:mm:ss or m:ss. */
export function fmtCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
