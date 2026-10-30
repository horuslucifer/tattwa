import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAll, solarDay, planetaryHour, tattva, nadi,
  sunriseNadiForTithi, tithiFromPhase, solarWeekday,
  DEFAULT_SETTINGS, MIN, HOUR, CHALDEAN, PRASAD_DURATIONS,
} from '../clocks.js';

// Los Angeles, the default location.
const LA = { lat: 34.05, lon: -118.24 };
const S = { ...DEFAULT_SETTINGS, ...LA };

/** Sunrise (ms) of the solar day that contains local noon of `isoLocalDate` in LA. */
function sunriseOf(isoLocalDate) {
  // Noon Pacific is always after sunrise and before sunset.
  const noon = new Date(`${isoLocalDate}T12:00:00-07:00`);
  return solarDay(noon, LA.lat, LA.lon);
}

// ───────────── solar day anchoring ─────────────

test('solarDay: sunrise ≤ now < nextSunrise, and sunset between them', () => {
  const now = new Date('2026-10-30T15:00:00-07:00');
  const d = solarDay(now, LA.lat, LA.lon);
  assert.ok(d.sunrise <= +now);
  assert.ok(d.nextSunrise > +now);
  assert.ok(d.sunset > d.sunrise && d.sunset < d.nextSunrise);
  // LA sunrise on 2026-10-30 is ~07:11 PDT (14:11 UTC)
  assert.equal(new Date(d.sunrise).toISOString().slice(0, 16), '2026-10-30T14:11');
});

test('before sunrise belongs to the previous solar day', () => {
  // Monday 2026-10-26 at 03:00 PDT, i.e. before Monday's sunrise.
  const early = new Date('2026-10-26T03:00:00-07:00');
  const d = solarDay(early, LA.lat, LA.lon);
  // Its sunrise is Sunday's (Oct 25, 14:07Z-ish).
  assert.equal(new Date(d.sunrise).toISOString().slice(0, 10), '2026-10-25');
  const r = computeAll(early, S);
  assert.equal(r.planetary.weekdayName, 'Sunday');
  assert.equal(r.planetary.dayRuler, 'Sun');
  assert.equal(r.planetary.isNight, true);
  // Tattva and nadi are also counted from Sunday's sunrise, not midnight:
  assert.equal(r.tattva.cycleStart >= d.sunrise, true);
  assert.equal(r.nadi.slotStart >= d.sunrise, true);
});

test('solarWeekday is timezone independent', () => {
  // 2026-10-25 14:07Z (Sunday, LA sunrise) → Sunday (0) at lon -118.24
  assert.equal(solarWeekday(+new Date('2026-10-25T14:07:00Z'), -118.24), 0);
  // Same instant but it is already Monday in UTC+12 — still Sunday by solar time in LA
  assert.equal(solarWeekday(+new Date('2026-10-26T00:30:00Z'), -118.24), 0);
  // In Tokyo (lon 139.7) sunrise 2026-10-26 ~ 20:55Z on the 25th UTC → Monday (1)
  assert.equal(solarWeekday(+new Date('2026-10-25T20:55:00Z'), 139.7), 1);
});

// ───────────── 1. planetary hours ─────────────

