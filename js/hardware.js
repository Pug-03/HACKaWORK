import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rbox } from './geom.js';

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
  batt.add(rbox(0.22, 0.32, 0.13, new THREE.MeshStandardMaterial({ color: 0xd9dcdf, metalness: 0.2, roughness: 0.5 }), 0, 0, 0, 0.012));
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
  blm.position.set(0, 0.06, 0.0655);
  batt.add(blm);
  for (let i = 0; i < 5; i++) batt.add(rbox(0.14, 0.008, 0.004, dark, 0, -0.06 - i * 0.02, 0.066, 0.002));   // vent louvres
  const keyLock = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.008, 16), steel);
  keyLock.rotation.x = Math.PI / 2;
  keyLock.position.set(0.085, -0.13, 0.068);
  batt.add(keyLock);
  group.add(tag(batt, 'battery'));

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
  const sensorBody = new THREE.MeshStandardMaterial({ color: 0xe3e6e9, roughness: 0.45 });
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
    s.traverse((m) => { if (m.isMesh) m.userData.part = 'sensor'; });
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
  const housing = rbox(0.22, 0.3, 0.07, new THREE.MeshStandardMaterial({ color: 0x2f3439, metalness: 0.3, roughness: 0.45 }), 0, 0, 0, 0.012);
  housing.userData.part = 'unit';
  unit.add(housing);
  // screen
  const scr = document.createElement('canvas');
  scr.width = 360; scr.height = 240;
  const screenTex = new THREE.CanvasTexture(scr);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.12), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 0.065, 0.0355);
  screen.userData.part = 'unit';
  unit.add(screen);
  // call button: red mushroom in a yellow ring
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 32), new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, -0.06, 0.04);
  unit.add(ring);
  const btnMat = new THREE.MeshStandardMaterial({ color: 0xd42a1e, emissive: 0x7a0d06, emissiveIntensity: 0.4, roughness: 0.35 });
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.022, 32), btnMat);
  button.rotation.x = Math.PI / 2;
  button.position.set(0, -0.06, 0.055);
  button.userData.part = 'callButton';
  unit.add(button);
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
  capPlate.position.set(0, -0.122, 0.0355);
  unit.add(capPlate);
  // LoRa gateway + LTE antenna on top of the unit
  const antBase = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.02, 16), dark);
  antBase.position.set(0.07, 0.16, 0);
  const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.16, 12), dark);
  whip.position.set(0.07, 0.25, 0);
  unit.add(antBase, whip);
  unit.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.part ??= 'unit'; } });
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
    // returns true while animating (blink / button travel)
    update(dt) {
      let moving = false;
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
        button.position.z = 0.055 - 0.012 * Math.sin((pressT / 0.25) * Math.PI);
        moving = true;
      }
      return moving;
    },
  };
}
