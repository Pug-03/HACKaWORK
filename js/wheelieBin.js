import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rbox, smooth, roundedRect } from './geom.js';

// 120 L wheelie bin with waste-slot (hood) lid — modelled on the TAB120HW drawing.
// Local frame: origin on the ground under the body centre, front = +Z, hinge at the back.

const box = (w, h, d, mat, x, y, z) => rbox(w, h, d, mat, x, y, z, 0.005);

// subtle moulded-HDPE roughness variation, shared by all bins
let hdpeRough = null;
function hdpeRoughness() {
  if (hdpeRough) return hdpeRough;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + (Math.random() - 0.5) * 50;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  hdpeRough = new THREE.CanvasTexture(c);
  hdpeRough.wrapS = hdpeRough.wrapT = THREE.RepeatWrapping;
  hdpeRough.repeat.set(3, 3);
  return hdpeRough;
}

// Open-top tapered shell with rounded vertical corners (radius r) and a closed bottom.
// One geometry, no groups: render outer FrontSide + inner BackSide twin.
function roundedTaperShell(wB, wT, dB, dT, h, rCorner, seg = 8, fillet = 0.035) {
  const ring = (w, d, y, r) => {
    const pts = [];
    const cx = w / 2 - r, cz = d / 2 - r;
    const corners = [[cx, cz, 0], [-cx, cz, Math.PI / 2], [-cx, -cz, Math.PI], [cx, -cz, Math.PI * 1.5]];
    for (const [x0, z0, a0] of corners) {
      for (let k = 0; k <= seg; k++) {
        const a = a0 + (k / seg) * (Math.PI / 2);
        pts.push(new THREE.Vector3(x0 + r * Math.cos(a), y, z0 + r * Math.sin(a)));
      }
    }
    return pts;
  };
  // profile: quarter-round fillet at the bottom edge, then straight taper to the top
  const rings = [];
  const FS = 5;
  for (let k = 0; k <= FS; k++) {
    const a = (k / FS) * (Math.PI / 2);
    const y = fillet * (1 - Math.cos(a)), inset = fillet * (1 - Math.sin(a));
    const tt = y / h;
    rings.push(ring(THREE.MathUtils.lerp(wB, wT, tt) - 2 * inset, THREE.MathUtils.lerp(dB, dT, tt) - 2 * inset, y, Math.max(0.006, rCorner - inset)));
  }
  rings.push(ring(wT, dT, h, rCorner));
  const bot = rings[0], n = bot.length, top = rings[rings.length - 1];
  const pos = [], idx = [];
  for (const rg of rings) for (const p of rg) pos.push(p.x, p.y, p.z);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = r * n, b = (r + 1) * n;
      idx.push(a + i, b + i, a + j, a + j, b + i, b + j);
    }
  }
  // bottom cap (separate vertices so the bottom edge stays crisp)
  const c0 = pos.length / 3;
  pos.push(0, 0, 0);
  for (const p of bot) pos.push(p.x, p.y, p.z);
  for (let i = 0; i < n; i++) idx.push(c0, c0 + 1 + i, c0 + 1 + ((i + 1) % n));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  // make winding face outward: check first side quad normal against its radial direction
  geo.computeVertexNormals();
  const a = rings[FS][0], b = top[0], c = rings[FS][1];
  const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (nrm.dot(new THREE.Vector3(a.x, 0, a.z)) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  return geo;
}

