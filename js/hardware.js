import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rbox, roundedRect, mergeStatic } from './geom.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Low-cost smart kit, sized so a whole province can afford one per station:
//  - one IP65 polycarbonate hub box (160 x 120 x 75 mm) on the left end panel: a single 130 x 40 mm mainboard
//    (ESP32-C3-MINI-1 with BLE built in, SIM7080G NB-IoT under a heatsink, 1S MPPT charger, RTC, microSD),
//    a flex LTE antenna, 2 x 18650 cells and an SHT40 temperature / humidity board
//  - 6 V 2 W panel on a tilting stainless bracket above the box (doubles as a rain hood), short cable straight
//    down from its junction box into an M12 gland in the top of the box, sheltered under the panel
//  - 30 mm 5 V mini fan on the sidewalk-side wall behind a louvred rain hood; the ESP32 runs it only when the
//    box gets hot (> 45 °C) in the afternoon sun
//  - 2.9" tri-colour e-paper behind a clear window in the lid: fill per bay, battery, signal, pickup status
//  - warm LED service light under the top wall; a reed switch + lid magnet turn it on when the lid opens
//  - 22 mm stainless anti-vandal "call extra pickup" button on the lid; its LED ring is the station's status
//    light (red = waiting for pickup, green = collected, blinking = extra pickup requested)
//  - a BLE fill sensor under every bin lid (VL53L1X time-of-flight + nRF52 module + 2 x AA), no wires
//    because the bins are wheeled away at every pickup; the measuring cone and reading show in the views
//  - visible fill level inside each bin / bag bay
const FONT = 'Kanit, Thonburi, sans-serif';
const MONO = 'Menlo, Consolas, monospace';

// rough Thai retail prices per station (THB), shown in the circuit panel
export const KIT_COST = {
  hub: [
    ['เมนบอร์ด BKK HUB (ESP32-C3 + SIM7080G + MPPT + RTC + microSD) ผลิตล็อต 1,000', 690],
    ['เสาอากาศแปะ LTE + ฮีตซิงก์ + เซ็นเซอร์ SHT40', 90],
    ['ถ่าน 18650 ×2 + รางถ่าน', 200],
    ['แผงโซลาร์ 6V 2W', 150],
    ['จอ e-paper 2.9″ 3 สี + บอร์ดขับ SPI', 390],
    ['กล่อง IP65 + หน้าต่างใส + ปุ่มกด LED วงแหวน', 300],
    ['พัดลมจิ๋ว 5V 30 มม. + ครอบกันฝน', 60],
    ['ไฟ LED ในกล่อง + สวิตช์แม่เหล็ก (reed)', 40],
  ],
  sensor: [['เซ็นเซอร์ฝาถัง BLE (nRF52 + ToF + ถ่าน AA ×2)', 520]],
  sensors: 3,
};
export const kitTotal = () => KIT_COST.hub.reduce((s, [, p]) => s + p, 0) + KIT_COST.sensor[0][1] * KIT_COST.sensors;

