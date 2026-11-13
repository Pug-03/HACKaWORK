import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CONFIG } from './config.js';
import { buildStation } from './binStation.js';
import { buildRiser, RISER } from './riser.js';
import { buildHardware, buildFillLevels, KIT_COST, kitTotal } from './hardware.js';
import { rbox } from './geom.js';
import { buildCamPole, CAM_TYPES, poleTotal } from './camPole.js';

// Two more ways to know how full a station is, built as full stations beside the original:
//  A (original, main.js): BLE time-of-flight sensor under every bin lid
//  B: a low weighing plate under every bin (4 load cells + HX711), wired to the same ESP32 hub
//  C: no hardware on the bins: a short solar camera pole beside the station looks down on it and an AI
//     (next phase) reads overflowing bins, lids that will not shut and bags dumped outside
// Floating arrows drop in from the sky above each station and say which one is which.

const FONT = 'Kanit, Thonburi, sans-serif';
const MONO = 'Menlo, Consolas, monospace';
export const ARROW_LAYER = 1;            // explain-only objects: seen by the main camera, not by the CCTV or the raycaster

// one weighing plate per bin (THB, rough Thai retail)
export const WEIGH_COST = [
  ['แผ่นชั่งเหล็กกัลวาไนซ์ 53×56 ซม. ลายกันลื่น + ทางลาด', 420],
  ['โหลดเซลล์ 50 กก. ×4 (ฮาล์ฟบริดจ์)', 140],
  ['บอร์ด HX711 24 บิต + กล่องกันน้ำ', 35],
  ['สายชีลด์ 4 แกน + ข้อต่อกันน้ำ', 55],
];
const hubTotal = () => KIT_COST.hub.reduce((s, [, p]) => s + p, 0);
const plateTotal = () => WEIGH_COST.reduce((s, [, p]) => s + p, 0);
export const weighTotal = () => hubTotal() + plateTotal() * 3;

// rough net weight of a full 120 L bin by stream (kg): turns weight back into % full
const FULL_KG = { recycle: 9, food: 72, general: 24 };
const BIN_TARE = 9.5;

export const VARIANT_INFO = {
  A: { color: '#2563eb', title: 'เซ็นเซอร์ใต้ฝาถัง', sub: 'แบบเดิม · ToF วัดระยะ + BLE', cost: () => `~${kitTotal().toLocaleString('th-TH')} บาท/สถานี` },
  B: { color: '#ea580c', title: 'ชั่งน้ำหนักใต้ถัง', sub: 'แผ่นโหลดเซลล์ 3 แผ่น · ต่อสายเข้าฮับเดิม', cost: () => `~${weighTotal().toLocaleString('th-TH')} บาท/สถานี` },
  C: { color: '#7c3aed', title: 'เสากล้องข้างถัง + AI', sub: 'โซลาร์ + 4G ในตัว · ใส่กล้องได้ 5 แบบ', cost: () => `~${(poleTotal() + CAM_TYPES.dome.cost).toLocaleString('th-TH')} บาท/สถานี` },
};

