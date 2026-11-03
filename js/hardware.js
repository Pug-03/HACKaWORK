import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rbox } from './geom.js';

// Smart hardware mounted on the bin station:
//  - two-colour beacon on a pole (red = waiting for pickup, green = collected) + small solar panel
//  - ultrasonic fill-level sensor under every lid
//  - control unit on the left end: status screen + "call extra pickup" button
//  - visible fill level inside each bin / bag bay
const FONT = 'Kanit, Thonburi, sans-serif';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function buildHardware(station) {
  const group = new THREE.Group();
  group.name = 'hardware';
  const F = CONFIG.frame, B = CONFIG.bin;
  const L = station.length, D = F.depth, H = F.height;
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.4, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb4b9be, metalness: 0.8, roughness: 0.35 });

  /* ---------- beacon on the back-left post ---------- */
  const poleX = -L / 2 + 0.02, poleZ = -D / 2 + 0.02, poleH = 0.42;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, poleH, 16), steel);
  pole.position.set(poleX, H + poleH / 2, poleZ);
  pole.castShadow = true;
  group.add(pole);
  const beaconY = H + poleH;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.035, 28), dark);
  base.position.set(poleX, beaconY + 0.0175, poleZ);
  group.add(base);
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x1f8f3a, emissive: 0x22c55e, emissiveIntensity: 1.6, roughness: 0.25, transparent: true, opacity: 0.92 });
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.07, 28), lensMat);
  lens.position.set(poleX, beaconY + 0.07, poleZ);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.042, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lensMat);
  cap.position.set(poleX, beaconY + 0.105, poleZ);
  group.add(lens, cap);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x22c55e, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(0.42, 0.42, 1);
  glow.position.set(poleX, beaconY + 0.08, poleZ);
  group.add(glow);
  // solar panel powering the electronics
  const panel = new THREE.Group();
  panel.position.set(poleX - 0.16, H + 0.3, poleZ);     // on an arm, outside the swing of the lids
  panel.rotation.x = -0.6;
  const cellsCanvas = document.createElement('canvas');
  cellsCanvas.width = 256; cellsCanvas.height = 192;
  const cx = cellsCanvas.getContext('2d');
  cx.fillStyle = '#c9ced4'; cx.fillRect(0, 0, 256, 192);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    cx.fillStyle = '#1b2a4a'; cx.fillRect(8 + i * 41, 8 + j * 44, 38, 41);
  }
  const cellTex = new THREE.CanvasTexture(cellsCanvas);
  cellTex.colorSpace = THREE.SRGBColorSpace;
  const cellMat = new THREE.MeshStandardMaterial({ map: cellTex, metalness: 0.5, roughness: 0.2 });
  const sp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.19), [steel, steel, cellMat, steel, steel, steel]);
  sp.castShadow = true;
  panel.add(sp);
  group.add(panel);
  const arm = rbox(0.15, 0.016, 0.016, steel, poleX - 0.075, H + 0.3, poleZ, 0.004);
  group.add(arm);

  /* ---------- fill sensors under each lid ---------- */
  const sensorBody = new THREE.MeshStandardMaterial({ color: 0x2d3136, roughness: 0.6 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.7, roughness: 0.3 });
  for (const bin of station.bins) {
    const s = new THREE.Group();
    s.add(rbox(0.08, 0.022, 0.05, sensorBody, 0, -0.011, 0, 0.004));
    for (const x of [-0.02, 0.02]) {
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 16), eyeMat);
      eye.position.set(x, -0.025, 0);
      s.add(eye);
    }
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
    glow.material.color.copy(col);
    blink = !!state.callRequested;
    if (!blink) { lensMat.emissiveIntensity = 1.6; glow.material.opacity = 1; lastOn = null; }

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
          lensMat.emissiveIntensity = on ? 2.2 : 0.25;
          glow.material.opacity = on ? 1 : 0.1;
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
