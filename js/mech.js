import * as THREE from 'three';
import { rbox } from './geom.js';

// Standard mechanical parts built from their published dimensions (metres).
// Everything here is generated from the governing geometry (chain pitch, tooth count,
// module, bearing series) rather than eyeballed, so parts mesh and fit at true scale.

/* ---------------- ANSI roller chain ---------------- */
// ANSI B29.1 / ISO 606 "A" series
export const CHAIN = {
  40: { p: 0.0127, roller: 0.00792, inner: 0.00795, plateH: 0.01207, plateT: 0.00152, pin: 0.00396 },
  50: { p: 0.015875, roller: 0.01016, inner: 0.00953, plateH: 0.01509, plateT: 0.00203, pin: 0.00508 },
};

export const pitchRadius = (p, N) => p / (2 * Math.sin(Math.PI / N));
export const outsideRadius = (p, N) => (p * (0.6 + 1 / Math.tan(Math.PI / N))) / 2;

// Sprocket tooth profile (ANSI simplified form): roller seats of radius 0.505·dr on the pitch
// circle; each tooth flank is the arc a roller sweeps while pivoting on the neighbouring pin
// (radius p − seat), clipped by the outside diameter.
export function sprocketShape(N, ch, { bore = 0.02, key = true, holes = 0, hubR = 0 } = {}) {
  const { p, roller } = ch;
  const Rp = pitchRadius(p, N), Ro = outsideRadius(p, N), rs = 0.505 * roller + 0.00007;
  const rf = p - rs, step = (2 * Math.PI) / N;
  const pts = [], M = N * 28;
  for (let i = 0; i < M; i++) {
    const th = (i / M) * Math.PI * 2;
    const k = Math.round(th / step);
    const d = th - k * step;                           // angle from the nearest seat
    let r;
    const s = Rp * Math.sin(d);
    if (Math.abs(s) < rs && Math.abs(d) < step / 2) {
      r = Rp * Math.cos(d) - Math.sqrt(rs * rs - s * s);      // inside a seat: roller-seat arc
      if (r < Rp - rs) r = Rp - rs;
    } else {
      r = Ro;
      // flanks: inside both pivot circles of the seats either side of this tooth
      const k0 = Math.floor(th / step);
      for (const kk of [k0, k0 + 1]) {
        const dd = th - kk * step, ss = Rp * Math.sin(dd);
        if (Math.abs(ss) >= rf) { r = Math.min(r, Rp - rs); continue; }
        r = Math.min(r, Rp * Math.cos(dd) + Math.sqrt(rf * rf - ss * ss));
      }
      r = Math.max(r, Rp - rs);
    }
    pts.push(new THREE.Vector2(Math.cos(th) * r, Math.sin(th) * r));
  }
  const sh = new THREE.Shape(pts);
  sh.holes.push(boreHole(bore, key));
  if (holes) {
    const rIn = Math.max(hubR, bore * 1.9), rOut = Rp - rs - 0.012;
    const rc = (rIn + rOut) / 2, rh = (rOut - rIn) / 2 * 0.82;
    for (let i = 0; i < holes; i++) {
      const a = (i / holes) * Math.PI * 2 + step / 2;
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * rc, Math.sin(a) * rc, rh, 0, Math.PI * 2, true);
      sh.holes.push(h);
    }
  }
  return sh;
}

// round bore with a DIN 6885 keyway on +Y
export function boreHole(d, key = true) {
  const r = d / 2, h = new THREE.Path();
  if (!key) { h.absarc(0, 0, r, 0, Math.PI * 2, true); return h; }
  const kw = d <= 0.022 ? 0.006 : d <= 0.03 ? 0.008 : d <= 0.038 ? 0.010 : d <= 0.044 ? 0.012 : d <= 0.05 ? 0.014 : 0.016;
  const kt = kw * 0.4, a = Math.asin(kw / 2 / r);
  h.moveTo(Math.cos(Math.PI / 2 + a) * r, Math.sin(Math.PI / 2 + a) * r);
  h.absarc(0, 0, r, Math.PI / 2 + a, Math.PI * 2 + Math.PI / 2 - a, false);
  h.lineTo(kw / 2, r + kt); h.lineTo(-kw / 2, r + kt); h.closePath();
  return h;
}