// comparison panel content
export const COMPARE = [
  { k: 'A', measures: 'ความสูงขยะในถัง (ToF ใต้ฝา)', cost: () => kitTotal(),
    pros: ['รู้ % ปริมาตรตรง ๆ ทุกประเภทขยะ', 'ไม่ต้องเดินสาย'],
    cons: ['มีถ่าน AA ในถังทุกใบ เปลี่ยนทุก 2–3 ปี', 'เซ็นเซอร์ติดไปกับถัง ถังหาย/สลับต้องจับคู่ใหม่'] },
  { k: 'B', measures: 'น้ำหนักขยะจริง (กก.) ใต้ถัง', cost: () => weighTotal(),
    pros: ['ไม่มีอุปกรณ์บนถัง สลับถังได้ทันที', 'ไม่มีถ่านในถัง ใช้ไฟจากฮับผ่านสาย', 'ได้ กก. จริง วางแผนรถ/คิดค่าบริการตามน้ำหนัก'],
    cons: ['ขยะเบา (รีไซเคิล) ต้องแปลงเป็น % ด้วยค่าความหนาแน่น', 'ถังสูงขึ้น 3 ซม. ต้องมีทางลาดเข็นขึ้น'] },
  { k: 'C', measures: 'ภาพจากกล้อง: ถังล้น ฝาเผยอ ถุงกองนอกถัง', cost: () => poleTotal() + CAM_TYPES.dome.cost,
    pros: ['ไม่มีอุปกรณ์บนถัง ไม่ต้องเดินสายไฟ (โซลาร์ + แบต + 4G ในตัวเสา)', 'เห็นสิ่งที่เซ็นเซอร์ไม่เห็น: ทิ้งนอกถัง หนู ยืนยันรถมาเก็บ', 'จุดที่มีกล้อง กทม. มองเห็นอยู่แล้ว ใช้ภาพเดิมเข้า AI ได้เลย ไม่ต้องตั้งเสา (~0 บาท)'],
    cons: ['มองไม่เห็นในถังตอนฝาปิด รู้ได้เมื่อล้นหรือฝาเผยอ', 'ถ้าต้องตั้งเสาเอง แพงกว่า A / B', 'AI ทำในเฟสถัดไป + ขอใช้ภาพตาม PDPA'] },
];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// polyline with rounded corners -> CurvePath (cables, conduits)
function routed(pts, bend) {
  const path = new THREE.CurvePath();
  let prev = pts[0].clone();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    if (!c) { path.add(new THREE.LineCurve3(prev, b.clone())); break; }
    const r = Math.min(bend, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
    const p0 = b.clone().addScaledVector(a.clone().sub(b).normalize(), r);
    const p1 = b.clone().addScaledVector(c.clone().sub(b).normalize(), r);
    if (prev.distanceTo(p0) > 1e-5) path.add(new THREE.LineCurve3(prev, p0));
    path.add(new THREE.QuadraticBezierCurve3(p0, b.clone(), p1));
    prev = p1;
  }
  return path;
}
function pipe(pts, r, mat, bend = 0.03) {
  const path = routed(pts, bend);
  const m = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(16, pts.length * 14), r, 10, false), mat);
  m.castShadow = true;
  return m;
}

/* ---------------------------------------------------------------- shared materials */
const MAT = {
  galv: new THREE.MeshStandardMaterial({ color: 0xaeb4ba, metalness: 0.85, roughness: 0.42 }),
  galvDark: new THREE.MeshStandardMaterial({ color: 0x80878e, metalness: 0.8, roughness: 0.5 }),
  alu: new THREE.MeshStandardMaterial({ color: 0xd2d6da, metalness: 0.9, roughness: 0.28 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.9 }),
  black: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5 }),
  cable: new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.45 }),
  pvc: new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.55 }),
  boxGrey: new THREE.MeshPhysicalMaterial({ color: 0xc4c8cc, roughness: 0.45, clearcoat: 0.3 }),
  white: new THREE.MeshPhysicalMaterial({ color: 0xf2f3f4, roughness: 0.35, clearcoat: 0.5 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xa9a7a1, roughness: 0.92 }),
  smoke: new THREE.MeshPhysicalMaterial({ color: 0x1c2026, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.72, clearcoat: 1 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.5, clearcoat: 1 }),
};

