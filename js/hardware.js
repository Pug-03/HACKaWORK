import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rbox, roundedBoxGeometry, mergeStatic } from './geom.js';
import { axialFan } from './mech.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Smart hardware mounted on the bin station:
//  - two-colour beacon on a pole (red = waiting for pickup, green = collected) + small solar panel
//  - ultrasonic fill-level sensor under every lid
//  - control unit on the left end: status screen + "call extra pickup" button
//  - visible fill level inside each bin / bag bay
const FONT = 'Kanit, Thonburi, sans-serif';

export function buildHardware(station) {
  const group = new THREE.Group();
  group.name = 'hardware';
  const F = CONFIG.frame, B = CONFIG.bin;
  const L = station.length, D = F.depth, H = F.height;
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.4, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb4b9be, metalness: 0.8, roughness: 0.35 });

  /* ---------- "look inside" helpers ---------- */
  const insideLabels = [];
  // owner: the door this label belongs to, or 'sensor' (shown while the sensor covers are see-through)
  function label(parent, text, x, y, z, owner) {
    const el = document.createElement('div');
    el.className = 'dim hw';
    el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.set(x, y, z);
    o.visible = false;
    parent.add(o);
    insideLabels.push({ o, owner });
    return o;
  }
  // open-front enclosure: back + 4 walls (front is a hinged door)
  function enclosure(w, h, d, mat, part) {
    const g = new THREE.Group(), th = 0.004;
    g.add(rbox(w, h, th, mat, 0, 0, -d / 2 + th / 2, 0.002));
    for (const sx of [-1, 1]) g.add(rbox(th, h, d, mat, sx * (w / 2 - th / 2), 0, 0, 0.002));
    for (const sy of [-1, 1]) g.add(rbox(w - 2 * th, th, d, mat, 0, sy * (h / 2 - th / 2), 0, 0.002));
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = part; } });
    return g;
  }
  // door hinged on one vertical edge (side = -1 left, +1 right); children are given in enclosure coordinates
  function door(parent, w, h, d, mat, part, side = -1) {
    const hinge = new THREE.Group();
    hinge.position.set(side * w / 2, 0, d / 2);
    const panel = rbox(w, h, 0.008, mat, -side * w / 2, 0, 0.004, 0.006);
    panel.userData.part = part;
    hinge.add(panel);
    // EPDM gasket on the inside of the door, two barrel hinges, quarter-turn latch on the free edge
    const gasket = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.9 });
    const cx = -side * w / 2;
    hinge.add(rbox(w - 0.012, 0.006, 0.004, gasket, cx, h / 2 - 0.009, -0.002, 0.001));
    hinge.add(rbox(w - 0.012, 0.006, 0.004, gasket, cx, -h / 2 + 0.009, -0.002, 0.001));
    hinge.add(rbox(0.006, h - 0.012, 0.004, gasket, cx - w / 2 + 0.009, 0, -0.002, 0.001));
    hinge.add(rbox(0.006, h - 0.012, 0.004, gasket, cx + w / 2 - 0.009, 0, -0.002, 0.001));
    for (const y of [h * 0.33, -h * 0.33]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 12), steel);
      barrel.position.set(0, y, 0.004);
      hinge.add(barrel);
    }
    const latch = rbox(0.008, 0.026, 0.008, gasket, -side * (w - 0.016), 0, 0.012, 0.002);
    hinge.add(latch);
    hinge.userData = { open: 0, target: 0, side, max: 1.42 };   // inner doors stop short of the cabinet door
    hinge.attachFront = (m) => { m.position.x -= side * w / 2; m.position.z -= d / 2 - 0.004; hinge.add(m); return m; };
    parent.add(hinge);
    return hinge;
  }
  const doors = [];
  const sensors = [];
  // front-face artwork for DIN modules / devices (labels, screw terminals, LCDs)
  const faceCache = new Map();
  function faceTex(kind, w, h) {
    const key = `${kind}|${w}|${h}`;
    if (faceCache.has(key)) return faceCache.get(key);
    const c = document.createElement('canvas');
    c.width = 256; c.height = Math.max(32, Math.round(256 * h / w));
    const g = c.getContext('2d'), W2 = c.width, H2 = c.height;
    const BG = { ctrl: '#e5e7eb', lte: '#f8fafc', lora: '#1f2937', brk: '#f4f4f2', dcdc: '#1d4ed8', relay: '#111827', fuse: '#1f2937', mppt: '#1e5bb8', tb: '#9ca3af', tbBlue: '#1d4ed8', tbGreen: '#16a34a' };
    g.fillStyle = BG[kind]; g.fillRect(0, 0, W2, H2);
    const ink = ['lora', 'relay', 'fuse', 'dcdc', 'mppt', 'tbBlue', 'tbGreen'].includes(kind) ? '#f8fafc' : '#1f2937';
    const screws = (y) => {
      const n = Math.max(1, Math.floor(W2 / 46));
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (W2 / n);
        g.fillStyle = '#2b2f33'; g.fillRect(x - 15, y - 15, 30, 30);
        g.fillStyle = '#c9ced3'; g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#4b5563'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x + 7, y); g.stroke();
      }
    };
    const text = (t, y, size, weight = 600, color = ink) => { g.fillStyle = color; g.font = `${weight} ${size}px ${FONT}`; g.textAlign = 'center'; g.fillText(t, W2 / 2, y); };
    if (kind.startsWith('tb')) { screws(22); screws(H2 - 22); g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, H2 * 0.45, W2, 6); }
    else {
      if (kind !== 'mppt') { screws(24); screws(H2 - 24); }
      if (kind === 'ctrl') {
        g.fillStyle = '#0f172a'; g.fillRect(W2 * 0.12, H2 * 0.28, W2 * 0.76, H2 * 0.24);
        g.fillStyle = '#4ade80'; g.font = `600 ${Math.round(H2 * 0.08)}px ${FONT}`; g.textAlign = 'left';
        g.fillText('BKK-PTW-001', W2 * 0.16, H2 * 0.38); g.fillText('FILL 62% · LTE ●', W2 * 0.16, H2 * 0.48);
        text('SMART BIN CONTROLLER', H2 * 0.66, Math.round(H2 * 0.06));
        text('HACKaWORK', H2 * 0.76, Math.round(H2 * 0.07), 700, '#1d4ed8');
      } else if (kind === 'lte') {
        text('4G LTE', H2 * 0.36, Math.round(H2 * 0.12), 700);
        text('INDUSTRIAL ROUTER', H2 * 0.46, Math.round(H2 * 0.055));
        g.fillStyle = '#9ca3af'; g.fillRect(W2 * 0.25, H2 * 0.55, W2 * 0.5, H2 * 0.06);
        text('SIM', H2 * 0.69, Math.round(H2 * 0.05), 500);
      } else if (kind === 'lora') {
        text('LoRaWAN', H2 * 0.38, Math.round(H2 * 0.1), 700);
        text('GATEWAY', H2 * 0.48, Math.round(H2 * 0.07));
        text('AS923 MHz', H2 * 0.6, Math.round(H2 * 0.06), 400);
      } else if (kind === 'brk') {
        g.fillStyle = '#d1d5db'; g.fillRect(W2 * 0.2, H2 * 0.36, W2 * 0.6, H2 * 0.3);
        text('C10', H2 * 0.32, Math.round(W2 * 0.2), 700);
        text('DC', H2 * 0.78, Math.round(W2 * 0.18), 600);
      } else if (kind === 'dcdc') {
        text('DC/DC', H2 * 0.4, Math.round(W2 * 0.2), 700);
        text('12→5V', H2 * 0.55, Math.round(W2 * 0.15));
        text('3A', H2 * 0.68, Math.round(W2 * 0.14), 400);
      } else if (kind === 'relay') {
        text('RELAY', H2 * 0.45, Math.round(W2 * 0.22), 700);
        text('12V', H2 * 0.6, Math.round(W2 * 0.2), 400);
      } else if (kind === 'fuse') {
        g.fillStyle = '#374151'; g.fillRect(W2 * 0.2, H2 * 0.3, W2 * 0.6, H2 * 0.4);
        text('10A', H2 * 0.55, Math.round(W2 * 0.22), 700);
      } else if (kind === 'mppt') {
        g.fillStyle = '#0b1220'; g.fillRect(W2 * 0.08, H2 * 0.22, W2 * 0.36, H2 * 0.3);
        g.fillStyle = '#38bdf8'; g.font = `600 ${Math.round(H2 * 0.09)}px ${FONT}`; g.textAlign = 'left';
        g.fillText('13.6V', W2 * 0.11, H2 * 0.35); g.fillText('2.4A ☀', W2 * 0.11, H2 * 0.47);
        g.fillStyle = ink; g.font = `700 ${Math.round(H2 * 0.13)}px ${FONT}`; g.textAlign = 'right';
        g.fillText('MPPT 75|10', W2 * 0.94, H2 * 0.36);
        g.font = `500 ${Math.round(H2 * 0.07)}px ${FONT}`; g.fillText('SOLAR CHARGE CONTROLLER', W2 * 0.94, H2 * 0.48);
        // status LEDs (bulk / absorption / float) up top, then the terminal legend right above the screw row
        [['#22c55e', 0.62], ['#f59e0b', 0.7], ['#38bdf8', 0.78]].forEach(([col, x]) => { g.fillStyle = col; g.beginPath(); g.arc(W2 * x, H2 * 0.14, H2 * 0.03, 0, Math.PI * 2); g.fill(); });
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, H2 * 0.62, W2, H2 * 0.38);           // terminal block recess
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = `600 ${Math.round(H2 * 0.07)}px ${FONT}`; g.textAlign = 'center';
        ['PV+', 'PV−', 'BAT+', 'BAT−', 'LD+', 'LD−'].forEach((t, i) => g.fillText(t, W2 * (0.083 + i * 0.167), H2 * 0.7));
        for (let i = 0; i < 6; i++) {                // one screw per terminal, under its legend
          const x = W2 * (0.083 + i * 0.167), y = H2 * 0.84;
          g.fillStyle = '#2b2f33'; g.fillRect(x - 16, y - 16, 32, 32);
          g.fillStyle = '#c9ced3'; g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#4b5563'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x + 7, y); g.stroke();
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    faceCache.set(key, tex);
    return tex;
  }
  // a device box whose front face (+Z) carries the artwork
  function device(kind, w, h, d, x, y, z) {
    const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(faceTex(kind, w, h).image.getContext('2d').getImageData(4, Math.round(faceTex(kind, w, h).image.height / 2), 1, 1).data.slice(0, 3).reduce((a, v, i) => a + v * [65536, 256, 1][i], 0)), roughness: 0.5 });
    const front = new THREE.MeshStandardMaterial({ map: faceTex(kind, w, h), roughness: 0.45 });
    const m = new THREE.Mesh(roundedBoxGeometry(w, h, d, 0.0025), [side, side, side, side, front, side]);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  let insideMode = false;
  const pcb = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.6 });
  const chip = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.4 });
  const shield = new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 0.9, roughness: 0.25 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xd3d7da, metalness: 0.3, roughness: 0.6 });
  // tube along a CurvePath: straight runs get 1 segment, bends `bendDiv` segments (no wasted rings on long runs)
  function tubeAlong(path, radius, radial, bendDiv) {
    const parts = path.curves.map((c) => [c, c.isLineCurve3 ? 1 : bendDiv]);
    const n = parts.reduce((s, p) => s + p[1], 0);
    const at = (t, fn, target) => {
      let k = t * n;
      for (const [c, m] of parts) { if (k <= m + 1e-6) return c[fn](Math.max(0, Math.min(1, k / m)), target); k -= m; }
      return parts[parts.length - 1][0][fn](1, target);
    };
    const curve = new THREE.Curve();
    curve.getPoint = curve.getPointAt = (t, target = new THREE.Vector3()) => at(t, 'getPoint', target);
    curve.getTangent = curve.getTangentAt = (t, target = new THREE.Vector3()) => at(t, 'getTangent', target);
    return new THREE.TubeGeometry(curve, n, radius, radial, false);
  }
  // polyline with rounded corners -> tube (used for both field conduits and panel wiring)
  function routed(pts, radius, bend, mat, radial = 8, bendDiv = 6) {
    pts = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 1e-5);
    const path = new THREE.CurvePath();
    let prev = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (i < pts.length - 1) {
        const inLen = p.distanceTo(prev), outLen = p.distanceTo(pts[i + 1]);
        const r = Math.min(bend, inLen / 2, outLen / 2);
        const a = p.clone().addScaledVector(new THREE.Vector3().subVectors(p, prev).normalize(), -r);
        const b = p.clone().addScaledVector(new THREE.Vector3().subVectors(pts[i + 1], p).normalize(), r);
        if (a.distanceTo(prev) > 1e-5) path.add(new THREE.LineCurve3(prev, a));
        path.add(new THREE.QuadraticBezierCurve3(a, p, b));
        prev = b;
      } else path.add(new THREE.LineCurve3(prev, p));
    }
    const m = new THREE.Mesh(tubeAlong(path, radius, radial, bendDiv), mat);
    m.userData.curve = path;
    m.castShadow = true;
    return m;
  }
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const wireMats = {};
  const wmat = (c) => (wireMats[c] ??= new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }));
  // panel wire: rounded route between two terminals
  const pwire = (color, pts) => routed(pts.map((p) => P(...p)), 0.0022, 0.008, wmat(color));
  // IP68 cable gland: hex nut on the wall + domed sealing cap, local +Y = outward
  const glandMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5 });
  function gland(pos, dir) {
    const g = new THREE.Group();
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 6), glandMat);
    nut.position.y = 0.004;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 20), glandMat);
    body.position.y = 0.012;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.012, 0.01, 20), glandMat);
    cap.position.y = 0.021;
    g.add(nut, body, cap);
    g.position.copy(pos);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  const wire = (color, x0, y0, z0, x1, y1, z1, r = 0.0025) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  };

  /* ---------- power & signal layout (all on the left end, outside the lids' swing) ----------
     Solar 50 W on a pole -> conduit -> battery box (LiFePO4 12.8 V 20 Ah + MPPT)
     -> conduit -> control unit (LTE modem + LoRa gateway) -> conduit up the pole -> beacon.
     Lid sensors are wireless (battery + LoRa) because bins are wheeled away at every pickup. */
  const X0 = -L / 2 - 0.004;                       // outer face of the left end panel
  // one outer cabinet holds both boxes side by side (local X of the cabinet = world +Z)
  // gap: the cabinet stands 50 mm off the panel on brackets; its 3 exhaust fans blow into that gap
  const CAB = { w: 0.56, h: 0.58, d: 0.17, gap: 0.05, y: 0.56, z: 0.07, battX: -0.13, unitX: 0.13, fanYs: [0.19, 0.03, -0.13], fanZ: 0.02, scrY: 0.165, inY: 0.19, inZ: -0.025 };
  const cabX = X0 - CAB.gap - CAB.d / 2;
  const poleX = X0 - 0.05, poleZ = -D / 2 + 0.04, poleTop = 1.78;
  const conduitMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.4, metalness: 0.8 });   // hot-dip galvanised rigid steel conduit
  let trunkLid = null, fanKnob = null, fanLampMat = null, fanMode = 'auto';
  const FAN_MAX_RPM = 20000;                       // turbo setting (slider tops out at 20 000 rpm)
  let fanPct = 40, fanRpm = 0;                     // set speed (slider) and actual rotor speed (spins up / coasts down)
  const _cabW = new THREE.Vector3();
  const brassMat = () => new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.85, roughness: 0.3 });
  const tag = (o, part) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = part; } }); return o; };

  // pole (doubles as the cable duct) + clamps to the frame
  const poleGrp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, poleTop - 0.06, 24), steel);
  pole.position.set(poleX, 0.06 + (poleTop - 0.06) / 2, poleZ);
  poleGrp.add(pole);
  const poleCap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  poleCap.position.set(poleX, poleTop, poleZ);
  poleGrp.add(poleCap);
  for (const y of [0.25, 0.8]) {                    // clamps sit on the frame (top at 0.89)
    poleGrp.add(rbox(0.05, 0.04, 0.03, steel, X0 - 0.025, y, poleZ, 0.004));
    const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 8, 24), dark);
    clamp.rotation.x = Math.PI / 2;
    clamp.position.set(poleX, y, poleZ);
    poleGrp.add(clamp);
  }
  group.add(tag(poleGrp, 'pole'));

  // 50 W solar panel (670 x 540 mm), tilted 15° toward the front, above the lids' swing
  const cellsCanvas = document.createElement('canvas');
  cellsCanvas.width = 670; cellsCanvas.height = 540;
  const cx = cellsCanvas.getContext('2d');
  cx.fillStyle = '#d7dbdf'; cx.fillRect(0, 0, 670, 540);
  const cols = 6, rows = 6, cw = (670 - 40) / cols, chh = (540 - 40) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = 20 + i * cw + 3, y = 20 + j * chh + 3;
    cx.fillStyle = '#16264a'; cx.fillRect(x, y, cw - 6, chh - 6);
    cx.fillStyle = 'rgba(200,210,230,0.55)';
    cx.fillRect(x + (cw - 6) * 0.33, y, 2, chh - 6);
    cx.fillRect(x + (cw - 6) * 0.66, y, 2, chh - 6);
  }
  const cellTex = new THREE.CanvasTexture(cellsCanvas);
  cellTex.colorSpace = THREE.SRGBColorSpace;
  const cellMat = new THREE.MeshPhysicalMaterial({ map: cellTex, metalness: 0.3, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xc7ccd1, metalness: 0.85, roughness: 0.3 });
  const solar = new THREE.Group();
  solar.position.set(poleX, poleTop + 0.06, poleZ);
  solar.rotation.x = 0.26;
  const sp = new THREE.Mesh(new THREE.BoxGeometry(0.67, 0.03, 0.54), [alu, alu, cellMat, alu, alu, alu]);
  solar.add(sp);
  solar.add(rbox(0.5, 0.025, 0.03, alu, 0, -0.03, -0.15, 0.004));   // mounting rails
  solar.add(rbox(0.5, 0.025, 0.03, alu, 0, -0.03, 0.15, 0.004));
  solar.add(rbox(0.06, 0.05, 0.36, steel, 0, -0.055, 0, 0.006));     // pole-top bracket
  group.add(tag(solar, 'solar'));
  const jbox = rbox(0.08, 0.1, 0.05, conduitMat, poleX, poleTop - 0.1, poleZ + 0.045, 0.008);   // panel junction box
  group.add(tag(jbox, 'solar'));

  // two-colour beacon on an arm off the pole (visible from the road and the sidewalk)
  const beacon = new THREE.Group();
  const by = 1.24, bx = poleX - 0.1;
  beacon.add(rbox(0.1, 0.025, 0.025, steel, poleX - 0.05, by - 0.03, poleZ, 0.005));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.035, 28), dark);
  base.position.set(bx, by, poleZ);
  beacon.add(base);
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x1f8f3a, emissive: 0x22c55e, emissiveIntensity: 2.4, roughness: 0.25 });
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.07, 28), lensMat);
  lens.position.set(bx, by + 0.052, poleZ);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.042, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lensMat);
  cap.position.set(bx, by + 0.087, poleZ);
  beacon.add(lens, cap);
  group.add(tag(beacon, 'beacon'));
  // (no glow sprite: transparent sprites get picked up by the AO pass and render as a dark square)

  // battery box: LiFePO4 12.8 V 20 Ah (256 Wh) + MPPT charge controller, vented, lockable
  const batt = new THREE.Group();
  batt.position.set(cabX + 0.007, CAB.y - 0.07, CAB.z + CAB.battX);   // heavy pack low   // parts mount straight on the cabinet backplate
  batt.rotation.y = -Math.PI / 2;                   // local +Z faces world -X
  const bW = 0.22, bH = 0.32, bD = 0.13;
  const battShell = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, metalness: 0.2, roughness: 0.5 });
  // (no separate battery box any more: one big cabinet, everything on its backplate)
  const battDoor = door(batt, bW, bH, bD, battShell, 'battery');
  batt.remove(battDoor);                           // kept only as the 'opened' state for the labels
  doors.push(battDoor);
  const battLabel = document.createElement('canvas');
  battLabel.width = 360; battLabel.height = 200;
  const bl = battLabel.getContext('2d');
  bl.fillStyle = '#f4f5f6'; bl.fillRect(0, 0, 360, 200);
  bl.fillStyle = '#e0a800'; bl.fillRect(0, 0, 360, 46);
  bl.fillStyle = '#1d2228'; bl.textAlign = 'center';
  bl.font = `600 28px ${FONT}`; bl.fillText('แบตเตอรี่ · BATTERY', 180, 33);
  bl.font = `500 26px ${FONT}`; bl.fillText('LiFePO4 12.8V 20Ah', 180, 92);
  bl.font = `400 22px ${FONT}`; bl.fillText('256 Wh · MPPT 10A', 180, 130);
  bl.fillText('สำรองไฟ 3–4 วัน', 180, 168);
  const blTex = new THREE.CanvasTexture(battLabel);
  blTex.colorSpace = THREE.SRGBColorSpace;
  const blm = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.095), new THREE.MeshStandardMaterial({ map: blTex, roughness: 0.6 }));
  blm.position.set(0, 0.06, bD / 2 + 0.0045);
  battDoor.attachFront(blm);
  for (let i = 0; i < 5; i++) battDoor.attachFront(rbox(0.14, 0.008, 0.004, dark, 0, -0.06 - i * 0.02, bD / 2 + 0.006, 0.002));   // vent louvres
  const keyLock = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.008, 16), steel);
  keyLock.rotation.x = Math.PI / 2;
  keyLock.position.set(0.085, -0.13, bD / 2 + 0.008);
  battDoor.attachFront(keyLock);
  battDoor.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = 'battery'; } });
  // internals: real panel layout — mounting plate, battery on a bracket with strap, MPPT controller
  // with a terminal strip, DIN rail with DC breakers / fuse / terminal blocks, wire duct, routed wiring
  const bIn = new THREE.Group();
  const zp = -bD / 2 + 0.006;                                                   // mounting plate face
  bIn.add(rbox(bW - 0.02, bH - 0.02, 0.003, plate, 0, 0, zp - 0.0015, 0.001));
  // battery + shelf bracket + strap
  const packTex = document.createElement('canvas');
  packTex.width = 320; packTex.height = 200;
  const pk = packTex.getContext('2d');
  pk.fillStyle = '#1e4fa3'; pk.fillRect(0, 0, 320, 200);
  pk.fillStyle = '#fff'; pk.textAlign = 'center';
  pk.font = `700 40px ${FONT}`; pk.fillText('LiFePO4', 160, 80);
  pk.font = `500 30px ${FONT}`; pk.fillText('12.8V · 20Ah', 160, 130);
  pk.font = `400 22px ${FONT}`; pk.fillText('BMS ในตัว', 160, 170);
  const pkT = new THREE.CanvasTexture(packTex); pkT.colorSpace = THREE.SRGBColorSpace;
  const packBlue = new THREE.MeshStandardMaterial({ color: 0x1e4fa3, roughness: 0.5 });
  const packD = 0.075, packZ = zp + packD / 2 + 0.002, packTop = -0.043;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, packD), [packBlue, packBlue, packBlue, packBlue, new THREE.MeshStandardMaterial({ map: pkT, roughness: 0.5 }), packBlue]);
  pack.position.set(0, packTop - 0.05, packZ);
  bIn.add(pack);
  bIn.add(rbox(0.18, 0.006, packD + 0.01, steel, 0, packTop - 0.103, packZ, 0.002));          // shelf
  for (const x of [-0.068, 0.068]) bIn.add(rbox(0.01, 0.102, packD + 0.004, dark, x, packTop - 0.05, packZ, 0.002));   // hold-down straps (clear of the label)
  // terminal posts under booted covers, right below the battery breaker / BAT- terminal they feed
  const termRed = wmat(0xd42a1e), termBlk = wmat(0x111111);
  for (const [x, m] of [[-0.0125, termRed], [0.0125, termBlk]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.007, 0.01, 12), m);
    t.position.set(x, packTop + 0.005, packZ);
    bIn.add(t);
  }
  // MPPT controller (heat-sink back against the plate) with a 6-way terminal strip along its bottom
  // (PV+ PV- BAT+ BAT- LOAD+ LOAD- at x = -0.0625 ... 0.0625, 25 mm pitch)
  const mpptY = 0.09, mpptZ = zp + 0.02;
  bIn.add(device('mppt', 0.15, 0.075, 0.03, 0, mpptY, mpptZ));
  // DIN rail right under the MPPT strip: every device sits under the MPPT terminal it feeds, so the
  // jumpers are short straight drops: PV breaker | PV- | battery breaker | BAT- | load fuse | LOAD-
  const railY = 0.01, railZ = zp + 0.004;
  bIn.add(rbox(bW - 0.04, 0.035, 0.007, steel, 0, railY, railZ, 0.001));
  const dinDev = (kind, x, w, h = 0.05) => bIn.add(device(kind, w, h, 0.035, x, railY, railZ + 0.02));
  dinDev('brk', -0.0625, 0.018); dinDev('brk', -0.0125, 0.018);                // DC breakers (PV, battery)
  for (const x of [-0.0625, -0.0125]) bIn.add(rbox(0.006, 0.012, 0.008, chip, x, railY + 0.002, railZ + 0.041, 0.001));   // toggles
  dinDev('fuse', 0.0375, 0.02);                                               // load fuse holder
  for (const x of [-0.0375, 0.0125, 0.0625]) dinDev('tbBlue', x, 0.009, 0.04);  // negative terminal blocks
  for (const x of [-0.084, 0.079]) bIn.add(rbox(0.006, 0.03, 0.02, dark, x, railY, railZ + 0.012, 0.001));   // rail end stops
  bIn.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = 'batteryInside'; } });
  batt.add(bIn);
  // cable glands: solar in (top), load out to the control unit (bottom)
  const battGlandTop = gland(P(-0.066, bH / 2, -0.02), P(0, 1, 0));
  const battGlandBot = gland(P(0.074, -bH / 2, -0.02), P(0, -1, 0));
  // (no glands on the battery block any more: it has no box of its own, its wires run in the cabinet ducts)
  label(batt, 'แบต LiFePO4 12.8V 20Ah + BMS', 0, packTop - 0.05, packZ + 0.05, battDoor);
  label(batt, 'MPPT ชาร์จจากโซลาร์', 0.02, mpptY + 0.05, 0, battDoor);
  label(batt, 'เบรกเกอร์ DC / ฟิวส์', -0.05, railY - 0.03, 0.03, battDoor);
  group.add(batt);

  // field conduits run gland-to-gland (box walls and the pole), with real bends
  const toLocal = (obj, v) => { obj.updateMatrix(); return v.clone().applyMatrix4(obj.matrix); };
  const tipOf = (obj, gl) => { obj.updateMatrix(); gl.updateMatrix(); const tip = P(0, 0.026, 0).applyMatrix4(gl.matrix).applyMatrix4(obj.matrix); return tip; };
  const flows = [];                              // conduit paths for the "current flow" animation
  function conduit(pts, part) {
    const m = routed(pts, 0.009, 0.03, conduitMat);
    flows.push({ curve: m.userData.curve, part });
    m.userData.part = part;
    group.add(m);
  }
  // glands on the pole wall (pole is the duct up to the solar panel and the beacon)
  const poleGlandSolar = gland(P(poleX, 0.21, poleZ + 0.03), P(0, 0, 1));
  const poleGlandBeacon = gland(P(poleX, 0.15, poleZ + 0.03), P(0, 0, 1));
  group.add(poleGlandSolar, poleGlandBeacon);
  const pS = P(poleX, 0.21, poleZ + 0.056), pB = P(poleX, 0.15, poleZ + 0.056);
  const bTop = tipOf(batt, battGlandTop), bBot = tipOf(batt, battGlandBot);
  // (solar conduit is laid once the cabinet exists: it enters through the cabinet floor)
  /* ---------- wireless fill sensors under each lid (battery + LoRa, no cable) ---------- */
  const sensorBody = new THREE.MeshStandardMaterial({ color: 0xe3e6e9, roughness: 0.45, transparent: true, opacity: 1 });
  const cellMat2 = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x7d868e, metalness: 0.7, roughness: 0.3 });
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x14532d, emissive: 0x22c55e, emissiveIntensity: 1.5 });
  const sensorLabel = document.createElement('canvas');
  sensorLabel.width = 256; sensorLabel.height = 64;
  const sl = sensorLabel.getContext('2d');
  sl.fillStyle = '#e3e6e9'; sl.fillRect(0, 0, 256, 64);
  sl.fillStyle = '#1d4ed8'; sl.font = `600 30px ${FONT}`; sl.textAlign = 'center';
  sl.fillText('LoRa · แบต 5 ปี', 128, 43);
  const slTex = new THREE.CanvasTexture(sensorLabel);
  slTex.colorSpace = THREE.SRGBColorSpace;
  for (const bin of station.bins) {
    const s = new THREE.Group();
    s.add(rbox(0.11, 0.032, 0.075, sensorBody, 0, -0.016, 0, 0.008));
    for (const x of [-0.025, 0.025]) {
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.008, 20), eyeMat);
      eye.position.set(x, -0.034, 0.008);
      s.add(eye);
    }
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.02), new THREE.MeshStandardMaterial({ map: slTex, roughness: 0.6 }));
    lbl.rotation.x = Math.PI / 2;
    lbl.position.set(0, -0.0325, -0.025);
    s.add(lbl);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 6), ledMat);
    led.position.set(0.045, -0.033, -0.025);
    s.add(led);
    const ant = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.05, 4, 8), new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.5 }));
    ant.rotation.z = Math.PI / 2;
    ant.position.set(0, -0.006, 0.05);
    s.add(ant);
    // internals (seen through the cover in "look inside" mode)
    s.add(rbox(0.09, 0.003, 0.06, pcb, 0, -0.008, 0, 0.001));
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 16), cellMat2);
    cell.rotation.z = Math.PI / 2;
    cell.position.set(0, -0.019, -0.018);
    s.add(cell);
    s.add(rbox(0.02, 0.004, 0.016, shield, 0.025, -0.012, 0.012, 0.001));     // LoRa radio
    s.traverse((m) => { if (m.isMesh) m.userData.part = 'sensor'; });
    if (bin === station.bins[0]) label(s, 'เซ็นเซอร์: ถ่านลิเธียม + บอร์ด LoRa + หัววัดอัลตราโซนิก', 0, -0.06, 0, 'sensor');
    s.position.set(0, 0, 0.1);
    bin.userData.lidPivot.add(s);
    sensors.push(s);
  }

  /* ---------- fill level inside bins (trash surface) ---------- */
  const trashMat = new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 0.95 });
  const trashGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.02, 4, 1);   // square-ish slab, scaled per bin
  trashGeo.rotateY(Math.PI / 4);
  const trashes = station.bins.map((bin) => {
    const m = new THREE.Mesh(trashGeo, trashMat);
    m.visible = false;
    bin.add(m);
    return m;
  });
  const bagOrder = station.bagPile ? station.bagPile.children.slice() : [];

  /* ---------- control unit on the left end panel (faces -X, visible from front-left) ---------- */
  const unit = new THREE.Group();
  unit.position.set(cabX + 0.037, CAB.y - 0.09, CAB.z + CAB.unitX);   // leaves the upper right for the fixed HMI   // controller parts straight on the backplate
  unit.rotation.y = -Math.PI / 2;               // local +Z now faces world -X
  const uW = 0.22, uH = 0.3, uD = 0.07;
  const unitShell = new THREE.MeshStandardMaterial({ color: 0x2f3439, metalness: 0.3, roughness: 0.45 });
  const unitDoor = door(unit, uW, uH, uD, unitShell, 'unit', 1);
  unit.remove(unitDoor);                           // screen + button now live on the cabinet door
  doors.push(unitDoor);
  // screen
  const scr = document.createElement('canvas');
  scr.width = 360; scr.height = 240;
  const screenTex = new THREE.CanvasTexture(scr);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.12), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 0.065, 0.0395);
  screen.userData.part = 'unit';
  // call button: red mushroom in a yellow ring
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 32), new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, -0.06, 0.044);
  const btnMat = new THREE.MeshStandardMaterial({ color: 0xd42a1e, emissive: 0x7a0d06, emissiveIntensity: 0.4, roughness: 0.35 });
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.022, 32), btnMat);
  button.rotation.x = Math.PI / 2;
  button.position.set(0, -0.06, 0.059);
  button.userData.part = 'callButton';
  let buttonZ = button.position.z;
  const btnParts = [];                                // ring, caption, shroud: whole bezel presses the button
  // caption plate under the button
  const cap2 = document.createElement('canvas');
  cap2.width = 440; cap2.height = 80;
  const c2 = cap2.getContext('2d');
  c2.fillStyle = '#f3f1ea'; c2.fillRect(0, 0, 440, 80);
  c2.fillStyle = '#1f2328'; c2.textAlign = 'center';
  c2.font = `600 30px ${FONT}`; c2.fillText('กดเรียกรถเก็บนอกรอบ', 220, 36);
  c2.font = `400 24px ${FONT}`; c2.fillText('ค่าบริการ 500 บาท', 220, 68);
  const capTex = new THREE.CanvasTexture(cap2);
  capTex.colorSpace = THREE.SRGBColorSpace;
  const capPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.033), new THREE.MeshStandardMaterial({ map: capTex, roughness: 0.7 }));
  capPlate.position.set(0, -0.122, 0.0395);
  // internals: DIN-rail controller panel — controller, LTE router, LoRa gateway, DC-DC, relay,
  // breaker and terminal blocks on two rails, slotted wire duct between, routed wiring and coax
  const uIn = new THREE.Group();
  const uz = -uD / 2 + 0.006;
  uIn.add(rbox(uW - 0.02, uH - 0.02, 0.003, plate, 0, 0, uz - 0.0015, 0.001));
  const rail = (y) => uIn.add(rbox(uW - 0.03, 0.035, 0.007, steel, 0, y, uz + 0.004, 0.001));
  const mod = (x, y, w, h, color, d = 0.04) => { const m = rbox(w, h, d, new THREE.MeshStandardMaterial({ color, roughness: 0.45 }), x, y, uz + 0.007 + d / 2, 0.003); uIn.add(m); return m; };
  const r1y = 0.075, r2y = -0.035;
  rail(r1y); rail(r2y);
  // rail 1: controller (MCU), LTE router, LoRa gateway
  const dev = (kind, x, y, w, h, d = 0.04) => uIn.add(device(kind, w, h, d, x, y, uz + 0.007 + d / 2));
  dev('ctrl', -0.055, r1y, 0.06, 0.07);
  dev('lte', 0.012, r1y, 0.045, 0.07);
  dev('lora', 0.06, r1y, 0.035, 0.07);
  for (const [x, c] of [[0.0, 0x22c55e], [0.012, 0x22c55e], [0.024, 0xf59e0b], [0.06, 0x3b82f6]]) {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.5 }));
    led.position.set(x, r1y - 0.02, uz + 0.048);
    uIn.add(led);
  }
  // SMA connectors on top of LTE / LoRa modules + coax up to the two antennas
  for (const x of [0.012, 0.06]) uIn.add(rbox(0.008, 0.01, 0.008, shield, x, r1y + 0.04, uz + 0.027, 0.001));
  // slotted wire duct between the rails and along the bottom
  const ductMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.6 });
  // slotted PVC wire duct: channel + snap-on cover, wires enter through the fingers on the top/bottom edges
  const coverMat = new THREE.MeshStandardMaterial({ color: 0xb8bec5, roughness: 0.55 });
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x3f454b, roughness: 0.8 });
  const duct = (y) => {
    uIn.add(rbox(uW - 0.03, 0.024, 0.026, ductMat, 0, y, uz + 0.015, 0.002));
    uIn.add(rbox(uW - 0.026, 0.026, 0.004, coverMat, 0, y, uz + 0.03, 0.0015));
    for (let i = 0; i < 18; i++) for (const e of [1, -1]) uIn.add(rbox(0.004, 0.003, 0.02, slotMat, -0.092 + i * 0.0108, y + e * 0.0115, uz + 0.015, 0.0005));
  };
  duct(0.02); duct(-0.095);
  // rail 2: DC breaker, DC-DC converter, beacon relay, terminal blocks
  dev('brk', -0.085, r2y, 0.018, 0.05);
  uIn.add(rbox(0.006, 0.012, 0.008, chip, -0.085, r2y + 0.004, uz + 0.051, 0.001));
  dev('dcdc', -0.055, r2y, 0.035, 0.05);
  dev('relay', -0.024, r2y, 0.018, 0.05);
  const relayLed = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.5 }));
  relayLed.position.set(-0.024, r2y + 0.018, uz + 0.048);
  uIn.add(relayLed);
  const tbColors = [0xd42a1e, 0x111111, 0x9ca3af, 0x9ca3af, 0x1d4ed8, 0x16a34a, 0x9ca3af];
  tbColors.forEach((c, i) => dev(c === 0x1d4ed8 ? 'tbBlue' : c === 0x16a34a ? 'tbGreen' : 'tb', 0.0 + i * 0.0105, r2y, 0.009, 0.045, 0.038));
  // (all unit wiring is laid later, together with the cabinet wiring, in cabinet coordinates)
  uIn.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = 'unitInside'; } });
  unit.add(uIn);
  const unitGlandPower = gland(P(-0.06, -uH / 2, 0), P(0, -1, 0));
  const unitGlandBeacon = gland(P(0.06, -uH / 2, 0), P(0, -1, 0));
  label(unit, 'คอนโทรลเลอร์ (MCU)', -0.055, r1y + 0.05, 0.02, unitDoor);
  label(unit, 'เราเตอร์ 4G LTE → แดชบอร์ด', 0.025, r1y - 0.05, 0.03, unitDoor);
  label(unit, 'LoRa gateway', 0.065, r1y + 0.055, 0.02, unitDoor);
  label(unit, 'DC-DC 12→5V · รีเลย์ไฟ', -0.045, r2y - 0.035, 0.03, unitDoor);
  label(unit, 'เบรกเกอร์ · ขั้วต่อสาย', 0.035, r2y + 0.035, 0.03, unitDoor);
  label(unit, 'รางเดินสาย', 0, -0.095, 0.035, unitDoor);
  // LoRa gateway + LTE antenna on top of the unit
  const antBase = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.02, 16), dark);
  antBase.position.set(0.07, 0.16, 0);
  const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.16, 12), dark);
  whip.position.set(0.07, 0.25, 0);
  const antBase2 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.016, 16), dark);
  antBase2.position.set(-0.07, 0.158, 0);
  const stubby = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.05, 4, 10), dark);
  stubby.position.set(-0.07, 0.2, 0);
  // (antennas moved to the cabinet roof)

  unit.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.part ??= 'unit'; } });
  button.userData.part = 'callButton';
  group.add(unit);


  /* ---------- combined outer cabinet: battery box + control unit side by side behind one lockable door ----------
     SUS304 2 mm wall-mount cabinet (560 W x 460 H x 170 D), built for years on a Bangkok sidewalk:
     - rain: IP55 door gasket, double-skin sun-shield roof with drip edges, every cable entry from the BOTTOM
     - heat: thermostat-switched 120 mm filter fan exhausting high under a rain cowl, filtered intake in the floor
     - vandals: concealed hinges, 3-point swing-handle lock + padlock, 6 mm polycarbonate window, raised steel
       shroud round the call button, tamper-proof wall bolts, dome antenna, cables in steel conduit + trunking
     The public only reaches the button; the two inner boxes stay separate (own doors, own glands). */
  const cab = new THREE.Group();
  cab.position.set(cabX, CAB.y, CAB.z);
  cab.rotation.y = -Math.PI / 2;                       // local +Z faces world -X, local +X = world +Z
  const cabMat = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.75, roughness: 0.35, roughnessMap: null });
  const cW = CAB.w, cH = CAB.h, cD = CAB.d;
  {
    const th = 0.004, shell = new THREE.Group();
    shell.add(rbox(cW, cH, th, cabMat, 0, 0, -cD / 2 + th / 2, 0.002));                                   // back
    {                                                // door-side wall with the intake cut-out
      const rs = new THREE.Shape();
      rs.moveTo(-cD / 2, -cH / 2); rs.lineTo(cD / 2, -cH / 2); rs.lineTo(cD / 2, cH / 2); rs.lineTo(-cD / 2, cH / 2); rs.closePath();
      const hole = new THREE.Path(); hole.absarc(-CAB.inZ, CAB.inY, 0.058, 0, Math.PI * 2, true); rs.holes.push(hole);
      const rw = new THREE.Mesh(new THREE.ExtrudeGeometry(rs, { depth: th, bevelEnabled: false, curveSegments: 40 }), cabMat);
      rw.rotation.y = Math.PI / 2; rw.position.x = cW / 2 - th;
      shell.add(rw);
    }
    for (const sy of [-1, 1]) shell.add(rbox(cW - 2 * th, th, cD, cabMat, 0, sy * (cH / 2 - th / 2), 0, 0.002));
    // pole-side wall: a real 2 mm sheet with three round fan cut-outs punched through it
    const wsh = new THREE.Shape();
    wsh.moveTo(-cD / 2, -cH / 2); wsh.lineTo(cD / 2, -cH / 2); wsh.lineTo(cD / 2, cH / 2); wsh.lineTo(-cD / 2, cH / 2); wsh.closePath();
    for (const fy of CAB.fanYs) { const hole = new THREE.Path(); hole.absarc(-CAB.fanZ, fy, 0.058, 0, Math.PI * 2, true); wsh.holes.push(hole); }
    const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(wsh, { depth: th, bevelEnabled: false, curveSegments: 40 }), cabMat);
    wall.rotation.y = Math.PI / 2;                   // shape x -> -Z, extrusion -> +X
    wall.position.x = -cW / 2;
    shell.add(wall);
    shell.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = 'cabinet'; } });
    cab.add(shell);
  }
  // double-skin sun-shield roof: 25 mm air gap on spacers, 40 mm overhang, folded drip edges, slight fall to the front
  const sunShield = new THREE.Group();
  sunShield.position.set(0, cH / 2 + 0.027, -CAB.gap / 2 + 0.005);   // reaches back over the fan gap to the panel
  sunShield.rotation.x = 0.05;
  const shD = cD + CAB.gap + 0.05;
  sunShield.add(rbox(cW + 0.08, 0.003, shD, cabMat, 0, 0, 0, 0.001));
  for (const sx of [-1, 1]) sunShield.add(rbox(0.003, 0.018, shD, cabMat, sx * (cW / 2 + 0.04), -0.009, 0, 0.001));
  sunShield.add(rbox(cW + 0.08, 0.018, 0.003, cabMat, 0, -0.009, shD / 2, 0.001));
  sunShield.add(rbox(cW + 0.08, 0.03, 0.003, cabMat, 0, -0.012, -shD / 2 + 0.0015, 0.001));   // flashing down onto the panel
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sunShield.add(rbox(0.02, 0.025, 0.02, cabMat, sx * (cW / 2 - 0.04), -0.014, sz * (cD / 2 - 0.03), 0.002));
  cab.add(sunShield);
  // exhaust: three 120 mm fans stacked on the pole-side wall, each behind a louvred grille under its own
  // rain hood that opens downward, so driving rain can't get in; air comes in through the door intake below
  const fanRotors = [];
  const fanMats = { frame: dark, blade: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.45 }), guard: steel };
  // motion-blur disc swept by the blades: fades in as the fan speeds up (blades fade out), so a fast fan reads as
  // a blur instead of strobing at the frame rate
  const blurMat = new THREE.MeshBasicMaterial({ color: 0x3a3e44, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const blurGeo = new THREE.RingGeometry(0.12 * 0.17, 0.12 * 0.47 - 0.0015, 40);
  const fanBlurs = [];
  const addBlur = (f) => { for (const z of [-0.008, 0.008]) { const d = new THREE.Mesh(blurGeo, blurMat); d.position.z = z; d.visible = false; d.userData.noMerge = true; f.add(d); fanBlurs.push(d); } };   // one disc each side of the blade sweep
  const sideX = -cW / 2, fanZ = CAB.fanZ;
  // airflow: faint streaks drawn with additive blending. Intake (door side, high): air is drawn up from under its
  // rain hood and converges on the grille. Exhausts (pole side): air leaves each grille and is turned down and out by
  // the hood. Streak speed, length and brightness all follow the actual rotor rpm, so they ease in and out with it.
  const AIR_N = 36;
  const air = [];
  const airPos = new Float32Array(AIR_N * 4 * 2 * 3), airCol = new Float32Array(AIR_N * 4 * 2 * 3);
  const airGeo = new THREE.BufferGeometry();
  airGeo.setAttribute('position', new THREE.BufferAttribute(airPos, 3).setUsage(THREE.DynamicDrawUsage));
  airGeo.setAttribute('color', new THREE.BufferAttribute(airCol, 3).setUsage(THREE.DynamicDrawUsage));
  const airLines = new THREE.LineSegments(airGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  airLines.frustumCulled = false;
  airLines.userData.noMerge = true;
  airLines.raycast = () => {};
  airLines.visible = false;
  cab.add(airLines);
  const airRnd = (() => { let q = 7; return () => ((q = (q * 16807) % 2147483647) / 2147483647); })();
  const newParticle = (p, u0) => { p.u = u0; p.a = airRnd() * Math.PI * 2; p.r = Math.sqrt(airRnd()) * 0.045; p.k = 0.7 + airRnd() * 0.6; p.w = (airRnd() - 0.5); };
  // emitter: c = grille centre (cab-local), out = +1 / -1 along X (outward), intake?
  for (const fy of CAB.fanYs) air.push({ x: sideX - 0.012, y: fy, z: CAB.fanZ, out: -1, intake: false, ps: [] });
  air.push({ x: cW / 2 + 0.012, y: CAB.inY, z: CAB.inZ, out: 1, intake: true, ps: [] });
  for (const e of air) for (let i = 0; i < AIR_N; i++) { const p = {}; newParticle(p, i / AIR_N); e.ps.push(p); }
  const airPt = (e, p, u, out) => {
    // exhaust: 3 cm straight out under the hood, then curving down and away (~35 cm); intake: the reverse path
    const t = e.intake ? 1 - u : u;
    const spread = 1 + t * 2.2;
    const dx = 0.03 * Math.min(1, t * 4) + 0.34 * t * p.k;              // mostly outward...
    const dy = -0.05 * Math.min(1, t * 3) * p.k - 0.05 * t * t;           // ...turned slightly down by the hood
    out.set(e.x + e.out * dx, e.y + Math.sin(p.a) * p.r * spread + dy, e.z + Math.cos(p.a) * p.r * spread + p.w * 0.06 * t);
    return out;
  };
  const _h = new THREE.Vector3(), _t = new THREE.Vector3();
  function updateAir(dt, rpm) {
    const f = rpm / FAN_MAX_RPM;
    const on = rpm > 30;
    airLines.visible = on;
    if (!on) return;
    const speed = 0.25 + 1.6 * Math.pow(f, 0.6);                 // path fraction per second
    const glow = Math.min(1, rpm / 2500);
    const tail = 0.04 + 0.22 * Math.pow(f, 0.7);                  // streak length grows with airspeed
    let k = 0;
    for (const e of air) for (const p of e.ps) {
      p.u += dt * speed * p.k;
      if (p.u >= 1) newParticle(p, p.u - 1);
      const u = p.u;
      airPt(e, p, u, _h);
      airPt(e, p, Math.max(0, u - tail), _t);   // tail = where it was a moment ago
      const fade = Math.sin(Math.PI * u) * glow * 0.55;           // fade in at the start, out at the end
      airPos.set([_h.x, _h.y, _h.z, _t.x, _t.y, _t.z], k * 6);
      airCol.set([0.45 * fade, 0.75 * fade, 0.95 * fade, 0, 0, 0], k * 6);   // pale air-blue head fading to nothing
      k++;
    }
    airGeo.attributes.position.needsUpdate = true;
    airGeo.attributes.color.needsUpdate = true;
  }
  for (const fy of CAB.fanYs) {
    const { group: f, rotor } = axialFan(0.12, fanMats);
    f.rotation.y = -Math.PI / 2;                     // outlet -> local -X, out through the side wall
    f.position.set(sideX + 0.0165, fy, fanZ);
    cab.add(f);
    fanRotors.push(rotor);
    addBlur(f);
  }
  // one continuous louvred grille over all three exhausts + one rain cowl (top + full-height side cheeks) as a
  // single folded piece; open face looks out, the slats are angled down so rain is shed outward
  {
    const cZ0 = fanZ - 0.079, cZ1 = cD / 2 - 0.002;      // cowl spans the wall only: never past the front edge / door
    const yTop = Math.max(...CAB.fanYs) + 0.0675, yBot = Math.min(...CAB.fanYs) - 0.0675, gh = yTop - yBot, gy = (yTop + yBot) / 2;
    const fz0 = fanZ - 0.0675, fz1 = cZ1 - 0.002;     // top/bottom bars run between the outer edges of the two vertical bars (no stub past the front)
    for (const [hh, dd, yy, zz] of [[0.012, fz1 - fz0, yTop - 0.006, (fz0 + fz1) / 2], [0.012, fz1 - fz0, yBot + 0.006, (fz0 + fz1) / 2], [gh, 0.012, gy, cZ1 - 0.008], [gh, 0.012, gy, fanZ - 0.0615]])
      cab.add(rbox(0.01, hh, dd, dark, sideX - 0.005, yy, zz, 0.002));                                   // one grille frame (front bar kept inside the cabinet's front edge)
    for (let y = yBot + 0.02; y < yTop - 0.012; y += 0.02) { const sl = rbox(0.012, 0.003, 0.115, dark, sideX - 0.011, y, fanZ, 0.001); sl.rotation.z = 0.7; cab.add(sl); }
    const hd = 0.045, hw = cZ1 - cZ0, hz = (cZ0 + cZ1) / 2;
    cab.add(rbox(hd + 0.004, 0.004, hw, cabMat, sideX - hd / 2, yTop + 0.006, hz, 0.001));      // cowl top (sloped drip edge below)
    cab.add(rbox(0.004, 0.012, hw, cabMat, sideX - hd - 0.001, yTop, hz, 0.001));              // drip lip
    for (const s2 of [-1, 1]) cab.add(rbox(hd, gh + 0.012, 0.003, cabMat, sideX - hd / 2, gy, hz + s2 * (hw / 2 - 0.0015), 0.001));   // full-height cheeks
  }
  // intake: one 120 mm fan high on the door-side wall (opposite the three exhausts), blowing in through a
  // filter behind an open louvred grille, under a rain hood that opens downward
  {
    const ix = cW / 2, iy = CAB.inY, iz = CAB.inZ;
    const { group: f, rotor } = axialFan(0.12, fanMats);
    f.rotation.y = -Math.PI / 2;                     // outlet -> local -X: pushes air into the cabinet
    f.position.set(ix - 0.0165, iy, iz);
    cab.add(f);
    fanRotors.push(rotor);
    addBlur(f);
    const gz0 = -cD / 2 + 0.003, gz1 = iz + 0.0675;   // top/bottom bars end at the vertical bars' outer edges (no stub past the back);
    // back bar 1 mm inside the hood cheek's outer face so their end faces don't share a plane
    for (const [hh, dd, yy, zz] of [[0.012, gz1 - gz0, iy + 0.0615, (gz0 + gz1) / 2], [0.012, gz1 - gz0, iy - 0.0615, (gz0 + gz1) / 2], [0.135, 0.012, iy, iz + 0.0615], [0.135, 0.012, iy, -cD / 2 + 0.009]])
      cab.add(rbox(0.01, hh, dd, dark, ix + 0.005, yy, zz, 0.002));   // back bar kept inside the cabinet's rear edge
    for (let i = 0; i < 6; i++) { const sl = rbox(0.012, 0.003, 0.115, dark, ix + 0.011, iy - 0.05 + i * 0.02, iz, 0.001); sl.rotation.z = -0.7; cab.add(sl); }
    const iz0 = -cD / 2 + 0.002, iz1 = iz + 0.0775, ihz = (iz0 + iz1) / 2;   // hood stays within the wall, no overhang past the back
    cab.add(rbox(0.045, 0.004, iz1 - iz0, cabMat, ix + 0.0225, iy + 0.074, ihz, 0.001));
    for (const zc of [iz0, iz1 - 0.003]) {
      const cheek = new THREE.Shape(); cheek.moveTo(0, 0); cheek.lineTo(0.045, 0); cheek.lineTo(0, -0.145); cheek.closePath();
      const cm = new THREE.Mesh(new THREE.ExtrudeGeometry(cheek, { depth: 0.003, bevelEnabled: false }), cabMat);
      cm.position.set(ix, iy + 0.072, iz + s2 * 0.077 - (s2 > 0 ? 0.003 : 0));
      cab.add(cm);
    }
  }
  const breather = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.014, 6), dark);
  breather.position.set(cW / 2 - 0.04, -cH / 2 - 0.007, 0.03);
  cab.add(breather);
  // 4 SHS standoff brackets to the panel, M10 tamper-proof (pin-hex) bolts on wall flanges
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const bx = sx * (cW / 2 - 0.05), by = sy * (cH / 2 - 0.05);
    cab.add(rbox(0.04, 0.04, CAB.gap, steel, bx, by, -cD / 2 - CAB.gap / 2, 0.002));
    cab.add(rbox(0.07, 0.05, 0.004, steel, bx, by, -cD / 2 - CAB.gap + 0.002, 0.001));
    for (const ox of [-0.024, 0.024]) {
      const bh = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.005, 20).rotateX(Math.PI / 2), steel);
      bh.position.set(bx + ox, by, -cD / 2 - CAB.gap + 0.007);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.004, 8).rotateX(Math.PI / 2), dark);
      pin.position.set(bx + ox, by, -cD / 2 - CAB.gap + 0.011);
      cab.add(bh, pin);
    }
  }
  // fixed HMI: 7" panel in its own bezel on a stand-off bracket from the backplate, right behind the door
  // window, so it never moves with the door
  {
    const hz = cD / 2 - 0.022;
    screen.position.set(CAB.unitX, CAB.scrY, hz + 0.0045);
    screen.userData.noMerge = true;
    cab.add(screen, rbox(0.2, 0.14, 0.008, dark, CAB.unitX, CAB.scrY, hz, 0.003));
    for (const sx of [-1, 1]) {
      cab.add(rbox(0.02, 0.1, 0.004, steel, CAB.unitX + sx * 0.085, CAB.scrY, hz - 0.006, 0.001));               // bracket ears
      cab.add(rbox(0.02, 0.02, hz - (-cD / 2 + 0.008), steel, CAB.unitX + sx * 0.085, CAB.scrY, (hz + -cD / 2 + 0.008) / 2 - 0.004, 0.002));   // stand-offs
    }
  }
  // finger-type wire ducts (25 x 35 mm, 5 mm slots): one down the middle, one full width along the top
  const cabDuct = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.55 });
  const ductZ = -cD / 2 + 0.026, bz = -cD / 2 + 0.0095;
  function fingerDuct(x0, y0, x1, y1) {           // straight run between two points on the backplate
    const vert = x0 === x1, len = vert ? Math.abs(y1 - y0) : Math.abs(x1 - x0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    cab.add(rbox(vert ? 0.025 : len, vert ? len : 0.025, 0.003, cabDuct, cx, cy, bz, 0.001));                  // base
    const n = Math.floor(len / 0.01);
    for (const s2 of [-1, 1]) for (let i = 0; i < n; i++) {
      const t = -len / 2 + 0.005 + i * 0.01;
      cab.add(rbox(vert ? 0.003 : 0.005, vert ? 0.005 : 0.003, 0.033, cabDuct, vert ? cx + s2 * 0.0115 : cx + t, vert ? cy + t : cy + s2 * 0.0115, ductZ, 0.0005));
    }
    cab.add(rbox(vert ? 0.027 : len, vert ? len : 0.027, 0.002, new THREE.MeshStandardMaterial({ color: 0xa7adb3, roughness: 0.5 }), cx, cy, ductZ + 0.0175, 0.0008));   // lid
  }
  fingerDuct(0, -0.27, 0, 0.24);
  fingerDuct(-0.245, 0.255, 0.245, 0.255);
  // brass earth bar (PE) on insulators low on the back wall; the wiring to it is laid with the rest below
  const brass2 = brassMat();
  cab.add(rbox(0.16, 0.012, 0.006, brass2, -0.13, -0.265, -cD / 2 + 0.02, 0.001));
  for (let i = 0; i < 6; i++)
    cab.add(new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.008, 8).rotateX(Math.PI / 2), steel).translateX(-0.2 + i * 0.028).translateY(-0.265).translateZ(-cD / 2 + 0.026));
  for (const x of [-0.215, -0.045]) cab.add(rbox(0.01, 0.012, 0.012, dark, x, -0.265, -cD / 2 + 0.01, 0.001));   // insulators
  // fan rail (top left): fuse, thermostat (35 °C), AUTO / OFF / ON selector, pilot lamp, 4 fan terminals
  // (+ + 0V 0V, bridged in pairs); sits 17 mm under the top duct so its wires drop straight into the slots
  const fanRailY = 0.185;
  cab.add(rbox(0.2, 0.035, 0.007, steel, -0.13, fanRailY, -cD / 2 + 0.012, 0.001));
  const dinM = (x, w, color) => cab.add(rbox(w, 0.08, 0.06, new THREE.MeshStandardMaterial({ color, roughness: 0.45 }), x, fanRailY, -cD / 2 + 0.045, 0.002));
  dinM(-0.205, 0.018, 0xf2f2f0);                   // fan fuse
  dinM(-0.17, 0.035, 0xe5e7eb);                    // thermostat
  cab.add(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.008, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.4 })).translateX(-0.17).translateY(fanRailY + 0.012).translateZ(-cD / 2 + 0.079));
  dinM(-0.115, 0.045, 0x374151);                   // selector switch body
  dinM(-0.08, 0.016, 0x374151);                    // pilot lamp module
  for (const [i, c] of [0xd9dde1, 0xd9dde1, 0x3b82f6, 0x3b82f6].entries()) {   // fan supply terminals
    const x = -0.065 + i * 0.01;
    cab.add(rbox(0.0085, 0.06, 0.05, new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), x, fanRailY, -cD / 2 + 0.04, 0.001));
    for (const yy of [0.022, -0.022]) cab.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.002, 10).rotateX(Math.PI / 2), steel).translateX(x).translateY(fanRailY + yy).translateZ(-cD / 2 + 0.0655));
  }
  for (const [x, c] of [[-0.06, 0xd42a1e], [-0.04, 0x1d4ed8]]) cab.add(rbox(0.014, 0.004, 0.003, new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), x, fanRailY + 0.012, -cD / 2 + 0.0665, 0.001));   // bridge bars
  fanKnob = new THREE.Group();
  fanKnob.position.set(-0.115, fanRailY + 0.01, -cD / 2 + 0.077);
  fanKnob.add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 24).rotateX(Math.PI / 2), dark));
  fanKnob.add(rbox(0.006, 0.024, 0.012, dark, 0, 0, 0.008, 0.002));
  fanKnob.traverse((m) => { if (m.isMesh) m.userData.part = 'fanSwitch'; });
  cab.add(fanKnob);
  fanLampMat = new THREE.MeshStandardMaterial({ color: 0x14532d, emissive: 0x22c55e, emissiveIntensity: 1.6 });
  cab.add(new THREE.Mesh(new THREE.SphereGeometry(0.0065, 16, 8), fanLampMat).translateX(-0.08).translateY(fanRailY + 0.02).translateZ(-cD / 2 + 0.077));
  {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x2 = c.getContext('2d'); x2.fillStyle = '#e9ecef'; x2.fillRect(0, 0, 256, 64); x2.fillStyle = '#111'; x2.textAlign = 'center'; x2.textBaseline = 'middle';
    x2.font = `600 26px ${FONT}`; x2.fillText('พัดลม: อัตโนมัติ · ปิด · เปิด', 128, 33);
    const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
    const lg = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.022), new THREE.MeshStandardMaterial({ map: tt, roughness: 0.6 }));
    lg.position.set(-0.13, fanRailY - 0.055, -cD / 2 + 0.0085);
    cab.add(lg);
  }
  // galvanised backplate that every component bolts to
  cab.add(rbox(cW - 0.02, cH - 0.2, 0.003, new THREE.MeshStandardMaterial({ color: 0xb9bec3, metalness: 0.6, roughness: 0.45 }), 0, -0.04, -cD / 2 + 0.006, 0.001));
  cab.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = 'cabinet'; } });

  // outer door: hinge on the front-side edge (+X local = toward the sidewalk), opens away from the pole
  const cabDoor = new THREE.Group();
  cabDoor.position.set(cW / 2, 0, cD / 2);
  const ux = CAB.unitX, scrY = CAB.scrY, btnY = -0.06;
  {
    const sh = new THREE.Shape();
    const x0 = -cW, x1 = 0, y0 = -cH / 2, y1 = cH / 2;   // door spans from the hinge (x = 0) to the free edge
    sh.moveTo(x0, y0); sh.lineTo(x1, y0); sh.lineTo(x1, y1); sh.lineTo(x0, y1); sh.closePath();
    const wx = ux - cW / 2, win = new THREE.Path();
    win.moveTo(wx - 0.105, scrY - 0.075); win.lineTo(wx - 0.105, scrY + 0.075); win.lineTo(wx + 0.105, scrY + 0.075); win.lineTo(wx + 0.105, scrY - 0.075); win.closePath();
    const hole = new THREE.Path();
    hole.absarc(wx, btnY, 0.031, 0, Math.PI * 2, true);
    sh.holes.push(win, hole);
    const dg = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1, curveSegments: 32 });
    const panel = new THREE.Mesh(dg, cabMat);
    panel.position.z = 0.001;
    cabDoor.add(panel);
    // window: 6 mm vandal-resistant polycarbonate in a black EPDM frame
    const glass = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.15), glass);
    g.position.set(wx, scrY, 0.0045);
    g.userData.noMerge = true;
    cabDoor.add(g);
    const epdm = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.85 });
    for (const [w, h, x, y] of [[0.222, 0.008, wx, scrY + 0.079], [0.222, 0.008, wx, scrY - 0.079], [0.008, 0.166, wx - 0.111, scrY], [0.008, 0.166, wx + 0.111, scrY]])
      cabDoor.add(rbox(w, h, 0.01, epdm, x, y, 0.004, 0.002));
    // button bezel: yellow ring around the hole + caption plate
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.031, 0.046, 40), new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 }));
    ring.position.set(wx, btnY, 0.0085);
    cabDoor.add(ring);
    btnParts.push(ring);
    const cp = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.033), new THREE.MeshStandardMaterial({ map: capTex, roughness: 0.7 }));
    cp.position.set(wx, btnY - 0.068, 0.0085);
    cabDoor.add(cp);
    btnParts.push(cp);
    // battery-side panel: warning label
    const wl = document.createElement('canvas'); wl.width = 400; wl.height = 260;
    const w2 = wl.getContext('2d');
    w2.fillStyle = '#f4f5f6'; w2.fillRect(0, 0, 400, 260);
    w2.fillStyle = '#1f7a3a'; w2.fillRect(0, 0, 400, 56);
    w2.fillStyle = '#fff'; w2.textAlign = 'center'; w2.font = `600 30px ${FONT}`; w2.fillText('ตู้ควบคุม · กทม.', 200, 39);
    w2.fillStyle = '#f2c200'; w2.beginPath(); w2.moveTo(200, 80); w2.lineTo(244, 156); w2.lineTo(156, 156); w2.closePath(); w2.fill();
    w2.fillStyle = '#1d2228'; w2.font = `700 52px ${FONT}`; w2.fillText('!', 200, 150);
    w2.font = `600 26px ${FONT}`; w2.fillText('ระบบไฟฟ้า · เฉพาะเจ้าหน้าที่', 200, 198);
    w2.font = `400 22px ${FONT}`; w2.fillText('แบตเตอรี่ LiFePO4 + ชุดควบคุมภายใน', 200, 236);
    const wlT = new THREE.CanvasTexture(wl); wlT.colorSpace = THREE.SRGBColorSpace;
    const wlm = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.11), new THREE.MeshStandardMaterial({ map: wlT, roughness: 0.6 }));
    wlm.position.set(-cW + CAB.battX + cW / 2 - 0.0, 0.04, 0.0085);
    cabDoor.add(wlm);
    // status screen on a bracket just behind the window, call button through the bezel hole

    button.position.set(wx, btnY, 0.016);
    buttonZ = button.position.z;
    cabDoor.add(button, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 24).rotateX(Math.PI / 2), dark).translateX(wx).translateY(btnY).translateZ(-0.012));
    // raised stainless shroud round the call button (no kicking / prying it out)
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.022, 40, 1, true).rotateX(Math.PI / 2), steel);
    shroud.position.set(wx, btnY, 0.019);
    shroud.material = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide });
    cabDoor.add(shroud);
    btnParts.push(shroud);
    // concealed hinges (inside only, nothing to unscrew); 3-point swing handle lock on the free edge
    const handleX = -cW + 0.035;
    cabDoor.add(rbox(0.03, 0.12, 0.006, dark, handleX, 0.03, 0.009, 0.004));                          // handle escutcheon
    const lever = rbox(0.016, 0.085, 0.012, steel, handleX, 0.03, 0.017, 0.005);
    cabDoor.add(lever);
    cabDoor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 16).rotateX(Math.PI / 2), brassMat()).translateX(handleX).translateY(0.08).translateZ(0.014));
    for (const sy of [1, -1]) cabDoor.add(rbox(0.008, cH * 0.42, 0.006, steel, handleX - 0.01, sy * cH * 0.25, -0.006, 0.001));   // lock rods (inside)
    cabDoor.add(rbox(0.04, 0.024, 0.006, steel, -cW + 0.012, -0.1, 0.011, 0.002));
    const lockBody = rbox(0.04, 0.032, 0.016, new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.3 }), -cW - 0.004, -0.13, 0.022, 0.004);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0028, 8, 20, Math.PI), steel);
    shackle.position.set(-cW - 0.004, -0.114, 0.022);
    cabDoor.add(lockBody, shackle);
    // EPDM gasket on the inside
    for (const [w, h, x, y] of [[cW - 0.012, 0.006, -cW / 2, cH / 2 - 0.009], [cW - 0.012, 0.006, -cW / 2, -cH / 2 + 0.009], [0.006, cH - 0.012, -cW + 0.009, 0], [0.006, cH - 0.012, -0.009, 0]])
      cabDoor.add(rbox(w, h, 0.004, epdm, x, y, -0.001, 0.001));
  }
  cabDoor.traverse((m) => { if (m.isMesh) { m.castShadow = !m.material.transparent; m.userData.part = 'cabinet'; } });
  button.userData.part = 'callButton';                 // door traverse above would swallow the button
  for (const m of btnParts) m.userData.part = 'callButton';
  cabDoor.userData = { open: 0, target: 0, side: 1, max: 2.0 };   // ~115°, stops before the station's front face
  cab.add(cabDoor);
  doors.push(cabDoor);
  // LTE + LoRa in one low anti-vandal dome on the sun shield (IP67, nothing to snap off); coax runs inside
  {
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.55 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.052, 0.008, 32), domeMat);
    base.position.set(ux, cH / 2 + 0.034, -0.0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.046, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.scale.y = 0.6;
    dome.position.set(ux, cH / 2 + 0.038, 0);
    base.userData.part = dome.userData.part = 'unit';
    cab.add(base, dome);
  }
  // every cable enters through the cabinet floor (IP68 glands), so rain can never run along a cable into the box
  group.add(cab);
  const floorY = CAB.y - CAB.h / 2;
  const ez = CAB.z - CAB.w / 2 + 0.025, rx = cabX + 0.07;   // solar riser: pole-side wall, behind the fans, near the backplate
  group.add(gland(P(rx, floorY, ez), P(0, -1, 0)));
  conduit([pS, P(pS.x, pS.y, pS.z + 0.03), P(rx, pS.y, ez), P(rx, floorY - 0.004, ez)], 'cableSolar');   // outside: steel conduit to the floor gland
  // inside the cabinet the field cables become ordinary insulated cores, laid in the panel wiring below
  unit.updateMatrix();
  const uL = (x, y, z) => P(x, y, z).applyMatrix4(unit.matrix);
  // beacon feed: steel conduit from the floor gland under the controller up the pole
  {
    const uBea = uL(0.06, -uH / 2, 0);
    group.add(gland(P(uBea.x, floorY, uBea.z), P(0, -1, 0)));
    conduit([P(uBea.x, floorY - 0.004, uBea.z), P(uBea.x, pB.y, uBea.z), P(uBea.x, pB.y, pB.z + 0.03), P(pB.x, pB.y, pB.z + 0.03), pB], 'cableBeacon');
    // galvanised steel trunking from the pole to under the cabinet: both conduits run inside it, the lid is held
    // by tamper-proof screws (comes off in the inside / circuit views so the runs can be seen)
    const tz0 = poleZ + 0.03, tz1 = uBea.z + 0.04, ty0 = 0.11, ty1 = floorY - 0.004, tx0 = X0, tx1 = X0 - 0.15;   // deep enough to swallow both conduit drops under the cabinet
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0xa9afb5, metalness: 0.75, roughness: 0.4 });
    const trunk = new THREE.Group();
    trunk.add(rbox(tx0 - tx1, 0.003, tz1 - tz0, trunkMat, (tx0 + tx1) / 2, ty0, (tz0 + tz1) / 2, 0.001));      // bottom
    trunk.add(rbox(tx0 - tx1, ty1 - ty0, 0.003, trunkMat, (tx0 + tx1) / 2, (ty0 + ty1) / 2, tz1, 0.001));      // end cap
    group.add(tag(trunk, 'trunking'));
    // pole-end plate: closes the run against the pole, the two pole glands pass through grommeted holes;
    // a stainless band clamps the plate to the pole so the trunking cannot be levered off
    {
      const es = new THREE.Shape();
      es.moveTo(tx1, ty0); es.lineTo(tx0, ty0); es.lineTo(tx0, ty1); es.lineTo(tx1, ty1); es.closePath();
      for (const gy of [0.15, 0.21]) { const h = new THREE.Path(); h.absarc(poleX, gy, 0.017, 0, Math.PI * 2, true); es.holes.push(h); }
      const ep = new THREE.Mesh(new THREE.ExtrudeGeometry(es, { depth: 0.003, bevelEnabled: false, curveSegments: 24 }), trunkMat);
      ep.position.z = tz0 + 0.001;
      trunk.add(ep);
      const grom = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.85 });
      for (const gy of [0.15, 0.21]) {
        const g = new THREE.Mesh(new THREE.TorusGeometry(0.0165, 0.0025, 8, 24), grom);
        g.position.set(poleX, gy, tz0 + 0.0025);
        trunk.add(g);
      }
      const bandY = (ty0 + 0.15) / 2 - 0.005;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0315, 0.0315, 0.02, 32, 1, true), steel);
      band.material = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide });
      band.position.set(poleX, bandY, poleZ);
      trunk.add(band);
      for (const sx of [-1, 1]) {
        trunk.add(rbox(0.006, 0.02, 0.008, band.material, poleX + sx * 0.022, bandY, tz0 - 0.0045, 0.001));   // band ears bolted to the plate
        const bh = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 6).rotateX(Math.PI / 2), steel);
        bh.position.set(poleX + sx * 0.022, bandY, tz0 + 0.006);   // nut inside the trunking
        trunk.add(bh);
      }
    }
    trunkLid = new THREE.Group();
    trunkLid.add(rbox(0.003, ty1 - ty0 + 0.006, tz1 - tz0 + 0.006, trunkMat, tx1, (ty0 + ty1) / 2, (tz0 + tz1) / 2, 0.001));
    trunkLid.add(rbox(tx0 - tx1, 0.003, tz1 - tz0, trunkMat, (tx0 + tx1) / 2, ty1, (tz0 + tz1) / 2, 0.001));
    for (const yy of [ty0 + 0.025, ty1 - 0.025]) for (const zz of [tz0 + 0.03, (tz0 + tz1) / 2, tz1 - 0.03]) {
      const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.003, 12).rotateZ(Math.PI / 2), steel);
      sc.position.set(tx1 - 0.002, yy, zz);
      trunkLid.add(sc);
    }
    const tl = document.createElement('canvas'); tl.width = 512; tl.height = 96;
    const t2 = tl.getContext('2d'); t2.fillStyle = '#f2c200'; t2.fillRect(0, 0, 512, 96); t2.fillStyle = '#111'; t2.textAlign = 'center'; t2.textBaseline = 'middle';
    t2.font = `700 40px ${FONT}`; t2.fillText('อันตราย · สายไฟฟ้า', 256, 48);
    const tlT = new THREE.CanvasTexture(tl); tlT.colorSpace = THREE.SRGBColorSpace;
    const tlm = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.03), new THREE.MeshStandardMaterial({ map: tlT, roughness: 0.6 }));
    tlm.rotation.y = -Math.PI / 2; tlm.position.set(tx1 - 0.002, (ty0 + ty1) / 2, (tz0 + tz1) / 2);
    trunkLid.add(tlm);
    group.add(tag(trunkLid, 'trunking'));
  }

  /* ---------- panel wiring ----------
     Every run is written in cabinet-local coordinates (x across, y up, z out of the door; backplate face at
     z = -0.0775) and lands on a real terminal. Runs between parts go through the finger ducts: the middle
     duct (x = 0, slots at every whole cm of y) and the top duct (y = 0.255, slots at x = ...5 mm), and through
     the controller's own ducts. Home 'b' / 'u' = battery / controller block (kept with their hover part),
     'c' = cabinet, 'g' = field cables in hardware space that also carry the current-flow animation.
     Colours (12 V DC panel): + red, 0 V black, PE green-yellow, signals grey, data blue, coax black. */
  {
    cab.updateMatrix(); batt.updateMatrix(); unit.updateMatrix();
    const inv = (o) => new THREE.Matrix4().copy(o.matrix).invert();
    const homes = {
      c: { obj: cab, m: new THREE.Matrix4(), part: 'cabinet' },
      b: { obj: bIn, m: inv(batt).multiply(cab.matrix), part: 'batteryInside' },
      u: { obj: uIn, m: inv(unit).multiply(cab.matrix), part: 'unitInside' },
      g: { obj: group, m: cab.matrix.clone(), part: 'cabinet' },
    };
    const RED = 0xd42a1e, BLK = 0x151515, GRY = 0x8b939c, BLU = 0x2563eb, GY = 'gy', COAX = 0x1a1a1a;
    const gyMat = (() => {                        // green with yellow longitudinal stripes (wraps round the core)
      const c = document.createElement('canvas'); c.width = 2; c.height = 10;
      const g = c.getContext('2d');
      g.fillStyle = '#1f9d3a'; g.fillRect(0, 0, 2, 10);
      g.fillStyle = '#f2c200'; g.fillRect(0, 0, 2, 2); g.fillRect(0, 5, 2, 2);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45 });
    })();
    const M = (c) => (c === GY ? gyMat : wmat(c));
    const cyl1 = new THREE.CylinderGeometry(1, 1, 1, 8);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xd8dcdf, metalness: 0.85, roughness: 0.3 });
    const markMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 });
    const Yax = new THREE.Vector3(0, 1, 0);
    const put = (home, m) => { m.castShadow = true; m.userData.part = home.part; home.obj.add(m); return m; };
    function sleeve(home, mat, at, dir, r, len) {
      const m = new THREE.Mesh(cyl1, mat);
      m.scale.set(r, len, r);
      m.quaternion.setFromUnitVectors(Yax, dir);
      m.position.copy(at);
      return put(home, m);
    }
    // run(home, colour, points, { a / b: 'f' = insulated ferrule into a screw terminal (default), 'n' = plain end
    //   (gland, sheath, lug, fan lead, hidden in a duct), r, bend, mark: wire-number sleeve, flow: flow part })
    function run(h, color, pts, o = {}) {
      const home = homes[h];
      const v = pts.map((p) => P(...p).applyMatrix4(home.m));
      const r = o.r ?? 0.0022, mat = M(color), collar = color === GY ? wmat(0x1f9d3a) : mat;
      for (const [flag, i, j] of [[o.a ?? 'f', 0, 1], [o.b ?? 'f', v.length - 1, v.length - 2]]) {
        if (flag !== 'f') continue;
        const T = v[i].clone(), d = T.clone().sub(v[j]).normalize();      // points into the terminal
        v[i] = T.clone().addScaledVector(d, -0.003);
        sleeve(home, collar, T.clone().addScaledVector(d, -0.0045), d, r + 0.0006, 0.005);
        sleeve(home, tipMat, T, d, 0.0011, 0.004);
      }
      if (o.mark) {                               // marker sleeve 16 mm back from whichever end has room
        for (const [i, j] of [[v.length - 1, v.length - 2], [0, 1]]) {
          const d = v[i].clone().sub(v[j]);
          if (d.length() < 0.03) continue;
          d.normalize();
          sleeve(home, markMat, v[i].clone().addScaledVector(d, -0.014), d, r + 0.0007, 0.008);
          break;
        }
      }
      const m = put(home, routed(v, r, o.bend ?? 0.008, mat, 6, 5));
      if (o.flow) flows.push({ curve: m.userData.curve, part: o.flow });
      return m;
    }
    const cabM = (mesh, x, y, z) => { mesh.position.set(x, y, z); return put(homes.c, mesh); };
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 });
    function tie(x, y, z, r, along = 'y') {           // nylon cable tie round a bundle
      const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0011, 4, 14), tieMat);
      if (along === 'y') t.rotation.x = Math.PI / 2; else if (along === 'x') t.rotation.y = Math.PI / 2;
      cabM(t, x, y, z);
    }
    const nutGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    function nut(x, y, z, r, h, axis = 'y', mat = steel) {
      const n = new THREE.Mesh(nutGeo, mat);
      n.scale.set(r, h, r);
      if (axis === 'z') n.rotation.x = Math.PI / 2; else if (axis === 'x') n.rotation.z = Math.PI / 2;
      cabM(n, x, y, z);
    }

    // ---- floor glands (inside): locknut, stripped-back sheath, P-clip strain relief to the back wall ----
    const sheathMat = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.7 });
    const sheath = (x, z, y0, y1) => { const s = new THREE.Mesh(cyl1, sheathMat); s.scale.set(0.0065, y1 - y0, 0.0065); cabM(s, x, (y0 + y1) / 2, z); };
    function pclip(x, y, z) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.0075, 0.0016, 5, 16), steel);
      t.rotation.x = Math.PI / 2;
      cabM(t, x, y, z);
      const len = z - 0.0075 - (-cD / 2 + 0.004);
      cabM(rbox(0.009, 0.005, len, steel, 0, 0, 0, 0.001), x, y, -cD / 2 + 0.004 + len / 2);   // tab / bracket to the back wall
      nut(x, y, -cD / 2 + 0.0055, 0.003, 0.003, 'z', dark);
    }
    const floorIn = -cH / 2 + 0.004;
    const SX = -0.255, SZ = -0.07, BX = 0.19, BZ = -0.037;                 // solar / beacon gland axes
    for (const [x, z, top] of [[SX, SZ, -0.262], [BX, BZ, -0.252]]) {
      nut(x, floorIn + 0.002, z, 0.0125, 0.004, 'y', glandMat);
      sheath(x, z, floorIn, top);
      pclip(x, floorIn + 0.014, z);
    }

    // ---- battery block: MPPT strip <- straight drops from the rail devices right below it ----
    const XPVp = -0.1925, XPVn = -0.1675, XBATp = -0.1425, XBATn = -0.1175, XLDp = -0.0925, XLDn = -0.0675;
    const mpptBot = -0.0175, brkTop = -0.035, brkBot = -0.085, tbTop = -0.04, tbBot = -0.08, tzB = -0.034;
    for (const [x, c, top] of [[XPVp, RED, brkTop], [XPVn, BLK, tbTop], [XBATp, RED, brkTop], [XBATn, BLK, tbTop], [XLDp, RED, brkTop], [XLDn, BLK, tbTop]])
      run('b', c, [[x, top, tzB], [x, mpptBot, tzB]]);
    // battery cables (thicker) from the booted posts straight up into the battery breaker / BAT- terminal
    run('b', RED, [[XBATp, -0.103, -0.0265], [XBATp, -0.094, -0.031], [XBATp, brkBot, tzB]], { a: 'n', r: 0.003 });
    run('b', BLK, [[XBATn, -0.103, -0.0265], [XBATn, -0.092, -0.031], [XBATn, tbBot, tzB]], { a: 'n', r: 0.003 });

    // ---- solar field cable: floor gland -> up the pole-side corner (behind the fans) -> PV breaker / PV- ----
    run('g', RED, [[SX - 0.0025, floorIn, SZ - 0.0015], [SX - 0.0025, -0.092, SZ - 0.0015], [-0.236, -0.092, -0.035], [XPVp, -0.092, -0.035], [XPVp, brkBot, tzB]], { a: 'n', r: 0.0024, mark: true, flow: 'cableSolar' });
    run('c', BLK, [[SX + 0.0025, -0.264, SZ - 0.0015], [SX + 0.0025, -0.1, SZ - 0.0015], [-0.236, -0.1, -0.046], [XPVn, -0.1, -0.046], [XPVn, tbBot, -0.04]], { a: 'n', r: 0.0024, mark: true });
    for (const y of [-0.2, -0.14]) tie(SX, y, SZ - 0.0015, 0.0055);
    // panel-frame earth from the same cable straight to the earth bar
    run('c', GY, [[SX, -0.264, SZ + 0.0035], [SX, -0.252, SZ + 0.0035], [-0.235, -0.25, -0.065], [-0.2, -0.25, -0.065], [-0.2, -0.2595, -0.065]], { a: 'n', mark: true });

    // ---- earth bar -> backplate bond stud, and -> controller PE terminal through the middle duct ----
    nut(-0.172, -0.226, -cD / 2 + 0.0105, 0.004, 0.005, 'z');
    cabM(new THREE.Mesh(new THREE.TorusGeometry(0.0045, 0.0012, 5, 12), brass2), -0.172, -0.226, -cD / 2 + 0.0095);   // ring lug
    run('c', GY, [[-0.172, -0.2595, -0.065], [-0.172, -0.24, -0.068], [-0.172, -0.2305, -0.0745]], { b: 'n' });
    run('c', GY, [[-0.06, -0.2595, -0.065], [-0.06, -0.25, -0.062], [0.005, -0.25, -0.062], [0.005, -0.19, -0.062], [0.17, -0.19, -0.058], [0.1825, -0.178, -0.05], [0.1825, -0.1475, -0.045]], { mark: true });

    // ---- 12 V load: fuse / LOAD- -> middle duct -> controller's lower duct -> breaker / 0 V terminal ----
    run('g', RED, [[XLDp, brkBot, tzB], [XLDp, -0.1, -0.04], [-0.025, -0.1, -0.05], [-0.004, -0.1, -0.05], [-0.004, -0.19, -0.048], [0.03, -0.19, -0.048], [0.045, -0.18, -0.046], [0.045, -0.15, -0.045]], { r: 0.0024, mark: true, flow: 'cableBatt' });
    run('c', BLK, [[XLDn, tbBot, tzB], [XLDn, -0.09, -0.038], [-0.025, -0.09, -0.058], [0.003, -0.09, -0.058], [0.003, -0.18, -0.058], [0.128, -0.18, -0.054], [0.1405, -0.17, -0.05], [0.1405, -0.1475, -0.045]], { r: 0.0024, mark: true });

    // ---- controller block: short drops from every module into its two ducts (runs inside are hidden) ----
    const XTB = (i) => 0.13 + i * 0.0105;
    for (const [x, c] of [[0.055, RED], [0.062, BLK], [0.09, BLU], [0.098, GRY], [0.128, RED], [0.135, BLK], [0.155, BLU], [0.18, RED], [0.187, BLK], [0.2, BLU]])
      run('u', c, [[x, -0.05, -0.04], [x, -0.066, -0.046]], { b: 'n' });                        // rail 1 bottoms -> upper duct
    for (const [x, c, top, z] of [[0.045, RED, -0.1, -0.04], [0.068, RED, -0.1, -0.04], [0.082, BLK, -0.1, -0.04], [0.102, GRY, -0.1, -0.04], [0.11, RED, -0.1, -0.04],
      [XTB(0), RED, -0.1025, -0.034], [XTB(1), BLK, -0.1025, -0.034], [XTB(2), RED, -0.1025, -0.04], [XTB(3), GRY, -0.1025, -0.04], [XTB(4), BLK, -0.1025, -0.04]])
      run('u', c, [[x, top, z], [x, -0.075, -0.046]], { b: 'n' });                               // rail 2 tops -> upper duct
    for (const [x, c, bot] of [[0.068, RED, -0.15], [0.082, BLK, -0.15], [0.106, RED, -0.15], [XTB(0), RED, -0.1475]])
      run('u', c, [[x, bot, -0.04], [x, -0.18, -0.046]], { b: 'n' });                            // rail 2 bottoms -> lower duct
    // beacon cable: relay-switched +12 V, colour-select signal and 0 V out of the lower duct to the floor gland
    run('g', RED, [[XTB(2), -0.1475, -0.045], [XTB(2), -0.188, -0.05], [BX - 0.003, -0.188, -0.048], [BX - 0.003, -0.24, -0.04], [BX - 0.003, floorIn, -0.039]], { b: 'n', mark: true, flow: 'cableBeacon' });
    run('c', GRY, [[XTB(3), -0.1475, -0.045], [XTB(3), -0.192, -0.046], [BX + 0.003, -0.192, -0.044], [BX + 0.003, -0.24, -0.04], [BX + 0.003, -0.256, -0.039]], { b: 'n', mark: true });
    run('c', BLK, [[XTB(4), -0.1475, -0.045], [XTB(4), -0.184, -0.042], [BX, -0.184, -0.04], [BX, -0.24, -0.034], [BX, -0.256, -0.034]], { b: 'n', mark: true });
    tie(BX, -0.226, -0.038, 0.0062);
    // HMI: cable from the controller's top connector up to the plug on the back of the screen bezel
    cabM(rbox(0.016, 0.008, 0.012, dark, 0, 0, 0, 0.001), 0.075, 0.024, -0.03);
    cabM(rbox(0.018, 0.012, 0.007, dark, 0, 0, 0, 0.001), 0.07, 0.115, 0.0555);
    run('c', 0x52525b, [[0.075, 0.028, -0.03], [0.075, 0.055, -0.03], [0.07, 0.105, 0.02], [0.07, 0.115, 0.0522]], { a: 'n', b: 'n', r: 0.0026, bend: 0.02 });
    // antenna coax: SMA on the router / gateway -> up through the top duct -> roof bulkheads under the dome
    for (const [x0, xs, xr, z] of [[0.142, 0.145, 0.115, -0.05], [0.19, 0.195, 0.135, -0.058]]) {
      nut(x0, 0.033, -0.039, 0.0042, 0.007, 'y', shield);                                       // SMA plug
      nut(xr, cH / 2 - 0.006, z, 0.0065, 0.004, 'y', shield);                                   // bulkhead nut
      run('c', COAX, [[x0, 0.036, -0.039], [x0, 0.05, -0.039], [xs, 0.07, z], [xs, 0.255, z], [xr, 0.255, z], [xr, cH / 2 - 0.008, z]], { a: 'n', b: 'n', r: 0.0025, bend: 0.012 });
    }

    // ---- fan circuit: +12 V / 0 V from the controller terminals -> middle duct -> top duct -> fan rail ----
    const fTop = 0.225, fBot = 0.145;
    run('c', RED, [[XTB(0), -0.1025, -0.047], [XTB(0), -0.07, -0.05], [0.004, -0.07, -0.05], [0.004, 0.247, -0.05], [-0.012, 0.247, -0.068], [-0.195, 0.247, -0.068], [-0.205, 0.247, -0.062], [-0.205, fTop, -0.062]], { mark: true });
    run('c', BLK, [[XTB(1), -0.1025, -0.047], [XTB(1), -0.07, -0.058], [-0.004, -0.07, -0.058], [-0.004, 0.13, -0.058], [-0.035, 0.13, -0.055], [-0.035, fBot, -0.055]], { mark: true });
    // jumpers under the rail: fuse -> thermostat & selector ON, thermostat -> selector AUTO, selector -> fan + / lamp, lamp -> 0 V
    const loop = (c, x0, z0, x1, z1, y) => run('c', c, [[x0, fBot, z0], [x0, y, z0], [x1, y, z1], [x1, fBot, z1]], { bend: 0.005 });
    loop(RED, -0.205, -0.025, -0.178, -0.025, 0.136);
    loop(RED, -0.205, -0.036, -0.115, -0.036, 0.126);
    loop(RED, -0.162, -0.03, -0.127, -0.03, 0.134);
    loop(RED, -0.103, -0.036, -0.065, -0.036, 0.128);
    loop(RED, -0.103, -0.024, -0.084, -0.024, 0.138);
    loop(BLK, -0.076, -0.055, -0.045, -0.055, 0.136);
    // fan leads: two per bridged terminal, up into the top duct, out of its ends to each fan's lead exit
    const fanLead = [[0.05, -0.262, -0.268], [0.057, -0.262, -0.268], [0.064, -0.262, -0.268]];
    CAB.fanYs.forEach((fy, k) => {
      const zk = -fanLead[k][0], ye = fy + 0.05;
      const [xr, tzr] = [[-0.065, -0.045], [-0.065, -0.056], [-0.055, -0.045]][k];
      const [xb, tzb] = [[-0.045, -0.045], [-0.045, -0.056], [-0.035, -0.045]][k];
      run('c', RED, [[xr, fTop, tzr], [xr, 0.25, tzr], [xr - 0.012, 0.25, zk], [fanLead[k][1], 0.25, zk], [fanLead[k][1], ye, zk], [fanLead[k][1], ye, -0.0398]], { b: 'n' });
      run('c', BLK, [[xb, fTop, tzb], [xb, 0.26, tzb], [xb - 0.012, 0.26, zk], [fanLead[k][2], 0.26, zk], [fanLead[k][2], ye, zk], [fanLead[k][2], ye, -0.0398]], { b: 'n' });
      for (const x of [fanLead[k][1], fanLead[k][2]]) nut(x, ye, -0.0405, 0.0034, 0.003, 'z', dark);   // lead grommets
    });
    tie(-0.265, 0.2, -0.0605, 0.0075); tie(-0.265, 0.11, -0.0605, 0.0075); tie(-0.265, -0.02, -0.064, 0.006);
    run('c', RED, [[-0.055, fTop, -0.056], [-0.055, 0.25, -0.056], [-0.043, 0.256, -0.068], [0.25, 0.256, -0.068], [0.259, 0.256, -0.068], [0.259, CAB.inY + 0.0605, -0.068]], { b: 'n', bend: 0.005 });
    run('c', BLK, [[-0.035, fTop, -0.056], [-0.035, 0.25, -0.056], [-0.023, 0.263, -0.068], [0.25, 0.263, -0.068], [0.267, 0.263, -0.068], [0.267, CAB.inY + 0.0605, -0.068]], { b: 'n', bend: 0.005 });

    // ---- door bond: short braided strap from a door stud to a wall stud right at the hinge ----
    nut(cW / 2 - 0.0055, -0.22, cD / 2 - 0.012, 0.004, 0.004, 'x');
    const braid = new THREE.MeshStandardMaterial({ color: 0xb7bdc3, metalness: 0.7, roughness: 0.45 });
    const strap = routed([P(-0.03, -0.22, -0.006), P(-0.018, -0.236, -0.016), P(-0.007, -0.22, -0.012)], 0.0028, 0.01, braid, 6, 5);
    const dstud = new THREE.Mesh(nutGeo, steel); dstud.scale.set(0.004, 0.005, 0.004); dstud.rotation.x = Math.PI / 2; dstud.position.set(-0.03, -0.22, -0.004);
    for (const m of [strap, dstud]) { m.castShadow = true; m.userData.part = 'cabinet'; cabDoor.add(m); }
  }

  function drawScreen(state) {
    const ctx = scr.getContext('2d');
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, 360, 240);
    const pending = state.status === 'pending';
    ctx.fillStyle = pending ? '#ef4444' : '#22c55e';
    ctx.fillRect(0, 0, 360, 44);
    ctx.fillStyle = '#fff';
    ctx.font = `600 24px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(state.callRequested ? 'เรียกรถแล้ว · รอรถมินิ EV' : pending ? 'รอรถมาเก็บ' : 'เก็บแล้ว', 14, 31);
    const names = ['รีไซเคิล', 'เศษอาหาร', 'ทั่วไป', 'ถุงดำ'];
    const colors = ['#f3c200', '#2f9e45', '#2f7bd0', '#9aa0a6'];
    state.fills.forEach((f, i) => {
      const y = 62 + i * 42;
      ctx.fillStyle = '#c9d1d9'; ctx.font = `400 19px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText(names[i], 14, y + 18);
      ctx.fillStyle = '#21262d'; ctx.fillRect(110, y + 2, 180, 20);
      ctx.fillStyle = f >= 80 ? '#ef4444' : colors[i];
      ctx.fillRect(110, y + 2, 180 * f / 100, 20);
      ctx.fillStyle = '#e6edf3'; ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(f)}%`, 346, y + 18);
    });
    screenTex.needsUpdate = true;
  }

  let blink = false, blinkT = 0, pressT = 0, lastOn = null;
  const RED = new THREE.Color(0xef4444), GREEN = new THREE.Color(0x22c55e);

  function apply(state) {
    const pending = state.status === 'pending';
    const col = pending ? RED : GREEN;
    lensMat.emissive.copy(col);
    lensMat.color.copy(col).multiplyScalar(0.6);
    blink = !!state.callRequested;
    if (!blink) { lensMat.emissiveIntensity = 2.4; lastOn = null; }

    // fill levels
    const usable = B.rimHeight - 0.1;
    station.bins.forEach((bin, i) => {
      const f = state.fills[i] / 100, m = trashes[i];
      m.visible = f > 0.02;
      const y = 0.03 + f * usable;
      const t = Math.min(1, y / (B.rimHeight - 0.07));
      const w = THREE.MathUtils.lerp(B.bodyBottomWidth, B.bodyTopWidth, t) - 0.03;
      const d = THREE.MathUtils.lerp(B.bodyBottomDepth, B.bodyTopDepth, t) - 0.03;
      m.scale.set(w / 0.7071, 1, d / 0.7071);
      m.position.y = y;
    });
    const fb = state.fills[3] / 100;
    bagOrder.forEach((o, i) => (o.visible = i / bagOrder.length < fb));
    drawScreen(state);
  }

  // fewer draw calls: merge each enclosure (except its door) and the remaining static hardware
  mergeStatic(unit, (n) => n === unitDoor);
  mergeStatic(batt, (n) => n === battDoor);
  mergeStatic(cab, (n) => n === cabDoor || n === fanKnob || n === screen || fanRotors.some((r) => r.parent === n));
  mergeStatic(group, (n) => [unit, batt, solar, beacon, cab, trunkLid].includes(n));

  /* ---------- circuit flow: glowing dots running along the conduits ---------- */
  const FLOW_COLORS = { cableSolar: 0xff5a36, cableBatt: 0xff5a36, cableBeacon: 0xffb020 };
  const dotGeo = new THREE.SphereGeometry(0.008, 10, 8);
  const dots = [];
  for (const f of flows) {
    const mat = new THREE.MeshBasicMaterial({ color: FLOW_COLORS[f.part] ?? 0x38bdf8, toneMapped: false });
    const len = f.curve.getLength();
    const n = Math.max(3, Math.round(len / 0.08));
    for (let i = 0; i < n; i++) {
      const d = new THREE.Mesh(dotGeo, mat);
      d.visible = false;
      d.userData = { curve: f.curve, u: i / n, speed: 0.12 / len };
      group.add(d);
      dots.push(d);
    }
  }
  let flowing = false;
  // the outer door opens whenever an inner box is opened, and shuts when both are closed
  function syncCab() { cabDoor.userData.target = unitDoor.userData.target || battDoor.userData.target ? 1 : 0; }

  return {
    group,
    // world-space anchors for the camera when focusing a device
    focusTargets: { unit, battery: batt, solar, beacon, sensor: () => sensors[0] },
    setUnitOpen(v) { unitDoor.userData.target = v ? 1 : 0; syncCab(); },
    setBatteryOpen(v) { battDoor.userData.target = v ? 1 : 0; syncCab(); },
    toggleCabinet() {
      const open = !cabDoor.userData.target;
      cabDoor.userData.target = open ? 1 : 0;
      if (!open) { unitDoor.userData.target = 0; battDoor.userData.target = 0; }
    },
    setFlow(v) { flowing = v; dots.forEach((d) => (d.visible = v)); trunkLid.visible = !(v || insideMode); },
    button,
    apply,
    press() { pressT = 0.25; },
    toggleUnit() { unitDoor.userData.target = unitDoor.userData.target ? 0 : 1; syncCab(); },
    toggleBattery() { battDoor.userData.target = battDoor.userData.target ? 0 : 1; syncCab(); },
    setInsideView(v) {
      insideMode = v;
      doors.forEach((d) => (d.userData.target = v ? 1 : 0));
      trunkLid.visible = !(v || flowing);
      sensorBody.opacity = v ? 0.25 : 1;
      sensorBody.depthWrite = !v;
    },
    isInsideView: () => insideMode,
    // cabinet fans: 'auto' (35 °C thermostat), 'on', 'off'; the selector knob and pilot lamp follow
    setFanMode(m) {
      fanMode = m;
      fanKnob.rotation.z = m === 'auto' ? 0.8 : m === 'on' ? -0.8 : 0;
      fanLampMat.emissiveIntensity = m === 'off' ? 0 : 1.6;
      fanLampMat.emissive.setHex(m === 'auto' ? 0xf59e0b : 0x22c55e);
    },
    getFanMode: () => fanMode,
    setFanSpeed(pct) { fanPct = Math.max(0, Math.min(100, pct)); },
    getFanSpeed: () => fanPct,
    getFanRpm: () => fanRpm,
    cycleFanMode() { this.setFanMode(fanMode === 'auto' ? 'on' : fanMode === 'on' ? 'off' : 'auto'); },   // the "look inside" mode itself; single doors can still be opened by clicking
    // returns 2 = doors moved (shadows), 1 = repaint (button travel / labels), 3 = beacon flip only, 0 = idle
    update(dt, camPos) {
      let moving = false, lightFlip = false;
      if (flowing) {
        for (const d of dots) {
          d.userData.u = (d.userData.u + d.userData.speed * dt) % 1;
          d.position.copy(d.userData.curve.getPointAt(d.userData.u));
        }
        moving = true;
      }
      let res = 0;
      // fans: rotor speed follows the set speed through a first-order lag (rotor inertia): ~0.8 s to spin up,
      // ~2 s to coast down, so speed changes are always smooth. The drawn spin rate saturates well below the frame
      // rate (no wagon-wheel strobing); above that the blades fade into a motion-blur disc.
      {
        const goal = fanMode === 'off' ? 0 : (fanPct / 100) * FAN_MAX_RPM;
        const tau = goal > fanRpm ? 0.8 : 2.0;
        fanRpm += (goal - fanRpm) * (1 - Math.exp(-dt / tau));
        if (Math.abs(goal - fanRpm) < 0.5) fanRpm = goal;
        if (fanRpm > 0.01 || goal > 0) {
          const w = (fanRpm * Math.PI) / 30;                         // rad/s
          const wDraw = 24 * Math.tanh(w / 24);                      // max ~3.8 rev/s drawn: stays under the 7-blade strobe limit at 60 fps
          fanRotors.forEach((r) => (r.rotation.z += dt * wDraw));
          const t = Math.min(1, Math.max(0, (w - 20) / 400)), blur = t * t * (3 - 2 * t);   // full blur from ~4000 rpm
          blurMat.opacity = 0.93 * blur;
          fanBlurs.forEach((d) => (d.visible = blur > 0.01));
          const bo = 1 - 0.95 * blur, wantT = bo < 0.999;
          if (fanMats.blade.transparent !== wantT) { fanMats.blade.transparent = wantT; fanMats.blade.needsUpdate = true; }
          fanMats.blade.opacity = bo;
          updateAir(dt, fanRpm);
          lightFlip = true;
        }
      }
      for (const d of doors) {
        const u = d.userData;
        if (Math.abs(u.target - u.open) > 1e-4) {
          u.open += (u.target - u.open) * Math.min(1, dt * 5);
          if (Math.abs(u.target - u.open) <= 1e-4) u.open = u.target;
          d.rotation.y = u.side * u.open * u.max;
          res = 2;
        }
      }
      for (const { o, owner } of insideLabels) {
        const show = owner === 'sensor' ? sensorBody.opacity < 1 : owner.userData.open > 0.6;
        if (o.visible !== show) { o.visible = show; res = Math.max(res, 1); }
      }
      if (blink) {
        blinkT += dt;
        const on = Math.sin(blinkT * Math.PI * 2 * 1.2) > 0;
        if (on !== lastOn) {                     // repaint only when the light flips
          lastOn = on;
          lensMat.emissiveIntensity = on ? 3 : 0.2;
          lightFlip = true;
        }
      }
      if (pressT > 0) {
        pressT = Math.max(0, pressT - dt);
        button.position.z = buttonZ - 0.012 * Math.sin((pressT / 0.25) * Math.PI);
        moving = true;
      }
      // 3 = only a light changed: repaint at full quality without the fast (no-AO) frame
      return res || (moving ? 1 : lightFlip ? 3 : 0);
    },
  };
}
