import * as THREE from 'three';
import { rbox, mergeStatic } from './geom.js';
import { makeBrushedTexture } from './textures.js';

// Raised anti-rodent base: a SEPARATE steel platform the bin station sits on.
// Open underneath (easy to sweep / hose down, nowhere to nest), rat guards on every leg,
// two lockable service trays under the deck for pest-control staff, and a front step.
export const RISER = {
  height: 0.35,      // top of deck above ground
  deck: 0.02,
  margin: 0.04,      // deck overhang around the station footprint
  leg: 0.06,
  beam: 0.07,
  stepHeight: 0.16,
  stepDepth: 0.26,
  tray: { w: 0.62, d: 0.42, h: 0.08, travel: 0.26, clearance: 0.08 },   // 8 cm off the ground; stops short of the step
};

function label(lines, w, h, bg, fg) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * 1400); c.height = Math.round(h * 1400);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach(([text, size, weight], i) => {
    ctx.font = `${weight} ${Math.round(c.height * size)}px Kanit, Thonburi, sans-serif`;
    ctx.fillText(text, c.width / 2, c.height * (lines.length === 1 ? 0.5 : 0.32 + i * 0.4));
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stripes() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3b3f44'; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#2a2d31';
  for (let x = 0; x < 256; x += 16) ctx.fillRect(x, 0, 8, 64);
  ctx.fillStyle = '#e0b300';
  ctx.fillRect(0, 54, 256, 10);                // yellow nosing on the step edge
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function buildRiser(renderer, stationLength, stationDepth) {
  const R = RISER;
  const group = new THREE.Group();
  group.name = 'riser';
  const W = stationLength + 2 * R.margin, Dp = stationDepth + 2 * R.margin, H = R.height;

  const brushed = makeBrushedTexture(renderer);
  const galv = new THREE.MeshStandardMaterial({ color: 0xa9afb5, metalness: 0.7, roughness: 0.42, roughnessMap: brushed });
  const dark = new THREE.MeshStandardMaterial({ color: 0x33373b, metalness: 0.4, roughness: 0.6 });
  const guardMat = new THREE.MeshStandardMaterial({ color: 0x8d949a, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide });
  const hole = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });

  // deck (checker plate look via brushed steel) + perimeter beams
  group.add(rbox(W, R.deck, Dp, galv, 0, H - R.deck / 2, 0, 0.004));
  const by = H - R.deck - R.beam / 2;
  group.add(rbox(W, R.beam, 0.04, galv, 0, by, Dp / 2 - 0.02, 0.004));
  group.add(rbox(W, R.beam, 0.04, galv, 0, by, -Dp / 2 + 0.02, 0.004));
  for (const x of [-W / 2 + 0.02, 0, W / 2 - 0.02]) group.add(rbox(0.04, R.beam, Dp - 0.08, galv, x, by, 0, 0.004));

  // legs with base plates, anchor bolts and cone rat guards
  const legH = H - R.deck;
  const guardGeo = new THREE.ConeGeometry(0.13, 0.07, 36, 1, true);
  const boltGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8);
  const legXs = [-W / 2 + R.leg / 2, 0, W / 2 - R.leg / 2];
  for (const x of legXs) {
    for (const z of [Dp / 2 - R.leg / 2, -Dp / 2 + R.leg / 2]) {
      group.add(rbox(R.leg, legH, R.leg, galv, x, legH / 2, z, 0.005));
      group.add(rbox(0.14, 0.008, 0.14, galv, x, 0.004, z, 0.002));
      for (const [bx, bz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const b = new THREE.Mesh(boltGeo, dark);
        b.position.set(x + bx * 0.05, 0.014, z + bz * 0.05);
        group.add(b);
      }
      const guard = new THREE.Mesh(guardGeo, guardMat);
      guard.position.set(x, 0.2, z);
      guard.castShadow = true;
      guard.userData.part = 'ratGuard';
      group.add(guard);
      const collar = rbox(R.leg + 0.012, 0.02, R.leg + 0.012, dark, x, 0.235, z, 0.003);   // clamp collar
      collar.userData.part = 'ratGuard';
      group.add(collar);
    }
  }

  // front step (separate treads on short legs, yellow safety nosing)
  const stepTex = stripes();
  stepTex.repeat.set(W / 0.25, 1);
  const stepTop = new THREE.MeshStandardMaterial({ map: stepTex, roughness: 0.85, metalness: 0.3 });
  // free-standing step, 12 cm clear of the deck so it doesn't form a ramp around the leg guards
  const stepZ = Dp / 2 + R.stepDepth / 2 + 0.12;
  const step = new THREE.Mesh(new THREE.BoxGeometry(W, 0.03, R.stepDepth), [galv, galv, stepTop, galv, galv, galv]);
  step.position.set(0, R.stepHeight - 0.015, stepZ);
  step.castShadow = step.receiveShadow = true;
  group.add(step);
  for (const x of [-W / 2 + 0.04, 0, W / 2 - 0.04]) {
    group.add(rbox(0.04, R.stepHeight - 0.03, 0.04, galv, x, (R.stepHeight - 0.03) / 2, stepZ + R.stepDepth / 2 - 0.04, 0.004));
    group.add(rbox(0.04, R.stepHeight - 0.03, 0.04, galv, x, (R.stepHeight - 0.03) / 2, stepZ - R.stepDepth / 2 + 0.04, 0.004));
  }

  // two lockable service trays hanging under the deck
  const T = R.tray;
  // trays hang low: entry holes ~11 cm up so rodents reach them, 8 cm clear of the ground for sweeping/hosing
  const beamBottom = H - R.deck - R.beam;
  const trayY = T.clearance + T.h / 2;
  const trayTop = trayY + T.h / 2 + 0.004;           // top of the guide rails
  const trayBodyMat = new THREE.MeshStandardMaterial({ color: 0x4f5a52, metalness: 0.35, roughness: 0.55 });
  const trayLabel = label([['ถาดบริการ · ควบคุมสัตว์พาหะ', 0.3, 600], ['เฉพาะเจ้าหน้าที่ · ล็อกกุญแจ', 0.24, 400]], T.w - 0.06, 0.045, '#e9e4d4', '#2b2b2b');
  const trays = [];
  for (const cx of [-W / 4, W / 4]) {
    // guide rails at tray level, hung from the deck beams on flat-bar hangers (open sides keep the holes visible)
    for (const sx of [-1, 1]) {
      const rx = cx + sx * (T.w / 2 + 0.012);
      group.add(rbox(0.02, 0.03, T.d + 0.04, dark, rx, trayTop - 0.015, 0, 0.003));
      for (const sz of [-1, 1]) group.add(rbox(0.02, beamBottom - trayTop, 0.006, dark, rx, (beamBottom + trayTop) / 2, sz * (T.d / 2 + 0.012), 0.002));
    }

    const drawer = new THREE.Group();
    drawer.position.set(cx, trayY, 0);
    // body: open-top box made of 5 sheets
    const th = 0.006;
    drawer.add(rbox(T.w, th, T.d, trayBodyMat, 0, -T.h / 2 + th / 2, 0, 0.002));
    drawer.add(rbox(th, T.h, T.d, trayBodyMat, -T.w / 2 + th / 2, 0, 0, 0.002));
    drawer.add(rbox(th, T.h, T.d, trayBodyMat, T.w / 2 - th / 2, 0, 0, 0.002));
    drawer.add(rbox(T.w, T.h, th, trayBodyMat, 0, 0, -T.d / 2 + th / 2, 0.002));
    // lid (fixed to drawer) so contents stay covered and out of reach of children / pets
    drawer.add(rbox(T.w, th, T.d, trayBodyMat, 0, T.h / 2 - th / 2, 0, 0.002));
    // front plate with handle, lock and label
    const front = rbox(T.w + 0.002, T.h + 0.01, 0.012, trayBodyMat, 0, 0, T.d / 2 + 0.006, 0.003);   // fits between the guide rails
    front.userData.part = 'tray';
    drawer.add(front);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(T.w - 0.06, 0.045), new THREE.MeshStandardMaterial({ map: trayLabel, roughness: 0.7 }));
    lbl.position.set(0, 0.012, T.d / 2 + 0.0125);
    drawer.add(lbl);
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.16, 4, 10), galv);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0, -0.024, T.d / 2 + 0.03);
    drawer.add(handle);
    for (const sx of [-1, 1]) drawer.add(rbox(0.012, 0.012, 0.024, galv, sx * 0.08, -0.024, T.d / 2 + 0.02, 0.003));
    const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.01, 20), galv);
    lock.rotation.x = Math.PI / 2;
    lock.position.set(T.w / 2 - 0.05, -0.022, T.d / 2 + 0.017);
    drawer.add(lock);
    // small entry holes on both ends
    const holeGeo = new THREE.CircleGeometry(0.025, 24);   // Ø 50 mm
    for (const sx of [-1, 1]) {
      for (const z of [-0.1, 0.1]) {
        const h = new THREE.Mesh(holeGeo, hole);
        h.rotation.y = sx * Math.PI / 2;
        h.position.set(sx * (T.w / 2 + 0.0005), -0.006, z);
        drawer.add(h);
      }
    }
    drawer.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.part ??= 'tray'; } });
    drawer.userData = { open: 0, target: 0, baseZ: 0 };
    group.add(drawer);
    trays.push(drawer);
  }

  group.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.userData.part ??= 'riser'; } });

  mergeStatic(group, (n) => trays.includes(n));

  return {
    group,
    topHeight: H,
    trays,
    setTraysOpen(v) { trays.forEach((t) => (t.userData.target = v ? 1 : 0)); },
    // returns true while something is still moving
    update(dt) {
      let moving = false;
      for (const t of trays) {
        const u = t.userData;
        if (Math.abs(u.target - u.open) > 1e-4) {
          u.open += (u.target - u.open) * Math.min(1, dt * 6);
          if (Math.abs(u.target - u.open) <= 1e-4) u.open = u.target;
          t.position.z = u.baseZ + u.open * R.tray.travel;
          moving = true;
        }
      }
      return moving;
    },
  };
}