// diamond checker plate (bump) + matching roughness
function checkerPlateTex() {
  const draw = (g, w, h) => {
    g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const cx = x * 32 + (y % 2 ? 16 : 0) + 8, cy = y * 32 + 16;
      g.save(); g.translate(cx, cy); g.rotate((y + x) % 2 ? Math.PI / 4 : -Math.PI / 4);
      const gr = g.createLinearGradient(-12, 0, 12, 0);
      gr.addColorStop(0, '#8a8a8a'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#8a8a8a');
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 12, 3.2, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  };
  const t = canvasTex(256, 256, draw);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

/* ================================================================ VARIANT B: weighing plates */
function buildWeighPlate(stationLen) {
  const g = new THREE.Group();
  const W = 0.53, Dp = 0.56, deckT = 0.006, deckTop = 0.029;
  const chk = checkerPlateTex();
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xbcc2c8, metalness: 0.85, roughness: 0.38, bumpMap: chk, bumpScale: 2.5 });
  // base tray (sits on the station floor) with a raised rim
  g.add(rbox(W, 0.006, Dp, MAT.galvDark, 0, 0.003, 0, 0.002));
  for (const sx of [-1, 1]) g.add(rbox(0.006, 0.016, Dp, MAT.galvDark, sx * (W / 2 - 0.003), 0.008, 0, 0.002));
  g.add(rbox(W, 0.016, 0.006, MAT.galvDark, 0, 0.008, Dp / 2 - 0.003, 0.002));
  // 4 single-point load cells (aluminium bars with a white gauge label) under the deck corners
  const gauge = new THREE.MeshStandardMaterial({ map: canvasTex(128, 32, (c, w, h) => { c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, w, h); c.fillStyle = '#1d4ed8'; c.font = `700 20px ${MONO}`; c.fillText('50kg', 8, 23); c.fillStyle = '#222'; c.fillRect(80, 8, 36, 16); }), roughness: 0.6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - 0.05), z = sz * (Dp / 2 - 0.06);
    g.add(rbox(0.014, 0.012, 0.07, MAT.alu, x, 0.013, z, 0.0015));
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.008), gauge);
    lbl.position.set(x + sx * 0.0072, 0.013, z); lbl.rotation.y = sx * Math.PI / 2;
    g.add(lbl);
    g.add(rbox(0.026, 0.003, 0.026, MAT.rubber, x, 0.0075, z - sz * 0.025, 0.001));        // rubber foot pad
    for (const dz of [-0.022, 0.022]) {                                                     // M5 bolts into the deck
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.006, 8), MAT.galv);
      b.position.set(x, 0.021, z + dz); g.add(b);
    }
  }
  // floating checker-plate deck (3 mm gap to the rim all round, so nothing touches but the cells)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W - 0.018, deckT, Dp - 0.06), deckMat);
  deck.position.set(0, deckTop - deckT / 2, -0.02);
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  // rear ramp lip (bins roll in from the back) with yellow/black edge
  const hazard = canvasTex(256, 32, (c, w, h) => { c.fillStyle = '#f2c200'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; for (let x = -32; x < w; x += 32) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 16, 0); c.lineTo(x + 32, 0); c.lineTo(x + 16, h); c.fill(); } });
  const rampShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.035, 0), new THREE.Vector2(0.035, deckTop - 0.002), new THREE.Vector2(0.03, deckTop - 0.002)]);
  const rampGeo = new THREE.ExtrudeGeometry(rampShape, { depth: W - 0.03, bevelEnabled: false });
  const ramp = new THREE.Mesh(rampGeo, [new THREE.MeshStandardMaterial({ color: 0x9ca3aa, metalness: 0.8, roughness: 0.45 }), new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.6 })]);
  ramp.rotation.y = Math.PI / 2;
  ramp.position.set(-(W - 0.03) / 2, 0, -Dp / 2 - 0.004 + 0.0);
  ramp.castShadow = ramp.receiveShadow = true;
  g.add(ramp);
  // front strip: HX711 junction box + cable gland toward the cable channel
  const jbx = -W / 2 + 0.07, jbz = Dp / 2 - 0.035;
  g.add(rbox(0.07, 0.024, 0.04, MAT.boxGrey, jbx, 0.018, jbz, 0.004));
  g.add(rbox(0.07, 0.002, 0.04, MAT.boxGrey, jbx, 0.031, jbz, 0.001));
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.016), new THREE.MeshStandardMaterial({ map: canvasTex(256, 80, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#ea580c'; c.font = `700 40px ${MONO}`; c.fillText('HX711', 12, 38); c.fillStyle = '#333'; c.font = `500 26px ${FONT}`; c.fillText('โหลดเซลล์ ×4', 12, 70); }), roughness: 0.6 }));
  sticker.rotation.x = -Math.PI / 2; sticker.position.set(jbx, 0.0322, jbz);
  sticker.material.polygonOffset = true; sticker.material.polygonOffsetFactor = -2;
  g.add(sticker);
  const gland = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 12), MAT.black);
  gland.rotation.z = Math.PI / 2; gland.position.set(jbx - 0.04, 0.018, jbz); g.add(gland);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = 'weighPlate'; } });
  return { group: g, deckTop: deckTop + 0.001, glandLocal: new THREE.Vector3(jbx - 0.045, 0.018, jbz) };
}