/* ---------- small helpers ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// polyline with rounded corners -> tube (wires, cables); straight runs get one ring pair, bends five
function routedGeo(pts, radius, bend, radial = 6) {
  pts = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 1e-5);
  const path = new THREE.CurvePath();
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (i < pts.length - 1) {
      const r = Math.min(bend, p.distanceTo(prev) / 2, p.distanceTo(pts[i + 1]) / 2);
      const a = p.clone().addScaledVector(p.clone().sub(prev).normalize(), -r);
      const b = p.clone().addScaledVector(pts[i + 1].clone().sub(p).normalize(), r);
      if (a.distanceTo(prev) > 1e-5) path.add(new THREE.LineCurve3(prev, a));
      path.add(new THREE.QuadraticBezierCurve3(a, p, b));
      prev = b;
    } else path.add(new THREE.LineCurve3(prev, p));
  }
  const parts = path.curves.map((c) => [c, c.isLineCurve3 ? 1 : 5]);
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
const hexGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 18);

export function buildHardware(station) {
  const group = new THREE.Group();
  group.name = 'hardware';
  const B = CONFIG.bin;
  const L = station.length;

  /* ---------- materials ---------- */
  const M = {
    pc: new THREE.MeshPhysicalMaterial({ color: 0xc9ccd0, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.5 }),   // light-grey polycarbonate
    pcLid: new THREE.MeshPhysicalMaterial({ color: 0xd3d6da, roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.4 }),
    pcIn: new THREE.MeshStandardMaterial({ color: 0xb4b8bd, roughness: 0.75 }),
    gasket: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 }),
    ss: new THREE.MeshStandardMaterial({ color: 0xc6cbd0, metalness: 0.9, roughness: 0.22 }),   // stainless
    ssBrushed: new THREE.MeshStandardMaterial({ color: 0xb3b9bf, metalness: 0.85, roughness: 0.38 }),
    zinc: new THREE.MeshStandardMaterial({ color: 0xa9b0b6, metalness: 0.8, roughness: 0.35 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.85, roughness: 0.3 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe0b84a, metalness: 0.95, roughness: 0.25 }),
    black: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.55 }),
    blackGloss: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.12, metalness: 0.1 }),
    nylon: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.55 }),
    jst: new THREE.MeshStandardMaterial({ color: 0xf4f0e2, roughness: 0.5 }),
    termGreen: new THREE.MeshStandardMaterial({ color: 0x1f8a4c, roughness: 0.5 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc7ccd1, metalness: 0.85, roughness: 0.3 }),
    backsheet: new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.85 }),
    ferrite: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.5 }),
    flex: new THREE.MeshStandardMaterial({ color: 0xc2860f, roughness: 0.45, metalness: 0.2 }),
    silica: new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.85 }),
    blueMod: new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.5 }),
    cap: new THREE.MeshStandardMaterial({ color: 0xa47b47, roughness: 0.5 }),
  };
  const wireMats = {};
  const wmat = (c) => (wireMats[c] ??= new THREE.MeshStandardMaterial({ color: c, roughness: 0.42 }));
  const ledMats = {};
  const ledMat = (c) => (ledMats[c] ??= new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, roughness: 0.3 }));
  const tag = (o, part) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part ??= part; } }); return o; };
  const put = (parent, mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh; };
  const cyl = (r, h, mat, axis = 'z', geo = cylGeo) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(r, h, r);
    if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2;
    return m;
  };
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  // pin-hex security screw (button head + recess + centre pin), axis z, head sits on z
  function secScrew(parent, x, y, z, r = 0.0032) {
    put(parent, cyl(r, 0.0016, M.ss), x, y, z + 0.0008);
    put(parent, cyl(r * 0.45, 0.0006, M.black, 'z', hexGeo), x, y, z + 0.0017);
    put(parent, cyl(r * 0.13, 0.0012, M.ss), x, y, z + 0.0016);
  }
  function phillips(parent, x, y, z, r = 0.002) {
    put(parent, cyl(r, 0.001, M.zinc), x, y, z + 0.0005);
    put(parent, box(r * 1.3, r * 0.28, 0.0004, M.black), x, y, z + 0.00105);
    put(parent, box(r * 0.28, r * 1.3, 0.0004, M.black), x, y, z + 0.00105);
  }

  /* ---------- "look inside" labels ---------- */
  const insideLabels = [];
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

  /* =====================================================================================================
     HUB BOX — 160 W x 120 H x 75 D mm polycarbonate, IP65: 65 mm body + 7.5 mm lid (+ field and button).
     Hub-local axes: x across (world +Z = toward the sidewalk), y up, z out of the lid (world -X).
     ===================================================================================================== */
  const hW = 0.16, hH = 0.12, hD = 0.075, wallT = 0.0028, rC = 0.009, bodyD = 0.065;
  const zBack = -hD / 2, zRim = zBack + bodyD;           // back face, top of the body rim (lid seats here)
  const LT = 0.0075;                                     // lid thickness (lid-local top face)
  const X0 = -L / 2 - 0.004;                             // outer face of the left end panel
  const STANDOFF = 0.008;                                // rubber feet between the box and the panel
  const hub = new THREE.Group();
  hub.position.set(X0 - STANDOFF - hD / 2, 0.68, 0.06);
  hub.rotation.y = -Math.PI / 2;

  /* ---------- body shell ---------- */
  const body = new THREE.Group();
  {
    const ring = roundedRect(new THREE.Shape(), hW, hH, rC);
    ring.holes.push(roundedRect(new THREE.Path(), hW - 2 * wallT, hH - 2 * wallT, rC - wallT));
    const bev = 0.0012;
    const walls = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: bodyD - 0.003 - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: 0.0004, bevelSegments: 2, curveSegments: 10 }), M.pc);
    walls.position.z = zBack + 0.003 + bev;
    body.add(walls);
    const back = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(new THREE.Shape(), hW, hH, rC), { depth: 0.003, bevelEnabled: false, curveSegments: 10 }), M.pc);
    back.position.z = zBack;
    body.add(back);
    const floorIn = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), hW - 2 * wallT, hH - 2 * wallT, rC - wallT), 8), M.pcIn);
    floorIn.position.z = zBack + 0.0031;
    body.add(floorIn);
    // gasket groove step just inside the rim
    const lip = roundedRect(new THREE.Shape(), hW - 2 * wallT + 0.0004, hH - 2 * wallT + 0.0004, rC - wallT);
    lip.holes.push(roundedRect(new THREE.Path(), hW - 2 * wallT - 0.0024, hH - 2 * wallT - 0.0024, rC - wallT - 0.0012));
    const lipM = new THREE.Mesh(new THREE.ExtrudeGeometry(lip, { depth: 0.0018, bevelEnabled: false, curveSegments: 10 }), M.pcIn);
    lipM.position.z = zRim - 0.0026;
    body.add(lipM);
  }
  // corner bosses (lid screws on the free edge) with brass inserts, tied to both walls by ribs
  const bossX = hW / 2 - wallT - 0.0048, bossY = hH / 2 - wallT - 0.0048;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const h = bodyD - 0.0045, zc = zBack + 0.003 + h / 2;
    put(body, cyl(0.0048, h, M.pc), sx * bossX, sy * bossY, zc);
    body.add(rbox(0.0012, 0.006, h, M.pc, sx * bossX, sy * (bossY + 0.004), zc, 0.0003));
    body.add(rbox(0.006, 0.0012, h, M.pc, sx * (bossX + 0.004), sy * bossY, zc, 0.0003));
    put(body, cyl(0.0022, 0.0012, M.brass), sx * bossX, sy * bossY, zBack + 0.003 + h + 0.0002);
    put(body, cyl(0.0011, 0.0014, M.black), sx * bossX, sy * bossY, zBack + 0.003 + h + 0.0004);
  }
  // short internal posts carrying the mounting plate
  const plateZ = zBack + 0.0095;                          // mounting plate front face
  const postXY = [[-0.056, 0.038], [0.056, 0.038], [-0.056, -0.038], [0.056, -0.038]];
  for (const [x, y] of postXY) put(body, cyl(0.0034, plateZ - 0.002 - (zBack + 0.003), M.pc), x, y, (plateZ - 0.002 + zBack + 0.003) / 2);
  // external mounting ears moulded into the back corners: pin-hex screws into the panel, rubber feet behind
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const ex = sx * (hW / 2 - 0.014), ey = sy * (hH / 2 + 0.0055);
    body.add(rbox(0.018, 0.012, 0.004, M.pc, ex, ey, zBack + 0.002, 0.0015));
    body.add(rbox(0.012, 0.005, 0.009, M.pc, ex, sy * (hH / 2 + 0.0012), zBack + 0.0065, 0.001));
    secScrew(body, ex, ey + sy * 0.001, zBack + 0.004, 0.0028);
    put(body, cyl(0.005, STANDOFF, M.rubber), ex, ey, zBack - STANDOFF / 2);
  }
  // floor: pressure-equalising membrane vent (front-right); top: the M12 solar gland, under the panel's shadow
  const ventPos = V3(0.05, -hH / 2, 0.006), glandPos = V3(-0.052, hH / 2, -0.006);
  {
    const v = new THREE.Group();
    put(v, cyl(0.0068, 0.0028, M.nylon, 'y', hexGeo), 0, -0.0014, 0);
    put(v, cyl(0.0056, 0.0036, M.nylon, 'y'), 0, -0.0046, 0);
    put(v, cyl(0.004, 0.0004, M.white, 'y'), 0, -0.0066, 0);                                  // ePTFE membrane
    put(v, cyl(0.0068, 0.002, M.nylon, 'y', hexGeo), 0, 0.0035, 0);                           // locknut inside
    v.position.copy(ventPos);
    body.add(v);
    const g = new THREE.Group();
    put(g, cyl(0.0085, 0.004, M.nylon, 'y', hexGeo), 0, -0.002, 0);
    put(g, cyl(0.0072, 0.005, M.nylon, 'y'), 0, -0.0065, 0);
    put(g, cyl(0.0068, 0.0058, M.nylon, 'y', new THREE.CylinderGeometry(0.75, 1, 1, 18)), 0, -0.0118, 0);   // domed sealing cap
    put(g, cyl(0.0085, 0.003, M.nylon, 'y', hexGeo), 0, 0.0045, 0);                            // locknut inside
    g.position.copy(glandPos);
    g.rotation.x = Math.PI;                                 // built pointing down; flip so the cap faces up
    body.add(g);
  }
  // asset tag on the sidewalk-facing side (+x): station id, QR, service number
  {
    const t = canvasTex(400, 260, (g, w, h) => {
      g.fillStyle = '#fafaf7'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1f7a3a'; g.fillRect(0, 0, w, 54);
      g.fillStyle = '#fff'; g.font = `600 30px ${FONT}`; g.textAlign = 'left'; g.fillText('ทรัพย์สิน กทม.', 16, 38);
      g.fillStyle = '#111'; g.font = `700 34px ${MONO}`; g.fillText('BKK-PTW-001', 16, 104);
      g.font = `400 22px ${FONT}`; g.fillText('ฮับ ESP32 · NB-IoT · v1.2', 16, 140);
      g.fillText('ติดตั้ง 11/2026', 16, 172);
      g.fillText('แจ้งเสีย โทร 1555', 16, 206);
      let q = 99; const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
      const qx = 268, qy = 78, cs = 7, n = 16;
      g.fillStyle = '#fff'; g.fillRect(qx - 6, qy - 6, cs * n + 12, cs * n + 12);
      g.fillStyle = '#111';
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (rnd() > 0.52) g.fillRect(qx + i * cs, qy + j * cs, cs, cs);
      for (const [a, b] of [[0, 0], [n - 5, 0], [0, n - 5]]) { g.fillStyle = '#111'; g.fillRect(qx + a * cs, qy + b * cs, cs * 5, cs * 5); g.fillStyle = '#fff'; g.fillRect(qx + (a + 1) * cs, qy + (b + 1) * cs, cs * 3, cs * 3); g.fillStyle = '#111'; g.fillRect(qx + (a + 2) * cs, qy + (b + 2) * cs, cs, cs); }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.046, 0.03), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
    m.rotation.y = Math.PI / 2;
    m.position.set(hW / 2 + 0.0006, 0.026, zBack + bodyD / 2);
    body.add(m);
  }
  // body hinge lugs on the -x edge (the lid's knuckles interleave), stainless pin
  const hingeX = -hW / 2 - 0.0035;
  for (const y of [0.052, 0.02, -0.02, -0.052]) {
    put(body, cyl(0.0035, 0.012, M.pc, 'y'), hingeX, y, zRim);
    body.add(rbox(0.006, 0.012, 0.004, M.pc, hingeX + 0.003, y, zRim - 0.002, 0.001));
  }
  put(body, cyl(0.0011, 0.118, M.ss, 'y'), hingeX, 0, zRim);
  tag(body, 'unit');
  hub.add(body);

  /* ---------- interior ---------- */
  const inside = new THREE.Group();
  inside.add(rbox(0.13, 0.092, 0.002, new THREE.MeshStandardMaterial({ color: 0xe6e7e4, roughness: 0.75 }), 0, 0, plateZ - 0.001, 0.003));
  for (const [x, y] of postXY) phillips(inside, x, y, plateZ, 0.0024);
  // PCB with silkscreen artwork on its top (+z) face
  const pcbTex = (kind, w, h) => canvasTex(Math.round(1200 * w / 0.05), Math.round(1200 * h / 0.05), (g, W, H) => {
    const S = W / w;                                                     // px per metre
    const col = { esp: '#1b1d22', sim: '#0f5132', chg: '#1d4ed8', nrf: '#14532d', tof: '#5b2a86' }[kind];
    g.fillStyle = col; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = Math.max(1, S * 0.0003);
    let q = kind.length * 77 + 5; const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 30; i++) { g.beginPath(); const x = rnd() * W, y = rnd() * H; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * W * 0.5, y); g.lineTo(x + (rnd() - 0.5) * W * 0.5, y + (rnd() - 0.5) * H * 0.6); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.1)';
    for (let i = 0; i < 50; i++) { g.beginPath(); g.arc(rnd() * W, rnd() * H, S * 0.00025, 0, Math.PI * 2); g.fill(); }      // vias
    g.fillStyle = '#f2f2f2'; g.textAlign = 'left';
    const txt = (t, x, y, size, weight = 600) => { g.font = `${weight} ${Math.round(S * size)}px ${MONO}`; g.fillText(t, S * x, S * y); };
    if (kind === 'esp') {
      txt('ESP32-C3-DevKitM', 0.021, 0.0045, 0.0017);
      txt('3V3 5V GND IO2 IO3 IO10', 0.003, 0.0205, 0.0012, 500);
      txt('BOOT', 0.031, 0.0128, 0.0011, 500); txt('RST', 0.0375, 0.0128, 0.0011, 500);
      g.fillStyle = '#c9a227'; for (const x of [0.002, 0.046]) for (const y of [0.002, 0.021]) { g.beginPath(); g.arc(S * x, S * y, S * 0.0011, 0, Math.PI * 2); g.fill(); }
    } else if (kind === 'sim') {
      txt('NB-IoT / Cat-M', 0.002, 0.004, 0.0017); txt('SIM7080G', 0.002, 0.0275, 0.0017);
      txt('NET PWR', 0.019, 0.0275, 0.0011, 500);
    } else if (kind === 'chg') {
      txt('SOLAR MPPT 1S', 0.002, 0.0045, 0.0017);
      txt('IN   BAT   OUT', 0.006, 0.0155, 0.0014);
    } else if (kind === 'nrf') {
      txt('BLE-FILL v2', 0.002, 0.0042, 0.0022); txt('nRF52810', 0.002, 0.039, 0.002);
    } else if (kind === 'tof') {
      txt('VL53L1X', 0.0012, 0.0035, 0.0014);
    }
  });
  function pcb(parent, kind, w, h, x, y, z, t = 0.0016) {
    const top = new THREE.MeshStandardMaterial({ map: pcbTex(kind, w, h), roughness: 0.45, metalness: 0.05 });
    const side = new THREE.MeshStandardMaterial({ color: 0x2f3a2c, roughness: 0.6 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), [side, side, side, side, top, side]);
    m.position.set(x, y, z + t / 2);
    m.castShadow = true;
    parent.add(m);
    return z + t;                                         // top surface z
  }
  function standoffs(parent, cx, cy, w, h, inset, zTop) {
    const len = zTop - plateZ;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) put(parent, cyl(0.0024, len, M.brass, 'z', hexGeo), cx + sx * (w / 2 - inset), cy + sy * (h / 2 - inset), plateZ + len / 2);
  }
  function cornerScrews(parent, cx, cy, w, h, inset, z) {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) phillips(parent, cx + sx * (w / 2 - inset), cy + sy * (h / 2 - inset), z, 0.0017);
  }
  // shielding can with laser-etched marking
  const canTex = (lines) => canvasTex(256, 224, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#d9dde1'); gr.addColorStop(1, '#b7bcc1');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4b5563'; g.textAlign = 'center';
    lines.forEach(([t, s], i) => { g.font = `600 ${s}px ${MONO}`; g.fillText(t, w / 2, 62 + i * 46); });
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });
  function can(parent, w, h, d, x, y, z, lines) {
    const top = new THREE.MeshStandardMaterial({ map: canTex(lines), metalness: 0.75, roughness: 0.3 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [M.ss, M.ss, M.ss, M.ss, top, M.ss]);
    m.position.set(x, y, z + d / 2);
    m.castShadow = true;
    parent.add(m);
  }
  // 2.54 mm pin header: black strip with gold pins
  const headerTex = (n) => canvasTex(64 * n, 64, (g, w) => { g.fillStyle = '#141414'; g.fillRect(0, 0, w, 64); for (let i = 0; i < n; i++) { g.fillStyle = '#e0b84a'; g.fillRect(i * 64 + 24, 24, 16, 16); } });
  function header(parent, n, x, y, z) {
    const top = new THREE.MeshStandardMaterial({ map: headerTex(n), roughness: 0.5 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(n * 0.00254, 0.00254, 0.0025), [M.black, M.black, M.black, M.black, top, M.black]);
    m.position.set(x, y, z + 0.00125);
    parent.add(m);
  }
  // 5 mm 2-pin screw terminal, wire entries facing -y
  function screwTerm(parent, x, y, z) {
    const g = new THREE.Group();
    g.add(rbox(0.01, 0.0075, 0.0085, M.termGreen, 0, 0, 0.00425, 0.0006));
    for (const px of [-0.0025, 0.0025]) {
      put(g, cyl(0.0016, 0.0008, M.zinc), px, 0.0008, 0.0089);
      put(g, box(0.0022, 0.0004, 0.0004, M.black), px, 0.0008, 0.0094);
      g.add(rbox(0.0034, 0.0006, 0.0034, M.black, px, -0.0038, 0.0034, 0.0002));
    }
    g.position.set(x, y, z);
    parent.add(g);
  }
  function jst(parent, pins, x, y, z) {
    const w = pins * 0.002 + 0.002;
    parent.add(rbox(w, 0.0045, 0.006, M.jst, x, y, z + 0.003, 0.0004));
    parent.add(rbox(w - 0.0012, 0.0006, 0.004, M.jst, x, y + 0.0024, z + 0.003, 0.0002));
  }
  const smd = (parent, w, h, d, x, y, z, mat = M.black) => put(parent, box(w, h, d, mat), x, y, z + d / 2);

  /* ---------- BKK HUB mainboard: one 130 x 40 mm 4-layer board, matte black / ENIG gold ----------
     what a province-wide rollout would actually build: the ESP32-C3-MINI-1 module, the SIM7080G LGA modem,
     the 1S MPPT charger, battery protection, buck-boost, RTC, microSD logger and every connector on one
     machine-assembled board. Every peripheral plugs into a keyed, labelled header along the top edge. */
  const MB = { x: -0.006, y: -0.027, w: 0.13, h: 0.04 };
  const mbZ = plateZ + 0.005;
  const espG = new THREE.Group(), simG = new THREE.Group(), chgG = new THREE.Group();   // MCU / modem / power zones
  const mbG = new THREE.Group();
  const U = (u) => MB.x + u, Vv = (v) => MB.y + v;
  const keep = [];                                          // occupied board rects (for the passive scatter)
  const occ = (u, v, w, h) => keep.push([u - w / 2 - 0.0005, v - h / 2 - 0.0005, u + w / 2 + 0.0005, v + h / 2 + 0.0005]);
  const mbTex = canvasTex(2600, 800, (g, W, H) => {
    const Sx = W / MB.w;
    const px = (u) => (u + MB.w / 2) * Sx, py = (v) => (MB.h / 2 - v) * Sx;
    g.fillStyle = '#15181b'; g.fillRect(0, 0, W, H);
    let q = 4242; const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
    g.fillStyle = 'rgba(255,255,255,0.025)';                 // copper pours under the mask
    for (const [u, v, w, h] of [[-0.047, -0.002, 0.034, 0.03], [0.03, 0, 0.04, 0.034], [-0.006, 0.005, 0.03, 0.016]]) g.fillRect(px(u - w / 2), py(v + h / 2), w * Sx, h * Sx);
    g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineCap = 'round';
    for (let i = 0; i < 140; i++) {                           // fine traces (orthogonal + 45°)
      g.lineWidth = Sx * (rnd() < 0.15 ? 0.0006 : 0.00018);
      let x = rnd() * W, y = rnd() * H; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) { const d = (rnd() - 0.5) * W * 0.12; if (k % 2) { x += d; y += d * (rnd() < 0.5 ? 1 : -1) * 0.4; } else x += d; g.lineTo(x, y); }
      g.stroke();
    }
    for (let b = 0; b < 4; b++) {                             // parallel buses MCU <-> modem, MCU <-> headers
      const y0 = py(-0.002 + b * 0.0045);
      for (let k = 0; k < 6; k++) { g.lineWidth = Sx * 0.00016; g.beginPath(); g.moveTo(px(-0.004), y0 + k * Sx * 0.0005); g.lineTo(px(0.016), y0 + k * Sx * 0.0005); g.stroke(); }
    }
    for (let i = 0; i < 420; i++) {                           // vias: gold ring, dark drill
      const x = rnd() * W, y = rnd() * H, r = Sx * (rnd() < 0.1 ? 0.0004 : 0.00022);
      g.fillStyle = '#b8902a'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0b0c0d'; g.beginPath(); g.arc(x, y, r * 0.45, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#efefe9'; g.textAlign = 'center';
    const T = (t, u, v, s, wgt = 600, al = 'center') => { g.textAlign = al; g.font = `${wgt} ${Math.round(Sx * s)}px ${MONO}`; g.fillText(t, px(u), py(v)); };
    [['SOLAR', -0.056], ['BATT', -0.045], ['BTN·EPD', -0.022], ['I2C', 0.002], ['LIGHT', 0.03], ['FAN', 0.043]].forEach(([t, u]) => T(t, u, 0.0118, 0.0013, 700));
    g.strokeStyle = 'rgba(239,239,233,0.75)'; g.lineWidth = Sx * 0.00014; g.setLineDash([Sx * 0.0008, Sx * 0.0005]);
    for (const [u0, v0, u1, v1, t] of [[-0.0645, -0.0195, -0.0295, 0.0105, 'POWER · MPPT 1S'], [-0.0285, -0.0195, 0.0105, 0.0105, 'MCU'], [0.0115, -0.0195, 0.0645, 0.0105, 'LTE-M / NB-IoT']]) {
      g.strokeRect(px(u0), py(v1), (u1 - u0) * Sx, (v1 - v0) * Sx);
      T(t, u0 + 0.0008, v1 - 0.0016, 0.0011, 600, 'left');
    }
    g.setLineDash([]);
    T('BKK SMART HUB', 0.046, -0.0158, 0.0019, 700); T('rev C · 2026-11 · 4L ENIG', 0.046, -0.0184, 0.0011, 500);
    [['U1', -0.0105, -0.0013], ['U2', 0.026, 0.0093], ['U3', -0.043, 0.0068], ['U4', -0.034, 0.0028], ['L1', -0.054, 0.0072], ['L2', -0.034, -0.0026], ['F1', -0.061, 0.0071], ['J9', 0.047, -0.0153], ['BT1', 0.002, -0.002], ['SD1', -0.012, 0.0132]].forEach(([t, u, v]) => T(t, u, v, 0.0009, 600));
    g.fillStyle = '#efefe9'; g.beginPath(); g.moveTo(px(-0.0405), py(-0.0175)); g.lineTo(px(-0.0385), py(-0.0145)); g.lineTo(px(-0.0365), py(-0.0175)); g.closePath(); g.fill();
    g.fillStyle = '#15181b'; T('!', -0.0385, -0.0171, 0.0018, 800);
    g.fillStyle = '#efefe9'; T('Li-ion 1S', -0.0385, -0.019, 0.0009, 600);
    const qs = Sx * 0.0003; g.fillStyle = '#efefe9'; g.fillRect(px(0.0585), py(-0.0125), qs * 14, qs * 14);
    g.fillStyle = '#15181b'; for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) if (rnd() > 0.5) g.fillRect(px(0.0585) + qs * (1 + i), py(-0.0125) + qs * (1 + j), qs, qs);
    g.fillStyle = '#c9a227';                                    // ENIG test points + mounting rings
    for (const [u, v] of [[-0.0615, 0.0165], [0.0615, 0.0165], [-0.0615, -0.0165], [0.0615, -0.0165], [0.009, 0.0165]]) { g.beginPath(); g.arc(px(u), py(v), Sx * 0.0026, 0, Math.PI * 2); g.fill(); }
  });
  const mbMat = new THREE.MeshPhysicalMaterial({ map: mbTex, roughness: 0.62, clearcoat: 0.5, clearcoatRoughness: 0.35 });   // conformal coat
  const mbSide = new THREE.MeshStandardMaterial({ color: 0x2c3328, roughness: 0.6 });
  {
    const b = new THREE.Mesh(new THREE.BoxGeometry(MB.w, MB.h, 0.0016), [mbSide, mbSide, mbSide, mbSide, mbMat, mbSide]);
    b.position.set(MB.x, MB.y, mbZ + 0.0008);
    mbG.add(b);
  }
  const mbTop = mbZ + 0.0016;
  const MBH = [[-0.0615, 0.0165], [0.0615, 0.0165], [-0.0615, -0.0165], [0.0615, -0.0165], [0.009, 0.0165]];
  for (const [u, v] of MBH) {
    put(mbG, cyl(0.0024, mbZ - plateZ, M.brass, 'z', hexGeo), U(u), Vv(v), plateZ + (mbZ - plateZ) / 2);
    phillips(mbG, U(u), Vv(v), mbTop, 0.0017);
    occ(u, v, 0.005, 0.005);
  }
  // part helpers in board coordinates (u, v = mm from the board centre), all sitting on the top copper
  const part = (grp, w, h, d, u, v, mat = M.black, round = 0) => { const m = round ? rbox(w, h, d, mat, U(u), Vv(v), mbTop + d / 2, round) : box(w, h, d, mat); if (!round) m.position.set(U(u), Vv(v), mbTop + d / 2); m.castShadow = true; grp.add(m); occ(u, v, w, h); return m; };
  const pad = (grp, w, h, u, v) => grp.add(box(w, h, 0.0002, M.gold).translateX(U(u)).translateY(Vv(v)).translateZ(mbTop + 0.0001));   // 0.2 mm proud so it never z-fights the mask
  const legs = (grp, u, v, w, h, n, axis = 'y') => {           // gull-wing leads either side of an SOIC
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
      const t = (i - (n - 1) / 2) * 0.00127;
      if (axis === 'y') grp.add(box(0.0004, 0.0009, 0.0003, M.ss).translateX(U(u + t)).translateY(Vv(v + s * (h / 2 + 0.0003))).translateZ(mbTop + 0.00015));
      else grp.add(box(0.0009, 0.0004, 0.0003, M.ss).translateX(U(u + s * (w / 2 + 0.0003))).translateY(Vv(v + t)).translateZ(mbTop + 0.00015));
    }
  };
  const elko = (grp, r, h, u, v) => {
    const capTop = canvasTex(64, 64, (g) => { g.fillStyle = '#c9cdd1'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#7d838a'; g.lineWidth = 6; g.beginPath(); g.moveTo(32, 6); g.lineTo(32, 58); g.moveTo(6, 32); g.lineTo(58, 32); g.stroke(); });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), [new THREE.MeshStandardMaterial({ color: 0x1b2440, roughness: 0.35 }), new THREE.MeshStandardMaterial({ map: capTop, metalness: 0.6, roughness: 0.3 }), M.black]);
    c.rotation.x = Math.PI / 2; c.position.set(U(u), Vv(v), mbTop + 0.0006 + h / 2); c.castShadow = true; grp.add(c);
    grp.add(rbox(r * 2.1, r * 2.1, 0.0006, M.black, U(u), Vv(v), mbTop + 0.0003, 0.0002));   // rubber base
    occ(u, v, r * 2.1, r * 2.1);
  };
  const shielded = (grp, s, d, u, v) => {                      // shielded power inductor with its marking dot
    part(grp, s, s, d, u, v, M.ferrite, s * 0.12);
    put(grp, cyl(s * 0.3, 0.00008, new THREE.MeshStandardMaterial({ color: 0x8f9399, roughness: 0.5 })), U(u), Vv(v), mbTop + d + 0.00004);
  };

  // --- POWER zone: 1S MPPT (CN3791), protection, buck-boost to 3.3 V / 5 V ---
  shielded(chgG, 0.0085, 0.0045, -0.054, 0.002);              // L1 10 µH
  elko(chgG, 0.003, 0.0075, -0.058, -0.011);
  elko(chgG, 0.003, 0.0075, -0.0505, -0.011);
  part(chgG, 0.005, 0.004, 0.0015, -0.043, 0.004); legs(chgG, -0.043, 0.004, 0.005, 0.004, 4);   // U3 MPPT
  part(chgG, 0.0045, 0.0026, 0.002, -0.043, -0.0035);         // D1 Schottky (SMA)
  part(chgG, 0.0045, 0.0032, 0.0013, -0.061, 0.0095, new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.5 }));   // F1 polyfuse
  part(chgG, 0.0045, 0.0034, 0.0021, -0.0505, 0.0095);         // TVS (SMB)
  part(chgG, 0.0064, 0.0032, 0.0006, -0.036, -0.0125, M.black); // R sense 2512
  part(chgG, 0.003, 0.0028, 0.001, -0.036, 0.0095); legs(chgG, -0.036, 0.0095, 0.003, 0.0028, 3);   // Q1 dual MOSFET
  part(chgG, 0.003, 0.003, 0.0008, -0.034, 0.002);             // U4 buck-boost (QFN)
  shielded(chgG, 0.004, 0.002, -0.034, -0.0045);               // L2 1.5 µH
  for (const [u, v] of [[-0.0465, -0.009], [-0.0445, -0.009], [-0.0395, 0.0], [-0.0395, -0.002], [-0.031, 0.0065]]) part(chgG, 0.0032, 0.0016, 0.0016, u, v, M.cap);   // 1206 bulk MLCCs
  // --- MCU zone: ESP32-C3-MINI-1 (antenna over the board edge), microSD, RTC coin cell, USB-C service port ---
  const mod = { u: -0.012, v: -0.0115 };
  part(espG, 0.0132, 0.0166, 0.0008, mod.u, mod.v, new THREE.MeshStandardMaterial({ color: 0x1f2a44, roughness: 0.5 }));
  can(espG, 0.0124, 0.0108, 0.0016, U(mod.u), Vv(mod.v + 0.0026), mbTop + 0.0008, [['ESP32-C3', 30], ['-MINI-1', 26], ['FCC ID', 20]]);
  {
    const at = canvasTex(160, 64, (g, w, h) => { g.fillStyle = '#1f2a44'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d4a63a'; g.lineWidth = 5; g.beginPath(); g.moveTo(8, 56); for (let i = 0; i < 6; i++) { g.lineTo(14 + i * 24, 12); g.lineTo(26 + i * 24, 12); g.lineTo(26 + i * 24, 52); } g.stroke(); });
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.0124, 0.0046), new THREE.MeshStandardMaterial({ map: at, roughness: 0.4, metalness: 0.2 }));
    a.position.set(U(mod.u), Vv(mod.v - 0.0057), mbTop + 0.0011);
    espG.add(a);
  }
  part(espG, 0.0145, 0.0145, 0.0016, -0.012, 0.005, M.ss, 0.0003);   // microSD push-push
  {
    put(espG, cyl(0.0068, 0.0028, M.black), U(0.002), Vv(0.006), mbTop + 0.0014);                  // CR1220 holder
    put(espG, cyl(0.0062, 0.0004, M.ss), U(0.002), Vv(0.006), mbTop + 0.003);
    espG.add(rbox(0.004, 0.012, 0.0004, M.ss, U(0.002), Vv(0.006), mbTop + 0.0034, 0.0001));  // retaining clip
    occ(0.002, 0.006, 0.0136, 0.0136);
  }
  part(espG, 0.009, 0.0074, 0.0032, 0.004, -0.0163, M.ss, 0.0013);   // USB-C (service / firmware)
  espG.add(rbox(0.0068, 0.0012, 0.0024, M.black, U(0.004), Vv(-0.0199), mbTop + 0.0016, 0.0005));
  for (const u of [0.0155, 0.021]) { part(espG, 0.0042, 0.0034, 0.0012, u, -0.0165, M.ss); put(espG, cyl(0.0012, 0.0012, M.black), U(u), Vv(-0.0165), mbTop + 0.0018); }   // BOOT / RST
  part(espG, 0.0032, 0.0016, 0.0009, 0.0115, -0.0115); part(espG, 0.0022, 0.0022, 0.0008, 0.0085, -0.006);   // ESD array, 3V3 LDO
  // --- MODEM zone: SIM7080G under a finned heatsink, nano-SIM, u.FL, status LEDs ---
  const modm = { u: 0.026, v: 0.0 };
  can(simG, 0.0176, 0.0157, 0.0024, U(modm.u), Vv(modm.v), mbTop, [['SIMCOM', 28], ['SIM7080G', 30], ['B20 B28 B8', 20]]);
  occ(modm.u, modm.v, 0.0176, 0.0157);
  simG.add(rbox(0.0148, 0.0134, 0.0006, new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.9 }), U(modm.u), Vv(modm.v), mbTop + 0.0027, 0.0002));   // thermal pad
  {
    const hs = new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.6, roughness: 0.42 });   // black anodised
    simG.add(rbox(0.0152, 0.0138, 0.0012, hs, U(modm.u), Vv(modm.v), mbTop + 0.0036, 0.0003));
    for (let k = 0; k < 7; k++) simG.add(rbox(0.0009, 0.0138, 0.0048, hs, U(modm.u - 0.0066 + k * 0.0022), Vv(modm.v), mbTop + 0.0066, 0.0002));
  }
  part(simG, 0.0128, 0.0118, 0.0015, 0.047, -0.008, M.ss, 0.0004);    // nano-SIM
  simG.add(rbox(0.0088, 0.0122, 0.0004, new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.4 }), U(0.0472), Vv(-0.0078), mbTop + 0.0017, 0.0001));
  const uflPos = V3(U(0.044), Vv(0.007), mbTop);
  part(simG, 0.003, 0.003, 0.0007, 0.044, 0.007, M.gold); put(simG, cyl(0.0011, 0.0016, M.gold), uflPos.x, uflPos.y, mbTop + 0.0015);
  for (const [u, v] of [[0.014, 0.0075], [0.014, -0.0075], [0.0385, 0.0035]]) part(simG, 0.0035, 0.0028, 0.0019, u, v, new THREE.MeshStandardMaterial({ color: 0xe0a21a, roughness: 0.45 }));   // tantalum bulk
  const netMat = new THREE.MeshStandardMaterial({ color: 0x14532d, emissive: 0x22c55e, emissiveIntensity: 0, roughness: 0.3 });
  [[ledMat(0xef4444), 0.006], [ledMat(0x3b82f6), 0.002], [netMat, -0.002], [ledMat(0xf59e0b), -0.006]].forEach(([m, v]) => { part(simG, 0.0016, 0.0008, 0.0006, 0.0605, v, m); pad(simG, 0.0022, 0.0011, 0.0605, v); });
  // --- headers along the top edge (keyed JST, white) with their mating plugs ---
  const conns = {};
  const header2 = (name, u, pins, pitch, color = M.jst) => {
    const w = pins * pitch + 0.0024, v = 0.0155;
    mbG.add(rbox(w, 0.0045, 0.006, color, U(u), Vv(v), mbTop + 0.003, 0.0004));
    mbG.add(rbox(w - 0.0012, 0.0006, 0.0048, color, U(u), Vv(v - 0.0024), mbTop + 0.0028, 0.0002));   // polarising rib
    mbG.add(rbox(w - 0.0008, 0.0032, 0.0034, color, U(u), Vv(v + 0.0006), mbTop + 0.0077, 0.0003));    // plug
    occ(u, v, w, 0.0045);
    conns[name] = (i) => V3(U(u - (pins - 1) * pitch / 2 + i * pitch), Vv(v + 0.0024), mbTop + 0.0077);
  };
  header2('solar', -0.056, 2, 0.0025); header2('batt', -0.045, 2, 0.0025);
  header2('btn', -0.022, 8, 0.002); header2('i2c', 0.002, 4, 0.001, M.nylon);
  header2('light', 0.03, 3, 0.002); header2('fan', 0.043, 2, 0.002);
  // --- passive scatter: 0402 / 0603 resistors and capacitors where the copper is free ---
  {
    let q = 777; const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
    const free = (u, v, w, h) => !keep.some(([a, b, c, d]) => u + w / 2 > a && u - w / 2 < c && v + h / 2 > b && v - h / 2 < d);
    const resTop = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
    for (let u = -0.0625; u < 0.0625; u += 0.0019) for (let v = -0.0185; v < 0.013; v += 0.0014) {
      if (rnd() > 0.42) continue;
      const big = rnd() < 0.25, rot = rnd() < 0.5;
      let w = big ? 0.0016 : 0.001, h = big ? 0.0008 : 0.0005;
      if (rot) [w, h] = [h, w];
      if (!free(u, v, w + 0.0003, h + 0.0003)) continue;
      const r = rnd(), mat = r < 0.55 ? M.cap : r < 0.9 ? resTop : M.ferrite;
      pad(mbG, w + 0.0004, h + 0.0002, u, v);
      part(mbG, w, h, big ? 0.0008 : 0.0005, u, v, mat);
    }
    for (let i = 0; i < 6; i++) { const u = -0.06 + rnd() * 0.12, v = -0.018 + rnd() * 0.03; if (free(u, v, 0.003, 0.003)) { part(mbG, 0.003, 0.003, 0.0008, u, v); legs(mbG, u, v, 0.003, 0.003, 3, rnd() < 0.5 ? 'x' : 'y'); } }   // small regulators / logic
  }
  tag(espG, 'unitInside'); tag(simG, 'unitInside'); tag(chgG, 'batteryInside'); tag(mbG, 'unitInside');
  inside.add(espG, simG, chgG, mbG);
  // positions the rest of the box refers to
  const E = { x: U(mod.u), y: Vv(mod.v), w: 0.0132, h: 0.0166 }, espTop = mbTop;
  const S = { x: U(modm.u), y: Vv(modm.v), w: 0.0176, h: 0.0157 }, simTop = mbTop;
  const K = { x: U(-0.047), y: Vv(0) };
  // flexible LTE/NB antenna stuck under the top wall, micro-coax up the right side to the u.FL
  const antY = hH / 2 - wallT - 0.0002, antZ = -0.006;
  {
    const at = canvasTex(400, 100, (g) => { g.fillStyle = '#c2860f'; g.fillRect(0, 0, 400, 100); g.fillStyle = '#e9b44c'; g.fillRect(14, 30, 250, 14); g.fillRect(14, 58, 330, 12); g.fillRect(250, 30, 14, 40); g.fillStyle = '#7a5208'; g.font = `600 22px ${MONO}`; g.fillText('LTE-M/NB 698-2690', 20, 92); });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.0003, 0.0105), [M.flex, M.flex, M.flex, new THREE.MeshStandardMaterial({ map: at, roughness: 0.45, metalness: 0.2 }), M.flex, M.flex]);
    a.position.set(0.028, antY, antZ);
    inside.add(a);
    inside.add(new THREE.Mesh(routedGeo([V3(uflPos.x, uflPos.y, simTop + 0.0023), V3(uflPos.x, uflPos.y + 0.003, simTop + 0.006), V3(0.072, 0.0, simTop + 0.008), V3(0.072, antY - 0.008, antZ), V3(0.05, antY - 0.0008, antZ)], 0.00065, 0.005, 5), wmat(0x2a2a2a)));
  }

  // --- 2 x 18650 holder with cells (top-left) ---
  const cellsGrp = new THREE.Group();
  const C = { x: -0.03, y: 0.026, len: 0.065, r: 0.009 };
  const holderZ = plateZ;
  cellsGrp.add(rbox(0.078, 0.042, 0.0022, M.black, C.x, C.y, holderZ + 0.0011, 0.001));
  for (const sx of [-1, 1]) cellsGrp.add(rbox(0.0035, 0.042, 0.0175, M.black, C.x + sx * 0.0372, C.y, holderZ + 0.00875, 0.001));   // end walls
  for (const dy of [-0.021, 0, 0.021]) cellsGrp.add(rbox(0.07, 0.0016, 0.007, M.black, C.x, C.y + dy, holderZ + 0.0035, 0.0006));   // rails
  phillips(cellsGrp, C.x - 0.03, C.y, holderZ + 0.0022, 0.0016);
  phillips(cellsGrp, C.x + 0.03, C.y, holderZ + 0.0022, 0.0016);
  const wrapTex = canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = '#1d4fb8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#123a8c'; g.fillRect(0, 0, w, 22); g.fillRect(0, h - 22, w, 22);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `700 40px ${FONT}`; g.fillText('Li-ion 18650', w / 2, 72);
    g.font = `500 28px ${MONO}`; g.fillText('3.7V  3400mAh  12.6Wh', w / 2, 116);
  });
  wrapTex.center.set(0.5, 0.5); wrapTex.rotation = Math.PI / 2;
  const wrapMat = new THREE.MeshStandardMaterial({ map: wrapTex, roughness: 0.32 });
  const cellCap = new THREE.MeshStandardMaterial({ color: 0xd2d6da, metalness: 0.9, roughness: 0.2 });
  const cellZ = holderZ + 0.0022 + C.r;
  for (const [i, y] of [C.y + 0.0105, C.y - 0.0105].entries()) {
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r, C.len - 0.002, 28, 1, true), wrapMat);
    cell.rotation.set(i * 0.6, 0, Math.PI / 2);
    cell.position.set(C.x, y, cellZ);
    cellsGrp.add(cell);
    for (const s of [-1, 1]) {
      put(cellsGrp, cyl(C.r - 0.0003, 0.001, cellCap, 'x'), C.x + s * (C.len / 2 - 0.0005), y, cellZ);
      put(cellsGrp, cyl(C.r * 0.82, 0.0003, M.white, 'x'), C.x + s * (C.len / 2 + 0.0001), y, cellZ);   // insulator ring
    }
    put(cellsGrp, cyl(0.0033, 0.0014, cellCap, 'x'), C.x + C.len / 2 + 0.0007, y, cellZ);    // + nub
    const coil = new THREE.Curve();
    coil.getPoint = (t, tg = new THREE.Vector3()) => tg.set(-t * 0.0035, Math.cos(t * Math.PI * 10) * 0.0042, Math.sin(t * Math.PI * 10) * 0.0042);
    const spring = new THREE.Mesh(new THREE.TubeGeometry(coil, 60, 0.00045, 5, false), cellCap);
    spring.position.set(C.x - C.len / 2 - 0.0002, y, cellZ);
    cellsGrp.add(spring);
    cellsGrp.add(rbox(0.0006, 0.011, 0.012, cellCap, C.x + C.len / 2 + 0.0016, y, cellZ, 0.0002));
    cellsGrp.add(rbox(0.0006, 0.011, 0.012, cellCap, C.x - C.len / 2 - 0.0038, y, cellZ, 0.0002));
  }
  const strapZ = cellZ + 0.008;
  for (const sx of [-1, 1]) cellsGrp.add(rbox(0.0006, 0.026, 0.004, cellCap, C.x + sx * (C.len / 2 + (sx > 0 ? 0.0022 : 0.0044)), C.y, strapZ, 0.0002));   // parallel straps
  tag(cellsGrp, 'batteryInside');
  inside.add(cellsGrp);

  // --- desiccant sachet + SHT40 temperature / humidity board (top-right, where the old charger sat) ---
  {
    const st = canvasTex(256, 160, (g, w) => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, 160); g.fillStyle = '#1f2937'; g.textAlign = 'center'; g.font = `700 34px ${FONT}`; g.fillText('SILICA GEL', w / 2, 62); g.font = `500 22px ${FONT}`; g.fillText('สารกันชื้น ห้ามรับประทาน', w / 2, 104); g.fillText('10 g', w / 2, 138); });
    const sa = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.016, 0.0045), [M.silica, M.silica, M.silica, M.silica, new THREE.MeshStandardMaterial({ map: st, roughness: 0.85 }), M.silica]);
    sa.position.set(0.048, 0.04, plateZ + 0.00235);
    sa.rotation.z = -0.05;
    inside.add(sa);
  }
  const sht = { x: 0.028, y: 0.016 };
  {
    const g = new THREE.Group();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(g, cyl(0.0012, 0.004, M.brass, 'z', hexGeo), sht.x + sx * 0.0055, sht.y + sy * 0.0045, plateZ + 0.002);
    g.add(rbox(0.014, 0.012, 0.0012, M.blueMod, sht.x, sht.y, plateZ + 0.0046, 0.0004));
    g.add(box(0.0015, 0.0015, 0.0006, M.white).translateX(sht.x + 0.002).translateY(sht.y).translateZ(plateZ + 0.0055));   // SHT40 (white cap)
    g.add(rbox(0.004, 0.003, 0.0018, M.nylon, sht.x - 0.004, sht.y - 0.0035, plateZ + 0.0061, 0.0003));                      // Qwiic socket
    tag(g, 'unitInside');
    inside.add(g);
  }

  // wiring diagram + service sticker on the back plate under the mainboard
  {
    const t = canvasTex(1400, 120, (g, w, h) => {
      g.fillStyle = '#f7f6f1'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1f7a3a'; g.fillRect(0, 0, 18, h);
      g.fillStyle = '#1f2328'; g.font = `700 34px ${FONT}`; g.textAlign = 'left'; g.fillText('BKK HUB · ผังสาย', 34, 46);
      g.font = `500 26px ${MONO}`; g.fillText('J1 SOLAR 6V · J2 BATT 1S · J3 BTN/LED/EPD · J4 I2C · J5 LIGHT/REED · J6 FAN', 34, 92);
      g.font = `500 26px ${FONT}`; g.textAlign = 'right'; g.fillText('เฉพาะเจ้าหน้าที่ · โทร 1555', w - 24, 46);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.105, 0.009), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
    m.position.set(-0.004, -0.0525, plateZ + 0.0003);
    inside.add(m);
  }

  // --- wiring: every lead ends in a plug on the mainboard header row; tie-wraps on adhesive bases ---
  const wire = (color, pts, r = 0.0007) => { const m = new THREE.Mesh(routedGeo(pts.map((p) => (p.isVector3 ? p : V3(...p))), r, 0.003, 6), wmat(color)); inside.add(m); return m; };
  const RED = 0xd42a1e, BLK = 0x151515, YEL = 0xf2c200, BLU = 0x2563eb, GRN = 0x16a34a;
  const zw = plateZ + 0.0035;
  const tE = (t) => [t.x, t.y, t.z];
  const up = (p, dy, dz = 0) => V3(p.x, p.y + dy, p.z + dz);
  const gapY = 0.0;                                          // service channel between the cells and the board
  // battery: + strap (right end) and - strap (left end) down into BATT
  const bP = conns.batt(1), bN = conns.batt(0);
  wire(RED, [[C.x + C.len / 2 + 0.0022, C.y - 0.006, strapZ + 0.001], [C.x + C.len / 2 + 0.0035, C.y - 0.016, strapZ - 0.001], [0.0065, gapY + 0.001, zw + 0.008], [bP.x, gapY + 0.001, zw + 0.008], up(bP, 0.003, 0.001), bP], 0.0008);
  wire(BLK, [[C.x - C.len / 2 - 0.0044, C.y - 0.006, strapZ + 0.001], [C.x - C.len / 2 - 0.0046, C.y - 0.016, strapZ - 0.002], [-0.07, gapY - 0.0005, zw + 0.007], [bN.x, gapY - 0.0005, zw + 0.007], up(bN, 0.003, 0.001), bN], 0.0008);
  // solar: top gland -> down the left wall (between wall and cell holder) -> SOLAR, split into red / black
  const sP = conns.solar(1), sN = conns.solar(0), split = V3(-0.0625, 0.0035, zw + 0.009);
  wire(0x1c1d20, [[glandPos.x, hH / 2 - 0.004, glandPos.z], [glandPos.x, hH / 2 - 0.01, glandPos.z - 0.002], [-0.0735, 0.042, zw + 0.009], [-0.0735, 0.006, zw + 0.009], split], 0.0019);
  wire(RED, [split, [sP.x, 0.0015, zw + 0.009], up(sP, 0.003, 0.001), sP], 0.0007);
  wire(BLK, [split, [sN.x, 0.0015, zw + 0.0095], up(sN, 0.003, 0.001), sN], 0.0007);
  inside.add(rbox(0.0052, 0.0034, 0.0024, M.black, split.x, split.y, split.z, 0.0006));        // heat-shrink at the split
  // SHT40: Qwiic cable to I2C
  const iA = conns.i2c(0), iB = conns.i2c(3);
  const qw = V3(sht.x - 0.004, sht.y - 0.0055, plateZ + 0.0061);
  [YEL, BLU, RED, BLK].forEach((c, i) => {
    const t = conns.i2c(i), o = (i - 1.5) * 0.0005;
    wire(c, [[qw.x + o, qw.y, qw.z], [qw.x + o, qw.y - 0.003, qw.z + 0.002], [t.x, 0.0035, zw + 0.007], up(t, 0.003, 0.001), t], 0.00028);
  });
  const tieMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 });
  const tie = (x, y, z, axis = 'y', r = 0.0026) => {
    inside.add(rbox(0.008, 0.008, 0.0016, M.white, x, y, plateZ + 0.0008, 0.0008));           // adhesive tie base
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.00045, 4, 14), tieMat);
    if (axis === 'y') t.rotation.x = Math.PI / 2; else t.rotation.y = Math.PI / 2;
    t.position.set(x, y, z); inside.add(t);
    inside.add(box(0.0016, 0.0012, 0.0014, tieMat).translateX(x + r).translateY(y).translateZ(z));   // tie head
  };
  tie(-0.0735, 0.03, zw + 0.009); tie(-0.0735, 0.012, zw + 0.009);
  /* ---------- 30 mm 5 V mini fan on the sidewalk-side wall (+x), exhausting through a louvred hood ----------
     mint blades + a tiny smiley hub sticker; spins gently whenever the lid is open (the ESP32 only runs it
     above 45 °C, through a logic MOSFET, so it costs almost nothing on battery) */
  const FAN = { s: 0.03, t: 0.01, y: -0.03, z: -0.002 };
  const fanX = hW / 2 - wallT - FAN.t / 2;
  const fanG = new THREE.Group();
  fanG.position.set(fanX, FAN.y, FAN.z);
  const fanRotor = new THREE.Group();
  {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.5 });
    const fr = roundedRect(new THREE.Shape(), FAN.s, FAN.s, 0.003);
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.0138, 0, Math.PI * 2, true); fr.holes.push(hole);
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const h = new THREE.Path(); h.absarc(a * 0.012, b * 0.012, 0.0016, 0, Math.PI * 2, true); fr.holes.push(h); }
    const fg = new THREE.ExtrudeGeometry(fr, { depth: FAN.t, bevelEnabled: false, curveSegments: 20 });
    fg.translate(0, 0, -FAN.t / 2);
    const frame = new THREE.Mesh(fg, frameMat);
    frame.rotation.y = Math.PI / 2;                         // extrusion along hub x (fan axis)
    fanG.add(frame);
    const screwOn = (parent, x, y, z, r, face) => { const g = new THREE.Group(); phillips(g, 0, 0, 0, r); g.position.set(x, y, z); g.rotation.y = face * Math.PI / 2; parent.add(g); };
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) screwOn(fanG, -FAN.t / 2, a * 0.012, b * 0.012, 0.0016, -1);
    // motor strut (three thin spokes on the outlet side) holding the hub
    for (let k = 0; k < 3; k++) {
      const sp = box(0.0008, 0.013, 0.0012, frameMat);
      sp.position.set(FAN.t / 2 - 0.0008, 0, 0);
      sp.rotation.x = k * (Math.PI * 2 / 3);
      sp.geometry.translate(0, 0.0065, 0);
      fanG.add(sp);
    }
    // rotor: rounded hub + 7 pitched mint blades
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x8fe3c8, roughness: 0.38, side: THREE.DoubleSide });
    const hubM = cyl(0.0055, 0.0075, frameMat, 'x');
    fanRotor.add(hubM);
    const bs = new THREE.Shape();
    bs.moveTo(0.005, -0.0022); bs.quadraticCurveTo(0.011, -0.004, 0.0132, -0.0012); bs.quadraticCurveTo(0.0128, 0.003, 0.0105, 0.0042); bs.quadraticCurveTo(0.008, 0.002, 0.005, 0.0022); bs.closePath();
    const bg = new THREE.ShapeGeometry(bs, 6);
    for (let k = 0; k < 7; k++) {
      const b = new THREE.Group();
      b.rotation.x = k * (Math.PI * 2 / 7);
      const m = new THREE.Mesh(bg, bladeMat);
      m.rotation.set(0, Math.PI / 2, 0);                    // blade plane in hub y-z
      m.rotateX(0.5);                                      // pitch
      b.add(m);
      fanRotor.add(b);
    }
    // smiley sticker on the hub, facing into the box
    const smile = canvasTex(128, 128, (g, w) => {
      g.fillStyle = '#ffe58a'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3b2f2f'; g.beginPath(); g.arc(44, 52, 8, 0, Math.PI * 2); g.arc(84, 52, 8, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3b2f2f'; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.arc(64, 64, 30, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
      g.fillStyle = 'rgba(255,120,120,0.6)'; g.beginPath(); g.arc(30, 76, 9, 0, Math.PI * 2); g.arc(98, 76, 9, 0, Math.PI * 2); g.fill();
    });
    const st = new THREE.Mesh(new THREE.CircleGeometry(0.0048, 24), new THREE.MeshStandardMaterial({ map: smile, roughness: 0.6 }));
    st.rotation.y = -Math.PI / 2;
    st.position.x = -0.0042;
    fanRotor.add(st);
  }
  fanG.add(fanRotor);
  fanG.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = 'fan'; } });
  hub.add(fanG);
  // 2-wire lead (red / black) from the fan to the charger's OUT terminal, via the MOSFET on the ESP32 side
  // 2-wire lead from the fan's corner to the FAN header
  [[RED, 1, 0.0006], [BLK, 0, -0.0006]].forEach(([c, pin, o]) => {
    const t = conns.fan(pin);
    wire(c, [[fanX - FAN.t / 2, FAN.y + 0.0135, FAN.z + o], [fanX - FAN.t / 2 - 0.004, FAN.y + 0.017, FAN.z - 0.004 + o], [0.058, -0.0045, zw + 0.0095 + o], [t.x, -0.0045, zw + 0.0095 + o], up(t, 0.003, 0.001), t], 0.0005);
  });
  // outside: round grille cut in the wall + a little louvred rain hood over it
  {
    const ox = hW / 2;
    for (let k = 0; k < 4; k++) {                           // concentric slots seen through the hood
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.004 + k * 0.0028, 0.0006, 4, 32), M.gasket);
      r.rotation.y = Math.PI / 2;
      r.position.set(ox + 0.0002, FAN.y, FAN.z);
      body.add(r);
    }
    const hood = new THREE.Group();
    hood.position.set(ox, FAN.y, FAN.z);
    hood.add(rbox(0.0016, 0.036, 0.036, M.pc, 0.0008, 0, 0, 0.0006));                       // flange
    hood.add(rbox(0.009, 0.0016, 0.034, M.pc, 0.0055, 0.0172, 0, 0.0006));                  // roof
    for (const sz of [-1, 1]) hood.add(rbox(0.009, 0.034, 0.0016, M.pc, 0.0055, 0, sz * 0.0162, 0.0006));   // cheeks
    for (let k = 0; k < 5; k++) {                           // slats angled down to shed rain
      const sl = rbox(0.008, 0.0012, 0.031, M.pc, 0.005, 0.0115 - k * 0.0062, 0, 0.0004);
      sl.rotation.z = -0.55;
      hood.add(sl);
    }
    for (const sz of [-1, 1]) { const g = new THREE.Group(); phillips(g, 0, 0, 0, 0.0014); g.position.set(0.0016, -0.0145, sz * 0.0115); g.rotation.y = Math.PI / 2; hood.add(g); }
    body.add(hood);
  }
  inside.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part ??= 'unitInside'; } });
  hub.add(inside);

  /* ---------- lid: hinged on the -x edge, two pin-hex screws on the free edge ---------- */
  const lid = new THREE.Group();
  lid.position.set(hingeX, 0, zRim);
  lid.userData = { open: 0, target: 0, side: -1, max: 1.95 };
  const cx = -hingeX;                                    // lid centre in hinge coordinates (hub x = 0)
  const btnY = -0.027, btnR = 0.0112;
  {
    const bev = 0.0016;
    const sh = roundedRect(new THREE.Shape(), hW - 2 * bev, hH - 2 * bev, rC - bev);
    const hole = new THREE.Path(); hole.absarc(0, btnY, btnR, 0, Math.PI * 2, true); sh.holes.push(hole);
    const lg = new THREE.ExtrudeGeometry(sh, { depth: LT - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 12 });
    lg.translate(cx, 0, bev);
    lid.add(new THREE.Mesh(lg, M.pcLid));
    // raised label field (moulded 0.6 mm step) with a clearance ring round the button
    const fld = roundedRect(new THREE.Shape(), hW - 0.026, hH - 0.026, rC - 0.004);
    const fh = new THREE.Path(); fh.absarc(0, btnY, 0.0175, 0, Math.PI * 2, true); fld.holes.push(fh);
    const fg = new THREE.ExtrudeGeometry(fld, { depth: 0.0003, bevelEnabled: true, bevelThickness: 0.0003, bevelSize: 0.0003, bevelSegments: 1, curveSegments: 12 });
    fg.translate(cx, 0, LT + 0.0003);
    lid.add(new THREE.Mesh(fg, M.pcLid));
    // tongue that drops into the body + EPDM gasket
    const tongue = roundedRect(new THREE.Shape(), hW - 2 * wallT - 0.0006, hH - 2 * wallT - 0.0006, rC - wallT);
    tongue.holes.push(roundedRect(new THREE.Path(), hW - 2 * wallT - 0.0036, hH - 2 * wallT - 0.0036, rC - wallT - 0.0015));
    const tg = new THREE.ExtrudeGeometry(tongue, { depth: 0.0035, bevelEnabled: false, curveSegments: 10 });
    tg.translate(cx, 0, -0.0035);
    lid.add(new THREE.Mesh(tg, M.pcLid));
    const gk = roundedRect(new THREE.Shape(), hW - 2 * wallT + 0.0016, hH - 2 * wallT + 0.0016, rC - wallT + 0.0008);
    gk.holes.push(roundedRect(new THREE.Path(), hW - 2 * wallT - 0.0008, hH - 2 * wallT - 0.0008, rC - wallT));
    const gg = new THREE.ExtrudeGeometry(gk, { depth: 0.0016, bevelEnabled: false, curveSegments: 10 });
    gg.translate(cx, 0, -0.0012);
    lid.add(new THREE.Mesh(gg, M.gasket));
  }
  for (const y of [0.036, -0.036]) {                       // lid knuckles between the body lugs
    put(lid, cyl(0.0035, 0.014, M.pcLid, 'y'), 0, y, 0);
    lid.add(rbox(0.006, 0.014, 0.004, M.pcLid, 0.003, y, 0.0015, 0.001));
  }
  for (const sy of [1, -1]) {                              // free-edge screws in counterbores
    const sx = cx + bossX, syy = sy * bossY;
    put(lid, cyl(0.0042, 0.0008, M.gasket), sx, syy, LT + 0.0002);
    secScrew(lid, sx, syy, LT, 0.0031);
  }
  // printed labels: green header strip on top, call-to-action left of the button, light legend right of it
  const sticker = (w, h, pw, ph, x, y, draw) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: canvasTex(pw, ph, draw), roughness: 0.55 }));
    m.position.set(cx + x, y, LT + 0.0011);
    lid.add(m);
  };
  sticker(0.122, 0.0105, 1024, 88, 0, 0.0405, (g, w, h) => {
    g.fillStyle = '#1f7a3a'; g.beginPath(); g.roundRect(0, 0, w, h, 18); g.fill();
    g.fillStyle = '#fff'; g.font = `600 50px ${FONT}`; g.textAlign = 'left'; g.fillText('BKK SMART BIN', 30, 62);
    g.textAlign = 'right'; g.font = `500 40px ${FONT}`; g.fillText('กทม. · เขตปทุมวัน', w - 30, 60);
  });
  sticker(0.04, 0.026, 400, 260, -0.041, btnY, (g, w, h) => {
    g.fillStyle = '#f6f4ee'; g.beginPath(); g.roundRect(0, 0, w, h, 22); g.fill();
    g.fillStyle = '#1f2328'; g.textAlign = 'center';
    g.font = `700 64px ${FONT}`; g.fillText('กดเรียกรถ', w / 2, 82);
    g.fillText('เก็บนอกรอบ', w / 2, 152);
    g.fillStyle = '#b91c1c'; g.font = `600 46px ${FONT}`; g.fillText('500 บาท ▶', w / 2, 222);
  });
  sticker(0.04, 0.026, 400, 260, 0.041, btnY, (g, w, h) => {
    g.fillStyle = '#f6f4ee'; g.beginPath(); g.roundRect(0, 0, w, h, 22); g.fill();
    [['#ef4444', 'แดง = รอรถ'], ['#22c55e', 'เขียว = เก็บแล้ว'], ['#ef4444', 'กระพริบ = เรียกแล้ว']].forEach(([c, s], i) => {
      const y = 56 + i * 76;
      g.fillStyle = c; g.beginPath(); g.arc(46, y, 20, 0, Math.PI * 2); g.fill();
      if (i === 2) { g.fillStyle = '#f6f4ee'; g.beginPath(); g.arc(46, y, 9, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#374151'; g.font = `500 40px ${FONT}`; g.textAlign = 'left'; g.fillText(s, 82, y + 14);
    });
  });

  /* ---------- 2.9" tri-colour e-paper (296 x 128, black / white / red) behind a clear PC window ----------
     e-paper keeps its picture with zero power and reads fine in full sun; the ESP32 redraws it only when a
     reading or the status changes (partial refresh), with a full black-white flash when the status flips */
  const dispGrp = new THREE.Group();
  const DW = 0.0669, DH = 0.0291, DY = 0.0125;            // active area (mm datasheet: 66.9 x 29.1)
  dispGrp.position.set(cx, DY, LT + 0.0006);           // sits proud of the moulded label field
  const epaper = document.createElement('canvas');
  epaper.width = 888; epaper.height = 384;                 // 3 x native resolution
  const epTex = new THREE.CanvasTexture(epaper);
  epTex.colorSpace = THREE.SRGBColorSpace;
  epTex.anisotropy = 8;
  const epMat = new THREE.MeshStandardMaterial({ map: epTex, roughness: 0.92 });
  const flashMat = new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false });
  {
    // raised moulded bezel round the window, with the e-paper module's black border showing inside
    const bz = roundedRect(new THREE.Shape(), 0.08, 0.038, 0.004);
    bz.holes.push(roundedRect(new THREE.Path(), 0.0712, 0.0322, 0.0022));
    const bg = new THREE.ExtrudeGeometry(bz, { depth: 0.0008, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 2, curveSegments: 8 });
    bg.translate(0, 0, 0.0004);
    dispGrp.add(new THREE.Mesh(bg, M.nylon));
    dispGrp.add(rbox(0.0712, 0.0322, 0.0006, M.black, 0, 0, 0.0005, 0.0003));          // glass border (FPC side wider)
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), epMat);
    scr.position.z = 0.0011;
    dispGrp.add(scr);
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), flashMat);
    flash.position.z = 0.00125;
    flash.visible = false;
    flash.userData.noMerge = true;
    dispGrp.add(flash);
    dispGrp.userData.flash = flash;
    // clear polycarbonate window: faint gloss + a soft highlight streak
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.0716, 0.0326), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.05, clearcoat: 1, depthWrite: false }));
    win.position.z = 0.0019;
    dispGrp.add(win);
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.034), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false }));
    streak.position.set(-0.018, 0, 0.002);
    streak.rotation.z = -0.5;
    dispGrp.add(streak);
  }
  lid.add(dispGrp);
  dispGrp.traverse((m) => { if (m.isMesh) m.userData.part = 'display'; });
  // inside the lid: module back, folded FPC, the SPI driver board and its lead into the button harness
  {
    const zi = -0.0004;
    lid.add(rbox(0.0895, 0.038, 0.0012, M.white, cx, DY, zi - 0.0006, 0.0006));       // module back (white carrier)
    lid.add(rbox(0.022, 0.012, 0.0004, M.white, cx - 0.028, DY + 0.004, zi - 0.0014, 0.0002));   // spec label
    lid.add(rbox(0.016, 0.006, 0.0003, M.flex, cx - 0.03, DY - 0.0205, zi - 0.0012, 0.0002));   // FPC tail folded behind
    const dx = cx - 0.044, dy = btnY + 0.004;               // driver board left of the button nut
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(lid, cyl(0.0012, 0.004, M.brass), dx + sx * 0.0115, dy + sy * 0.0075, zi - 0.002);
    lid.add(rbox(0.029, 0.019, 0.0016, M.blueMod, dx, dy, zi - 0.0048, 0.0004));
    lid.add(rbox(0.009, 0.0045, 0.0028, M.black, dx + 0.008, dy + 0.006, zi - 0.0068, 0.0003));   // FPC connector latch
    lid.add(rbox(0.0045, 0.0045, 0.0009, M.black, dx - 0.004, dy, zi - 0.0061, 0.0002));        // level shifter IC
    lid.add(rbox(0.012, 0.0026, 0.0032, M.jst, dx - 0.006, dy - 0.0072, zi - 0.0072, 0.0003));    // 8-pin lead header
    // FPC from the module down into the latch, then the lead from the header to the button lugs
    lid.add(new THREE.Mesh(routedGeo([V3(cx - 0.03, DY - 0.0235, zi - 0.0014), V3(dx + 0.011, dy + 0.0095, zi - 0.004), V3(dx + 0.008, dy + 0.0085, zi - 0.0068)], 0.0007, 0.003, 4), M.flex));
    lid.add(new THREE.Mesh(routedGeo([V3(dx - 0.006, dy - 0.0085, zi - 0.0088), V3(dx - 0.006, dy - 0.014, zi - 0.011), V3(-0.006 + cx, btnY - 0.012, zi - 0.015), V3(cx - 0.004, btnY - 0.003, -LT - 0.019 - 0.006)], 0.0011, 0.005), wmat(0x8b939c)));
    label(lid, 'จอ e-paper 2.9″ · บอร์ดขับ SPI', cx - 0.03, DY + 0.026, -0.006, lid);
  }
  // 22 mm stainless anti-vandal button: flat bezel, RGB ring, flush actuator; threaded body, nut and lugs inside
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x1f8f3a, emissive: 0x22c55e, emissiveIntensity: 2.4, roughness: 0.3 });
  const btnGrp = new THREE.Group();
  btnGrp.position.set(cx, btnY, LT);
  {
    put(btnGrp, cyl(0.0128, 0.0022, M.ss), 0, 0, 0.0011);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.0089, 0.0101, 48), ringMat);
    ring.position.z = 0.0025;
    btnGrp.add(ring);
    put(btnGrp, cyl(0.0088, 0.0024, M.black), 0, 0, 0.001);
    const bodyLen = 0.019;
    put(btnGrp, cyl(0.0098, bodyLen, M.ssBrushed), 0, 0, -LT - bodyLen / 2 + 0.0025);
    for (let i = 0; i < 7; i++) put(btnGrp, cyl(0.0101, 0.0005, M.ss), 0, 0, -LT - 0.003 - i * 0.0015);   // thread crests
    put(btnGrp, cyl(0.0145, 0.0035, M.ss, 'z', hexGeo), 0, 0, -LT - 0.0005);
    put(btnGrp, cyl(0.0135, 0.0008, M.ss), 0, 0, -LT + 0.0016);
    put(btnGrp, cyl(0.0085, 0.004, M.black), 0, 0, -LT - bodyLen + 0.0005);                  // switch block
    for (const [x, y] of [[-0.004, 0.003], [0.004, 0.003], [-0.004, -0.003], [0.004, -0.003]]) {
      btnGrp.add(rbox(0.0016, 0.0004, 0.005, M.gold, x, y, -LT - bodyLen - 0.002, 0.0001));
      put(btnGrp, cyl(0.0011, 0.004, M.black), x, y, -LT - bodyLen - 0.0055);
    }
  }
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.0084, 0.0084, 0.0024, 40), new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.92, roughness: 0.18 }));
  button.rotation.x = Math.PI / 2;
  button.position.z = 0.0019;
  btnGrp.add(button);
  const buttonZ = button.position.z;
  lid.add(btnGrp);
  lid.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part ??= 'unit'; } });
  btnGrp.traverse((m) => { if (m.isMesh) m.userData.part = 'callButton'; });
  hub.add(lid);
  /* ---------- service light: warm-white LED bar under the top wall, switched by a reed switch ----------
     a magnet on the lid's free edge holds the reed open while the lid is shut; opening the lid closes it and
     the bar fades on. A tiny light sensor on the bar lets the ESP32 skip it in daylight (always on in the demo) */
  const lampG = new THREE.Group();
  const lampY = hH / 2 - wallT, lampZ = 0.017, lampL = 0.09, lampX = 0.004;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xf4efe4, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 });
  {
    lampG.add(rbox(lampL + 0.004, 0.003, 0.009, M.alu, lampX, lampY - 0.0015, lampZ, 0.0006));       // alu channel
    const diff = rbox(lampL, 0.0012, 0.0068, lampMat, lampX, lampY - 0.0034, lampZ, 0.0005);         // opal diffuser
    lampG.add(diff);
    for (const sx of [-1, 1]) lampG.add(rbox(0.002, 0.0035, 0.0094, M.nylon, lampX + sx * (lampL / 2 + 0.002), lampY - 0.0017, lampZ, 0.0004));   // end caps
    put(lampG, cyl(0.0012, 0.0006, M.black, 'y'), lampX + lampL / 2 - 0.006, lampY - 0.0041, lampZ);    // light sensor window
  }
  // spot aimed down and slightly forward: lights the boards on the back plate without leaking through the back
  // wall onto the frame behind the box (lights ignore walls when they cast no shadows)
  const lamp = new THREE.SpotLight(0xffd2a0, 0, 0.2, 1.05, 0.35, 2);
  lamp.position.set(lampX, lampY - 0.005, lampZ);
  lamp.target.position.set(lampX, -hH / 2, lampZ + 0.03);
  lampG.add(lamp, lamp.target);
  // reed switch on the free-side wall (glass body, gold leads) + its magnet on the lid
  const reedPos = V3(hW / 2 - wallT - 0.0022, 0.036, zRim - 0.007);
  {
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xdfeee8, transparent: true, opacity: 0.55, roughness: 0.05, depthWrite: false });
    const r = cyl(0.0011, 0.009, glass, 'z');
    r.position.copy(reedPos);
    lampG.add(r);
    put(lampG, cyl(0.0003, 0.007, M.gold, 'z'), reedPos.x, reedPos.y, reedPos.z);
    lampG.add(rbox(0.002, 0.004, 0.012, M.white, reedPos.x + 0.0012, reedPos.y, reedPos.z, 0.0004));   // holder clip
  }
  lid.add(rbox(0.004, 0.008, 0.003, M.ferrite, -hingeX + reedPos.x - 0.006, reedPos.y, -0.0016, 0.0006));   // lid magnet (in hinge coords)
  // LIGHT header: lamp + (red), common (black), reed signal (yellow), dressed down the right side
  [[RED, 2, 0.0012, false], [BLK, 0, 0, false], [YEL, 1, -0.0012, true]].forEach(([c, pin, o, reed]) => {
    const t = conns.light(pin);
    const head = reed ? [[reedPos.x - 0.001, reedPos.y, reedPos.z - 0.005], [0.068, reedPos.y - 0.004, reedPos.z - 0.014]]
      : [[lampX + lampL / 2 + 0.001, lampY - 0.0025, lampZ - 0.003 + o], [0.06, lampY - 0.006, lampZ - 0.012]];
    wire(c, [...head, [0.064 + o, 0.03, zw + 0.011], [0.064 + o, -0.002 - o, zw + 0.011], [t.x, -0.002 - o, zw + 0.011], up(t, 0.003, 0.001), t], 0.0005);
  });
  lampG.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.userData.part = 'unitLight'; } });
  hub.add(lampG);
  // button harness: grey 4-core cable with a service loop past the hinge, rebuilt while the lid swings
  const harness = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0x8b939c, roughness: 0.5 }));
  harness.userData.part = 'unitInside';
  harness.castShadow = true;
  hub.add(harness);
  const harnessStart = conns.btn(3.5).clone();               // 8-way plug: button, LED ring and e-paper SPI
  const tailZ = -LT - 0.019 - 0.0075;                      // end of the heat-shrunk lugs (button-group z)
  const hp = Array.from({ length: 6 }, () => V3(0, 0, 0));
  const _bt = V3(0, 0, 0);
  function buildHarness() {
    lid.updateMatrix(); btnGrp.updateMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(lid.matrix, btnGrp.matrix);
    hp[0].copy(harnessStart);
    hp[1].set(harnessStart.x, harnessStart.y + 0.005, harnessStart.z + 0.006);
    hp[2].set(-hW / 2 + 0.013, -0.006, zRim - 0.024);
    hp[3].set(-hW / 2 + 0.009, btnY - 0.006, zRim - 0.01);
    hp[4].copy(_bt.set(0, 0, tailZ - 0.007).applyMatrix4(m));
    hp[5].copy(_bt.set(0, 0, tailZ).applyMatrix4(m));
    harness.geometry.dispose();
    harness.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp, false, 'centripetal'), 40, 0.0017, 6, false);
  }
  buildHarness();

  /* ---------- 6 V 2 W panel on a tilting stainless bracket fixed to the station panel above the box ---------- */
  const solar = new THREE.Group();
  const P = { w: 0.16, d: 0.12, tilt: 0.3, pivotY: hH / 2 + 0.048, pivotZ: 0.016 };
  const wallZ = zBack - STANDOFF;                           // station panel face in hub coords
  {
    solar.add(rbox(0.11, 0.034, 0.002, M.ss, 0, P.pivotY, wallZ + 0.001, 0.003));
    for (const sx of [-1, 1]) secScrew(solar, sx * 0.042, P.pivotY, wallZ + 0.002, 0.0028);
    const armLen = P.pivotZ - wallZ;
    for (const sx of [-1, 1]) {
      const ax = sx * (P.w / 2 + 0.003);
      const arm = new THREE.Shape();
      arm.moveTo(0, -0.012); arm.lineTo(armLen, -0.012); arm.absarc(armLen, 0, 0.012, -Math.PI / 2, Math.PI / 2, false); arm.lineTo(0, 0.012); arm.closePath();
      const slot = new THREE.Path(); slot.absarc(armLen, 0, 0.0028, 0, Math.PI * 2, true); arm.holes.push(slot);
      const am = new THREE.Mesh(new THREE.ExtrudeGeometry(arm, { depth: 0.002, bevelEnabled: false, curveSegments: 16 }), M.ss);
      am.rotation.y = -Math.PI / 2;                        // shape x -> +z (out from the wall), extrusion -> -x
      am.position.set(ax + (sx > 0 ? 0.002 : 0), P.pivotY, wallZ);
      solar.add(am);
      solar.add(rbox(Math.abs(ax) - 0.054, 0.024, 0.002, M.ss, sx * (0.054 + (Math.abs(ax) - 0.054) / 2), P.pivotY, wallZ + 0.001, 0.0005));   // folded flange to the plate
      const bx = ax + sx * 0.001;
      put(solar, cyl(0.0026, 0.016, M.ss, 'x'), bx, P.pivotY, P.pivotZ);                    // pivot bolt
      put(solar, cyl(0.0042, 0.003, M.ss, 'x', hexGeo), bx - sx * 0.0065, P.pivotY, P.pivotZ);
      const wn = new THREE.Group();                                                          // wing nut (tilt lock)
      put(wn, cyl(0.0035, 0.004, M.ss, 'x'), 0, 0, 0);
      for (const s2 of [-1, 1]) wn.add(rbox(0.002, 0.009, 0.004, M.ss, 0, s2 * 0.0055, 0, 0.0008));
      wn.position.set(bx + sx * 0.0065, P.pivotY, P.pivotZ);
      wn.rotation.x = 0.4;
      solar.add(wn);
    }
  }
  const panel = new THREE.Group();
  panel.position.set(0, P.pivotY, P.pivotZ);
  panel.rotation.x = P.tilt;                                // front edge down: faces up and out, sheds rain over the lid
  {
    const cellsTex = canvasTex(1024, 768, (g, w, h) => {
      g.fillStyle = '#e8eaec'; g.fillRect(0, 0, w, h);
      const cols = 4, rows = 3, m = 34, gap = 8, cw = (w - 2 * m - gap * (cols - 1)) / cols, ch = (h - 2 * m - gap * (rows - 1)) / rows;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = m + i * (cw + gap), y = m + j * (ch + gap);
        const gr = g.createLinearGradient(x, y, x + cw, y + ch); gr.addColorStop(0, '#16233f'); gr.addColorStop(1, '#0d1830');
        g.fillStyle = gr; g.beginPath(); g.roundRect(x, y, cw, ch, 10); g.fill();
        g.strokeStyle = 'rgba(190,200,220,0.22)'; g.lineWidth = 1;
        for (let k = 1; k < 28; k++) { g.beginPath(); g.moveTo(x, y + (k * ch) / 28); g.lineTo(x + cw, y + (k * ch) / 28); g.stroke(); }
        g.fillStyle = 'rgba(215,222,235,0.85)';
        for (const f of [0.25, 0.5, 0.75]) g.fillRect(x + cw * f - 2, y, 4, ch);
      }
      g.fillStyle = 'rgba(210,215,222,0.9)';
      for (let j = 0; j < rows - 1; j++) g.fillRect(m, m + (j + 1) * (ch + gap) - gap / 2 - 2, w - 2 * m, 4);
    });
    const glass = new THREE.MeshPhysicalMaterial({ map: cellsTex, metalness: 0.2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 });
    const laminate = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.008, 0.004, P.d - 0.008), [M.backsheet, M.backsheet, glass, M.backsheet, M.backsheet, M.backsheet]);
    laminate.position.y = 0.0045;
    panel.add(laminate);
    for (const sz of [-1, 1]) {                                                              // L-section frame rails
      panel.add(rbox(P.w, 0.009, 0.005, M.alu, 0, 0.0025, sz * (P.d / 2 - 0.0025), 0.0008));
      panel.add(rbox(P.w, 0.0015, 0.008, M.alu, 0, 0.0068, sz * (P.d / 2 - 0.004), 0.0004));
    }
    for (const sx of [-1, 1]) {
      panel.add(rbox(0.005, 0.009, P.d, M.alu, sx * (P.w / 2 - 0.0025), 0.0025, 0, 0.0008));
      panel.add(rbox(0.008, 0.0015, P.d, M.alu, sx * (P.w / 2 - 0.004), 0.0068, 0, 0.0004));
    }
    panel.add(rbox(0.026, 0.008, 0.02, M.black, -0.05, -0.0015, -0.03, 0.0015));          // junction box
    put(panel, cyl(0.0032, 0.006, M.black, 'x'), -0.065, -0.0015, -0.03);                  // strain relief
    const spec = canvasTex(400, 240, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 240); g.fillStyle = '#111'; g.font = `700 30px ${FONT}`; g.fillText('SOLAR MODULE 2W', 18, 40); g.font = `500 24px ${MONO}`; ['Pmax  2.0 W', 'Vmp   6.0 V', 'Imp   0.33 A', 'Voc   7.2 V', 'Isc   0.36 A'].forEach((t, i) => g.fillText(t, 18, 84 + i * 32)); });
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.024), new THREE.MeshStandardMaterial({ map: spec, roughness: 0.6 }));
    sl.rotation.x = Math.PI / 2; sl.position.set(0.02, 0.0024, 0.01);
    panel.add(sl);
    for (const sx of [-1, 1]) {                                                              // pivot blocks riveted to the frame
      panel.add(rbox(0.006, 0.01, 0.024, M.alu, sx * (P.w / 2 - 0.002), -0.004, 0, 0.001));
      for (const z of [-0.008, 0.008]) put(panel, cyl(0.0012, 0.0012, M.ss, 'x'), sx * (P.w / 2 + 0.0012), -0.004, z);
    }
  }
  solar.add(panel);
  // PV cable: junction box -> short S-bend straight down -> top gland (the panel above keeps rain off it)
  panel.updateMatrix();
  const jbExit = V3(-0.069, -0.0015, -0.03).applyMatrix4(panel.matrix);
  const gTop = hH / 2 + 0.0135;                             // top of the gland's sealing cap
  solar.add(new THREE.Mesh(routedGeo([
    jbExit,
    jbExit.clone().add(V3(-0.007, -0.004, 0.001)),
    V3(glandPos.x - 0.02, gTop + 0.024, glandPos.z - 0.002),
    V3(glandPos.x, gTop + 0.012, glandPos.z),
    V3(glandPos.x, gTop - 0.001, glandPos.z),
  ], 0.0022, 0.01, 8), M.rubber));
  tag(solar, 'solar');
  hub.add(solar);

  label(hub, 'ESP32-C3 · BLE', E.x, -0.051, espTop + 0.004, lid);
  label(hub, 'NB-IoT + ฮีตซิงก์', S.x + 0.006, -0.051, espTop + 0.004, lid);
  label(hub, 'MPPT · จ่ายไฟ', K.x - 0.006, -0.051, espTop + 0.004, lid);
  label(hub, 'ถ่าน 18650 ×2', C.x - 0.006, 0.054, 0.03, lid);
  label(hub, 'เซ็นเซอร์อุณหภูมิ/ชื้น', sht.x - 0.004, sht.y + 0.014, 0.012, lid);
  label(hub, 'ไฟ LED ติดเองตอนเปิดฝา', lampX - 0.01, hH / 2 + 0.006, lampZ, lid);
  label(hub, 'พัดลม 30 มม.', fanX - 0.01, FAN.y - 0.024, 0.016, lid);
  group.add(hub);

  /* =====================================================================================================
     BLE FILL SENSOR under each bin lid — 72 x 50 x 22 mm ABS, VHB pad + 2 rivets through the lid.
     Looks straight down with a VL53L1X (27° cone); a tilt switch wakes it when the lid shuts.
     ===================================================================================================== */
  const sensors = [];
  const beams = [];
  const sensorBody = new THREE.MeshPhysicalMaterial({ color: 0xe6e8ea, roughness: 0.4, clearcoat: 0.3, transparent: true, opacity: 1 });
  const sLabelMat = new THREE.MeshStandardMaterial({
    roughness: 0.55,
    map: canvasTex(512, 200, (g, w, h) => {
      g.fillStyle = '#e6e8ea'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 18); g.fill();
      g.fillStyle = '#1d4ed8'; g.font = `700 50px ${FONT}`; g.textAlign = 'left'; g.fillText('BLE FILL', 26, 70);
      g.fillStyle = '#374151'; g.font = `500 32px ${MONO}`; g.fillText('PTW-001', 26, 118); g.font = `500 28px ${FONT}`; g.fillText('ถ่าน AA ×2 · เปลี่ยน 2029', 26, 162);
      g.fillStyle = '#111'; for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) if ((i * 7 + j * 13) % 5 < 2) g.fillRect(380 + i * 12, 40 + j * 12, 12, 12);
    }),
  });
  // drawn through the bin walls (x-ray) so the cone can be seen from outside
  const beamMat = new THREE.LineBasicMaterial({ color: 0xff3b6b, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const beamGeo = (() => {
    const R = Math.tan(THREE.MathUtils.degToRad(13.5)), N = 24, pts = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push(0, 0, 0, Math.cos(a) * R, -1, Math.sin(a) * R); }
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2; pts.push(Math.cos(a) * R, -1, Math.sin(a) * R, Math.cos(b) * R, -1, Math.sin(b) * R); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g;
  })();
  const parting = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6 });
  const foam = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.9 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, emissive: 0x3b82f6, emissiveIntensity: 1.6, roughness: 0.2 });
  const aperture = new THREE.MeshStandardMaterial({ color: 0x3b0a14, roughness: 0.1, metalness: 0.3 });
  const aaWrap = canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#1f2937'; g.fillRect(0, 0, w, h); g.fillStyle = '#e5e7eb'; g.fillRect(0, 0, 40, h); g.fillStyle = '#f59e0b'; g.font = `700 34px ${FONT}`; g.fillText('LITHIUM AA', 52, 60); });
  aaWrap.center.set(0.5, 0.5); aaWrap.rotation = Math.PI / 2;
  const aaMat = new THREE.MeshStandardMaterial({ map: aaWrap, roughness: 0.35 });
  const sW = 0.072, sDp = 0.05, sH = 0.022, winZ = 0.013;
  station.bins.forEach((bin, bi) => {
    const s = new THREE.Group();
    // two-part shell (base against the lid + cover) with a parting-line groove
    s.add(rbox(sW, 0.007, sDp, sensorBody, 0, -0.0035, 0, 0.003));
    s.add(rbox(sW - 0.001, 0.0006, sDp - 0.001, parting, 0, -0.0072, 0, 0.0003));
    s.add(rbox(sW, sH - 0.0078, sDp, sensorBody, 0, -0.0078 - (sH - 0.0078) / 2, 0, 0.004));
    s.add(rbox(sW - 0.008, 0.0012, sDp - 0.008, foam, 0, 0.0006, 0, 0.0004));               // VHB foam pad
    for (const sx of [-1, 1]) {                                                              // flange ears + rivets
      s.add(rbox(0.01, 0.0025, 0.016, sensorBody, sx * (sW / 2 + 0.004), -0.00125, 0, 0.0012));
      put(s, cyl(0.0024, 0.0012, M.ss, 'y'), sx * (sW / 2 + 0.004), -0.0031, 0);
      put(s, cyl(0.0009, 0.0014, M.black, 'y'), sx * (sW / 2 + 0.004), -0.0035, 0);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {                                   // cover screws
      put(s, cyl(0.0021, 0.0007, M.ss, 'y'), sx * (sW / 2 - 0.005), -sH - 0.00035, sz * (sDp / 2 - 0.005));
      put(s, cyl(0.0008, 0.0002, M.black, 'y', hexGeo), sx * (sW / 2 - 0.005), -sH - 0.0008, sz * (sDp / 2 - 0.005));
    }
    // ToF window: raised bezel, IR-black cover glass, emitter / receiver apertures
    s.add(rbox(0.016, 0.0012, 0.011, sensorBody, 0, -sH - 0.0006, winZ, 0.002));
    s.add(rbox(0.012, 0.0004, 0.007, M.blackGloss, 0, -sH - 0.0013, winZ, 0.0008));
    for (const dx of [-0.0025, 0.0025]) put(s, cyl(0.0011, 0.0002, aperture, 'y'), dx, -sH - 0.0016, winZ);
    put(s, cyl(0.0014, 0.0008, pipeMat, 'y'), 0.026, -sH - 0.0004, winZ);                     // status light pipe
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.02), sLabelMat);
    lbl.rotation.x = Math.PI / 2;
    lbl.position.set(-0.002, -sH - 0.0002, -0.0105);
    s.add(lbl);
    // internals: board horizontal, component side down toward the window
    const inn = new THREE.Group();
    inn.rotation.x = Math.PI / 2;                          // board +z -> sensor -y, board +y -> sensor +z
    inn.position.y = -0.0055;
    const top = pcb(inn, 'nrf', 0.064, 0.042, 0, 0, 0, 0.0012);
    smd(inn, 0.0105, 0.0175, 0.0008, 0.024, -0.002, top, M.blueMod);                         // nRF52810 module
    can(inn, 0.0095, 0.012, 0.0018, 0.024, -0.0045, top + 0.0008, [['nRF52', 34], ['810', 34]]);
    for (const dx of [-0.005, 0.005]) put(inn, cyl(0.0012, 0.003, M.brass, 'z', hexGeo), dx, winZ, top + 0.0015);
    const tofTop = pcb(inn, 'tof', 0.013, 0.01, 0, winZ, top + 0.003, 0.001);
    smd(inn, 0.0049, 0.0025, 0.0016, 0, winZ, tofTop, M.black);                              // VL53L1X package
    put(inn, cyl(0.0021, 0.006, M.ss, 'x'), 0.013, 0.012, top + 0.0024);                     // tilt switch
    smd(inn, 0.0032, 0.0015, 0.0008, 0.016, 0.006, top, M.ss);                               // 32 kHz crystal
    smd(inn, 0.0016, 0.0008, 0.0008, 0.01, 0.002, top, M.cap);
    inn.add(rbox(0.054, 0.028, 0.0012, M.black, -0.008, -0.0155, top + 0.0006, 0.0004));     // AA holder
    for (const y of [-0.0095, -0.0215]) {
      const aa = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.049, 22, 1, true), aaMat);
      aa.rotation.z = Math.PI / 2;
      aa.position.set(-0.008, y, top + 0.0082);
      inn.add(aa);
      for (const sx of [-1, 1]) put(inn, cyl(sx > 0 ? 0.0025 : 0.0068, 0.0012, M.ss, 'x'), -0.008 + sx * 0.0251, y, top + 0.0082);
    }
    inn.traverse((m) => { if (m.isMesh) m.castShadow = false; });
    s.add(inn);
    s.traverse((m) => { if (m.isMesh) m.userData.part = 'sensor'; });
    // measurement cone + live reading (shown while the lid is shut in the inside / circuit views)
    const beam = new THREE.LineSegments(beamGeo, beamMat);
    beam.position.set(0, -sH - 0.0016, winZ);
    beam.visible = false;
    beam.raycast = () => {};
    beam.userData.noMerge = true;
    beam.renderOrder = 10;
    s.add(beam);
    const el = document.createElement('div');
    el.className = 'dim hw';
    const read = new CSS2DObject(el);
    read.visible = false;
    s.add(read);
    if (bi === 0) label(s, 'nRF52 · ToF VL53L1X · AA ×2', 0, -0.045, 0, 'sensor');
    s.position.set(0, 0, 0.1);
    bin.userData.lidPivot.add(s);
    sensors.push(s);
    beams.push({ beam, read, el, lid: bin.userData.lidPivot, last: '' });
  });

  /* ---------- fill level inside bins (trash surface) ---------- */
  const trashMat = new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 0.95 });
  const trashGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.02, 4, 1);
  trashGeo.rotateY(Math.PI / 4);
  const trashes = station.bins.map((bin) => {
    const m = new THREE.Mesh(trashGeo, trashMat);
    m.visible = false;
    bin.add(m);
    return m;
  });
  const bagOrder = station.bagPile ? station.bagPile.children.slice() : [];
  let fills = [0, 0, 0, 0];

  // decals (labels, stickers, screens, antenna prints): pull them toward the camera in depth so they never
  // z-fight the surface they sit on, even from the far overview where depth precision is coarse
  const decalOffset = (m) => {
    if (!m.isMesh || Array.isArray(m.material)) return;
    if (!['PlaneGeometry', 'CircleGeometry', 'RingGeometry'].includes(m.geometry.type)) return;
    m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; m.material.polygonOffsetUnits = -4;
  };
  group.traverse(decalOffset);
  sensors.forEach((s) => s.traverse(decalOffset));              // the lid sensors live on the bin lids, outside the group
  // fewer draw calls: merge static meshes per subtree (hover parts stay apart)
  mergeStatic(body);
  for (const g of [cellsGrp, chgG, espG, simG, mbG]) mergeStatic(g);
  mergeStatic(inside, (n) => n === cellsGrp || n === chgG || n === espG || n === simG || n === mbG);
  mergeStatic(solar);
  mergeStatic(lid, (n) => n === btnGrp || n === dispGrp);

  /* ---------- circuit view: dots for the radio links and the solar lead ---------- */
  const dotGeo = new THREE.SphereGeometry(0.004, 10, 8);
  const links = [];
  const mkLink = (color, n, speed, ends, arc = 0) => {
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const dots = Array.from({ length: n }, (_, i) => { const d = new THREE.Mesh(dotGeo, mat); d.visible = false; d.userData.u = i / n; group.add(d); return d; });
    links.push({ dots, speed, ends, arc });
  };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const local = (obj, v) => group.worldToLocal(obj.localToWorld(v));
  sensors.forEach((s) => mkLink(0x38bdf8, 8, 0.5, () => [local(s, _a.set(0, -0.01, 0)), local(hub, _b.set(0.028, antY, antZ))], 0.25));
  mkLink(0x6366f1, 6, 0.4, () => [local(hub, _a.set(0.028, hH / 2, 0)), local(hub, _b.set(0.028, hH / 2 + 0.7, 0.1))]);
  mkLink(0xff5a36, 4, 0.6, () => [local(hub, _a.copy(jbExit)), local(hub, _b.set(glandPos.x, gTop, glandPos.z))]);
  let flowing = false, beamFlow = false;

  let insideMode = false, blink = false, blinkT = 0, lastOn = null, pressT = 0;
  const ST_RED = new THREE.Color(0xef4444), ST_GREEN = new THREE.Color(0x22c55e);

  // e-paper page: header with station id / battery / signal, one bar per bay, status line at the bottom
  const BAYS = CONFIG.bays.map((b) => (b.id === 'bag' ? 'ถุงขยะ' : b.th));
  const EK = '#151515', ER = '#c4161c', EW = '#ecebe4';
  let epKey = '', epMode = '', flashT = 0, fanSpeed = 0, lampLevel = 0, netT = 0;
  function drawEpaper(state) {
    const g = epaper.getContext('2d'), w = epaper.width, h = epaper.height;
    g.fillStyle = EW; g.fillRect(0, 0, w, h);
    g.fillStyle = EK; g.textBaseline = 'alphabetic';
    g.font = `700 40px ${MONO}`; g.textAlign = 'left'; g.fillText(state.id || 'BKK', 18, 46);
    // battery + NB-IoT bars (top right)
    g.lineWidth = 4; g.strokeStyle = EK; g.strokeRect(w - 176, 18, 62, 30); g.fillRect(w - 114, 26, 6, 14); g.fillRect(w - 170, 24, 44, 18);
    g.font = `600 30px ${MONO}`; g.textAlign = 'right'; g.fillText('87%', w - 186, 44);
    for (let i = 0; i < 4; i++) g.fillRect(w - 88 + i * 18, 48 - 8 - i * 8, 12, 8 + i * 8);
    g.fillRect(14, 60, w - 28, 4);
    // fill bars
    const rows = state.fills.length, top = 76, rh = 50;
    for (let i = 0; i < rows; i++) {
      const f = Math.round(state.fills[i]), y = top + i * rh, full = f >= 80;
      g.fillStyle = EK; g.textAlign = 'left'; g.font = `600 34px ${FONT}`; g.fillText(BAYS[i] ?? `ช่อง ${i + 1}`, 18, y + 36);
      const bx = 220, bw = w - bx - 150;
      g.strokeStyle = EK; g.lineWidth = 3; g.strokeRect(bx, y + 10, bw, 30);
      g.fillStyle = full ? ER : EK; g.fillRect(bx + 5, y + 15, Math.max(0, (bw - 10) * f / 100), 20);
      for (let k = 1; k < 4; k++) { g.fillStyle = EW; g.fillRect(bx + bw * k / 4 - 1, y + 15, 2, 20); }
      g.fillStyle = full ? ER : EK; g.textAlign = 'right'; g.font = `700 36px ${MONO}`; g.fillText(`${f}%`, w - 18, y + 38);
    }
    // status band
    const y = top + rows * rh + 4;
    const t = new Date(state.lastPickup || Date.now());
    const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    const [bg, fg, msg] = state.callRequested ? [ER, EW, 'เรียกรถนอกรอบแล้ว · รถกำลังมา']
      : state.status === 'pending' ? [EK, EW, 'ถังใกล้เต็ม · รอรถมาเก็บ']
      : [EW, EK, `เก็บล่าสุด ${hm} น. · กดปุ่มเรียกรถได้`];
    g.fillStyle = bg; g.fillRect(0, y, w, h - y);
    if (bg === EW) { g.fillStyle = EK; g.fillRect(14, y, w - 28, 3); }
    g.fillStyle = fg; g.textAlign = 'center'; g.font = `600 36px ${FONT}`; g.fillText(msg, w / 2, y + (h - y) / 2 + 13);
    epTex.needsUpdate = true;
  }

  function apply(state) {
    const key = JSON.stringify([state.fills.map(Math.round), state.status, state.callRequested, state.lastPickup]);
    if (key !== epKey) {
      const mode = `${state.status}|${state.callRequested}`;
      if (epMode && mode !== epMode) flashT = 0.36;          // status flipped: full refresh (black / white flash)
      epKey = key; epMode = mode;
      drawEpaper(state);
    }
    fills = state.fills.slice();
    const col = state.status === 'pending' ? ST_RED : ST_GREEN;
    ringMat.emissive.copy(col);
    ringMat.color.copy(col).multiplyScalar(0.6);
    blink = !!state.callRequested;
    if (!blink) { ringMat.emissiveIntensity = 2.4; lastOn = null; blinkT = 0; }
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
  }

  // ToF cones: window straight down to the trash surface, with the distance and the fill it maps to
  const _w = new THREE.Vector3(), _t = new THREE.Vector3();
  function updateBeams() {
    let changed = false;
    const want = insideMode || beamFlow;
    beams.forEach((b, i) => {
      const on = want && Math.abs(b.lid.rotation.x) < 0.03;
      if (b.beam.visible !== on) { b.beam.visible = on; changed = true; }
      const showRead = on && beamFlow;                    // readouts only in the circuit view (the inside view has its own labels)
      if (b.read.visible !== showRead) { b.read.visible = showRead; changed = true; }
      if (!on) return;
      b.beam.getWorldPosition(_w);
      trashes[i].getWorldPosition(_t);
      const dist = Math.max(0.03, _w.y - _t.y - 0.01);
      if (Math.abs(b.beam.scale.y - dist) > 1e-4) { b.beam.scale.setScalar(dist); changed = true; }
      b.read.position.set(0, b.beam.position.y - dist, b.beam.position.z);
      const txt = `ToF ${Math.round(dist * 100)} ซม. → ${Math.round(fills[i])}%`;
      if (txt !== b.last) { b.el.textContent = txt; b.last = txt; changed = true; }
    });
    return changed;
  }

  const setLid = (v) => { lid.userData.target = v ? 1 : 0; };
  return {
    group,
    // world-space anchors for the camera when focusing a device
    focusTargets: { unit: hub, battery: hub, sensor: () => sensors[0].children[0] },   // the shell only: the ToF cone would skew the bounding box
    setUnitOpen: setLid,
    setBatteryOpen: setLid,
    // beams: also draw the ToF cones (off when zoomed on the hub, where they would cover it)
    setFlow(v, beams = v) { flowing = v; beamFlow = beams; links.forEach((l) => l.dots.forEach((d) => (d.visible = v))); },
    button,
    apply,
    press() { pressT = 0.25; },
    setInsideView(v) {
      insideMode = v;
      setLid(v);
      sensorBody.opacity = v ? 0.22 : 1;
      sensorBody.depthWrite = !v;
    },
    isInsideView: () => insideMode,
    // returns 2 = lid moved (shadows), 1 = repaint (button travel / labels / dots / beams), 3 = status light flip only, 0 = idle
    update(dt) {
      let res = 0, moving = false, lightFlip = false;
      if (flowing) {
        for (const l of links) {
          const [a, b] = l.ends();
          const arc = a.distanceTo(b) * l.arc;
          for (const d of l.dots) {
            d.userData.u = (d.userData.u + l.speed * dt) % 1;
            const u = d.userData.u;
            d.position.lerpVectors(a, b, u);
            d.position.y += Math.sin(Math.PI * u) * arc;
          }
        }
        moving = true;
      }
      const u = lid.userData;
      if (Math.abs(u.target - u.open) > 1e-4) {
        u.open += (u.target - u.open) * Math.min(1, dt * 5);
        if (Math.abs(u.target - u.open) <= 1e-4) u.open = u.target;
        lid.rotation.y = u.side * u.open * u.max;
        buildHarness();
        res = 2;
      }
      if (updateBeams()) res = Math.max(res, 1);
      for (const { o, owner } of insideLabels) {
        const show = owner === 'sensor' ? sensorBody.opacity < 1 : owner.userData.open > 0.6;
        if (o.visible !== show) { o.visible = show; res = Math.max(res, 1); }
      }
      if (blink) {
        blinkT += dt;
        const on = Math.sin(blinkT * Math.PI * 2 * 1.2) > 0;
        if (on !== lastOn) {                               // off phase = unlit diffuser (dark smoke), not a dim red
          lastOn = on;
          ringMat.emissiveIntensity = on ? 3.2 : 0;
          if (on) ringMat.color.copy(ST_RED).multiplyScalar(0.6); else ringMat.color.setHex(0x2a2224);
          lightFlip = true;
        }
      }
      if (lid.userData.open > 0.05 || insideMode) {          // fan: gentle spin-up / spin-down
        fanSpeed = Math.min(1, fanSpeed + dt * 0.8);
      } else fanSpeed = Math.max(0, fanSpeed - dt * 0.6);
      if (fanSpeed > 0) { fanRotor.rotation.x -= dt * fanSpeed * Math.PI * 2 * 1.4; moving = true; }
      if (lid.userData.open > 0.05) {                       // modem NETLIGHT: short blink every 3 s = registered
        netT = (netT + dt) % 3;
        const ni = netT < 0.1 ? 2.6 : 0;
        if (netMat.emissiveIntensity !== ni) { netMat.emissiveIntensity = ni; moving = true; }
      }
      const lt = lid.userData.open > 0.08 ? 1 : 0;           // service light follows the reed switch
      if (lampLevel !== lt) {
        lampLevel = lt > lampLevel ? Math.min(1, lampLevel + dt * 4) : Math.max(0, lampLevel - dt * 3);
        lamp.intensity = lampLevel * 0.25;
        lampMat.emissiveIntensity = lampLevel * 2.2;
        moving = true;
      }
      if (flashT > 0) {
        flashT = Math.max(0, flashT - dt);
        const fl = dispGrp.userData.flash, ph = Math.floor((0.36 - flashT) / 0.12);   // black, white, done
        const on = flashT > 0 && ph < 2;
        if (fl.visible !== on) fl.visible = on;
        if (on) flashMat.color.setHex(ph % 2 ? 0xf2f1ea : 0x111111);
        moving = true;
      }
      if (pressT > 0) {
        pressT = Math.max(0, pressT - dt);
        button.position.z = buttonZ - 0.0015 * Math.sin((pressT / 0.25) * Math.PI);
        moving = true;
      }
      return res || (moving ? 1 : lightFlip ? 3 : 0);
    },
  };
}
