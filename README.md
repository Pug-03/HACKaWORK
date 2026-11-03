# HACKaWORK — BKK Bin Station 3D

A true-to-scale (1 unit = 1 m) 3D web model of the Bangkok (BMA) 4-bay sidewalk
waste-sorting station: recycle / food waste / general waste (120 L wheelie bins (TAB120HW, waste-slot lid)) and an
open bay for sealed bin bags.

## Run

ES modules need a local server (opening index.html directly via file:// will not work):

    cd ~/code/HACKaWORK
    python3 -m http.server 8765
    # open http://localhost:8765

## Structure

- `index.html` — page, UI, import map (three.js r170 from jsDelivr)
- `js/config.js` — all dimensions and colours (edit here when real drawings are available)
- `js/binStation.js` — frame, panels, lattice, wheelie bins, bag pile
- `js/textures.js` — canvas-drawn front signs (Thai/English text + icons) and paving
- `js/main.js` — scene, camera, controls, dimension lines, scale figure, interaction, smart-system simulation
- `js/riser.js` — separate raised anti-rodent base (legs with rat guards, front step, two lockable service trays)
- `js/hardware.js` — beacon (red = waiting for pickup, green = collected), solar panel, fill sensors under lids, control unit with screen and 500 THB call button
- `js/composter.js` — stand-alone 40 L food-waste composter (heated drum, paddle rotor, top hatch, compost drawer, BMA branding + order phone placeholder)
- `js/geom.js` — rounded boxes and creased-normal smoothing helpers
- `js/environment.js` — sidewalk, curb, road, pad, lights
- `dashboard.html` — simulated district dashboard; syncs live with the 3D page via BroadcastChannel/localStorage

`window.HACKaWORK` exposes `scene`, `camera`, `controls`, `station`, `CONFIG` for future features.

## Dimension notes

Bins follow the TAB120HW drawing (500 x 550 x 1100 mm). Frame estimated from site photos.
Bays: 3 x 0.58 m + 0.90 m = 2.64 m long, 0.70 m deep, 0.89 m frame height (bin collars stand about 8 cm above the frame).

## Notes

- The composter's phone number is a placeholder (`COMPOSTER.phone` in `js/composter.js`).
- A 40 L drum realistically handles about 10 kg of food waste per day.
- Regular collection rounds on the dashboard (06:00, 14:00, 22:00) are example values.