function buildVariantB(renderer) {
  const station = buildStation(renderer);
  const L = station.length, F = CONFIG.frame;
  const base = F.footHeight + 0.008;                      // top of the station floor plate
  const plates = [];
  const cableMat = MAT.cable;
  const cables = new THREE.Group();
  // cable channel along the front of the floor (behind the bottom rail), out through the left end panel
  const chZ = CONFIG.frame.depth / 2 - 0.055, chY = base + 0.009;
  cables.add(rbox(L - 0.06, 0.018, 0.024, MAT.galvDark, 0, base + 0.009, chZ, 0.002));
  station.bins.forEach((bin, i) => {
    const p = buildWeighPlate(L);
    p.group.position.set(bin.position.x, base, 0);
    station.group.add(p.group);
    bin.position.y = base + p.deckTop;                    // the bin now stands on the plate
    plates.push(p);
    const s = p.group.position.clone().add(p.glandLocal);
    cables.add(pipe([s, new THREE.Vector3(s.x - 0.02, s.y, s.z), new THREE.Vector3(s.x - 0.03, chY + 0.004, chZ)], 0.0028, cableMat, 0.012));
  });
  // conduit: through a gland in the left end panel, along its outside face and up into the hub's base
  const X0 = -L / 2 - 0.004, hubX = X0 - 0.008 - 0.0375, hubBottom = 0.68 - 0.06;
  const cx = X0 - 0.014;
  const conduit = pipe([
    new THREE.Vector3(-L / 2 + 0.03, chY, chZ), new THREE.Vector3(cx, chY, chZ), new THREE.Vector3(cx, chY, -0.02),
    new THREE.Vector3(cx, hubBottom - 0.06, -0.02), new THREE.Vector3(hubX, hubBottom - 0.06, 0.04), new THREE.Vector3(hubX, hubBottom + 0.004, 0.04),
  ], 0.008, MAT.pvc, 0.05);
  cables.add(conduit);
  for (const y of [0.18, 0.34, 0.48]) {                     // saddle clips on the panel
    cables.add(rbox(0.006, 0.012, 0.03, MAT.galv, X0 - 0.003, y, -0.02, 0.002));
  }
  cables.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = 'weighCable'; } });
  station.group.add(cables);

  // same ESP32 hub as station A, minus the lid sensors
  const hardware = buildHardware(station, { lidSensors: false });
  station.group.add(hardware.group);

  // live weight readouts above each bin
  const readouts = station.bins.map((bin) => {
    const el = document.createElement('div');
    el.className = 'dim weigh';
    const o = new CSS2DObject(el);
    o.position.set(bin.position.x, 1.36, 0.2);
    station.group.add(o);
    return { el, o, last: '' };
  });
  // see-through front sign panels to show the plates
  const fronts = [];
  station.group.traverse((o) => { if (o.isMesh && Array.isArray(o.material) && o.userData.bayId) fronts.push(o); });
  const solid = fronts.map((o) => o.material);
  const ghost = fronts.map((o) => o.material.map((m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.16; c.depthWrite = false; c.alphaTest = 0; return c; }));
  return {
    station, hardware, plates, readouts,
    setXray(v) { fronts.forEach((o, i) => (o.material = v ? ghost[i] : solid[i])); },
    apply(state) {
      hardware.apply(state);
      CONFIG.bays.filter((b) => b.type === 'bin').forEach((bay, i) => {
        const kg = (state.fills[i] / 100) * FULL_KG[bay.id];
        const txt = `<b>${kg.toFixed(1)} กก.</b><small>${Math.round(state.fills[i])}%</small>`;
        const r = readouts[i];
        if (txt !== r.last) { r.el.innerHTML = txt; r.last = txt; }
      });
    },
    setReadouts(v) { readouts.forEach((r) => (r.o.visible = v)); },
  };
}

/* ================================================================ VARIANT C: BMA CCTV pole */
function qrPlacard() {
  const tex = canvasTex(400, 520, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#7c3aed'; c.fillRect(0, 0, w, 96);
    c.fillStyle = '#fff'; c.font = `700 44px ${FONT}`; c.textAlign = 'center'; c.fillText('เรียกรถนอกรอบ', w / 2, 64);
    c.fillStyle = '#111';
    const n = 21, s = 11, ox = (w - n * s) / 2, oy = 122;
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (r() < 0.48) c.fillRect(ox + x * s, oy + y * s, s, s);
    for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      c.fillStyle = '#111'; c.fillRect(ox + fx * s, oy + fy * s, 7 * s, 7 * s);
      c.fillStyle = '#fff'; c.fillRect(ox + (fx + 1) * s, oy + (fy + 1) * s, 5 * s, 5 * s);
      c.fillStyle = '#111'; c.fillRect(ox + (fx + 2) * s, oy + (fy + 2) * s, 3 * s, 3 * s);
    }
    c.fillStyle = '#111'; c.font = `600 34px ${FONT}`; c.fillText('สแกน · 500 บาท', w / 2, 410);
    c.fillStyle = '#6b7280'; c.font = `500 24px ${FONT}`; c.fillText('ไม่มีอุปกรณ์ที่สถานี', w / 2, 452);
    c.fillText('กล้องข้างถังยืนยันรถมาเก็บ', w / 2, 486);
  });
  const g = new THREE.Group();
  g.add(rbox(0.004, 0.21, 0.165, MAT.alu, 0, 0, 0, 0.002));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.155, 0.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
  face.rotation.y = -Math.PI / 2; face.position.x = -0.0022; g.add(face);
  for (const y of [-0.09, 0.09]) for (const z of [-0.07, 0.07]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.002, 10), MAT.alu);
    r.rotation.z = Math.PI / 2; r.position.set(-0.0032, y, z); g.add(r);
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = 'qrCall'; } });
  return g;
}

