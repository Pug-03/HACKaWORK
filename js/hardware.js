import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rbox, roundedBoxGeometry, mergeStatic } from './geom.js';
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
    hinge.userData = { open: 0, target: 0, side };
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
        for (let i = 0; i < 3; i++) { g.fillStyle = '#e5e7eb'; g.beginPath(); g.arc(W2 * (0.14 + i * 0.1), H2 * 0.66, H2 * 0.05, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = `500 ${Math.round(H2 * 0.06)}px ${FONT}`; g.textAlign = 'center';
        ['PV+', 'PV−', 'BAT+', 'BAT−', 'LD+', 'LD−'].forEach((t, i) => g.fillText(t, W2 * (0.083 + i * 0.167), H2 * 0.82));
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
  function routed(pts, radius, bend, mat) {
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
  const poleX = X0 - 0.05, poleZ = -D / 2 + 0.04, poleTop = 1.78;
  const conduitMat = new THREE.MeshStandardMaterial({ color: 0x3c4146, roughness: 0.6, metalness: 0.2 });
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
  bIn.add(rbox(0.012, 0.102, packD + 0.004, dark, 0, packTop - 0.05, packZ, 0.002));          // strap
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
  const mpptT = [-0.0625, -0.0375, -0.0125, 0.0125, 0.0375, 0.0625].map((x) => {    // PV+ PV- BAT+ BAT- LOAD+ LOAD-
    bIn.add(rbox(0.018, 0.012, 0.012, shield, x, mpptY - 0.042, mpptZ + 0.006, 0.001));
    return [x, mpptY - 0.048, mpptZ + 0.006];
  });
  // DIN rail with PV breaker, battery breaker, load fuse and terminal blocks
  const railY = 0.005, railZ = zp + 0.004;
  bIn.add(rbox(bW - 0.04, 0.035, 0.007, steel, 0, railY, railZ, 0.001));
  const dinDev = (kind, x, w, h = 0.05) => bIn.add(device(kind, w, h, 0.035, x, railY, railZ + 0.02));
  dinDev('brk', -0.07, 0.018); dinDev('brk', -0.05, 0.018);                  // DC breakers (PV, battery)
  for (const x of [-0.07, -0.05]) bIn.add(rbox(0.006, 0.012, 0.008, chip, x, railY + 0.002, railZ + 0.041, 0.001));   // toggles
  dinDev('fuse', -0.025, 0.02);                                               // load fuse holder
  for (let i = 0; i < 4; i++) dinDev(i % 2 ? 'tbBlue' : 'tb', 0.01 + i * 0.008, 0.007, 0.04);   // terminal blocks
  // wiring (rounded runs between real terminal points)
  const zw = railZ + 0.03;
  bIn.add(pwire(0xd42a1e, [bt[0], [bt[0][0], railY - 0.035, packZ], [-0.05, railY - 0.035, zw], [-0.05, railY - 0.025, zw]]));                 // BAT+ -> breaker
  bIn.add(pwire(0xd42a1e, [[-0.05, railY + 0.025, zw], [-0.05, railY + 0.035, zw], [-0.0125, railY + 0.035, zw], mpptT[2]]));                 // breaker -> BAT+
  bIn.add(pwire(0x111111, [bt[1], [bt[1][0], railY - 0.04, packZ], [0.0125, railY - 0.04, zw], [0.0125, railY + 0.04, zw], mpptT[3]]));      // BAT- -> MPPT
  bIn.add(pwire(0xd42a1e, [[-0.07, bH / 2 - 0.006, -0.02], [-0.07, bH / 2 - 0.03, -0.02], [-0.085, bH / 2 - 0.05, zw], [-0.085, railY + 0.035, zw], [-0.07, railY + 0.035, zw], [-0.07, railY + 0.025, zw]]));   // PV+ in -> breaker
  bIn.add(pwire(0xd42a1e, [[-0.07, railY - 0.025, zw], [-0.07, railY - 0.04, zw], [-0.0625, railY - 0.04, zw], mpptT[0]]));                  // breaker -> PV+
  bIn.add(pwire(0x111111, [[-0.062, bH / 2 - 0.006, -0.02], [-0.062, bH / 2 - 0.03, -0.02], [-0.0375, mpptY + 0.06, zw], mpptT[1]]));        // PV-
  bIn.add(pwire(0xd42a1e, [mpptT[4], [0.0375, railY + 0.035, zw], [0.014, railY + 0.035, zw], [0.014, railY + 0.02, zw]]));                  // LOAD+ -> terminal
  bIn.add(pwire(0x111111, [mpptT[5], [0.0625, railY + 0.035, zw], [0.03, railY + 0.035, zw], [0.03, railY + 0.02, zw]]));                     // LOAD- -> terminal
  bIn.add(pwire(0xd42a1e, [[0.014, railY - 0.02, zw], [0.014, -0.05, zw], [0.07, -0.07, zw], [0.07, -bH / 2 + 0.03, -0.02], [0.07, -bH / 2 + 0.006, -0.02]]));   // to control unit
  bIn.add(pwire(0x111111, [[0.03, railY - 0.02, zw], [0.03, -0.045, zw], [0.078, -0.065, zw], [0.078, -bH / 2 + 0.03, -0.02], [0.078, -bH / 2 + 0.006, -0.02]]));
  bIn.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = 'batteryInside'; } });
  batt.add(bIn);
  // cable glands: solar in (top), load out to the control unit (bottom)
  const battGlandTop = gland(P(-0.066, bH / 2, -0.02), P(0, 1, 0));
  const battGlandBot = gland(P(0.074, -bH / 2, -0.02), P(0, -1, 0));
  batt.add(battGlandTop, battGlandBot);
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
  conduit([pS, P(pS.x, pS.y, pS.z + 0.03), P(bTop.x, pS.y, bTop.z), P(bTop.x, bTop.y + 0.03, bTop.z), bTop], 'cableSolar');      // solar -> battery
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
  unit.position.set(-L / 2 - 0.006 - 0.035, 0.68, 0.12);
  unit.rotation.y = -Math.PI / 2;               // local +Z now faces world -X
  const uW = 0.22, uH = 0.3, uD = 0.07;
  const unitShell = new THREE.MeshStandardMaterial({ color: 0x2f3439, metalness: 0.3, roughness: 0.45 });
  unit.add(enclosure(uW, uH, uD, unitShell, 'unit'));
  const unitDoor = door(unit, uW, uH, uD, unitShell, 'unit', 1);   // hinge toward the front so it doesn't cover the battery box
  doors.push(unitDoor);
  // screen
  const scr = document.createElement('canvas');
  scr.width = 360; scr.height = 240;
  const screenTex = new THREE.CanvasTexture(scr);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.12), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 0.065, 0.0395);
  screen.userData.part = 'unit';
  unitDoor.attachFront(screen);
  // call button: red mushroom in a yellow ring
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 32), new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, -0.06, 0.044);
  const btnMat = new THREE.MeshStandardMaterial({ color: 0xd42a1e, emissive: 0x7a0d06, emissiveIntensity: 0.4, roughness: 0.35 });
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.022, 32), btnMat);
  button.rotation.x = Math.PI / 2;
  button.position.set(0, -0.06, 0.059);
  button.userData.part = 'callButton';
  unitDoor.attachFront(button);
  const buttonZ = button.position.z;
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
  uIn.add(routed([P(0.012, r1y + 0.045, uz + 0.027), P(0.012, r1y + 0.06, uz + 0.027), P(0.07, uH / 2 - 0.02, 0), P(0.07, uH / 2 - 0.004, 0)], 0.0018, 0.01, wmat(0x111111)));
  uIn.add(routed([P(0.06, r1y + 0.045, uz + 0.027), P(0.06, r1y + 0.055, uz + 0.027), P(-0.07, uH / 2 - 0.025, 0), P(-0.07, uH / 2 - 0.004, 0)], 0.0018, 0.01, wmat(0x111111)));
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
  // short jumpers from modules into the ducts (the runs inside the duct are hidden, like a real panel)
  const uzw = uz + 0.03;
  for (const [x, c] of [[-0.065, 0xd42a1e], [-0.045, 0x111111], [0.005, 0xd42a1e], [0.02, 0x111111], [0.055, 0x1d4ed8]]) uIn.add(pwire(c, [[x, r1y - 0.035, uzw], [x, 0.031, uzw]]));
  for (const [x, c] of [[-0.085, 0xd42a1e], [-0.06, 0xd42a1e], [-0.05, 0x111111], [-0.024, 0xf59e0b], [0.0, 0xd42a1e], [0.0105, 0x111111], [0.042, 0x1d4ed8], [0.0525, 0x16a34a]]) {
    uIn.add(pwire(c, [[x, r2y + 0.025, uzw], [x, 0.009, uzw]]));
    uIn.add(pwire(c, [[x, r2y - 0.025, uzw], [x, -0.084, uzw]]));
  }
  // field cables leave the bottom duct straight down to the two glands
  uIn.add(pwire(0xd42a1e, [[-0.064, -0.106, uzw], [-0.064, -0.12, uzw], [-0.062, -uH / 2 + 0.02, 0], [-0.062, -uH / 2 + 0.004, 0]]));
  uIn.add(pwire(0x111111, [[-0.056, -0.106, uzw], [-0.056, -0.12, uzw], [-0.058, -uH / 2 + 0.02, 0], [-0.058, -uH / 2 + 0.004, 0]]));
  uIn.add(pwire(0xf59e0b, [[0.056, -0.106, uzw], [0.056, -0.12, uzw], [0.058, -uH / 2 + 0.02, 0], [0.058, -uH / 2 + 0.004, 0]]));
  uIn.add(pwire(0x111111, [[0.064, -0.106, uzw], [0.064, -0.12, uzw], [0.062, -uH / 2 + 0.02, 0], [0.062, -uH / 2 + 0.004, 0]]));
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

  // conduits that need the control unit: battery load -> unit, unit -> pole (beacon)
  {
    const uPow = tipOf(unit, unitGlandPower), uBea = tipOf(unit, unitGlandBeacon);
    conduit([bBot, P(bBot.x, 0.25, bBot.z), P(uPow.x, 0.25, uPow.z), uPow], 'cableBatt');
    conduit([uBea, P(uBea.x, pB.y, uBea.z), P(uBea.x, pB.y, pB.z + 0.03), P(pB.x, pB.y, pB.z + 0.03), pB], 'cableBeacon');
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
  mergeStatic(group, (n) => [unit, batt, solar, beacon].includes(n));

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
    isInsideView: () => insideMode,   // the "look inside" mode itself; single doors can still be opened by clicking
    // returns 2 = doors moved (shadows), 1 = repaint (button travel / labels), 3 = beacon flip only, 0 = idle
    update(dt) {
      let moving = false, lightFlip = false;
      if (flowing) {
        for (const d of dots) {
          d.userData.u = (d.userData.u + d.userData.speed * dt) % 1;
          d.position.copy(d.userData.curve.getPointAt(d.userData.u));
        }
        moving = true;
      }
      let res = 0;
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