// sprocket mesh in the XY plane, axis = Z, centred on its thickness, with a hub boss on +Z
export function sprocketMesh(N, ch, mat, opts = {}) {
  const width = opts.width ?? 0.93 * ch.inner - 0.00015;
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(sprocketShape(N, ch, opts), {
    depth: width - 0.001, bevelEnabled: true, bevelThickness: 0.0005, bevelSize: 0.0005, bevelSegments: 1, curveSegments: 12,
  });
  geo.translate(0, 0, -(width - 0.001) / 2);
  g.add(new THREE.Mesh(geo, mat));
  if (opts.hubR) {
    const hub = new THREE.Shape();
    hub.absarc(0, 0, opts.hubR, 0, Math.PI * 2, false);
    hub.holes.push(boreHole(opts.bore ?? 0.02, true));
    const hl = opts.hubL ?? 0.025;
    const hg = new THREE.ExtrudeGeometry(hub, { depth: hl, bevelEnabled: false, curveSegments: 28 });
    hg.translate(0, 0, width / 2 - 0.0005);
    g.add(new THREE.Mesh(hg, mat));
    // set screw on the hub over the key
    const ss = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.004, 8), opts.screwMat ?? mat);
    ss.position.set(0, opts.hubR + 0.0015, width / 2 + hl / 2);
    g.add(ss);
  }
  return g;
}

// Open-belt pitch line around two sprockets (local XY plane). Arc lengths are measured in
// pitches so rollers sit exactly in the seats (chordal action). Returns a sampler.
export function chainPath(c1, N1, c2, N2, p) {
  const R1 = pitchRadius(p, N1), R2 = pitchRadius(p, N2);
  const k1 = (p * N1) / (2 * Math.PI), k2 = (p * N2) / (2 * Math.PI);   // "pitch length" per radian
  const ex = c2.x - c1.x, ey = c2.y - c1.y, d = Math.hypot(ex, ey);
  const al = Math.atan2(ey, ex), be = Math.acos((R1 - R2) / d);
  const span = Math.sqrt(d * d - (R1 - R2) ** 2);
  const a1s = al + be, a1 = 2 * Math.PI - 2 * be;      // big sprocket wraps the far side
  const a2s = al - be, a2 = 2 * be;
  const L1 = a1 * k1, L2 = a2 * k2;
  const P = (c, R, a) => new THREE.Vector2(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R);
  const A = P(c1, R1, a1s + a1), B = P(c2, R2, a2s);   // first straight: big -> small
  const C = P(c2, R2, a2s + a2), D = P(c1, R1, a1s);   // second straight: small -> big
  const length = L1 + span + L2 + span;
  function at(s) {
    s = ((s % length) + length) % length;
    if (s < L1) return P(c1, R1, a1s + s / k1);
    s -= L1;
    if (s < span) return A.clone().lerp(B, s / span);
    s -= span;
    if (s < L2) return P(c2, R2, a2s + s / k2);
    s -= L2;
    return C.clone().lerp(D, s / span);
  }
  // sprocket phase so that a seat sits under the roller at path position s0
  const phase1 = (s0) => a1s + (((s0 % p) + p) % p) / k1;
  const phase2 = (s0) => a2s + ((((s0 - L1 - span) % p) + p) % p) / k2;
  return { length, at, phase1, phase2, k1, k2, R1, R2 };
}

// centre distance giving an even number of links closest to the wanted distance
export function solveCentreDistance(N1, N2, p, want) {
  const len = (d) => {
    const R1 = pitchRadius(p, N1), R2 = pitchRadius(p, N2), be = Math.acos((R1 - R2) / d);
    return (2 * Math.PI - 2 * be) * (p * N1) / (2 * Math.PI) + 2 * be * (p * N2) / (2 * Math.PI) + 2 * Math.sqrt(d * d - (R1 - R2) ** 2);
  };
  let links = Math.round(len(want) / p);
  if (links % 2) links += 1;
  let lo = want * 0.7, hi = want * 1.3;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (len(m) / p < links) lo = m; else hi = m; }
  return { d: (lo + hi) / 2, links };
}