function buildVariantC(renderer, root) {
  const station = buildStation(renderer);
  const L = station.length;
  const fill = buildFillLevels(station);
  const qr = qrPlacard();
  qr.position.set(-L / 2 - 0.006, 0.66, 0.06);
  station.group.add(qr);

  // our own short solar camera pole beside the right end panel; the boom reaches over the middle of the
  // station so the camera looks down on all four lids side by side
  const D = CONFIG.frame.depth;
  const polePos = new THREE.Vector3(L / 2 + 0.3, 0.012, 0);
  const feedLook = new THREE.Vector3(0, 0.9, 0.1);                    // root-local: middle of the station, lid level
  const camPole = buildCamPole(feedLook.clone().sub(polePos), { boom: polePos.x, initial: 'dome' });
  camPole.group.position.copy(polePos);
  camPole.tieTo(new THREE.Vector3(L / 2, 0, 0).sub(polePos), [0.78, 1.16]);
  root.add(camPole.group);

  const cctvCam = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 60);
  cctvCam.layers.set(0);
  root.add(cctvCam);
  let poleOn = true;

  // field of view: pyramid edges + ground footprint, explain layer only (rebuilt when the feed source changes)
  const fov = new THREE.Group();
  const fovLineMat = new THREE.LineBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.85, depthWrite: false });
  const fovFillMat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const footMat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
  const ray = new THREE.Raycaster();
  function rebuildFov() {
    for (const o of [...fov.children]) { o.geometry.dispose(); fov.remove(o); }
    root.updateMatrixWorld(true);
    const lensLocal = cctvCam.position.clone();
    const corners = [];
    const groundY = root.localToWorld(new THREE.Vector3(0, 0.03, 0)).y;
    const asp = cctvCam.aspect; cctvCam.aspect = 16 / 9; cctvCam.updateProjectionMatrix();
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ray.setFromCamera(new THREE.Vector2(x, y), cctvCam);
      const t = (groundY - ray.ray.origin.y) / ray.ray.direction.y;
      const p = t > 0 && t < 40 ? ray.ray.at(t, new THREE.Vector3()) : ray.ray.at(8, new THREE.Vector3());
      corners.push(root.worldToLocal(p));
    }
    cctvCam.aspect = asp; cctvCam.updateProjectionMatrix();
    const edgePts = [];
    for (let i = 0; i < 4; i++) edgePts.push(lensLocal, corners[i], corners[i], corners[(i + 1) % 4]);
    fov.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edgePts), fovLineMat));
    const sp = [];
    for (let i = 0; i < 4; i++) { const a = corners[i], b = corners[(i + 1) % 4]; sp.push(lensLocal.x, lensLocal.y, lensLocal.z, a.x, a.y, a.z, b.x, b.y, b.z); }
    const sideGeo = new THREE.BufferGeometry(); sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    fov.add(new THREE.Mesh(sideGeo, fovFillMat));
    const foot = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]), footMat);
    foot.position.y = 0.005;
    fov.add(foot);
    fov.traverse((o) => { o.layers.set(ARROW_LAYER); o.raycast = () => {}; });
  }
  fov.visible = false;
  let fovWanted = false, fovAllowed = true;
  root.add(fov);

  // point the simulated feed at whichever camera is live: our pole camera if fitted, else the BMA dome
  function aimFeed() {
    const type = camPole.type();
    root.updateMatrixWorld(true);
    if (!poleOn || type === 'none') { fov.visible = false; fovAllowed = false; return; }
    fovAllowed = true; fov.visible = fovWanted;
    const lensW = camPole.lens(type);
    cctvCam.position.copy(root.worldToLocal(lensW.clone()));
    // looking (almost) straight down: keep the station's long side across the picture, front at the bottom
    cctvCam.up.set(0, 0, -1);
    if (type === 'fisheye') cctvCam.lookAt(root.localToWorld(cctvCam.position.clone().add(new THREE.Vector3(0, -2.4, 0.05))));
    else cctvCam.lookAt(root.localToWorld(feedLook.clone()));
    cctvCam.fov = CAM_TYPES[type].fov;
    cctvCam.updateProjectionMatrix();
    cctvCam.updateMatrixWorld(true);
    rebuildFov();
  }
  aimFeed();

  return {
    station, fill, cctvCam, fov, camPole,
    feedSource: () => ({ live: poleOn && camPole.type() !== 'none', type: camPole.type(), poleOn }),
    setFov(v) { fovWanted = v; fov.visible = v && fovAllowed; },
    setCamPole(v) {
      poleOn = v;
      if (v) root.add(camPole.group); else root.remove(camPole.group);
      aimFeed();
    },
    setCamType(k) { camPole.setType(k); aimFeed(); },
    reaim: aimFeed,
    apply(state) {
      fill.apply(state.fills);
      // a bin packed past the brim cannot shut: the lid rides up a little (what the camera can see)
      station.bins.forEach((bin, i) => {
        const u = bin.userData;
        if (u.target >= 0.5) return;                       // opened by hand: leave it
        u.target = state.fills[i] >= 90 ? 0.05 : 0;
      });
    },
  };
}