// Hood of the TAB120HW lid, built from its side profile (Z = along lid from hinge, Y = up)
// and swept across X with a width that tapers from base to top (front view 452 -> 328 mm).
// Shape: near-vertical front face (the push flap), rounded crest, long slope down to the hinge side.
// inset > 0 builds the smaller inner shell (wall thickness). The bottom faces are removed so the
// hood is open underneath over the hole in the lid plate.
function wedgeHood(B, zBack, zFront, mat, inset = 0) {
  const h = B.hoodHeight - inset, bw = B.hoodBaseWidth - 2 * inset, tw = B.hoodTopWidth - 2 * inset;
  zBack += inset * 3; zFront -= inset;
  // the bevel grows the outline by bs, so the profile is drawn bs inside the target size
  const bs = 0.007, bt = 0.018, zb = zBack + bs, zf = zFront - bs, y0 = bs, yt = h;
  const s = new THREE.Shape();
  s.moveTo(zb, y0);
  s.lineTo(zf, y0);
  s.lineTo(zf - 0.006, yt - 0.03);                            // front face, leaning back slightly
  s.quadraticCurveTo(zf - 0.01, yt, zf - 0.045, yt);          // rounded crest
  s.quadraticCurveTo(zf - 0.09, yt, zf - 0.12, yt * 0.78);
  s.lineTo(zb + 0.02, y0 + 0.012);                            // long slope to the back
  s.quadraticCurveTo(zb, y0 + 0.004, zb, y0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 4, curveSegments: 16 });
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i), e = (p.getZ(i) - 0.5) / (1 + 2 * bt);   // e spans -0.5..0.5 incl. bevel
    const width = THREE.MathUtils.lerp(bw, tw, Math.min(1, v / h));
    p.setXYZ(i, e * width, v, u);
  }
  // mapping (u,v,e) -> (x,y,z) mirrors handedness: flip winding back
  const idx = geo.index;
  if (idx) { for (let i = 0; i < idx.count; i += 3) { const t = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, t); } }
  else { for (let i = 0; i < p.count; i += 3) { for (let k = 0; k < 3; k++) { const t = p.getComponent(i + 1, k); p.setComponent(i + 1, k, p.getComponent(i + 2, k)); p.setComponent(i + 2, k, t); } } }
  // drop triangles lying on the base plane (open bottom)
  const src = geo.toNonIndexed();
  const sp = src.attributes.position, keep = [];
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let i = 0; i < sp.count; i += 3) {
    va.fromBufferAttribute(sp, i); vb.fromBufferAttribute(sp, i + 1); vc.fromBufferAttribute(sp, i + 2);
    nrm.subVectors(vb, va).cross(vc.clone().sub(va)).normalize();
    // open bottom: drop every downward-facing face at the base (the bevel leaves it a few 0.1 mm off zero)
    if (Math.max(va.y, vb.y, vc.y) < 0.01 && nrm.y < -0.7) continue;
    // open the flat front face: the push-flap opening is framed separately (see frontFrame)
    if (nrm.z > 0.95) continue;
    for (let k = 0; k < 3; k++) keep.push(sp.getX(i + k), sp.getY(i + k), sp.getZ(i + k));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  const m = new THREE.Mesh(smooth(out, 40), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function createWheelieBin(color) {
  const B = CONFIG.bin;
  const g = new THREE.Group();
  const plastic = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.5, roughnessMap: hdpeRoughness(), metalness: 0,
    clearcoat: 0.2, clearcoatRoughness: 0.55,
  });
  // inner surfaces: rendered BackSide on the same geometry, so outer and inner never fight for the same pixel
  const inner = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.28), roughness: 0.85, envMapIntensity: 0.3, side: THREE.BackSide });   // dim cavity
  const innerDeep = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.16), roughness: 0.9, envMapIntensity: 0.2, side: THREE.BackSide });
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.75 });

  const rim = B.rimHeight;                 // top of collar
  const collarH = 0.07, ct = 0.025;
  const bodyTop = rim - 0.05;              // interior floor-of-opening sits below collar top

  // hollow body: open top (py face hidden), inside shown by a BackSide twin
  const bodyGeo = roundedTaperShell(B.bodyBottomWidth, B.bodyTopWidth, B.bodyBottomDepth, B.bodyTopDepth, bodyTop - 0.02, 0.045);
  const body = new THREE.Mesh(bodyGeo, plastic);
  body.castShadow = body.receiveShadow = true;
  const bodyIn = new THREE.Mesh(bodyGeo, innerDeep);
  bodyIn.receiveShadow = true;
  body.position.y = bodyIn.position.y = 0.02;
  g.add(body, bodyIn);

  // collar ring around the opening
  const cw = B.collarWidth, cd = B.collarDepth, cy = rim - collarH / 2;
  const cb = 0.006;
  const collarShape = roundedRect(new THREE.Shape(), cw - 2 * cb, cd - 2 * cb, 0.045);
  collarShape.holes.push(roundedRect(new THREE.Path(), cw - 2 * ct, cd - 2 * ct, 0.03));
  const collarGeo = new THREE.ExtrudeGeometry(collarShape, { depth: collarH - 2 * cb, bevelEnabled: true, bevelThickness: cb, bevelSize: cb, bevelSegments: 3, curveSegments: 10 });
  const collar = new THREE.Mesh(smooth(collarGeo, 40), plastic);
  collar.rotation.x = -Math.PI / 2;
  collar.position.y = cy - collarH / 2 + cb;
  collar.castShadow = collar.receiveShadow = true;
  g.add(collar);
  // gussets under the front and side collar
  for (const x of [-0.15, 0, 0.15]) g.add(box(0.02, 0.07, 0.013, plastic, x, rim - collarH - 0.035, 0.2385));
  for (const sx of [-1, 1]) g.add(box(0.013, 0.07, 0.02, plastic, sx * 0.2285, rim - collarH - 0.035, 0.1));

  // back: hinge housing + pull handle
  g.add(box(cw - 0.04, 0.045, 0.04, plastic, 0, rim - 0.0225, -cd / 2 - 0.02));
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, cw - 0.08, 12), plastic);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0, rim - 0.065, -cd / 2 - 0.022);
  handle.castShadow = true;
  g.add(handle);
  for (const sx of [-1, 1]) g.add(box(0.025, 0.05, 0.05, plastic, sx * (cw / 2 - 0.06), rim - 0.055, -cd / 2 - 0.015));

  // wheels (205 mm) behind the body, front foot
  const wr = B.wheel / 2, wz = -B.bodyBottomDepth / 2 - 0.02;
  const tube = 0.019;
  const tyreGeo = new THREE.TorusGeometry(wr - tube, tube, 14, 40);
  const rimGeo = new THREE.CylinderGeometry(wr - tube * 1.6, wr - tube * 1.6, 0.028, 32);
  const hubGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.05, 16);
  const spokeGeo = new THREE.BoxGeometry(0.006, wr - tube * 1.8 - 0.02, 0.03);
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.55 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const wx = sx * (B.wheelSpan / 2 - 0.0225);
    const wheel = new THREE.Group();
    wheel.position.set(wx, wr, wz);
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    tyre.rotation.y = Math.PI / 2; tyre.scale.z = 1.2; tyre.castShadow = true;
    const rimM = new THREE.Mesh(rimGeo, hubMat);
    rimM.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, black);
    hub.rotation.z = Math.PI / 2;
    wheel.add(tyre, rimM, hub);
    for (let k = 0; k < 12; k++) {                    // spokes on the outer face
      const sp = new THREE.Mesh(spokeGeo, black);
      const a = (k / 12) * Math.PI * 2, rr = (wr - tube * 1.8) / 2 + 0.01;
      sp.position.set(sx * 0.015, Math.cos(a) * rr, Math.sin(a) * rr);
      sp.rotation.x = a;
      wheel.add(sp);
    }
    g.add(wheel);
    g.add(box(0.012, 0.12, 0.05, plastic, sx * 0.188, wr + 0.03, wz + 0.025)); // wheel boss
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, B.wheelSpan, 8), hubMat);
  axle.rotation.z = Math.PI / 2; axle.position.set(0, wr, wz);
  g.add(axle);
  g.add(box(B.bodyBottomWidth * 0.8, 0.02, 0.05, plastic, 0, 0.01, B.bodyBottomDepth / 2 - 0.03));

  // ----- lid (rotates about the hinge axis) -----
  const lidPivot = new THREE.Group();
  const hingeZ = -cd / 2 - 0.02;
  lidPivot.position.set(0, rim + 0.005, hingeZ);
  const Ld = cd / 2 - hingeZ + 0.025;    // hinge to front overhang
  const LW = B.width, t = B.lidThickness;

  // lid plate (rounded corners like the top view) + skirt over the collar
  const plateShape = new THREE.Shape();
  const rc = 0.035;
  plateShape.moveTo(-LW / 2 + rc, 0); plateShape.lineTo(LW / 2 - rc, 0); plateShape.quadraticCurveTo(LW / 2, 0, LW / 2, rc);
  plateShape.lineTo(LW / 2, Ld - rc); plateShape.quadraticCurveTo(LW / 2, Ld, LW / 2 - rc, Ld);
  plateShape.lineTo(-LW / 2 + rc, Ld); plateShape.quadraticCurveTo(-LW / 2, Ld, -LW / 2, Ld - rc);
  plateShape.lineTo(-LW / 2, rc); plateShape.quadraticCurveTo(-LW / 2, 0, -LW / 2 + rc, 0);
  // opening under the hood: waste pushed through the front flap drops through here into the bin
  const zFront = Ld - 0.15 * Ld, zBack = Ld - 0.63 * Ld, wall = 0.01;
  // the hole fills the whole footprint inside the hood (no plastic floor under it): from just behind
  // the front frame back to where the inner shell meets the plate, wall to wall
  const hx = B.hoodBaseWidth / 2 - wall - 0.004, hz0 = zBack + 0.05, hz1 = zFront - 0.014;
  const hole = new THREE.Path();
  hole.moveTo(-hx, hz0); hole.lineTo(-hx, hz1); hole.lineTo(hx, hz1); hole.lineTo(hx, hz0); hole.closePath();
  plateShape.holes.push(hole);
  const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(plateShape, {
    depth: t - 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 8,
  }), plastic);
  plate.rotation.x = Math.PI / 2;        // shape Y -> +Z, extrude -> -Y
  plate.position.y = t - 0.004;
  plate.castShadow = plate.receiveShadow = true;
  lidPivot.add(plate);
  // raised step ring around the lid top (moulded rim seen in the photo)
  lidPivot.add(box(LW - 0.05, 0.008, 0.02, plastic, 0, t + 0.004, Ld - 0.035));
  const skirt = 0.04, sk = 0.01;
  lidPivot.add(box(LW - 2 * rc, skirt, sk, plastic, 0, -skirt / 2 + 0.006, Ld - sk / 2));        // front skirt
  for (const sx of [-1, 1]) lidPivot.add(box(sk, skirt, Ld - 0.08, plastic, sx * (LW / 2 - sk / 2), -skirt / 2 + 0.006, Ld / 2));
  // thick rounded front lip (finger grip edge)
  const lipF = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, LW - 0.12, 4, 12), plastic);
  lipF.rotation.z = Math.PI / 2;
  lipF.position.set(0, -0.005, Ld + 0.004);
  lipF.castShadow = true;
  lidPivot.add(lipF);
  for (const x of [-0.16, 0, 0.16]) {                                                            // hinge knuckles
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.08, 12), black);
    k.rotation.z = Math.PI / 2; k.position.set(x, 0.005, 0);
    lidPivot.add(k);
  }

  // hood: from 63% to 15% of the lid depth measured from the front (side elevation)
  const hood = wedgeHood(B, zBack, zFront, plastic);
  const hoodIn = wedgeHood(B, zBack, zFront, inner, wall);   // inner wall, seen from below through the hole
  hoodIn.castShadow = false;
  hood.position.y = hoodIn.position.y = t - 0.007;
  lidPivot.add(hood, hoodIn);

  // push flap on the front face: thin dark gap outline + flap panel, hinged at its top edge
  const hh = B.hoodHeight;
  const fBot = 0.018, fTop = hh - 0.054;      // flap sits inside the flat front face (top at hh - 0.037)
  const wAt = (y, inset) => THREE.MathUtils.lerp(B.hoodBaseWidth, B.hoodTopWidth, y / hh) / 2 - inset;
  const trap = (inset, y0, y1) => {
    const sh = new THREE.Shape();
    sh.moveTo(-wAt(y0, inset), y0); sh.lineTo(wAt(y0, inset), y0); sh.lineTo(wAt(y1, inset), y1); sh.lineTo(-wAt(y1, inset), y1); sh.closePath();
    return sh;
  };
  const lean = Math.atan2(0.006, hh - 0.03);           // match the front face lean
  const flapPivot = new THREE.Group();
  flapPivot.position.set(0, t, zFront);
  flapPivot.rotation.x = -lean;
  // front frame around the real opening: closes the flat front face of the hood (which is left open
  // in the mesh) and gives the opening a 12 mm moulded edge that joins the inner shell
  const faceTop = hh - 0.033, kFlat = 0.5 / (1 + 2 * 0.018);           // flat-face extent (bevel excluded)
  const outerHalf = (y) => kFlat * THREE.MathUtils.lerp(B.hoodBaseWidth, B.hoodTopWidth, (y + 0.007) / hh) + 0.001;
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-outerHalf(0), 0); frameShape.lineTo(outerHalf(0), 0);
  frameShape.lineTo(outerHalf(faceTop), faceTop); frameShape.lineTo(-outerHalf(faceTop), faceTop); frameShape.closePath();
  const slotOutline = trap(0.026, fBot - 0.004, fTop + 0.004);
  const holePts = slotOutline.getPoints();
  if (holePts.length > 1 && holePts[0].equals(holePts[holePts.length - 1])) holePts.pop();   // drop closing duplicate
  frameShape.holes.push(new THREE.Path(holePts));
  const frontFrame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.012, bevelEnabled: false }), plastic);
  frontFrame.position.z = -0.012;
  frontFrame.castShadow = frontFrame.receiveShadow = true;
  frontFrame.userData.part = 'flap';
  flapPivot.add(frontFrame);
  const flapGeo = new THREE.ExtrudeGeometry(trap(0.03, fBot, fTop), { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
  const flap = new THREE.Mesh(flapGeo, plastic);
  flap.castShadow = true;
  flap.userData.part = 'flap';
  // hinge along the flap's top edge; positive rotation swings the bottom inward (into the hood)
  const flapHinge = new THREE.Group();
  flapHinge.position.set(0, fTop, 0);
  flap.position.set(0, -fTop, 0.0015);
  flapHinge.add(flap);
  flapPivot.add(flapHinge);
  // three small moulded notches along the crest (as in the photo)
  for (const x of [-0.07, 0, 0.07]) flapPivot.add(box(0.03, 0.005, 0.016, black, x, hh - 0.001, -0.032));
  lidPivot.add(flapPivot);

  // loop carry handles beside the hood: one continuous moulded arch with flared feet
  const hLen = 0.12, hRise = 0.038, hr = 0.0095, bend = 0.016;
  const arch = new THREE.CurvePath();
  const v3 = (z, y) => new THREE.Vector3(0, y, z);
  const z0h = -hLen / 2, z1h = hLen / 2;
  arch.add(new THREE.LineCurve3(v3(z0h, -0.006), v3(z0h, hRise - bend)));
  arch.add(new THREE.QuadraticBezierCurve3(v3(z0h, hRise - bend), v3(z0h, hRise), v3(z0h + bend, hRise)));
  arch.add(new THREE.LineCurve3(v3(z0h + bend, hRise), v3(z1h - bend, hRise)));
  arch.add(new THREE.QuadraticBezierCurve3(v3(z1h - bend, hRise), v3(z1h, hRise), v3(z1h, hRise - bend)));
  arch.add(new THREE.LineCurve3(v3(z1h, hRise - bend), v3(z1h, -0.006)));
  const archGeo = new THREE.TubeGeometry(arch, 64, hr, 16, false);
  const footGeo = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);   // dome
  for (const sx of [-1, 1]) {
    const handle = new THREE.Group();
    handle.position.set(sx * (LW / 2 - 0.018), t, zBack + (zFront - zBack) * 0.55);
    const tubeM = new THREE.Mesh(archGeo, plastic);
    tubeM.scale.x = 1.15;                         // slightly oval grip, wider than tall
    tubeM.castShadow = tubeM.receiveShadow = true;
    handle.add(tubeM);
    for (const z of [z0h, z1h]) {                 // soft fillet where each leg meets the lid
      const foot = new THREE.Mesh(footGeo, plastic);
      foot.scale.set(0.02, 0.012, 0.024);
      foot.position.set(0, -0.001, z);
      foot.castShadow = true;
      handle.add(foot);
    }
    lidPivot.add(handle);
  }

  g.add(lidPivot);
  g.userData = { lidPivot, open: 0, target: 0, flap: { hinge: flapHinge, open: 0, hold: 0 } };
  return g;
}