// figure-eight link plate outline, pin centres at ±p/2
function plateShape(p, h, holeR) {
  const sh = new THREE.Shape(), n = 40, waist = 0.39 * h;
  const pts = [];
  for (let i = 0; i <= n; i++) {                       // top edge, left cap -> right cap
    const x = -p / 2 - h / 2 + (i / n) * (p + h);
    let y;
    if (Math.abs(x) <= p / 2) y = h / 2 - (h / 2 - waist) * Math.cos((Math.PI * x) / p) ** 2;
    else y = Math.sqrt(Math.max(0, (h / 2) ** 2 - (Math.abs(x) - p / 2) ** 2));
    pts.push([x, y]);
  }
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  for (let i = pts.length - 2; i > 0; i--) sh.lineTo(pts[i][0], -pts[i][1]);
  sh.closePath();
  for (const cx of [-p / 2, p / 2]) { const ho = new THREE.Path(); ho.absarc(cx, 0, holeR, 0, Math.PI * 2, true); sh.holes.push(ho); }
  return sh;
}

// Roller chain as instanced rollers / bushings, inner plates, outer plates and riveted pins.
// update(s0) lays every link on the path; links alternate inner / outer like a real chain.
export function rollerChain(path, ch, links, mats) {
  const { p, roller, inner, plateH, plateT, pin } = ch;
  const g = new THREE.Group();
  const rollerGeo = new THREE.CylinderGeometry(roller / 2, roller / 2, inner - 0.0002, 14).rotateX(Math.PI / 2);
  const pinGeo = new THREE.CylinderGeometry(pin / 2, pin / 2, inner + 4 * plateT + 0.0016, 8).rotateX(Math.PI / 2);
  const ipGeo = new THREE.ExtrudeGeometry(plateShape(p, plateH * 0.94, roller * 0.31), { depth: plateT, bevelEnabled: false, curveSegments: 8 });
  const opGeo = new THREE.ExtrudeGeometry(plateShape(p, plateH, pin / 2), { depth: plateT, bevelEnabled: false, curveSegments: 8 });
  ipGeo.translate(0, 0, -plateT / 2); opGeo.translate(0, 0, -plateT / 2);
  const half = links / 2;
  const rollers = new THREE.InstancedMesh(rollerGeo, mats.roller, links);
  const pins = new THREE.InstancedMesh(pinGeo, mats.pin, links);
  const ip = new THREE.InstancedMesh(ipGeo, mats.plate, half * 2);
  const op = new THREE.InstancedMesh(opGeo, mats.plate, half * 2);
  for (const m of [rollers, pins, ip, op]) { m.castShadow = true; m.receiveShadow = true; m.userData.noMerge = true; m.frustumCulled = false; g.add(m); }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  const zi = inner / 2 + plateT / 2, zo = inner / 2 + plateT * 1.5;
  function update(s0) {
    const P = [];
    for (let i = 0; i < links; i++) P.push(path.at(s0 + i * p));
    for (let i = 0; i < links; i++) {
      const a = P[i], b = P[(i + 1) % links];
      V.set(a.x, a.y, 0); Q.identity(); M.compose(V, Q, S);
      rollers.setMatrixAt(i, M); pins.setMatrixAt(i, M);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      Q.setFromAxisAngle(Z, ang);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, j = i >> 1, side = i % 2 ? op : ip, z = i % 2 ? zo : zi;
      V.set(mx, my, z); M.compose(V, Q, S); side.setMatrixAt(j * 2, M);
      V.set(mx, my, -z); M.compose(V, Q, S); side.setMatrixAt(j * 2 + 1, M);
    }
    for (const m of [rollers, pins, ip, op]) m.instanceMatrix.needsUpdate = true;
  }
  return { group: g, update };
}

