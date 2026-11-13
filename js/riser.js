import * as THREE from 'three';
import { rbox, mergeStatic } from './geom.js';
import { makeBrushedTexture } from './textures.js';

// Raised anti-rodent base: a SEPARATE steel platform the bin station sits on.
// Open underneath (easy to sweep / hose down, nowhere to nest), rat guards on every leg,
// two removable bait cassettes under the deck that come out sideways at the riser ends (gate + padlock),
// and a fixed front step.
export const RISER = {
  height: 0.35,      // top of deck above ground
  deck: 0.02,
  margin: 0.04,      // deck overhang around the station footprint
  leg: 0.06,
  beam: 0.07,
  stepHeight: 0.22,
  stepDepth: 0.26,
  // bait cassette: 42 cm along x (slides out), 56 cm along z (fits between the corner legs), 8 cm off the ground
  tray: { w: 0.42, d: 0.56, h: 0.08, clearance: 0.08, lidOpen: 1.48 },
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
      group.add(rbox(R.leg - 0.002, legH, R.leg - 0.002, galv, x, legH / 2, z, 0.005));   // 1 mm inside the beam faces (no coplanar faces)
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

  // front step (treads on short legs, yellow safety nosing), free-standing 12 cm clear of the
  // deck so it doesn't form a ramp around the leg guards. Tread at 22 cm.
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
  // the step is all fixed treads: nothing on it lifts out
  const spans = [[-W / 2, 0], [0, W / 2]];
  for (const [x0, x1] of spans) {
    const m = tread(x0, x1);
    m.position.set((x0 + x1) / 2, sTop - 0.015, stepZ);
    group.add(m);
  }
  const stepLegH = sTop - 0.03;
  for (const x of [-W / 2 + 0.04, -W / 4, 0, W / 4, W / 2 - 0.04]) {
    for (const z of [stepZ + R.stepDepth / 2 - 0.04, stepBack + 0.04]) group.add(rbox(0.04, stepLegH, 0.04, galv, x, stepLegH / 2, z, 0.004));
  }
  for (const [x0, x1] of spans) for (const z of [stepZ + R.stepDepth / 2 - 0.02, stepBack + 0.02]) group.add(rbox(x1 - x0, 0.02, 0.03, galv, (x0 + x1) / 2, sTop - 0.04, z, 0.003));
  // Two removable bait cassettes, one at each END of the riser, sliding out sideways (along x) between the
  // corner legs, where nothing is in the way: no step, no road side. They only ride ~45 cm on the rails and
  // then come off completely, so staff carry the cassette to the van / pavement, re-bait it and slide it back.
  // Each bay is shut by a swing gate bar across the open end with a padlock: closed gate = the cassette cannot
  // be pulled out by passers-by. The cassette lid has its own keyed cam lock.
  const T = R.tray;
  const trayY = T.clearance + T.h / 2;
  const trayBodyMat = new THREE.MeshStandardMaterial({ color: 0x4f5a52, metalness: 0.35, roughness: 0.55 });
  const trayLabel = label([['ตลับเหยื่อ · ควบคุมสัตว์พาหะ', 0.3, 600], ['เฉพาะเจ้าหน้าที่ · ล็อกกุญแจ', 0.24, 400]], T.d - 0.06, 0.045, '#e9e4d4', '#2b2b2b');
  const angleMat = new THREE.MeshStandardMaterial({ color: 0x8f969c, metalness: 0.75, roughness: 0.45, roughnessMap: brushed });
  const wearMat = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.8 });
  const gateMat = new THREE.MeshStandardMaterial({ color: 0xf2c200, metalness: 0.3, roughness: 0.5 });
  const hexGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 6);
  const joistBottom = H - R.deck - 0.04;
  const railY = T.clearance - 0.003;
  const baitMat = new THREE.MeshStandardMaterial({ color: 0x2f86c4, roughness: 0.85 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.18 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.85, roughness: 0.3 });
  const glueMat = new THREE.MeshStandardMaterial({ color: 0xe9d66b, roughness: 0.6 });
  // T.w runs along x (in / out), T.d along z (between the corner legs)
  const outerX = W / 2 - 0.045;                         // cassette outer face, just inside the riser end
  const trays = [];
  for (const s of [-1, 1]) {
    const cx = s * (outerX - T.w / 2);
    const xIn = cx - s * (T.w / 2 + 0.02), xOut = s * (W / 2 - 0.012);
    const railLen = Math.abs(xOut - xIn), railMid = (xIn + xOut) / 2;
    // hanger: two 40x40 joists along x under the deck, drop posts at both ends, an angle rail with a UHMW
    // wear strip on each side, a back stop + tie bars at the inner end, a top tie bar at the open end
    for (const sz of [-1, 1]) {
      const rz = sz * (T.d / 2 + 0.018);
      group.add(rbox(railLen, 0.04, 0.04, galv, railMid, H - R.deck - 0.02, rz, 0.003));
      for (const px of [xIn, xOut - s * 0.0125]) {
        group.add(rbox(0.025, joistBottom - railY, 0.025, galv, px, (joistBottom + railY) / 2, rz + sz * 0.004, 0.002));
        const b = new THREE.Mesh(hexGeo, dark); b.rotation.x = Math.PI / 2; b.position.set(px, railY + 0.016, rz + sz * 0.0175); group.add(b);
      }
      group.add(rbox(railLen, 0.03, 0.003, angleMat, railMid, railY + 0.015, rz + sz * 0.014, 0.0012));    // vertical leg
      group.add(rbox(railLen, 0.003, 0.035, angleMat, railMid, railY - 0.0015, rz - sz * 0.008, 0.0012));  // horizontal leg
      group.add(rbox(railLen - 0.02, 0.003, 0.014, wearMat, railMid, railY + 0.0015, rz - sz * 0.016, 0.001));
    }
    group.add(rbox(0.025, 0.025, T.d + 0.06, galv, xIn, joistBottom - 0.0125, 0, 0.002));
    group.add(rbox(0.025, 0.02, T.d + 0.06, galv, xIn, railY - 0.013, 0, 0.002));
    group.add(rbox(0.012, T.h * 0.7, T.d - 0.04, galv, xIn + s * 0.006, trayY, 0, 0.002));                // back stop
    group.add(rbox(0.025, 0.025, T.d + 0.06, galv, xOut - s * 0.0125, joistBottom - 0.0125, 0, 0.002));
    group.add(rbox(0.025, 0.02, T.d + 0.06, galv, xOut - s * 0.0125, railY - 0.013, 0, 0.002));         // under the rails: open end stays clear
    // padlock hasp on the far post, hinge knuckle on the near one
    const gz0 = -(T.d / 2 + 0.024), gz1 = T.d / 2 + 0.024, gx = xOut + s * 0.004;
    group.add(rbox(0.006, 0.05, 0.03, chrome, gx, trayY, gz1 - 0.004, 0.001));
    const staple = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0018, 8, 16, Math.PI), chrome);
    staple.rotation.z = -s * Math.PI / 2; staple.position.set(gx + s * 0.003, trayY, gz1 - 0.004); group.add(staple);
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 12), chrome).translateX(gx).translateY(trayY).translateZ(gz0));
    // gate: yellow flat bar across the open end, hinged on a vertical pin at -z, padlocked at +z
    const gate = new THREE.Group(); gate.position.set(gx + s * 0.006, trayY, gz0);
    const glen = gz1 - gz0;
    gate.add(rbox(0.008, 0.04, glen, gateMat, 0, 0, glen / 2, 0.002));
    gate.add(rbox(0.009, 0.03, 0.03, chrome, 0, 0, glen - 0.004, 0.001));                              // hasp plate
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.026), new THREE.MeshStandardMaterial({ map: label([['ล็อก · เฉพาะเจ้าหน้าที่', 0.62, 600]], 0.2, 0.026, '#f2c200', '#1d1d1d'), roughness: 0.6 }));
    gl.rotation.y = s * Math.PI / 2; gl.position.set(s * 0.0045, 0, glen / 2); gate.add(gl);
    gate.traverse((o) => { if (o.isMesh) o.userData.part = 'trayGate'; });
    group.add(gate);
    const padlock = new THREE.Group();
    padlock.add(rbox(0.011, 0.026, 0.022, brassMat, 0, -0.016, 0, 0.003));
    const shk = new THREE.Mesh(new THREE.TorusGeometry(0.0075, 0.0018, 8, 16, Math.PI), chrome); shk.rotation.y = Math.PI / 2; shk.position.y = -0.003; padlock.add(shk);
    padlock.add(rbox(0.0008, 0.006, 0.0014, dark, s * 0.0058, -0.02, 0, 0.0003));
    padlock.position.set(gx + s * 0.012, trayY + 0.004, gz1 - 0.004);
    padlock.traverse((o) => { if (o.isMesh) o.userData.part = 'trayGate'; });
    group.add(padlock);

    // the cassette: floor + rain lid, stainless mesh on three sides, solid service face at the outer end
    const drawer = new THREE.Group();
    drawer.position.set(cx, trayY, 0);
    const body = new THREE.Group(); body.rotation.y = s > 0 ? 0 : Math.PI;    // body-local +x = out of the bay
    drawer.add(body);
    const th = 0.006, headerH = 0.03;
    body.add(rbox(T.w, th, T.d, trayBodyMat, 0, -T.h / 2 + th / 2, 0, 0.002));
    for (const sz of [-1, 1]) body.add(rbox(T.w - 0.01, 0.004, 0.012, wearMat, 0, -T.h / 2 - 0.002, sz * (T.d / 2 - 0.02), 0.001));   // skid strips
    const meshH = T.h - 2 * th;
    for (const sz of [-1, 1]) { const m = new THREE.Mesh(meshPanel(T.w - 2 * th, meshH), meshMat); m.position.set(0, 0, sz * (T.d / 2 - th / 2) - 0.0015); body.add(m); }
    { const m = new THREE.Mesh(meshPanel(T.d - 2 * th, meshH), meshMat); m.rotation.y = Math.PI / 2; m.position.set(-T.w / 2 + th / 2 - 0.0015, 0, 0); body.add(m); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) body.add(rbox(0.01, T.h - 0.002, 0.01, trayBodyMat, sx * (T.w / 2 - 0.005), 0, sz * (T.d / 2 - 0.005), 0.002));
    // service face: solid plate, label, fold-flat carry handle, keyed cam lock for the lid
    body.add(rbox(0.008, T.h, T.d, trayBodyMat, T.w / 2 - 0.004, 0, 0, 0.002));
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(T.d - 0.08, 0.034), new THREE.MeshStandardMaterial({ map: trayLabel, roughness: 0.7 }));
    lbl.rotation.y = Math.PI / 2; lbl.position.set(T.w / 2 + 0.0002, -0.012, -0.02); body.add(lbl);
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.12, 4, 10), galv);
    handle.rotation.x = Math.PI / 2; handle.position.set(T.w / 2 + 0.026, 0.018, -0.02); body.add(handle);
    for (const hz of [-1, 1]) body.add(rbox(0.024, 0.01, 0.01, galv, T.w / 2 + 0.014, 0.018, -0.02 + hz * 0.06, 0.002));
    const lockZ = T.d / 2 - 0.04;
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.004, 24).rotateZ(Math.PI / 2), chrome);
    bezel.position.set(T.w / 2 + 0.002, 0.018, lockZ);
    const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.002, 20).rotateZ(Math.PI / 2), brassMat);
    plug.position.set(T.w / 2 + 0.0045, 0.018, lockZ);
    body.add(bezel, plug, rbox(0.001, 0.009, 0.0016, dark, T.w / 2 + 0.0058, 0.018, lockZ, 0.0003));
    // lid: hinged along the inner edge (-x), opens once the cassette is out and set down
    const lid = new THREE.Group(); lid.position.set(-T.w / 2, T.h / 2, 0); body.add(lid);
    lid.add(rbox(T.w + 0.01, th, T.d + 0.01, trayBodyMat, T.w / 2, th / 2, 0, 0.002));
    for (const hz of [-0.18, 0, 0.18]) { const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.05, 12).rotateX(Math.PI / 2), galv); kn.position.set(-0.004, 0.002, hz); lid.add(kn); }
    lid.add(rbox(0.02, 0.004, 0.08, galv, T.w - 0.01, th + 0.002, -0.08, 0.0015));                    // lift tab
    lid.traverse((o) => { if (o.isMesh) o.userData.part = 'trayLid'; });
    // contents: two bait rods with locked-on wax blocks, baffles, a glue board, the service card
    const inH = T.h - 2 * th, floorTop = -T.h / 2 + th;
    for (const bz of [-0.15, 0.15]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, inH, 8), galv);
      rod.position.set(-0.08, 0, bz); body.add(rod);
      for (let k = 0; k < 2; k++) body.add(rbox(0.032, 0.022, 0.032, baitMat, -0.08, floorTop + 0.013 + k * 0.024, bz, 0.006));
      body.add(rbox(0.14, inH * 0.6, 0.006, trayBodyMat, -0.05, floorTop + inH * 0.3, bz + (bz < 0 ? 0.06 : -0.06), 0.002));
    }
    body.add(rbox(0.12, 0.003, 0.18, glueMat, 0.08, floorTop + 0.0015, 0, 0.001));
    body.add(rbox(0.035, 0.0015, 0.06, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), 0.15, floorTop + 0.001, 0.19, 0.0005));
    drawer.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.part ??= 'tray'; } });
    drawer.userData = { s, cx, open: 0, target: 0, lid, lidOpen: 0, lidTarget: 0, gate, padlock };
    group.add(drawer);
    trays.push(drawer);
  }

  group.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.userData.part ??= 'riser'; } });

  mergeStatic(group, (n) => trays.includes(n) || trays.some((t) => t.userData.gate === n || t.userData.padlock === n));

  return {
    group,
    topHeight: H,
    trays,
    // cassettes: true = unlock the gate, slide out sideways, lift off and set down on the pavement beside the riser
    setTraysOpen(v) { trays.forEach((d) => { d.userData.target = v ? 1 : 0; if (!v) d.userData.lidTarget = 0; }); },
    traysState: () => trays[0].userData.target,
    // lid opens once the cassette is out on the pavement (opening it takes the cassette out first)
    setLidOpen(v) { trays.forEach((d) => { if (v) d.userData.target = 1; d.userData.lidTarget = v ? 1 : 0; }); },
    isLidOpen: () => !!trays[0].userData.lidTarget,
    update(dt) {
      let moving = false;
      const ease = (x) => x * x * (3 - 2 * x);
      for (const t of trays) {
        const u = t.userData;
        const lidHold = u.lidOpen > 0.02 && u.target === 0;                 // shut the lid before it goes back in
        if (Math.abs(u.target - u.open) > 1e-4 && !lidHold) {
          u.open += Math.sign(u.target - u.open) * Math.min(Math.abs(u.target - u.open), dt * 0.55);
          const k = u.open;
          // 0-0.15 padlock off + gate swings open · 0.15-0.6 slide out on the rails · 0.6-1 lift off, carry 30 cm, set down
          const g = ease(Math.min(1, k / 0.15)), sl = ease(Math.min(1, Math.max(0, (k - 0.15) / 0.45))), c = Math.max(0, (k - 0.6) / 0.4);
          u.padlock.visible = k < 0.04;
          u.gate.rotation.y = u.s * g * 1.7;
          const slide = (R.tray.w + 0.05) * sl;
          const lift = Math.sin(Math.min(1, c) * Math.PI) * 0.05;
          const yDown = (R.tray.h / 2 + 0.003) - trayY;
          t.position.x = u.cx + u.s * (slide + 0.3 * ease(c));
          t.position.y = trayY + lift + yDown * ease(c);
          moving = true;
        }
        const lidGoal = u.lidTarget && u.open > 0.999 ? 1 : 0;
        if (Math.abs(lidGoal - u.lidOpen) > 1e-4) {
          u.lidOpen += (lidGoal - u.lidOpen) * Math.min(1, dt * 5);
          if (Math.abs(lidGoal - u.lidOpen) <= 1e-4) u.lidOpen = lidGoal;
          u.lid.rotation.z = u.lidOpen * R.tray.lidOpen;
          moving = true;
        }
      }
      return moving;
    },
  };
}