/* ================================================================ sky arrows */
function buildArrow(key, onPick) {
  const info = VARIANT_INFO[key];
  const col = new THREE.Color(info.color);
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15, emissive: col, emissiveIntensity: 0.35 });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.6, 24), mat);
  shaft.position.y = 0.62; g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.34, 32), mat);
  head.rotation.x = Math.PI; head.position.y = 0.17; g.add(head);
  for (const y of [0.78, 0.86]) {                                                  // white bands, read like a marker
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.03, 24), ringMat); r.position.y = y; g.add(r);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  tail.position.y = 0.92; g.add(tail);
  // label card
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'vtag';
  el.style.setProperty('--c', info.color);
  el.innerHTML = `<b>${key}</b><span><strong>${info.title}</strong><small>${info.sub}</small><em>${info.cost()}</em></span>`;
  el.addEventListener('click', () => onPick(key));
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const label = new CSS2DObject(el);
  label.position.y = 1.32;
  g.add(label);
  g.traverse((o) => { o.layers.set(ARROW_LAYER); });
  // landing ripple on the ground
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 72), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  ripple.rotation.x = -Math.PI / 2;
  ripple.layers.set(ARROW_LAYER);
  ripple.raycast = () => {};
  ripple.visible = false;
  return { g, label, ripple, rest: 0, t: 0, delay: 0, dropping: false, rippleT: -1 };
}