/* ---------------- involute spur gear ---------------- */
export function spurGearShape(z, m, { bore = 0.02, pa = 20 } = {}) {
  const r = (z * m) / 2, rb = r * Math.cos((pa * Math.PI) / 180), ra = r + m, rf = Math.max(r - 1.25 * m, bore / 2 + 0.004);
  const inv = (a) => Math.tan(a) - a;
  const ap = (pa * Math.PI) / 180;
  const halfTooth = Math.PI / (2 * z) + inv(ap);       // half tooth thickness angle at the base circle
  const pts = [];
  const flank = (rr) => inv(Math.acos(Math.min(1, rb / rr)));
  for (let i = 0; i < z; i++) {
    const c = (i / z) * Math.PI * 2;
    const steps = 6, left = [], right = [];
    for (let s = 0; s <= steps; s++) {
      const rr = Math.max(rb, rf) + ((ra - Math.max(rb, rf)) * s) / steps;
      const t = halfTooth - flank(rr);
      left.push([c - t, rr]); right.push([c + t, rr]);
    }
    pts.push([c - Math.PI / z, rf]);
    if (rf < rb) pts.push([c - halfTooth, rf]);
    left.forEach((q) => pts.push(q));
    right.reverse().forEach((q) => pts.push(q));
    if (rf < rb) pts.push([c + halfTooth, rf]);
  }
  const sh = new THREE.Shape(pts.map(([a, rr]) => new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr)));
  sh.holes.push(boreHole(bore, true));
  return sh;
}

/* ---------------- shredder cutter (3 hooks) with hex bore ---------------- */
export function cutterShape(rBase, rTip, hooks, hexAF) {
  const pts = [], n = hooks * 40;
  for (let i = 0; i < n; i++) {
    const u = (i % 40) / 40, a = (i / n) * Math.PI * 2;
    // hook: slow rise over 80 % of the pitch, steep return face (the cutting edge)
    const r = u < 0.8 ? rBase + (rTip - rBase) * (u / 0.8) ** 1.6 : rTip - (rTip - rBase) * ((u - 0.8) / 0.2) ** 0.5;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const sh = new THREE.Shape(pts);
  sh.holes.push(hexPath(hexAF / 2));
  return sh;
}
export function hexPath(rIn) {
  const R = rIn / Math.cos(Math.PI / 6), h = new THREE.Path();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i / 6) * Math.PI * 2; i ? h.lineTo(Math.cos(a) * R, Math.sin(a) * R) : h.moveTo(Math.cos(a) * R, Math.sin(a) * R); }
  h.closePath();
  return h;
}

/* ---------------- fasteners ---------------- */
const hexCache = new Map();
export function hexBolt(size, mat) {                  // ISO 4017 hex head, size = thread dia
  const s = size * 1.6, k = size * 0.65;             // across flats ≈ 1.6 d, head height ≈ 0.65 d
  const key = size.toFixed(4);
  if (!hexCache.has(key)) hexCache.set(key, new THREE.CylinderGeometry(s / Math.sqrt(3), s / Math.sqrt(3), k, 6));
  const m = new THREE.Mesh(hexCache.get(key), mat);
  m.castShadow = true;
  return m;
}