test('planetary hours: Sunday first hour = Sun, then Venus, Mercury, Moon, Saturn…', () => {
  const d = sunriseOf('2026-10-25'); // Sunday
  const seq = [];
  for (let i = 0; i < 7; i++) {
    const at = new Date(d.sunrise + i * ((d.sunset - d.sunrise) / 12) + 1000);
    seq.push(planetaryHour(at, d, LA.lon).planet);
  }
  assert.deepEqual(seq, ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars']);
});

test('planetary hours: each weekday ruler opens its own day', () => {
  const days = {
    '2026-10-25': 'Sun', '2026-10-26': 'Moon', '2026-10-27': 'Mars', '2026-10-28': 'Mercury',
    '2026-10-29': 'Jupiter', '2026-10-30': 'Venus', '2026-10-31': 'Saturn',
  };
  for (const [date, ruler] of Object.entries(days)) {
    const d = sunriseOf(date);
    const p = planetaryHour(new Date(d.sunrise + 1000), d, LA.lon);
    assert.equal(p.planet, ruler, date);
    assert.equal(p.number, 1);
    assert.equal(p.isNight, false);
  }
});

test('planetary hours: Sunday night hour 1 = Jupiter, Saturday night hour 1 = Mercury', () => {
  const sun = sunriseOf('2026-10-25');
  const p1 = planetaryHour(new Date(sun.sunset + 1000), sun, LA.lon);
  assert.equal(p1.isNight, true);
  assert.equal(p1.number, 1);
  assert.equal(p1.planet, 'Jupiter');
  const sat = sunriseOf('2026-10-31');
  const p2 = planetaryHour(new Date(sat.sunset + 1000), sat, LA.lon);
  assert.equal(p2.planet, 'Mercury');
  // last night hour of Saturday hands over to Sunday's Sun
  const p3 = planetaryHour(new Date(sat.nextSunrise - 1000), sat, LA.lon);
  assert.equal(p3.number, 12);
  assert.equal(p3.nextPlanet, 'Sun');
});

test('planetary hours: 24 hours tile the solar day exactly and the Chaldean chain is unbroken', () => {
  const d = sunriseOf('2026-10-30');
  let prev = null;
  for (let i = 0; i < 24; i++) {
    const len = i < 12 ? (d.sunset - d.sunrise) / 12 : (d.nextSunrise - d.sunset) / 12;
    const start = i < 12 ? d.sunrise + i * len : d.sunset + (i - 12) * len;
    const p = planetaryHour(new Date(start + 500), d, LA.lon);
    assert.equal(p.index, i);
    if (prev) assert.equal(CHALDEAN[(CHALDEAN.indexOf(prev) + 1) % 7], p.planet);
    prev = p.planet;
  }
});

// ───────────── 2. tattva tides ─────────────

test('tattva at sunrise = Akasha / Akasha of Akasha', () => {
  const d = sunriseOf('2026-10-30');
  const t = tattva(new Date(d.sunrise), d, S);
  assert.equal(t.main, 'Akasha');
  assert.equal(t.sub, 'Akasha');
  assert.equal(t.label, 'Akasha of Akasha');
  assert.equal(t.msLeftMain, 24 * MIN);
  assert.equal(t.msLeftSub, 4.8 * MIN);
});

test('tattva at sunrise + 25 min = Vayu, sub Vayu of Vayu (subTattvaStart: own)', () => {
  const d = sunriseOf('2026-10-30');
  const t = tattva(new Date(d.sunrise + 25 * MIN), d, S);
  assert.equal(t.main, 'Vayu');
  assert.equal(t.label, 'Vayu of Vayu');
});

test('tattva at sunrise + 30 min: Vayu; sub depends on subTattvaStart setting', () => {
  const d = sunriseOf('2026-10-30');
  const at = new Date(d.sunrise + 30 * MIN);
  // "own" (spec text): Vayu runs 24–48; its subs start with Vayu: 24–28.8 Vayu, 28.8–33.6 Tejas
  const own = tattva(at, d, { ...S, subTattvaStart: 'own' });
  assert.equal(own.main, 'Vayu');
  assert.equal(own.label, 'Tejas of Vayu');
  // "akasha" (spec test case): subs always run Akasha→…: 24–28.8 Akasha, 28.8–33.6 Vayu
  const ak = tattva(at, d, { ...S, subTattvaStart: 'akasha' });
  assert.equal(ak.main, 'Vayu');
  assert.equal(ak.label, 'Vayu of Vayu');
});

test('tattva: the 2-hour cycle repeats; order toggle swaps the last two', () => {
  const d = sunriseOf('2026-10-30');
  const seq = (settings) => [0, 24, 48, 72, 96, 120].map((m) => tattva(new Date(d.sunrise + m * MIN + 1000), d, settings).main);
  assert.deepEqual(seq(S), ['Akasha', 'Vayu', 'Tejas', 'Prithvi', 'Apas', 'Akasha']);
  assert.deepEqual(seq({ ...S, tattvaOrder: 'apas-prithvi' }), ['Akasha', 'Vayu', 'Tejas', 'Apas', 'Prithvi', 'Akasha']);
  const t = tattva(new Date(d.sunrise + 2 * HOUR + 10 * MIN), d, S);
  assert.equal(t.main, 'Akasha');
  assert.equal(t.cycleStart, d.sunrise + 2 * HOUR);
  assert.ok(Math.abs(t.cycleFraction - 10 / 120) < 1e-9);
});

test('tattva: Prasad mode uses the editable config and is flagged unverified', () => {
  assert.equal(PRASAD_DURATIONS.verified, false);
  const d = sunriseOf('2026-10-30');
  const s = { ...S, tattvaDurationMode: 'prasad' };
  const m = PRASAD_DURATIONS.minutes;
  const t0 = tattva(new Date(d.sunrise), d, s);
  assert.equal(t0.main, 'Akasha');
  assert.equal(t0.msLeftMain, m.Akasha * MIN);
  const t1 = tattva(new Date(d.sunrise + m.Akasha * MIN + 1000), d, s);
  assert.equal(t1.main, 'Vayu');
  const total = Object.values(m).reduce((a, b) => a + b, 0);
  assert.equal(t0.cycleMs, total * MIN);
});

// ───────────── 3. swara / nadi ─────────────

test('tithi → sunrise nadi mapping (Shiva Swarodaya 3-tithi blocks)', () => {
  const waxing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((t) => sunriseNadiForTithi(t, true));
  assert.deepEqual(waxing, [
    'Ida', 'Ida', 'Ida', 'Pingala', 'Pingala', 'Pingala', 'Ida', 'Ida', 'Ida',
    'Pingala', 'Pingala', 'Pingala', 'Ida', 'Ida', 'Ida',
  ]);
  const waning = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((t) => sunriseNadiForTithi(t, false));
  assert.deepEqual(waning, [
    'Pingala', 'Pingala', 'Pingala', 'Ida', 'Ida', 'Ida', 'Pingala', 'Pingala', 'Pingala',
    'Ida', 'Ida', 'Ida', 'Pingala', 'Pingala', 'Pingala',
  ]);
});

test('tithiFromPhase splits the lunation into 30 tithis', () => {
  assert.deepEqual(
    [tithiFromPhase(0).tithi, tithiFromPhase(0.49).tithi, tithiFromPhase(0.5).tithi, tithiFromPhase(0.999).tithi],
    [1, 15, 16, 30],
  );
  assert.equal(tithiFromPhase(0.2).paksha, 'Shukla');
  assert.equal(tithiFromPhase(0.7).paksha, 'Krishna');
  assert.equal(tithiFromPhase(0.7).pakshaTithi, 7);
});

test('nadi: alternates every 60 min from sunrise with a ±4 min Sushumna window', () => {
  const d = sunriseOf('2026-10-30');
  const first = nadi(new Date(d.sunrise + 10 * MIN), d, S);
  const second = nadi(new Date(d.sunrise + 70 * MIN), d, S);
  const third = nadi(new Date(d.sunrise + 130 * MIN), d, S);
  assert.notEqual(first.predicted, 'Sushumna');
  assert.notEqual(first.predicted, second.predicted);
  assert.equal(first.predicted, third.predicted);
  assert.equal(first.predicted, first.sunriseNadi);
  // around the 60-min switch: Sushumna
  assert.equal(nadi(new Date(d.sunrise + 57 * MIN), d, S).predicted, 'Sushumna');
  assert.equal(nadi(new Date(d.sunrise + 63 * MIN), d, S).predicted, 'Sushumna');
  assert.notEqual(nadi(new Date(d.sunrise + 55 * MIN), d, S).predicted, 'Sushumna');
  // countdown
  assert.equal(nadi(new Date(d.sunrise + 10 * MIN), d, S).msToSwitch, 50 * MIN);
  // window width is a setting
  const wide = { ...S, sushumnaWindowMin: 10 };
  assert.equal(nadi(new Date(d.sunrise + 52 * MIN), d, wide).predicted, 'Sushumna');
});

test('nadi: sunrise nadi follows the tithi at sunrise', () => {
  const d = sunriseOf('2026-10-30');
  const n = nadi(new Date(d.sunrise + 10 * MIN), d, S);
  assert.equal(n.sunriseNadi, sunriseNadiForTithi(n.pakshaTithi, n.waxing));
  assert.ok(n.tithi >= 1 && n.tithi <= 30);
  assert.ok(['Shukla', 'Krishna'].includes(n.paksha));
});

// ───────────── computeAll ─────────────

test('computeAll returns every clock with consistent countdowns', () => {
  const now = new Date('2026-10-30T15:00:00-07:00');
  const r = computeAll(now, S);
  assert.ok(r.planetary.msLeft > 0 && r.planetary.msLeft <= r.planetary.hourLengthMs);
  assert.ok(r.tattva.msLeftMain > 0 && r.tattva.msLeftMain <= 24 * MIN);
  assert.ok(r.tattva.msLeftSub > 0 && r.tattva.msLeftSub <= 4.8 * MIN);
  assert.ok(r.nadi.msToSwitch > 0 && r.nadi.msToSwitch <= 60 * MIN);
  assert.equal(r.planetary.weekdayName, 'Friday');
  assert.equal(r.planetary.dayRuler, 'Venus');
});

test('nadi: msToWindowEnd counts to the end of the Sushumna window on both sides of a switch', () => {
  const d = sunriseOf('2026-10-30');
  const before = nadi(new Date(d.sunrise + 58 * MIN), d, S); // 2 min before the switch
  assert.equal(before.inSushumnaWindow, true);
  assert.equal(before.msToWindowEnd, 6 * MIN);
  const after = nadi(new Date(d.sunrise + 61 * MIN), d, S); // 1 min after the switch
  assert.equal(after.inSushumnaWindow, true);
  assert.equal(after.msToWindowEnd, 3 * MIN);
  assert.equal(nadi(new Date(d.sunrise + 30 * MIN), d, S).msToWindowEnd, 0);
});