/* ================================================================ public */
// mainStation: station A (already in the scene). Returns the variant stations, arrows and CCTV helpers.
export function buildVariants({ renderer, scene, mainStation, padHeight, onPick }) {
  const L = mainStation.length, D = CONFIG.frame.depth;
  const GAP = 1.3;
  const mkRoot = (key, x) => {
    const root = new THREE.Group();
    root.position.set(x, 0, 0);
    root.userData.variant = key;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(L + 0.5, 0.012, D + 0.5), new THREE.MeshStandardMaterial({ color: 0x8f9aa3, roughness: 0.85 }));
    pad.position.y = 0.006; pad.receiveShadow = true;
    root.add(pad);
    scene.add(root);
    return root;
  };
  const rootB = mkRoot('B', -(L + GAP));
  const rootC = mkRoot('C', -2 * (L + GAP));

  const B = buildVariantB(renderer);
  const C = buildVariantC(renderer, rootC);
  const risers = [];
  for (const [root, v] of [[rootB, B], [rootC, C]]) {
    const riser = buildRiser(renderer, L, D);
    riser.group.position.y = padHeight;
    root.add(riser.group, v.station.group);
    risers.push(riser);
  }
  let riserOn = true;
  const place = () => {
    for (const [i, v] of [B, C].entries()) {
      v.station.group.position.y = padHeight + (riserOn ? RISER.height : 0);
      risers[i].group.visible = riserOn;
    }
  };
  place();

  // arrows: A rides on the main station group, B / C on their roots
  const arrows = {
    A: buildArrow('A', onPick), B: buildArrow('B', onPick), C: buildArrow('C', onPick),
  };
  const lidTopLocal = CONFIG.frame.footHeight + 0.008 + CONFIG.bin.rimHeight + 0.05 + CONFIG.bin.lidThickness + CONFIG.bin.hoodHeight;
  arrows.A.parent = mainStation.group;
  arrows.B.parent = B.station.group;
  arrows.C.parent = C.station.group;
  Object.values(arrows).forEach((a, i) => {
    a.rest = lidTopLocal + 0.32;
    a.delay = i * 0.22;
    a.parent.add(a.g, a.ripple);
    a.g.visible = false;
  });
  // C's camera hangs over the middle of the station: drop its arrow over the food bin instead
  arrows.C.g.position.x = arrows.C.ripple.position.x = -L / 4 - 0.1;
  let arrowsOn = false;
  function setArrows(v) {
    arrowsOn = v;
    for (const a of Object.values(arrows)) {
      a.g.visible = v; a.label.visible = v;
      if (v) { a.t = 0; a.dropping = true; a.g.position.y = a.rest + 7; a.label.element.classList.remove('landed'); }
      else { a.dropping = false; a.ripple.visible = false; a.rippleT = -1; }
    }
  }

  const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  return {
    roots: { B: rootB, C: rootC },
    B, C,
    bins: [...B.station.bins, ...C.station.bins],
    cctvCam: C.cctvCam,
    setRiser(v) { riserOn = v; place(); },
    setArrows, arrowsOn: () => arrowsOn,
    setFov: (v) => C.setFov(v),
    setCamOpen: (v) => C.camPole.setOpen(v),
    camOpen: () => C.camPole.isOpen(),
    canCamOpen: () => C.feedSource().live,
    setBoxOpen: (v) => C.camPole.setBoxOpen(v),
    boxOpen: () => C.camPole.isBoxOpen(),
    setNight: (v) => C.camPole.setNight(v),
    night: () => C.camPole.isNight(),
    setCamPole: (v) => C.setCamPole(v),
    camPoleOn: () => C.feedSource().poleOn,
    setCamType: (k) => C.setCamType(k),
    camType: () => C.camPole.type(),
    feedSource: () => C.feedSource(),
    setXray: (v) => B.setXray(v),
    apply(state) { B.apply(state); C.apply(state); },
    // 2 = moved (shadows), 1 = repaint, 3 = light flip only, 0 = idle
    update(dt) {
      let res = 0;
      for (const a of Object.values(arrows)) {
        if (a.dropping) {
          a.t += dt;
          const k = Math.min(1, Math.max(0, (a.t - a.delay) / 1.0));
          a.g.position.y = a.rest + 7 * (1 - easeOutBack(k));
          if (k >= 1) {
            a.dropping = false; a.g.position.y = a.rest;
            a.rippleT = 0; a.ripple.visible = true;
            a.ripple.position.y = -a.parent.position.y + 0.02;
            a.label.element.classList.add('landed');
          }
          res = Math.max(res, 1);
        }
        if (a.rippleT >= 0) {
          a.rippleT += dt;
          const k = Math.min(1, a.rippleT / 1.1);
          const s = 0.6 + k * 1.4;
          a.ripple.scale.set(s, s, s);
          a.ripple.material.opacity = 0.75 * (1 - k);
          if (k >= 1) { a.rippleT = -1; a.ripple.visible = false; }
          res = Math.max(res, 1);
        }
      }
      const cp = C.camPole.update(dt);
      if (cp) res = res ? Math.max(res === 3 ? 1 : res, cp === 3 ? 1 : cp) : cp;
      const hw = B.hardware.update(dt);
      return res ? (hw === 2 ? 2 : res) : hw;
    },
    // world-space boxes the CCTV "AI" labels: 3 bins + the bag bay
    aiTargets() {
      const st = C.station;
      const out = st.bins.map((bin, i) => ({ obj: bin, bay: CONFIG.bays[i], i }));
      out.push({ bagBay: true, bay: CONFIG.bays[3], i: 3, x0: st.xs[3], x1: st.xs[4] });
      return out;
    },
  };
}
