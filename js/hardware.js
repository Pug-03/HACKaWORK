import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rbox } from './geom.js';
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
  function label(parent, text, x, y, z) {
    const el = document.createElement('div');
    el.className = 'dim hw';
    el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.set(x, y, z);
    o.visible = false;
    parent.add(o);
    insideLabels.push(o);
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
    hinge.userData = { open: 0, target: 0, side };
    hinge.attachFront = (m) => { m.position.x -= side * w / 2; m.position.z -= d / 2 - 0.004; hinge.add(m); return m; };
    parent.add(hinge);
    return hinge;
  }
  const doors = [];
  const pcb = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.6 });
  const chip = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.4 });
  const shield = new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 0.9, roughness: 0.25 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xd3d7da, metalness: 0.3, roughness: 0.6 });
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
  batt.position.set(X0 - 0.068, 0.48, -0.15);
  batt.rotation.y = -Math.PI / 2;                   // local +Z faces world -X
  const bW = 0.22, bH = 0.32, bD = 0.13;
  const battShell = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, metalness: 0.2, roughness: 0.5 });
  batt.add(enclosure(bW, bH, bD, battShell, 'battery'));
  const battDoor = door(batt, bW, bH, bD, battShell, 'battery');
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
  // internals
  const bIn = new THREE.Group();
  bIn.add(rbox(bW - 0.02, bH - 0.02, 0.003, plate, 0, 0, -bD / 2 + 0.006, 0.001));       // mounting plate
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
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.09), [packBlue, packBlue, packBlue, packBlue, new THREE.MeshStandardMaterial({ map: pkT, roughness: 0.5 }), packBlue]);
  pack.position.set(0, -0.075, -0.012);
  bIn.add(pack);
  for (const [x, c] of [[-0.06, 0xd42a1e], [0.06, 0x111111]]) {          // terminals
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 12), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
    t.position.set(x, -0.004, -0.012);
    bIn.add(t);
  }
  const mppt = new THREE.Group();
  mppt.position.set(-0.015, 0.085, -0.035);
  mppt.add(rbox(0.13, 0.075, 0.035, chip, 0, 0, 0, 0.004));
  for (let i = 0; i < 7; i++) mppt.add(rbox(0.004, 0.07, 0.012, chip, -0.054 + i * 0.018, 0, -0.022, 0.001));   // heat-sink fins
  const mpptScr = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.025), new THREE.MeshBasicMaterial({ color: 0x38bdf8, toneMapped: false }));
  mpptScr.position.set(-0.025, 0.012, 0.018);
  mppt.add(mpptScr);
  bIn.add(mppt);
  for (const x of [0.07, 0.09]) bIn.add(rbox(0.017, 0.045, 0.035, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }), x, 0.085, -0.035, 0.002));   // DC breakers
  bIn.add(rbox(0.16, 0.008, 0.004, new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.9, roughness: 0.3 }), 0, 0.03, -0.055, 0.001));   // busbar
  bIn.add(wire(0xd42a1e, -0.06, 0.002, -0.012, -0.04, 0.05, -0.035));
  bIn.add(wire(0x111111, 0.06, 0.002, -0.012, 0.01, 0.05, -0.035));
  bIn.add(wire(0xd42a1e, 0.08, 0.11, -0.035, 0.08, 0.155, -0.035));         // from solar (top gland)
  bIn.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = 'batteryInside'; } });
  batt.add(bIn);
  label(batt, 'แบต LiFePO4 12.8V 20Ah', 0, -0.075, 0.04);
  label(batt, 'MPPT ชาร์จจากโซลาร์', -0.015, 0.125, 0);
  label(batt, 'เบรกเกอร์ DC', 0.08, 0.04, 0);
  group.add(batt);

  // conduits: rounded-corner tubes between the boxes
  function conduit(pts, part) {
    const path = new THREE.CurvePath();
    const r = 0.03;
    let prev = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (i < pts.length - 1) {
        const inDir = new THREE.Vector3().subVectors(p, prev).normalize();
        const outDir = new THREE.Vector3().subVectors(pts[i + 1], p).normalize();
        const a = p.clone().addScaledVector(inDir, -r), b = p.clone().addScaledVector(outDir, r);
        path.add(new THREE.LineCurve3(prev, a));
        path.add(new THREE.QuadraticBezierCurve3(a, p, b));
        prev = b;
      } else path.add(new THREE.LineCurve3(prev, p));
    }
    const m = new THREE.Mesh(new THREE.TubeGeometry(path, 48, 0.009, 10, false), conduitMat);
    m.castShadow = true;
    m.userData.part = part;
    group.add(m);
    // cable glands at both ends
    for (const e of [pts[0], pts[pts.length - 1]]) {
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), dark);
      g.position.copy(e);
      g.userData.part = part;
      group.add(g);
    }
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  conduit([V(poleX, 0.76, poleZ + 0.03), V(poleX, 0.76, -0.2), V(poleX, 0.645, -0.2)], 'cableSolar');          // solar -> battery
  conduit([V(X0 - 0.04, 0.4, -0.04), V(X0 - 0.04, 0.4, 0.12), V(X0 - 0.04, 0.535, 0.12)], 'cableBatt');       // battery -> control unit
  conduit([V(X0 - 0.04, 0.83, 0.05), V(X0 - 0.04, 0.87, 0.05), V(X0 - 0.04, 0.87, poleZ + 0.02), V(poleX, 0.87, poleZ + 0.02)], 'cableBeacon'); // unit -> pole -> beacon

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
    if (bin === station.bins[0]) label(s, 'เซ็นเซอร์: ถ่านลิเธียม + บอร์ด LoRa + หัววัดอัลตราโซนิก', 0, -0.06, 0);
    s.position.set(0, 0, 0.1);
    bin.userData.lidPivot.add(s);
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
  unitDoor.attachFront(ring);
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
  unitDoor.attachFront(capPlate);
  // internals: controller board with MCU, LTE modem, LoRa gateway radio, DC-DC, beacon relay, terminals
  const uIn = new THREE.Group();
  uIn.add(rbox(uW - 0.02, uH - 0.02, 0.003, plate, 0, 0, -uD / 2 + 0.006, 0.001));
  uIn.add(rbox(0.17, 0.12, 0.003, pcb, 0, 0.05, -0.028, 0.001));
  uIn.add(rbox(0.026, 0.026, 0.004, chip, -0.045, 0.065, -0.025, 0.001));                 // MCU
  uIn.add(rbox(0.046, 0.036, 0.006, shield, 0.035, 0.075, -0.024, 0.001));               // LTE modem
  uIn.add(rbox(0.012, 0.016, 0.003, new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 }), 0.07, 0.04, -0.025, 0.001));   // SIM
  uIn.add(rbox(0.032, 0.026, 0.005, shield, 0.03, 0.02, -0.024, 0.001));                 // LoRa gateway radio
  uIn.add(wire(0x222222, 0.03, 0.033, -0.022, 0.07, 0.148, -0.01, 0.0018));             // coax to antenna
  uIn.add(rbox(0.04, 0.026, 0.016, new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 }), -0.05, 0.01, -0.02, 0.002));   // DC-DC
  uIn.add(rbox(0.026, 0.022, 0.016, chip, -0.055, -0.045, -0.02, 0.002));               // beacon relay
  const tbMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.5 });
  const tbOrange = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 });
  for (let i = 0; i < 7; i++) uIn.add(rbox(0.016, 0.022, 0.018, i % 3 === 0 ? tbOrange : tbMat, -0.054 + i * 0.018, -0.095, -0.02, 0.002));   // terminal blocks
  for (const [x, c] of [[-0.036, 0xd42a1e], [-0.018, 0x111111], [0.018, 0x2563eb], [0.036, 0x16a34a]]) uIn.add(wire(c, x, -0.106, -0.02, x, -0.148, -0.02));
  uIn.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = 'unitInside'; } });
  unit.add(uIn);
  label(unit, 'MCU ควบคุมหลัก', -0.05, 0.085, 0.01);
  label(unit, 'โมดูล 4G LTE → แดชบอร์ด', 0.04, 0.125, 0.01);
  label(unit, 'LoRa รับสัญญาณเซ็นเซอร์', 0.035, -0.005, 0.01);
  label(unit, 'DC-DC 12→5V', -0.06, 0.0, 0.01);
  label(unit, 'รีเลย์ไฟแจ้งเตือน', -0.055, -0.065, 0.01);
  label(unit, 'ขั้วต่อสาย', 0, -0.125, 0.01);
  // LoRa gateway + LTE antenna on top of the unit
  const antBase = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.02, 16), dark);
  antBase.position.set(0.07, 0.16, 0);
  const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.16, 12), dark);
  whip.position.set(0.07, 0.25, 0);
  unit.add(antBase, whip);
  unit.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.part ??= 'unit'; } });
  button.userData.part = 'callButton';
  group.add(unit);

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

  return {
    group,
    button,
    apply,
    press() { pressT = 0.25; },
    toggleUnit() { unitDoor.userData.target = unitDoor.userData.target ? 0 : 1; },
    toggleBattery() { battDoor.userData.target = battDoor.userData.target ? 0 : 1; },
    setInsideView(v) {
      doors.forEach((d) => (d.userData.target = v ? 1 : 0));
      sensorBody.opacity = v ? 0.25 : 1;
      sensorBody.depthWrite = !v;
    },
    isInsideView: () => doors.some((d) => d.userData.target),
    // returns 2 = doors moved (shadows), 1 = repaint only (blink / button), 0 = idle
    update(dt) {
      let moving = false;
      let res = 0;
      for (const d of doors) {
        const u = d.userData;
        if (Math.abs(u.target - u.open) > 1e-4) {
          u.open += (u.target - u.open) * Math.min(1, dt * 5);
          if (Math.abs(u.target - u.open) <= 1e-4) u.open = u.target;
          d.rotation.y = u.side * u.open * 1.9;
          res = 2;
        }
      }
      const showLabels = doors.some((d) => d.userData.open > 0.6) || sensorBody.opacity < 1;
      for (const l of insideLabels) {
        if (l.visible !== showLabels) { l.visible = showLabels; res = Math.max(res, 1); }
      }
      if (blink) {
        blinkT += dt;
        const on = Math.sin(blinkT * Math.PI * 2 * 1.2) > 0;
        if (on !== lastOn) {                     // repaint only when the light flips
          lastOn = on;
          lensMat.emissiveIntensity = on ? 3 : 0.2;
          moving = true;
        }
      }
      if (pressT > 0) {
        pressT = Math.max(0, pressT - dt);
        button.position.z = buttonZ - 0.012 * Math.sin((pressT / 0.25) * Math.PI);
        moving = true;
      }
      return Math.max(res, moving ? 1 : 0);
    },
  };
}