/* ---------------- UCP pillow-block bearing ---------------- */
// UCP2xx dimensions (NTN/NSK catalogue): d, h (centre height), a (length), e (bolt centres),
// b (base width), g (base thickness), w (overall height), Bi (inner ring width)
export const UCP = {
  206: { d: 0.03, h: 0.0429, a: 0.165, e: 0.121, b: 0.048, g: 0.017, w: 0.0825, Bi: 0.0383, bolt: 0.014 },
  208: { d: 0.04, h: 0.0492, a: 0.188, e: 0.137, b: 0.054, g: 0.018, w: 0.0952, Bi: 0.0492, bolt: 0.016 },
  210: { d: 0.05, h: 0.0572, a: 0.206, e: 0.159, b: 0.060, g: 0.022, w: 0.1111, Bi: 0.0516, bolt: 0.016 },
};
// shaft axis = local X, base on y = -h, length along Z
export function pillowBlock(series, mats) {
  const U = UCP[series], g = new THREE.Group();
  const castR = U.w - U.h;                              // housing boss radius
  g.add(rbox(U.b * 0.9, U.g, U.a, mats.cast, 0, -U.h + U.g / 2, 0, 0.004));                       // foot
  g.add(rbox(U.b * 0.72, U.h - U.g, U.a * 0.42, mats.cast, 0, -U.h + U.g + (U.h - U.g) / 2 - 0.004, 0, 0.006));   // pedestal web
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(castR, castR, U.b * 0.78, 36).rotateZ(Math.PI / 2), mats.cast);
  g.add(boss);
  // bearing insert: outer ring face, inner ring with two set screws
  const ring = new THREE.Mesh(new THREE.TorusGeometry(U.d * 0.86, U.d * 0.2, 10, 36).rotateY(Math.PI / 2), mats.steel);
  ring.position.x = U.b * 0.39;
  g.add(ring);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(U.d * 0.62, U.d * 0.62, U.Bi, 32, 1, true).rotateZ(Math.PI / 2), mats.steel);
  inner.position.x = (U.Bi - U.b * 0.78) / 2;
  g.add(inner);
  for (const a of [0.35, -0.35]) {
    const ss = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.006, 8), mats.dark);
    ss.position.set(U.b * 0.39 + U.Bi * 0.2, Math.cos(a) * U.d * 0.62, Math.sin(a) * U.d * 0.62);
    ss.rotation.x = -a;
    g.add(ss);
  }
  // grease nipple
  const gn = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.012, 6), mats.brass ?? mats.steel);
  gn.position.y = castR + 0.005;
  g.add(gn);
  // hold-down bolts in the slotted holes
  for (const s of [-1, 1]) {
    const b = hexBolt(U.bolt, mats.dark);
    b.position.set(0, -U.h + U.g + U.bolt * 0.33, s * U.e / 2);
    g.add(b);
  }
  return g;
}

/* ---------------- TEFC motor + gearbox ---------------- */
// IEC frame TEFC motor, axis = local Z, starting at z = 0 going +Z: finned body, fan cowl, terminal box
export function tefcMotor(dia, len, mats) {
  const g = new THREE.Group(), r = dia / 2;
  const fins = 20, sh = new THREE.Shape();
  for (let i = 0; i < fins * 2; i++) {
    const a = (i / (fins * 2)) * Math.PI * 2, rr = i % 2 ? r : r * 0.9;
    const a2 = a + Math.PI / (fins * 2);
    i ? sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    sh.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
  }
  sh.closePath();
  const bodyL = len * 0.72;
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: bodyL, bevelEnabled: false }), mats.paint);
  g.add(body);
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.012, 32).rotateX(Math.PI / 2), mats.paint);
  flange.position.z = 0.006;
  g.add(flange);
  const endBell = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.012, 32).rotateX(Math.PI / 2), mats.paint);
  endBell.position.z = bodyL;
  g.add(endBell);
  // fan cowl with a perforated end
  const cowlL = len - bodyL;
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, cowlL, 32, 1, true).rotateX(Math.PI / 2), mats.cowl ?? mats.paint);
  cowl.position.z = bodyL + cowlL / 2;
  g.add(cowl);
  const grill = new THREE.Shape(); grill.absarc(0, 0, r * 0.97, 0, Math.PI * 2, false);
  for (let ring = 1; ring <= 3; ring++) {
    const n = ring * 8, rr = r * 0.24 * ring;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, h = new THREE.Path(); h.absarc(Math.cos(a) * rr, Math.sin(a) * rr, r * 0.06, 0, Math.PI * 2, true); grill.holes.push(h); }
  }
  const gm = new THREE.Mesh(new THREE.ExtrudeGeometry(grill, { depth: 0.002, bevelEnabled: false, curveSegments: 6 }), mats.cowl ?? mats.paint);
  gm.position.z = len - 0.002;
  g.add(gm);
  // terminal box + cable gland on top
  const tb = rbox(r * 0.9, r * 0.45, r * 0.9, mats.paint, 0, r * 0.95 + r * 0.2, bodyL * 0.45, 0.004);
  g.add(tb);
  const gland = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.018, 6).rotateZ(Math.PI / 2), mats.dark);
  gland.position.set(r * 0.45 + 0.008, r * 0.95 + r * 0.2, bodyL * 0.45);
  g.add(gland);
  // nameplate
  const np = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.7, r * 0.45), mats.plate ?? mats.steel);
  np.rotation.y = -Math.PI / 2; np.position.set(-r * 0.93, 0, bodyL * 0.5);
  g.add(np);
  return g;
}

