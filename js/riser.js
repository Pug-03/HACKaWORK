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
  // tread: 4 mm anti-slip steel plate punched with staggered drain slots (rain falls straight through to the
  // pavement, nothing ponds), on 30 mm skirts and end plates, with a solid yellow nosing along the walking edge
  const treadMat = new THREE.MeshStandardMaterial({ color: 0x1f2630, metalness: 0.35, roughness: 0.8 });
  const nosingMat = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6 });
  const tread = (x0, x1) => {
    const g = new THREE.Group(), w = x1 - x0, d = R.stepDepth;
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, -d / 2); sh.lineTo(w / 2, -d / 2); sh.lineTo(w / 2, d / 2); sh.lineTo(-w / 2, d / 2); sh.closePath();
    const sl = 0.05, sw = 0.01, px = 0.07;
    let row = 0;
    for (let zc = -d / 2 + 0.03; zc <= d / 2 - 0.065; zc += 0.028, row++) {
      for (let xc = -w / 2 + 0.035 + (row % 2) * px / 2; xc + sl / 2 <= w / 2 - 0.02; xc += px) {
        const h = new THREE.Path();
        h.moveTo(xc - sl / 2 + sw / 2, zc - sw / 2);
        h.lineTo(xc + sl / 2 - sw / 2, zc - sw / 2); h.absarc(xc + sl / 2 - sw / 2, zc, sw / 2, -Math.PI / 2, Math.PI / 2, false);
        h.lineTo(xc - sl / 2 + sw / 2, zc + sw / 2); h.absarc(xc - sl / 2 + sw / 2, zc, sw / 2, Math.PI / 2, Math.PI * 1.5, false);
        sh.holes.push(h);
      }
    }
    const plateGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2);
    const plate = new THREE.Mesh(plateGeo, treadMat);   // shape y -> world -z
    plate.position.y = 0.011;
    g.add(plate);
    for (const sz of [-1, 1]) g.add(rbox(w, 0.026, 0.004, galv, 0, -0.002, sz * (d / 2 - 0.002), 0.001));     // skirts (top = plate underside, not flush with its top/edge)
    for (const sx of [-1, 1]) g.add(rbox(0.004, 0.026, d - 0.008, galv, sx * (w / 2 - 0.002), -0.002, 0, 0.001)); // end plates
    for (let x = -w / 2 + 0.25; x < w / 2 - 0.1; x += 0.25) g.add(rbox(0.004, 0.022, d - 0.008, galv, x, -0.004, 0, 0.001));   // cross ribs
    g.add(rbox(w, 0.004, 0.045, nosingMat, 0, 0.017, d / 2 - 0.0225, 0.001));                          // yellow nosing
    g.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
    return g;
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
  for (const x of cuts.flat()) group.add(rbox(0.05, 0.004, R.stepDepth - 0.02, galv, x, sTop - 0.0305, stepZ, 0.001));   // top 1.5 mm up into the tread end plates, clear of the leg / stringer / pin-guide tops
  const stepHatches = [];
  for (const [x0, x1] of cuts) {
    const panel = new THREE.Group();
    panel.position.set((x0 + x1) / 2, sTop - 0.015, stepZ);
    panel.add(tread(x0 + 0.004, x1 - 0.004));
    // two spring latches under the front corners (like a removable store-shelf tray): a steel pin shoots out
    // under the ledge angle; squeezing the finger tab up under the nosing pulls it in. Both corners must be
    // squeezed at the same time before the panel can be lifted out. Nothing on top to kick or tamper with.
    const tabMat = new THREE.MeshStandardMaterial({ color: 0xd93a2b, roughness: 0.5 });
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.2 });
    const locks = [];
    const half = (x1 - x0) / 2 - 0.004, fz = R.stepDepth / 2;
    for (const sx of [-1, 1]) {
      const lx = sx * (half - 0.05);
      // finger tab: hinged at its back edge to a bracket under the tread, front lip drops just behind the nosing
      const tab = new THREE.Group();
      tab.position.set(lx, -0.017, fz - 0.05);
      tab.add(rbox(0.036, 0.004, 0.034, tabMat, 0, -0.004, 0.017, 0.001));
      tab.add(rbox(0.035, 0.014, 0.004, tabMat, 0, -0.011, 0.0315, 0.001));       // lip the fingertip pulls on (just inside the tab's front / side faces)
      panel.add(tab);
      panel.add(rbox(0.044, 0.006, 0.01, galv, lx, -0.017, fz - 0.05, 0.001));    // hinge bracket
      // pin + link rod back to the tab (pin rides in two guides at mid-depth)
      const pin = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.06, 16).rotateZ(Math.PI / 2), pinMat);
      rod.position.x = sx * (half - 0.02);            // tip 1 cm past the panel end, under the ledge
      const link = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, fz - 0.05, 8).rotateX(Math.PI / 2), pinMat);
      link.position.set(sx * (half - 0.048), 0, (fz - 0.05) / 2);
      pin.add(rod, link);
      pin.position.y = -0.0245;
      panel.add(pin);
      for (const gx of [half - 0.045, half - 0.012]) panel.add(rbox(0.008, 0.014, 0.02, galv, sx * gx, -0.022, 0, 0.001));   // pin guides
      locks.push({ tab, pin, sx });
    }
    panel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.part = 'stepHatch'; } });
    panel.userData = { open: 0, lock: 0, locks, y0: panel.position.y, z0: stepZ };
    group.add(panel);
    stepHatches.push(panel);
  }

  // two lockable service trays hanging under the deck
  const T = R.tray;
  // trays hang low: entry holes ~11 cm up so rodents reach them, 8 cm clear of the ground for sweeping/hosing
  const trayY = T.clearance + T.h / 2;
  const trayBodyMat = new THREE.MeshStandardMaterial({ color: 0x4f5a52, metalness: 0.35, roughness: 0.55 });
  const trayLabel = label([['ถาดบริการ · ควบคุมสัตว์พาหะ', 0.3, 600], ['เฉพาะเจ้าหน้าที่ · ล็อกกุญแจ', 0.24, 400]], T.w - 0.06, 0.045, '#e9e4d4', '#2b2b2b');
  const angleMat = new THREE.MeshStandardMaterial({ color: 0x8f969c, metalness: 0.75, roughness: 0.45, roughnessMap: brushed });
  const wearMat = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.8 });
  const hexGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 6);
  const railLen = T.d + 0.06;
  const joistBottom = H - R.deck - 0.04;
  // Hanger frame for one tray: two 40x40 SHS deck joists, four 25x25 SHS drop posts with gussets,
  // and a 30x30x3 equal angle on each side (with a UHMW wear strip) that the tray floor slides on.
  function hangerFrame(cx) {
    const railY = T.clearance - 0.003;               // horizontal leg sits just under the tray floor
    for (const sx of [-1, 1]) {
      const rx = cx + sx * (T.w / 2 + 0.018);
      group.add(rbox(0.04, 0.04, Dp - 0.08, galv, rx, H - R.deck - 0.02, 0, 0.003));          // joist, beam to beam
      for (const sz of [-1, 1]) {
        const pz = sz * (T.d / 2 + 0.005);
        group.add(rbox(0.025, joistBottom - railY, 0.025, galv, rx, (joistBottom + railY) / 2, pz, 0.002));
        const g = new THREE.Shape();
        g.moveTo(0, 0); g.lineTo(-sz * 0.05, 0); g.lineTo(0, -0.05); g.closePath();
        const gm = new THREE.Mesh(new THREE.ExtrudeGeometry(g, { depth: 0.004, bevelEnabled: false }), galv);
        gm.rotation.y = -Math.PI / 2;                // shape X -> world Z, extrusion -> world -X
        gm.position.set(rx + 0.002, joistBottom, pz - sz * 0.0125);
        group.add(gm);
        const b = new THREE.Mesh(hexGeo, dark);      // M8 bolt through the angle into the post
        b.rotation.z = Math.PI / 2;
        b.position.set(rx + sx * 0.0175, railY + 0.016, pz);
        group.add(b);
      }
      group.add(rbox(0.003, 0.03, railLen, angleMat, rx + sx * 0.014, railY + 0.015, 0, 0.0012));     // vertical leg
      group.add(rbox(0.035, 0.003, railLen, angleMat, rx - sx * 0.008, railY - 0.0015, 0, 0.0012));   // horizontal leg
      group.add(rbox(0.014, 0.003, railLen - 0.02, wearMat, rx - sx * 0.016, railY + 0.0015, 0, 0.001)); // wear strip
    }
    // tie bars front and back: top one above the tray lid, bottom one under the rails,
    // so both ends stay open and the tray slides out either way
    for (const ez of [-1, 1]) {
      group.add(rbox(T.w + 0.06, 0.025, 0.025, galv, cx, joistBottom - 0.0125, ez * (T.d / 2 + 0.022), 0.002));
      group.add(rbox(T.w + 0.06, 0.02, 0.025, galv, cx, railY - 0.013, ez * (T.d / 2 + 0.022), 0.002));
    }
  }
  // longitudinal stringer under the deck plate between the joists
  group.add(rbox(W - 0.08, 0.04, 0.04, galv, 0, H - R.deck - 0.02, -0.06, 0.003));

  const baitMat = new THREE.MeshStandardMaterial({ color: 0x2f86c4, roughness: 0.85 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.18 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.85, roughness: 0.3 });
  const glueMat = new THREE.MeshStandardMaterial({ color: 0xe9d66b, roughness: 0.6 });
  const trays = [];
  for (const cx of [-W / 4, W / 4]) {
    hangerFrame(cx);

    const drawer = new THREE.Group();
    drawer.position.set(cx, trayY, 0);
    // body: solid floor + solid rain lid, stainless mesh on all four sides (25 mm openings, 4 mm bars)
    // so rodents can reach in from every side; a narrow solid header on the front carries label/handle/lock
    const th = 0.006, headerH = 0.03;
    drawer.add(rbox(T.w, th, T.d, trayBodyMat, 0, -T.h / 2 + th / 2, 0, 0.002));                 // floor
    // lid: hinge pins along BOTH short edges (pull-pin hinges). Whichever end comes out first, the pins
    // at the inner edge stay in and the lid lifts about them; keyed cam lock on each header, stay at ~85°
    const lid = new THREE.Group();
    const lidPlate = new THREE.Group();
    lidPlate.add(rbox(T.w + 0.01, th, T.d + 0.01, trayBodyMat, 0, -th / 2, 0, 0.002));
    for (const ez of [-1, 1]) {
      for (const hx of [-0.2, 0, 0.2]) {
        const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.05, 12).rotateZ(Math.PI / 2), galv);
        kn.position.set(hx, -0.002, ez * (T.d / 2 + 0.006));
        lidPlate.add(kn);
      }
      lidPlate.add(rbox(0.06, 0.004, 0.02, galv, -0.16, 0.0005, ez * (T.d / 2 - 0.01), 0.0015));   // lift tab
      const staple = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0016, 8, 16, Math.PI), chrome);   // padlock staple
      staple.rotation.y = Math.PI / 2;
      staple.position.set(-T.w / 2 + 0.05, 0.001, ez * (T.d / 2 + 0.014));
      lidPlate.add(staple);
    }
    lid.add(lidPlate);
    lid.position.set(0, T.h / 2, T.d / 2 + 0.005);
    lidPlate.position.z = -(T.d / 2 + 0.005);
    lid.traverse((o) => { if (o.isMesh) o.userData.part = 'trayLid'; });
    drawer.add(lid);
    // slide members on both tray sides (drawer member of a 2-stage full-extension slide)
    for (const sx of [-1, 1]) drawer.add(rbox(0.004, 0.018, T.d - 0.01, galv, sx * (T.w / 2 + 0.006), -T.h / 2 + 0.012, 0, 0.001));
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
    // both ends are identical service faces (header + label + handle + lock), so the tray
    // can be pulled out from the front (step side) or from the back
    const headerY = T.h / 2 - headerH / 2;
    const labelMat = new THREE.MeshStandardMaterial({ map: trayLabel, roughness: 0.7 });
    const padlocks = {};
    for (const sz of [1, -1]) {
      const end = new THREE.Group();
      end.rotation.y = sz > 0 ? 0 : Math.PI;       // local +Z points out of this end
      const em = new THREE.Mesh(endMesh, meshMat);
      em.position.set(0, -headerH / 2 + th / 2, T.d / 2 - th / 2 - 0.0015);
      end.add(em);
      const header = rbox(T.w + 0.002, headerH, 0.012, trayBodyMat, 0, headerY, T.d / 2 + 0.006, 0.003);
      end.add(header);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.022), labelMat);
      lbl.position.set(-0.08, headerY, T.d / 2 + 0.0125);
      end.add(lbl);
      const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.1, 4, 10), galv);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(0.16, headerY, T.d / 2 + 0.03);
      end.add(handle);
      for (const hx of [-1, 1]) end.add(rbox(0.01, 0.01, 0.022, galv, 0.16 + hx * 0.05, headerY, T.d / 2 + 0.02, 0.002));
      // keyed cam lock (Ø19 mm chrome bezel, keyway slot) that latches the tray to the frame
      const lockX = T.w / 2 - 0.035;
      const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.004, 24).rotateX(Math.PI / 2), chrome);
      bezel.position.set(lockX, headerY, T.d / 2 + 0.0135);
      const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.002, 20).rotateX(Math.PI / 2), brassMat);
      plug.position.set(lockX, headerY, T.d / 2 + 0.0158);
      const keyway = rbox(0.0016, 0.009, 0.001, dark, lockX, headerY, T.d / 2 + 0.0168, 0.0003);
      end.add(bezel, plug, keyway);
      // padlock hasp: hinged staple plate on the header, padlock through the lid's staple (second lock on the lid)
      const haspX = -T.w / 2 + 0.05;
      end.add(rbox(0.022, 0.026, 0.003, chrome, haspX, headerY, T.d / 2 + 0.0135, 0.001));
      const padlock = new THREE.Group();
      padlock.add(rbox(0.026, 0.022, 0.011, brassMat, 0, -0.012, 0, 0.003));
      const shk = new THREE.Mesh(new THREE.TorusGeometry(0.0075, 0.0018, 8, 16, Math.PI), chrome);
      shk.position.y = -0.001;
      padlock.add(shk);
      padlock.add(rbox(0.0014, 0.006, 0.0008, dark, 0, -0.016, 0.0058, 0.0003));   // key slot
      padlock.position.set(haspX, headerY + 0.008, T.d / 2 + 0.022);
      end.add(padlock);
      padlocks[sz] = padlock;
      drawer.add(end);
    }
    // contents: two stainless bait rods with 20 g wax blocks (locked in, can't be dragged out),
    // a glue board in the middle and a low baffle so bait sits away from the entry mesh
    const inH = T.h - 2 * th, floorTop = -T.h / 2 + th;
    for (const bx of [-0.2, 0.2]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, inH, 8), galv);
      rod.position.set(bx, 0, -0.1);
      drawer.add(rod);
      for (let k = 0; k < 2; k++) drawer.add(rbox(0.032, 0.022, 0.032, baitMat, bx, floorTop + 0.013 + k * 0.024, -0.1, 0.006));
      drawer.add(rbox(0.006, inH * 0.6, 0.16, trayBodyMat, bx + (bx < 0 ? 0.06 : -0.06), floorTop + inH * 0.3, -0.06, 0.002));  // baffle
    }
    drawer.add(rbox(0.22, 0.003, 0.13, glueMat, 0, floorTop + 0.0015, 0.05, 0.001));
    drawer.add(rbox(0.06, 0.0015, 0.035, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), 0.15, floorTop + 0.001, 0.14, 0.0005)); // service card
    drawer.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.part ??= 'tray'; } });
    // intermediate slide members ride between the fixed angle and the tray, moving half as far
    const mids = [];
    for (const sx of [-1, 1]) {
      const m = rbox(0.006, 0.022, T.d, angleMat, cx + sx * (T.w / 2 + 0.016), trayY - T.h / 2 + 0.012, 0, 0.0012);
      m.userData.part = 'tray';
      group.add(m);
      mids.push(m);
    }
    drawer.userData = { open: 0, target: 0, baseZ: 0, lid, lidPlate, lidOpen: 0, lidTarget: 0, lidDir: -1, mids, padlocks };
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
        // squeeze both corner tabs (pins retract) before lifting; release (pins shoot out) only once it is back down
        const lockGoal = goal || u.open > 1e-4 ? 1 : 0;
        if (Math.abs(lockGoal - u.lock) > 1e-4) {
          u.lock += Math.sign(lockGoal - u.lock) * Math.min(Math.abs(lockGoal - u.lock), dt * 3);
          const press = Math.min(1, u.lock / 0.3), pull = Math.min(1, Math.max(0, (u.lock - 0.2) / 0.8));
          for (const l of u.locks) { l.tab.rotation.x = -0.35 * press; l.pin.position.x = -l.sx * 0.045 * pull; }
          moving = true;
          if (goal && u.lock < 1) continue;
        }
        if (Math.abs(goal - u.open) > 1e-4) {
          u.open += Math.sign(goal - u.open) * Math.min(Math.abs(goal - u.open), dt * 1.4);
          const q = u.open, a = Math.min(1, q / 0.2), b = Math.min(1, Math.max(0, (q - 0.2) / 0.5)), c = Math.min(1, Math.max(0, (q - 0.7) / 0.3));
          // lift 4 cm, carry 50 cm forward, set down flat on the pavement
          p.position.y = u.y0 + 0.04 * a - (u.y0 + 0.04 - 0.03) * c;   // set down on the pavement (resting on the pin guides)
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
          t.position.z = u.baseZ + u.open * (u.open < 0 ? R.tray.travelBack : R.tray.travel);
          u.mids.forEach((m) => (m.position.z = t.position.z / 2));
          moving = true;
        }
        // lid lifts only once the tray is fully out on its side, about the inner-edge pins
        const lidGoal = u.lidTarget && u.open * u.lidDir > 0.97 ? 1 : 0;
        if (u.lidOpen === 0 && lidGoal) {
          u.lid.position.z = -u.lidDir * (T.d / 2 + 0.005);
          u.lidPlate.position.z = u.lidDir * (T.d / 2 + 0.005);
        }
        // the padlock on the outer header comes off before the lid lifts and goes back once it is shut
        for (const k of [1, -1]) {
          const show = !(k === u.lidDir && (u.lidTarget || u.lidOpen > 0));
          if (u.padlocks[k].visible !== show) { u.padlocks[k].visible = show; moving = true; }
        }
        if (Math.abs(lidGoal - u.lidOpen) > 1e-4) {
          u.lidOpen += (lidGoal - u.lidOpen) * Math.min(1, dt * 5);
          if (Math.abs(lidGoal - u.lidOpen) <= 1e-4) u.lidOpen = lidGoal;
          u.lid.rotation.x = -u.lidDir * u.lidOpen * R.tray.lidOpen;
          moving = true;
        }
      }
      return moving;
    },
  };
}
