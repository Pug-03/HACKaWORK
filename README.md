# HACKaWORK — BKK Bin Station 3D

A true-to-scale (1 unit = 1 m) 3D web model of a Bangkok (BMA) 4-bay sidewalk
waste-sorting station, extended with an anti-rodent raised base, smart hardware,
a food-waste composter, an electric mini garbage truck and a district dashboard.

## Run locally

ES modules need a local server (opening `index.html` directly via `file://` will not work).
An internet connection is required for three.js (jsDelivr CDN) and the Kanit font.
There is nothing to install and no build step; you only need one way to serve the folder.

    cd HACKaWORK
    npm run dev                    # needs npm + python3; same as: python3 -m http.server 8766
    # 3D model:  http://localhost:8766
    # dashboard: http://localhost:8766/dashboard.html

If `npm run dev` doesn't work, run one of these from the same folder instead:

    python3 -m http.server 8766    # macOS / Linux, without npm
    py -m http.server 8766         # Windows, usually has `py` rather than `python3`
    npx serve -l 8766              # Node only, no Python

If port 8766 is already in use, pick another number in the command and in the URL.
The browser needs WebGL (a recent Chrome, Edge, Safari or Firefox).

After pulling changes, hard-refresh (Cmd/Ctrl + Shift + R) so the browser drops cached modules.

## Deploy (GitHub Pages)

Everything is static HTML/JS, so GitHub Pages works as-is:
Settings → Pages → Build and deployment → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)`.
The site is then served at `https://<user>.github.io/HACKaWORK/`.

## What's in the scene

- **Bin station** — steel frame (2.64 × 0.70 × 0.89 m), laser-cut sign panels, three
  TAB120HW 120 L wheelie bins (recycle / food / general) and a sealed-bag bay with a
  lattice band. Hood lids have a push flap that opens through the lid into the bin.
- **Anti-rodent riser** (separate piece, 35 cm) — open underneath for cleaning, cone rat
  guards on every leg, two lockable service trays for pest-control staff, free-standing
  front step (12 cm clear of the deck).
- **Smart hardware** — 50 W solar panel on a Ø60 mm pole, LiFePO4 12.8 V 20 Ah battery
  box with MPPT, conduits, control unit (screen, LTE modem, LoRa gateway, 500 THB
  "call extra pickup" button), two-colour beacon (red = waiting, green = collected),
  wireless LoRa ultrasonic fill sensors under the lids. "Look inside" opens the boxes
  and labels every internal part.
- **Composter** — stand-alone 200 L cabinet (~50 kg food waste/day): heated drum, paddle
  rotor, top hatch, pull-out compost drawer, BMA branding with an order phone placeholder.
- **EV mini truck** — drives in for an out-of-round call or when a bin reaches 80 %,
  leaves when the pickup is confirmed.
- **Fertilizer shop** — small timber hut with a thatched roof beside the composter, selling
  bagged compost (BMA bags + one made-up placeholder brand).
- **Moving objects** — double-press and hold the station, composter or shop, then drag to
  move it. Turn on "จัดวางตำแหน่งเอง" to rotate the selected object by 15° with Q/E or the
  buttons. Positions are saved in the browser's localStorage; "คืนตำแหน่งเดิม" restores the
  defaults.
- **Simulation + dashboard** — fill sliders, call / collected buttons; state is shared
  live with `dashboard.html` (KPIs, per-station table, EV dispatch queue) via
  BroadcastChannel + localStorage, with a heartbeat so the dashboard shows when the
  3D page is offline.

## Files

| File | Contents |
|---|---|
| `index.html` | 3D page, UI panels, import map (three.js r170) |
| `dashboard.html` | District dashboard (simulated data + live station) |
| `js/config.js` | Station, bay and bin dimensions / colours |
| `js/binStation.js` | Frame, panels, lattice, bag pile |
| `js/wheelieBin.js` | TAB120HW bin: rounded body, collar, hood lid, push flap, wheels |
| `js/riser.js` | Anti-rodent raised base, rat guards, lockable service trays (front or back pull-out, lifting lid), step with lift-out panels |
| `js/hardware.js` | Solar, battery, conduits, control unit, beacon, sensors, look-inside |
| `js/composter.js` | 200 L composter: heated U-trough, paddle mixer, chain drive, twin-shaft shredder, electrics, side bag display |
| `js/mech.js` | Standard parts from real dimensions: sprockets / #50 roller chain, involute gears, UCP bearings, TEFC motors, cutters, bolts |
| `js/shop.js` | Fertilizer shop: thatched timber hut with stacked compost bags (BMA bags + one placeholder brand) |
| `js/circuit.js` | Electrical and data circuit diagram overlay |
| `js/truck.js` | EV mini garbage truck |
| `js/environment.js` | Sidewalk, curb, road, pad, lights |
| `js/textures.js` | Canvas textures (signs + laser-cut masks, paving, noise) |
| `js/geom.js` | Rounded boxes, creased normals, rounded-rect paths |
| `js/main.js` | Scene, camera, render-on-demand loop, interaction, simulation, sync |

`window.HACKaWORK` exposes `scene, camera, controls, station, riser, hardware, composter,
smart, CONFIG, invalidate`. Call `HACKaWORK.invalidate(true)` after changing the scene from
outside so it re-renders.

## Notes / placeholders

- Bins follow the TAB120HW drawing (500 × 550 × 1100 mm); the frame is estimated from site photos.
- The composter's order phone number is a placeholder (`COMPOSTER.phone` in `js/composter.js`).
- Regular collection rounds on the dashboard (06:00, 14:00, 22:00) are example values.
- Other stations on the dashboard and the compost output rate are simulated.