/* ---------------- axial fan (e.g. 120 x 120 x 25 mm) ---------------- */
// square frame with a venturi ring and 4 mounting holes, 7 swept + pitched blades on a hub,
// wire finger guard on the outlet face. Axis = local Z (outlet towards +Z). rotor spins about Z.
export function axialFan(size, mats) {
  const g = new THREE.Group(), s = size, depth = s * 0.21, rv = s * 0.47;
  const fr = new THREE.Shape();
  const c = s * 0.06, h = s / 2;
  fr.moveTo(-h + c, -h); fr.lineTo(h - c, -h); fr.quadraticCurveTo(h, -h, h, -h + c); fr.lineTo(h, h - c); fr.quadraticCurveTo(h, h, h - c, h);
  fr.lineTo(-h + c, h); fr.quadraticCurveTo(-h, h, -h, h - c); fr.lineTo(-h, -h + c); fr.quadraticCurveTo(-h, -h, -h + c, -h);
  const v = new THREE.Path(); v.absarc(0, 0, rv, 0, Math.PI * 2, true); fr.holes.push(v);
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const m = new THREE.Path(); m.absarc(x * s * 0.41, y * s * 0.41, s * 0.022, 0, Math.PI * 2, true); fr.holes.push(m); }
  const frameGeo = new THREE.ExtrudeGeometry(fr, { depth, bevelEnabled: false, curveSegments: 24 });
  frameGeo.translate(0, 0, -depth / 2);
  g.add(new THREE.Mesh(frameGeo, mats.frame));
  // motor hub carrier: 4 struts on the inlet side
  for (let i = 0; i < 4; i++) {
    const st = rbox(rv, s * 0.025, s * 0.02, mats.frame, 0, 0, -depth / 2 + s * 0.012, 0.001);
    st.geometry = st.geometry.clone().translate(rv / 2, 0, 0);
    st.position.set(0, 0, 0);
    st.rotation.z = Math.PI / 4 + (i * Math.PI) / 2;
    g.add(st);
  }
  const rotor = new THREE.Group();
  const rh = s * 0.17, rt = rv - s * 0.012;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(rh, rh, depth * 0.8, 32).rotateX(Math.PI / 2), mats.blade);
  rotor.add(hub);
  const bl = new THREE.Shape();
  bl.moveTo(rh * 0.95, -s * 0.05);
  bl.quadraticCurveTo((rh + rt) / 2, -s * 0.075, rt, -s * 0.02);
  bl.quadraticCurveTo(rt + s * 0.01, s * 0.06, rt - s * 0.02, s * 0.1);
  bl.quadraticCurveTo((rh + rt) / 2, s * 0.06, rh * 0.95, s * 0.05);
  bl.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bl, { depth: s * 0.012, bevelEnabled: false, curveSegments: 10 });
  bladeGeo.translate(0, 0, -s * 0.006);
  for (let i = 0; i < 7; i++) {
    const holder = new THREE.Group();
    holder.rotation.z = (i / 7) * Math.PI * 2;
    const b = new THREE.Mesh(bladeGeo, mats.blade);
    b.rotation.x = 0.55;                              // blade pitch
    holder.add(b);
    rotor.add(holder);
  }
  const cap = new THREE.Mesh(new THREE.CircleGeometry(rh * 0.8, 24), mats.label ?? mats.frame);
  cap.position.z = depth * 0.4 + 0.0005;
  rotor.add(cap);
  g.add(rotor);
  // finger guard: 4 rings + 4 spokes
  if (mats.guard) {
    for (let k = 1; k <= 4; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry((rv * k) / 4.2, s * 0.006, 6, 40), mats.guard);
      ring.position.z = depth / 2 + s * 0.012;
      g.add(ring);
    }
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.006, s * 0.006, rv * 2, 6), mats.guard);
      sp.rotation.z = (i * Math.PI) / 4;
      sp.position.z = depth / 2 + s * 0.012;
      g.add(sp);
    }
  }
  return { group: g, rotor };
}
