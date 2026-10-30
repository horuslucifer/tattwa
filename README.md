# TATTVA TIDE

A live "where am I now" clock for Golden Dawn / Swara breath timing. Three traditional
clocks, all counted from the local **sunrise**, in a dark one-handed phone layout that
installs as an offline PWA. Personal-experiment software; no backend, no accounts.

## What the three clocks are

| Clock | What it counts | What the card shows |
|---|---|---|
| **Planetary hour** | Sunrise→sunset split into 12 "day hours", sunset→sunrise into 12 "night hours". The weekday's planet rules hour 1, then the Chaldean order (♄ ♃ ♂ ☉ ♀ ☿ ☽) repeats. | Ruling planet + glyph, hour N of 12 (day/night), time left, next ruler. |
| **Tattva tide** | Five elemental currents of 24 min each from sunrise: Akasha → Vayu → Tejas → Prithvi → Apas (2-hour cycle). Each contains five 4.8-min sub-tattvas. | Sub-tattva "of" main tattva with SVG symbols, two countdowns, 2-hour ring with a moving marker. |
| **Swara / Nadi** | Shiva Swarodaya: the tithi (lunar day) at sunrise decides whether Ida (left) or Pingala (right) opens the day; the side swaps every 60 min; ±4 min around each swap is a Sushumna window. | Predicted nadi + side, tithi with paksha and name, time to the next switch. |

The **Help** tab inside the app explains all of this in more detail, including how to run
the breath experiment.

## Run it

Requires Node 18+. Any static file server works; the npm script uses `serve`.

```bash
npm install
npm test          # 17 unit tests for clocks.js
npm start         # serves on http://localhost:5173
```

Open `http://localhost:5173` on the Mac, or on the phone use the Mac's LAN IP
(`http://192.168.x.x:5173`). Geolocation and the service worker need **https or
localhost**; over plain LAN http the app still works but you enter lat/long by hand and
it won't cache for offline use. For a real install, host the folder on any https static
host (GitHub Pages, Netlify, Cloudflare Pages) and then:

- iPhone Safari: Share → **Add to Home Screen**
- Android Chrome: menu → **Install app**

After that it opens full-screen and runs with no network.

## File structure

```
tattva-tide/
├── index.html            markup for the five views (Now, Timeline, Log, Settings, Help)
├── styles.css            dark / gold / serif theme
├── app.js                UI: rendering, timers, log, CSV export, settings form, geolocation
├── clocks.js             ALL time math, pure functions, no DOM  ← the part worth reading
├── symbols.js            SVG for the five tattva symbols and the 2-hour ring
├── store.js              localStorage for settings + breath log
├── sw.js                 service worker (cache-first, offline)
├── manifest.webmanifest  PWA manifest
├── icons/                icon.svg, icon-192.png, icon-512.png
├── vendor/suncalc.js     suncalc 1.9 converted to an ES module (same file for browser + tests)
├── tools/make-icons.js   regenerates the PNG icons (no dependencies)
└── test/clocks.test.js   node:test unit tests
```

## clocks.js in one paragraph

`computeAll(date, settings)` finds the **solar day** containing `date` (latest sunrise ≤
now, the sunset after it, the next sunrise) using suncalc, then derives the three clocks
from that anchor: `planetaryHour()`, `tattva()`, `nadi()`. The weekday for the planetary
hour is the *local solar* weekday of the sunrise (longitude-based, so it does not depend
on the phone's time zone). `dayTables()` returns the three lanes for the Timeline. Nothing
in the file touches the DOM, timers or storage, so it is fully unit-testable.

## Settings (because sources disagree)

- **Tattva order**: `…Prithvi → Apas` (Golden Dawn, default) or `…Apas → Prithvi`.
- **Duration mode**: `equal` (24 min each) or `prasad` (unequal). ⚠ The Prasad minutes in
  `PRASAD_DURATIONS` (clocks.js) are **not verified** against *Nature's Finer Forces*.
  They are the Shiva Swarodaya pala proportions (Prithvi 20, Apas 16, Tejas 12, Vayu 8,
  Akasha 4 min; 60-min cycle). The object carries `verified: false` and a note; the UI
  shows a warning while this mode is on.
- **Sub-tattva start**: `own` (default: Vayu of Vayu opens Vayu) or `akasha` (Akasha of
  Vayu opens Vayu). Sunrise + 30 min is *Tejas of Vayu* under `own` and *Vayu of Vayu*
  under `akasha`; both are tested.
- **Nadi switch interval** (default 60 min) and **Sushumna window** (default ±4 min).
- **Location**: geolocation button or manual lat/long. Default Los Angeles (34.05, -118.24).

## The breath log

LEFT / RIGHT / BOTH buttons save a timestamp, what your body showed, and what every clock
predicted at that moment (nadi, scheduled nadi, Sushumna flag, tithi, paksha, planet,
hour, tattva, sub-tattva, plus the settings in force). Stats: overall match, side-only
match (ignoring Sushumna windows), by time of day, by tithi, by predicted nadi. **Export
CSV** downloads everything; **Clear log** asks first.

## Assumptions and known limits

- suncalc sunrise/sunset are accurate to about a minute; moon phase is the Sun–Moon
  elongation, and tithi = 1/30 of a lunation, read at sunrise. Good enough for 3-tithi
  blocks, not for ritual-grade panchanga.
- Polar day/night throws "No sunrise found" and the masthead shows the error.
- The log lives only in that browser's localStorage. Export the CSV if you care about it.
