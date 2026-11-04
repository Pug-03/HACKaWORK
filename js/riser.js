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
  stepHeight: 0.22,
  stepDepth: 0.26,
  // 8 cm off the ground. 2-stage full-extension slides take the tray right out past the deck edge (62 cm)
  // either way: out the back, or out the front under the raised step once its lift-out panel is off
  tray: { w: 0.62, d: 0.42, h: 0.08, travel: 0.62, travelBack: 0.62, clearance: 0.08, lidOpen: 1.48 },
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
  const meshMat = new THREE.MeshStandardMaterial({ color: 0xb9bfc5, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide });
  // stainless grid panel (XY plane, centred): square openings with bars between
  const meshCache = new Map();
  function meshPanel(w, h, hole = 0.025, bar = 0.004, thick = 0.003) {
    const key = `${w.toFixed(4)}|${h.toFixed(4)}`;
    if (meshCache.has(key)) return meshCache.get(key);
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(w / 2, h / 2); sh.lineTo(-w / 2, h / 2); sh.closePath();
    const cols = Math.floor((w - bar) / (hole + bar)), rows = Math.max(1, Math.floor((h - bar) / (hole + bar)));
    const ox = -((cols * (hole + bar) - bar) / 2), oy = -((rows * (hole + bar) - bar) / 2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = ox + c * (hole + bar), y = oy + r * (hole + bar);
      const p = new THREE.Path();
      p.moveTo(x, y); p.lineTo(x, y + hole); p.lineTo(x + hole, y + hole); p.lineTo(x + hole, y); p.closePath();
      sh.holes.push(p);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
    meshCache.set(key, g);
    return g;
  }

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

  // front step (separate treads on short legs, yellow safety nosing), free-standing 12 cm clear of the
  // deck so it doesn't form a ramp around the leg guards. The tread sits at 22 cm so a tray (top at 16 cm)
  // slides out underneath it; the section in front of each tray is a lift-out panel (finger holes, sits on
  // ledge angles) that staff lift off and set down on the pavement in front, clearing the space the tray
  // lid swings through, so a tray can come all the way out the FRONT and be re-baited from the sidewalk.
  const stepTex = stripes();
  const stepZ = Dp / 2 + R.stepDepth / 2 + 0.12, stepBack = stepZ - R.stepDepth / 2;
  const sTop = R.stepHeight;
  const tread = (x0, x1) => {
    const t = stepTex.clone();
    t.needsUpdate = true;
    t.repeat.set((x1 - x0) / 0.25, 1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.03, R.stepDepth), [galv, galv, new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.3 }), galv, galv, galv]);
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  const flipHalf = R.tray.w / 2 + 0.03;              // hatch is 6 cm wider than the tray
  const cuts = [-W / 4, W / 4].map((c) => [c - flipHalf, c + flipHalf]);
  const fixedSpans = [[-W / 2, cuts[0][0]], [cuts[0][1], cuts[1][0]], [cuts[1][1], W / 2]];
  for (const [x0, x1] of fixedSpans) {
    const m = tread(x0, x1);
    m.position.set((x0 + x1) / 2, sTop - 0.015, stepZ);
    group.add(m);
  }
  const stepLegH = sTop - 0.03;
  for (const x of [-W / 2 + 0.04, 0, W / 2 - 0.04, ...cuts.flat()]) {
    for (const z of [stepZ + R.stepDepth / 2 - 0.04, stepBack + 0.04]) group.add(rbox(0.04, stepLegH, 0.04, galv, x, stepLegH / 2, z, 0.004));
  }
  // front and back stringers only under the fixed treads, so nothing crosses the tray paths
  for (const [x0, x1] of fixedSpans) for (const z of [stepZ + R.stepDepth / 2 - 0.02, stepBack + 0.02]) group.add(rbox(x1 - x0, 0.02, 0.03, galv, (x0 + x1) / 2, sTop - 0.04, z, 0.003));
  // ledge angles on the cut legs that the lift-out panels rest on
  for (const x of cuts.flat()) group.add(rbox(0.05, 0.004, R.stepDepth - 0.02, galv, x, sTop - 0.032, stepZ, 0.001));
  const stepHatches = [];
  for (const [x0, x1] of cuts) {
    const panel = new THREE.Group();
    panel.position.set((x0 + x1) / 2, sTop - 0.015, stepZ);
    panel.add(tread(x0 + 0.004, x1 - 0.004));
    for (const sx of [-1, 1]) {                       // finger holes (dark slots) near each end
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.025), dark);
      slot.rotation.x = -Math.PI / 2;
      slot.position.set(sx * ((x1 - x0) / 2 - 0.07), 0.0155, 0);
      panel.add(slot);
    }
    panel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.part = 'stepHatch'; } });
    panel.userData = { open: 0, y0: panel.position.y, z0: stepZ };
    group.add(panel);
    stepHatches.push(panel);
  }

  // two lockable service trays hanging under the deck
  const T = R.tray;
  // trays hang low: entry holes ~11 cm up so rodents reach them, 8 cm clear of the ground for sweeping/hosing
  const trayY = T.clearance + T.h / 2;
  const trayBodyMat = new THREE.MeshStandardMaterial({ color: 0x4f5a52, metalness: 0.35, roughness: 0.55 });
  const trayLabel = label([['ถาดบริการ · ควบคุมสัตว์พาหะ', 0.3, 600], ['เฉพาะเจ้าหน้าที่ · ล็อกกุญแจ', 0.24, 400]], T.w - 0.06, 0.045, '#e9e4d4', '#2b2b2b');
  const trays = [];
  for (const cx of [-W / 4, W / 4]) {
    hangerFrame(cx);

    const drawer = new THREE.Group();
    drawer.position.set(cx, trayY, 0);
    // body: solid floor + solid rain lid, stainless mesh on all four sides (25 mm openings, 4 mm bars)
    // so rodents can reach in from every side; a narrow solid header on the front carries label/handle/lock
    const th = 0.006, headerH = 0.03;
    drawer.add(rbox(T.w, th, T.d, trayBodyMat, 0, -T.h / 2 + th / 2, 0, 0.002));                 // floor
    drawer.add(rbox(T.w + 0.01, th, T.d + 0.01, trayBodyMat, 0, T.h / 2 - th / 2, 0, 0.002));    // lid
    const meshH = T.h - 2 * th;
    const sideMesh = meshPanel(T.d - 2 * th, meshH);
    const endMesh = meshPanel(T.w - 2 * th, meshH - headerH + th);
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(sideMesh, meshMat);
      m.rotation.y = Math.PI / 2;
      m.position.set(sx * (T.w / 2 - th / 2) - 0.0015, 0, 0);
      drawer.add(m);
    }
    // corner posts holding the mesh panels
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) drawer.add(rbox(0.01, T.h, 0.01, trayBodyMat, sx * (T.w / 2 - 0.005), 0, sz * (T.d / 2 - 0.005), 0.002));
    // front header (solid) with handle, lock and label
    const headerY = T.h / 2 - headerH / 2;
    const front = rbox(T.w + 0.002, headerH, 0.012, trayBodyMat, 0, headerY, T.d / 2 + 0.006, 0.003);
    front.userData.part = 'tray';
    drawer.add(front);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.022), new THREE.MeshStandardMaterial({ map: trayLabel, roughness: 0.7 }));
    lbl.position.set(-0.08, headerY, T.d / 2 + 0.0125);
    drawer.add(lbl);
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.1, 4, 10), galv);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0.16, headerY, T.d / 2 + 0.03);
    drawer.add(handle);
    for (const sx of [-1, 1]) drawer.add(rbox(0.01, 0.01, 0.022, galv, 0.16 + sx * 0.05, headerY, T.d / 2 + 0.02, 0.002));
    const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 20), galv);
    lock.rotation.x = Math.PI / 2;
    lock.position.set(T.w / 2 - 0.035, headerY, T.d / 2 + 0.017);
    drawer.add(lock);
    drawer.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.part ??= 'tray'; } });
    drawer.userData = { open: 0, target: 0, baseZ: 0 };
    group.add(drawer);
    trays.push(drawer);
  }

  group.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.userData.part ??= 'riser'; } });

  mergeStatic(group, (n) => trays.includes(n) || stepHatches.includes(n) || trays.some((t) => t.userData.mids.includes(n)));

  return {
    group,
    topHeight: H,
    trays,
    // v: 1 / true = pull out the front (step side), -1 = pull out the back, 0 / false = close
    setTraysOpen(v) {
      const t = v === -1 ? -1 : v ? 1 : 0;
      trays.forEach((d) => { d.userData.target = t; if (t !== d.userData.lidDir) d.userData.lidTarget = 0; });
    },
    traysState: () => trays[0].userData.target,
    // lid opens on whichever side the tray is out (front by default); opening it pulls the tray out first
    setLidOpen(v) {
      const dir = trays[0].userData.target || 1;
      trays.forEach((d) => { if (v) { d.userData.target = dir; d.userData.lidDir = dir; } d.userData.lidTarget = v ? 1 : 0; });
    },
    isLidOpen: () => !!trays[0].userData.lidTarget,
    // returns true while something is still moving
    update(dt) {
      let moving = false;
      // step panels: off while any tray is (or is about to be) out the front; back on once all are home
      const frontBusy = trays.some((t) => t.userData.target === 1 || t.userData.open > 0.003);
      for (const p of stepHatches) {
        const u = p.userData, goal = frontBusy ? 1 : 0;
        if (Math.abs(goal - u.open) > 1e-4) {
          u.open += Math.sign(goal - u.open) * Math.min(Math.abs(goal - u.open), dt * 1.4);
          const q = u.open, a = Math.min(1, q / 0.2), b = Math.min(1, Math.max(0, (q - 0.2) / 0.5)), c = Math.min(1, Math.max(0, (q - 0.7) / 0.3));
          // lift 4 cm, carry 50 cm forward, set down flat on the pavement
          p.position.y = u.y0 + 0.04 * a - (u.y0 + 0.04 - 0.015) * c;
          p.position.z = u.z0 + 0.5 * b;
          moving = true;
        }
      }
      const stepClear = stepHatches.every((p) => p.userData.open > 0.999);
      for (const t of trays) {
        const u = t.userData;
        const lidHold = u.lidOpen > 0.02 && u.target !== u.lidDir;            // close the lid before moving
        const stepHold = u.target === 1 && u.open < 1 && !stepClear;           // wait for the panel to come off
        if (Math.abs(u.target - u.open) > 1e-4 && !lidHold && !stepHold) {
          u.open += (u.target - u.open) * Math.min(1, dt * 4);
          if (Math.abs(u.target - u.open) <= 1e-4) u.open = u.target;
          t.position.z = u.baseZ + u.open * R.tray.travel;
          moving = true;
        }
      }
      return moving;
    },
  };
}
