import * as THREE from 'three';
import { rbox } from './geom.js';

// Electric mini garbage truck (about 3.6 x 1.5 x 1.9 m, ~500 kg payload) run with a private partner.
// Drives in along the road behind the station when an out-of-round pickup is requested,
// parks, and drives away once the pickup is confirmed.
const FONT = 'Kanit, Thonburi, sans-serif';

function sideDecal() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 400;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1f7a3a'; ctx.fillRect(0, 0, 1024, 400);
  ctx.fillStyle = '#f3c200'; ctx.fillRect(0, 330, 1024, 22);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
  ctx.font = `700 120px ${FONT}`; ctx.fillText('กทม.', 50, 150);
  ctx.font = `600 64px ${FONT}`; ctx.fillText('รถเก็บขยะไฟฟ้า EV', 50, 240);
  ctx.font = `400 40px ${FONT}`; ctx.fillText('บริการเก็บนอกรอบ · ร่วมกับภาคเอกชน', 50, 300);
  // simple EV plug icon
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(880, 150, 70, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(900, 95); ctx.lineTo(860, 155); ctx.lineTo(900, 155); ctx.lineTo(860, 215); ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTruck() {
  const g = new THREE.Group();
  g.name = 'truck';
  const body = new THREE.Group();          // everything above the wheels (bobs slightly while driving)
  g.add(body);

  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f5f6, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const green = new THREE.MeshPhysicalMaterial({ color: 0x1f7a3a, roughness: 0.4, clearcoat: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1b2836, roughness: 0.05, metalness: 0.2, clearcoat: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bdc2, metalness: 0.8, roughness: 0.35 });

  // chassis
  body.add(rbox(3.4, 0.16, 1.2, dark, 0, 0.46, 0, 0.02));
  // cab (front = +X)
  body.add(rbox(1.05, 1.2, 1.46, white, 1.12, 1.1, 0, 0.12));
  body.add(rbox(0.06, 0.55, 1.3, glass, 1.63, 1.38, 0, 0.03));                 // windscreen
  for (const sz of [-1, 1]) body.add(rbox(0.6, 0.45, 0.02, glass, 1.15, 1.4, sz * 0.735, 0.02));   // side windows
  body.add(rbox(0.08, 0.22, 1.4, dark, 1.64, 0.7, 0, 0.03));                   // bumper
  for (const sz of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.2 }));
    hl.rotation.z = Math.PI / 2;
    hl.position.set(1.665, 0.92, sz * 0.52);
    body.add(hl);
    body.add(rbox(0.12, 0.08, 0.04, dark, 1.4, 1.55, sz * 0.75, 0.01));       // mirrors
  }
  body.add(rbox(1.05, 0.1, 1.46, green, 1.12, 0.62, 0, 0.03));                 // green skirt stripe on cab

  // cargo box with rear tipping door
  const decal = sideDecal();
  const decalMat = new THREE.MeshPhysicalMaterial({ map: decal, roughness: 0.4, clearcoat: 0.4 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.25, 1.5), [green, green, green, green, decalMat, decalMat]);
  box.position.set(-0.55, 1.18, 0);
  box.castShadow = box.receiveShadow = true;
  body.add(box);
  body.add(rbox(0.06, 1.15, 1.42, steel, -1.66, 1.18, 0, 0.02));             // rear door
  for (const y of [0.85, 1.5]) body.add(rbox(0.04, 0.04, 1.3, dark, -1.7, y, 0, 0.01));   // door hinges / latch bar
  for (const sz of [-1, 1]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.08), new THREE.MeshStandardMaterial({ color: 0x7a0d06, emissive: 0xff2a1a, emissiveIntensity: 0.6 }));
    tl.position.set(-1.71, 0.75, sz * 0.62);
    body.add(tl);
  }
  // roof warning light (amber), flashes while working
  const amber = new THREE.MeshStandardMaterial({ color: 0x8a5a00, emissive: 0xffa000, emissiveIntensity: 0.3 });
  const roofLight = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 20), amber);
  roofLight.position.set(1.12, 1.76, 0);
  body.add(roofLight);
  // charge port flap
  body.add(rbox(0.16, 0.12, 0.02, dark, 0.75, 0.95, 0.74, 0.01));

  // wheels
  const wheels = [];
  const tyreGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.2, 32);
  const rimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.21, 24);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  for (const x of [1.1, -0.95]) for (const sz of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(x, 0.31, sz * 0.63);
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    tyre.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(rimGeo, steel);
    rim.rotation.x = Math.PI / 2;
    w.add(tyre, rim);
    w.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(w);
    wheels.push(w);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.part = 'truck'; } });

  /* ---------- driving ---------- */
  const PARK_X = 0, FAR = 18;
  let state = 'away', t = 0, from = -FAR, to = PARK_X, flashT = 0, onArrive = null, lastOn = null;
  g.visible = false;
  g.position.x = -FAR;

  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  return {
    group: g,
    state: () => state,
    arrive(cb) {
      if (state === 'parked' || state === 'arriving') return;
      onArrive = cb;
      if (state === 'leaving') {
        // called back while driving off: turn around from where it is instead of jumping to the start
        state = 'arriving'; t = 0; from = g.position.x; to = PARK_X;
        return;
      }
      state = 'arriving'; t = 0; from = -FAR; to = PARK_X;
      g.position.x = from; g.visible = true;
    },
    leave() {
      if (state === 'away' || state === 'leaving') return;
      state = 'leaving'; t = 0; from = g.position.x; to = FAR;
    },
    // returns 2 = truck moved (shadows change), 3 = only the roof light flipped, 0 = nothing
    update(dt) {
      if (state === 'away') return 0;
      flashT += dt;
      const on = Math.sin(flashT * 8) > 0;
      const flipped = on !== lastOn;
      if (flipped) { lastOn = on; amber.emissiveIntensity = on ? 2.5 : 0.3; }
      if (state === 'parked') return flipped ? 3 : 0;   // 3 = light-only change
      t = Math.min(1, t + dt / 6);                      // 6 s drive
      const prevX = g.position.x;
      g.position.x = from + (to - from) * ease(t);
      const dx = g.position.x - prevX;
      for (const w of wheels) w.rotation.z -= dx / 0.31;
      body.position.y = Math.sin(flashT * 14) * 0.006 * (1 - Math.abs(2 * t - 1));
      if (t >= 1) {
        body.position.y = 0;
        if (state === 'arriving') { state = 'parked'; onArrive?.(); }
        else { state = 'away'; g.visible = false; amber.emissiveIntensity = 0.3; lastOn = null; }
      }
      return 2;
    },
  };
}
