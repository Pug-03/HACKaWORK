import * as THREE from 'three';
import { rbox, mergeStatic } from './geom.js';
import { makeBrushedTexture } from './textures.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { axialFan, CHAIN, UCP, outsideRadius, sprocketMesh, chainPath, solveCentreDistance, rollerChain, spurGearShape, cutterShape, hexPath, hexBolt, pillowBlock, tefcMotor } from './mech.js';
import { bmaBagTex } from './shop.js';

// Stand-alone food-waste composter cabinet (separate unit beside the bin station).
// 200 L heated U-trough with a paddle mixer, twin-shaft shredder on the feed, carbon-filtered exhaust.
// Food scraps go in through the top hatch; finished compost comes out of the bottom drawer.
export const COMPOSTER = {
  width: 1.2, depth: 0.8, height: 1.2,
  capacityL: 200,                                  // U-trough r 290 mm x 800 mm ≈ 199 L gross
  dailyKg: 50,                                     // ~50 kg food waste per day on a 24 h cycle
  phone: '02-XXX-XXXX',                            // placeholder — put the real BMA order line here
};

const FONT = 'Kanit, Thonburi, sans-serif';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, canvas: c };
}

// draw centred text, shrinking the font until it fits maxW
function fitText(ctx, text, x, y, maxW, size, weight) {
  let px = size;
  do { ctx.font = `${weight} ${Math.round(px)}px ${FONT}`; px *= 0.94; } while (ctx.measureText(text).width > maxW && px > 8);
  ctx.fillText(text, x, y);
}

function brandingTexture(wM, hM) {
  const W = 1600, H = Math.round(1600 * hM / wM);
  return canvasTex(W, H, (ctx, w, h) => {
    ctx.fillStyle = '#eef1f3'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    // left: BMA block
    const lw = w * 0.36, lpad = lw * 0.86;
    ctx.fillStyle = '#1f7a3a'; ctx.fillRect(0, 0, lw, h);
    ctx.fillStyle = '#ffffff';
    fitText(ctx, 'กทม.', lw / 2, h * 0.46, lpad, h * 0.3, 700);
    fitText(ctx, 'เศษอาหาร → ปุ๋ย', lw / 2, h * 0.64, lpad, h * 0.075, 500);
    ctx.fillStyle = '#f3c200'; ctx.fillRect(lw * 0.2, h * 0.72, lw * 0.6, h * 0.012);
    ctx.fillStyle = '#ffffff';
    fitText(ctx, `${COMPOSTER.capacityL} ลิตร · ${COMPOSTER.dailyKg} กก./วัน`, lw / 2, h * 0.84, lpad, h * 0.055, 400);
    // right: description + order box
    const rx = lw + 60, rw = w - lw - 120, cx = lw + (w - lw) / 2;
    ctx.fillStyle = '#1d2228';
    fitText(ctx, 'เครื่องหมักปุ๋ยจากเศษอาหาร', cx, h * 0.17, rw, h * 0.1, 600);
    ctx.fillStyle = '#5b646e';
    fitText(ctx, `FOOD WASTE COMPOSTER · ${COMPOSTER.capacityL} L`, cx, h * 0.26, rw, h * 0.05, 500);
    ctx.strokeStyle = '#cfd5da'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(rx, h * 0.32); ctx.lineTo(rx + rw, h * 0.32); ctx.stroke();
    ctx.fillStyle = '#2f3a44';
    fitText(ctx, 'รับเฉพาะเศษอาหาร · ไม่รับพลาสติก แก้ว โลหะ', cx, h * 0.42, rw, h * 0.058, 500);
    fitText(ctx, 'เปิดฝาด้านบน เทเศษอาหาร แล้วปิดฝา', cx, h * 0.5, rw, h * 0.05, 400);
    ctx.fillStyle = '#f3c200'; ctx.fillRect(rx, h * 0.58, rw, h * 0.34);
    ctx.fillStyle = '#1d2228';
    fitText(ctx, 'ติดต่อซื้อ-ขายปุ๋ยกับ กทม.', cx, h * 0.69, rw * 0.9, h * 0.07, 600);
    fitText(ctx, `โทร. ${COMPOSTER.phone}`, cx, h * 0.85, rw * 0.9, h * 0.13, 700);
  });
}


/* =====================================================================================
   200 L in-vessel food-waste composter, built to true scale (metres, origin = floor centre,
   +Z = front, +X = right). Layout of the real machine class (horizontal mixer, heated U-trough):

   FEED    top hatch (safety-interlocked) -> hopper -> twin-shaft shredder (0.75 kW, 25 rpm)
   CHAMBER SUS304 3 mm U-trough r 290 mm x 800 mm (~199 L), silicone heater pads 1.5 kW under
           40 mm rock wool + 1 mm cladding, Ø50 mm shaft with 7 bolted plough paddles
   DRIVE   0.4 kW worm gearmotor 6 rpm -> #50 roller chain 12T/36T -> mixer 2 rpm, UCP210 bearings
   AIR     side-channel blower into the bed, exhaust port -> activated-carbon filter -> 120 mm fan
   OUT     knife gate on a 24 V linear actuator -> chute -> compost drawer
   WEIGHT  4 shear-beam load cells under the trough lugs
   POWER   230 V 1~ 16 A, DIN-rail panel (MCB/RCBO, contactors, VFD, SSR, PLC, 24 V PSU)
   ===================================================================================== */
export function buildComposter(renderer) {
  const C = COMPOSTER;
  const W = C.width, Dd = C.depth, H = C.height, t = 0.012, foot = 0.05, rc = 0.045;
  const xi = W / 2 - t, zi = Dd / 2 - t;            // inner faces of the cabinet walls
  const group = new THREE.Group();
  group.name = 'composter';

  /* ---------- materials ---------- */
  const brushed = makeBrushedTexture(renderer);
  const ss = new THREE.MeshStandardMaterial({ color: 0xc3c8cd, metalness: 0.85, roughness: 0.32, roughnessMap: brushed });
  const ssIn = new THREE.MeshStandardMaterial({ color: 0xbfc5ca, metalness: 0.8, roughness: 0.38, side: THREE.DoubleSide });
  const ssDark = new THREE.MeshStandardMaterial({ color: 0x8e959b, metalness: 0.8, roughness: 0.4 });
  const clad = new THREE.MeshStandardMaterial({ color: 0xd3d7db, metalness: 0.7, roughness: 0.35 });
  const wool = new THREE.MeshStandardMaterial({ color: 0xb9a466, roughness: 1 });
  const heatMat = new THREE.MeshStandardMaterial({ color: 0xb5401f, emissive: 0xff5a00, emissiveIntensity: 0, roughness: 0.7 });
  const compostMat = new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.6 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 });
  const galv = new THREE.MeshStandardMaterial({ color: 0xa9afb5, metalness: 0.7, roughness: 0.42 });
  const cast = new THREE.MeshStandardMaterial({ color: 0x3e4a55, metalness: 0.45, roughness: 0.55 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.9, roughness: 0.28 });
  const blackOx = new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.8, roughness: 0.38 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.85, roughness: 0.3 });
  const motorBlue = new THREE.MeshStandardMaterial({ color: 0x2f5d8a, metalness: 0.35, roughness: 0.45 });
  const motorGrey = new THREE.MeshStandardMaterial({ color: 0x6f7a84, metalness: 0.4, roughness: 0.5 });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.7 });
  const plastic = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
  const mechMats = { cast, steel, dark: blackOx, brass };

  // parts that come off / swing open in the cutaway view, and their numbered callouts
  const cutHide = [];                                // front halves + guards, hidden in cutaway
  const callouts = [];
  const tag = (o, part) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.userData.part = part; } }); return o; };

  /* ---------- section helpers: U-profile halves extruded along X ----------
     2D coords (a, b) = (z - dz, y - y0). side -1 = back half (a <= 0), +1 = front half. Each half is a
     closed solid, so with the front halves hidden the layers show real cut faces at a = 0. */
  const dz = -0.02;
  const T = { r: 0.29, hs: 0.2, y0: 0.7, xL: -0.45, xR: 0.35 };      // trough: inner radius, straight height, axis
  const L_T = T.xR - T.xL;
  const N_ARC = 28;
  function halfU(r0, r1, top, side, a0 = -Math.PI / 2, span = Math.PI / 2, straight = true) {
    const sh = new THREE.Shape(), pts = [];
    for (let k = 0; k <= N_ARC; k++) { const a = a0 + side * span * (k / N_ARC); pts.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
    if (straight) pts.push([side * r0, top]);
    const outer = [];
    for (let k = 0; k <= N_ARC; k++) { const a = a0 + side * span * (k / N_ARC); outer.push([Math.cos(a) * r1, Math.sin(a) * r1]); }
    if (straight) outer.push([side * r1, top]);
    pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    outer.reverse().forEach(([x, y]) => sh.lineTo(x, y));
    sh.closePath();
    return sh;
  }
  // solid half plate (end plates / end insulation): U region out to r1 with a half-hole of radius rh
  function halfPlate(r1, top, rh, side) {
    const sh = new THREE.Shape();
    sh.moveTo(0, -r1);
    for (let k = 1; k <= N_ARC; k++) { const a = -Math.PI / 2 + side * (Math.PI / 2) * (k / N_ARC); sh.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); }
    sh.lineTo(side * r1, top); sh.lineTo(0, top); sh.lineTo(0, rh);
    for (let k = 1; k < 16; k++) { const a = Math.PI / 2 - side * (Math.PI) * (k / 16); sh.lineTo(Math.cos(a) * rh, Math.sin(a) * rh); }   // half-hole on this half's own side
    sh.lineTo(0, -rh); sh.closePath();
    return sh;
  }
  // extrude a profile along X from x0 to x1 (profile a -> world Z, b -> world Y)
  function alongX(shape, x0, x1, mat, y0 = T.y0) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: 8 });
    const m = new THREE.Mesh(g, mat);
    m.rotation.y = -Math.PI / 2;                     // local X -> world +Z, local Z -> world -X
    m.position.set(x1, y0, dz);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  const inside = new THREE.Group();
  const both = (fn) => { for (const side of [-1, 1]) { const m = fn(side); inside.add(m); if (side > 0) cutHide.push(m); } };

  /* ---------- cabinet shell (1.2 mm SUS304 hairline, 45 mm corner radius) ---------- */
  const y0 = foot, colH = H - rc - y0;
  group.add(rbox(W - 0.1, foot - 0.004, Dd - 0.1, black, 0, foot / 2, 0, 0.006));               // recessed plinth
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {                                          // M16 levelling feet
    const fx = sx * (W / 2 - 0.08), fz = sz * (Dd / 2 - 0.08);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.012, 24), rubber);
    pad.position.set(fx, 0.006, fz);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, foot - 0.012, 12), steel);
    stem.position.set(fx, 0.012 + (foot - 0.012) / 2, fz);
    const nut = hexBolt(0.016, steel); nut.position.set(fx, 0.03, fz);
    group.add(pad, stem, nut);
  }
  group.add(rbox(W - 2 * rc, t, Dd - 2 * rc, ss, 0, y0 + t / 2, 0, 0.004));                        // floor
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(rc, rc, colH, 32), ss);
    col.position.set(sx * (W / 2 - rc), y0 + colH / 2, sz * (Dd / 2 - rc));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(rc, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), ss);
    ball.position.set(sx * (W / 2 - rc), H - rc, sz * (Dd / 2 - rc));
    group.add(col, ball);
  }
  for (const sz of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(rc, rc, W - 2 * rc, 32, 1, true), ss);
    e.rotation.z = Math.PI / 2; e.position.set(0, H - rc, sz * (Dd / 2 - rc));
    group.add(e);
  }
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(rc, rc, Dd - 2 * rc, 32, 1, true), ss);
    e.rotation.x = Math.PI / 2; e.position.set(sx * (W / 2 - rc), H - rc, 0);
    group.add(e);
  }
  const wallH = H - rc - y0;
  const rearY0 = 0.4;
  group.add(rbox(W - 2 * rc, rearY0 - y0, t, ss, 0, (y0 + rearY0) / 2, -Dd / 2 + t / 2, 0.003));     // lower back strip (drain, power)
  group.add(rbox(W - 2 * rc, rc, t, ss, 0, H - rc / 2 - 0.001, -Dd / 2 + t / 2, 0.002));
  for (const sx of [-1, 1]) group.add(rbox(t, wallH, Dd - 2 * rc, ss, sx * (W / 2 - t / 2), y0 + wallH / 2, 0, 0.003));   // sides
  // removable side service panels: seam lines + 4 quarter-turn fasteners each
  for (const sx of [-1, 1]) {
    const px = sx * (W / 2 + 0.001);
    for (const [w, h, y, z] of [[Dd - 0.2, 0.003, 0.36, 0], [Dd - 0.2, 0.003, 0.96, 0], [0.003, 0.6, 0.66, -(Dd - 0.2) / 2], [0.003, 0.6, 0.66, (Dd - 0.2) / 2]]) {
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(h === 0.003 ? w : 0.003, h === 0.003 ? 0.003 : h), black);
      seam.rotation.y = sx * Math.PI / 2; seam.position.set(px, y, z);
      group.add(seam);
    }
    for (const [y, z] of [[0.39, -0.26], [0.39, 0.26], [0.93, -0.26], [0.93, 0.26]]) {
      const q = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 20), steel);
      q.rotation.z = Math.PI / 2; q.position.set(sx * (W / 2 + 0.002), y, z);
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.002), black);
      slot.rotation.y = sx * Math.PI / 2; slot.position.set(sx * (W / 2 + 0.005), y, z);
      group.add(q, slot);
    }
  }
  // pressed louvres: exhaust (right, high, behind the fan) and blower intake (left, low)
  function louvre(sx, yc, zc, rows, len) {
    for (let i = 0; i < rows; i++) {
      const y = yc + (i - (rows - 1) / 2) * 0.016;
      const hood = rbox(0.007, 0.003, len, ss, sx * (W / 2 + 0.003), y + 0.002, zc, 0.001);
      hood.rotation.z = -sx * 0.7;
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.007), black);
      slot.rotation.y = sx * Math.PI / 2; slot.position.set(sx * (W / 2 + 0.0006), y - 0.002, zc);
      group.add(hood, slot);
    }
  }
  louvre(1, 1.06, -0.2, 7, 0.13);
  louvre(-1, 0.45, -0.12, 6, 0.2);

  /* ---------- top: feed hatch over the hopper ---------- */
  const hatchW = 0.6, hatchD = 0.32, hatchZ = dz;
  const topW = W - 2 * rc, topBack = (hatchZ - hatchD / 2) - (-Dd / 2 + rc), topFront = (Dd / 2 - rc) - (hatchZ + hatchD / 2);
  group.add(rbox(topW, t, topBack, ss, 0, H - t / 2, -Dd / 2 + rc + topBack / 2, 0.003));
  group.add(rbox(topW, t, topFront, ss, 0, H - t / 2, Dd / 2 - rc - topFront / 2, 0.003));
  const sideTopW = (topW - hatchW) / 2;
  for (const sx of [-1, 1]) group.add(rbox(sideTopW, t, hatchD, ss, sx * (hatchW / 2 + sideTopW / 2), H - t / 2, hatchZ, 0.003));
  // EPDM gasket round the opening, interlock switch at the front edge
  for (const [w, d, x, z] of [[hatchW, 0.008, 0, hatchZ - hatchD / 2], [hatchW, 0.008, 0, hatchZ + hatchD / 2], [0.008, hatchD, -hatchW / 2, hatchZ], [0.008, hatchD, hatchW / 2, hatchZ]])
    group.add(rbox(w, 0.004, d, rubber, x, H + 0.001, z, 0.001));
  const interlock = rbox(0.03, 0.05, 0.03, plastic(0xd9a400), 0.22, H - t - 0.03, hatchZ + hatchD / 2 - 0.02, 0.004);
  group.add(interlock);
  const hatch = new THREE.Group();
  hatch.position.set(0, H, hatchZ - hatchD / 2);
  hatch.add(rbox(hatchW + 0.03, 0.02, hatchD + 0.03, ss, 0, 0.01, hatchD / 2, 0.008));
  const hh = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.14, 4, 12), ssDark);
  hh.rotation.z = Math.PI / 2; hh.position.set(0, 0.036, hatchD - 0.01);
  hatch.add(hh);
  for (const sx of [-1, 1]) hatch.add(rbox(0.014, 0.026, 0.014, ssDark, sx * 0.07, 0.024, hatchD - 0.01, 0.003));
  for (const sx of [-1, 1]) {                         // butt hinges + gas strut
    hatch.add(rbox(0.06, 0.004, 0.03, steel, sx * 0.22, 0.0, -0.004, 0.001));
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.056, 12).rotateZ(Math.PI / 2), steel);
    k.position.set(sx * 0.22, 0.004, -0.012);
    hatch.add(k);
  }
  const hatchSign = canvasTex(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#1f7a3a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, 'ช่องเติมเศษอาหาร', w / 2, h * 0.36, w * 0.9, h * 0.34, 600);
    fitText(ctx, 'ห้ามใส่มือ · เครื่องย่อยหยุดเมื่อเปิดฝา', w / 2, h * 0.75, w * 0.9, h * 0.2, 400);
  });
  const hs = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.094), new THREE.MeshStandardMaterial({ map: hatchSign.tex, roughness: 0.6 }));
  hs.rotation.x = -Math.PI / 2; hs.position.set(0, 0.0205, hatchD / 2 - 0.02);
  hatch.add(hs);
  tag(hatch, 'hatch');
  hatch.userData = { open: 0, target: 0 };
  group.add(hatch);

  /* ---------- front: compost drawer / service door / sloped control console ---------- */
  const frontW = W - 2 * rc - 0.002;
  const drawerY0 = y0 + t, drawerY1 = 0.32, doorY0 = 0.33, doorY1 = 0.93, ctrlY0 = 0.93, ctrlY1 = H - rc;
  // door frame jamb + gasket, so the opening reads as a real door when it swings
  group.add(rbox(frontW, 0.01, 0.012, ss, 0, doorY0 - 0.005, Dd / 2 - 0.006, 0.002));
  // service door, hinged on the left, two quarter-turn locks; carries the branding vinyl
  const door = new THREE.Group();
  door.position.set(-frontW / 2, (doorY0 + doorY1) / 2, Dd / 2);
  const dH = doorY1 - doorY0 - 0.004;
  const brand = brandingTexture(frontW - 0.01, dH);
  const brandFace = new THREE.MeshStandardMaterial({ map: brand.tex, roughness: 0.55, metalness: 0.1 });
  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(frontW - 0.004, dH, 0.018), [ss, ss, ss, ss, brandFace, ss]);
  doorPanel.position.set(frontW / 2, 0, -0.009);
  door.add(doorPanel);
  for (const [w, h, x, y] of [[frontW - 0.04, 0.008, frontW / 2, dH / 2 - 0.012], [frontW - 0.04, 0.008, frontW / 2, -dH / 2 + 0.012], [0.008, dH - 0.03, 0.014, 0], [0.008, dH - 0.03, frontW - 0.018, 0]])
    door.add(rbox(w, h, 0.006, rubber, x, y, -0.021, 0.002));                 // door gasket
  for (const y of [dH * 0.36, -dH * 0.36]) {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.07, 14), steel);
    k.position.set(-0.002, y, -0.004);
    door.add(k);
  }
  for (const y of [dH * 0.3, -dH * 0.3]) {
    const lk = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 24).rotateX(Math.PI / 2), steel);
    lk.position.set(frontW - 0.03, y, 0.004);
    const sl = rbox(0.003, 0.012, 0.002, black, frontW - 0.03, y, 0.009, 0.0005);
    door.add(lk, sl);
  }
  tag(door, 'serviceDoor');
  door.userData = { open: 0, target: 0 };
  group.add(door);
  // sloped console (18°) carrying the HMI and the operator buttons; hinges up on its top edge
  const consoleOuter = new THREE.Group();
  const tilt = 0.31, cHgt = ctrlY1 - ctrlY0;
  consoleOuter.position.set(0, ctrlY1, Dd / 2 - cHgt * Math.sin(tilt));
  const consoleTilt = new THREE.Group();
  consoleTilt.rotation.x = -tilt;
  consoleOuter.add(consoleTilt);
  const cPanel = rbox(frontW, cHgt, t, ss, 0, -cHgt / 2, -t / 2, 0.004);
  consoleTilt.add(cPanel);
  // 7" HMI (bezel 192 x 138 mm)
  const screen = canvasTex(800, 480, () => {});
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.155, 0.093), new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false }));
  scr.position.set(-0.3, -cHgt / 2, 0.0052);
  scr.userData.noMerge = true;
  scr.castShadow = false;
  consoleTilt.add(scr, rbox(0.192, 0.138, 0.006, black, -0.3, -cHgt / 2, 0.0005, 0.003));
  // 22 mm pilot lights with legend plates
  const ledRun = new THREE.MeshStandardMaterial({ color: 0x1b5e20, emissive: 0x22c55e, emissiveIntensity: 0 });
  const ledHeat = new THREE.MeshStandardMaterial({ color: 0x7a3b00, emissive: 0xff7a00, emissiveIntensity: 0 });
  const ledFault = new THREE.MeshStandardMaterial({ color: 0x5a0d0d, emissive: 0xff2a2a, emissiveIntensity: 0 });
  const legend = (txt) => canvasTex(160, 48, (ctx, w, h) => { ctx.fillStyle = '#e9ecef'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#1d2228'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitText(ctx, txt, w / 2, h / 2, w * 0.9, h * 0.6, 600); }).tex;
  const ctrlRow = -cHgt / 2;
  [[ledRun, -0.08, 'ทำงาน'], [ledHeat, -0.02, 'ฮีตเตอร์'], [ledFault, 0.04, 'ขัดข้อง']].forEach(([m, x, txt]) => {
    const bez = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.01, 24).rotateX(Math.PI / 2), steel);
    bez.position.set(x, ctrlRow + 0.02, 0.005);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.011, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), m);
    lens.position.set(x, ctrlRow + 0.02, 0.009);
    const lg = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.014), new THREE.MeshStandardMaterial({ map: legend(txt), roughness: 0.6 }));
    lg.position.set(x, ctrlRow - 0.012, 0.0005);
    consoleTilt.add(bez, lens, lg);
  });
  // AUTO / OFF / MAN selector, START (flush green), STOP (flush red), E-STOP (40 mm mushroom on yellow plate)
  const sel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.012, 24).rotateX(Math.PI / 2), black);
  sel.position.set(0.11, ctrlRow + 0.02, 0.006);
  consoleTilt.add(sel, rbox(0.006, 0.026, 0.008, black, 0.11, ctrlRow + 0.02, 0.014, 0.002));
  const lgSel = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.014), new THREE.MeshStandardMaterial({ map: legend('อัตโนมัติ·ปิด·มือ'), roughness: 0.6 }));
  lgSel.position.set(0.11, ctrlRow - 0.012, 0.0005);
  consoleTilt.add(lgSel);
  const startBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 24).rotateX(Math.PI / 2), plastic(0x1f8a3a));
  startBtn.position.set(0.18, ctrlRow + 0.02, 0.008);
  startBtn.userData.part = 'composterStart';
  const stopBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 24).rotateX(Math.PI / 2), plastic(0xc62828));
  stopBtn.position.set(0.235, ctrlRow + 0.02, 0.008);
  stopBtn.userData.part = 'composterStart';
  for (const [x, txt] of [[0.18, 'เริ่ม'], [0.235, 'หยุด']]) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 24).rotateX(Math.PI / 2), steel);
    g.position.set(x, ctrlRow + 0.02, 0.003);
    const lg = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.014), new THREE.MeshStandardMaterial({ map: legend(txt), roughness: 0.6 }));
    lg.position.set(x, ctrlRow - 0.012, 0.0005);
    consoleTilt.add(g, lg);
  }
  consoleTilt.add(startBtn, stopBtn);
  const ePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.002, 32).rotateX(Math.PI / 2), plastic(0xf2c200));
  ePlate.position.set(0.34, ctrlRow + 0.005, 0.001);
  const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.024, 28).rotateX(Math.PI / 2), plastic(0xc62828));
  estop.position.set(0.34, ctrlRow + 0.005, 0.014);
  estop.userData.part = 'estop';
  const eCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 24).rotateX(Math.PI / 2), black);
  eCollar.position.set(0.34, ctrlRow + 0.005, 0.006);
  consoleTilt.add(ePlate, eCollar, estop);
  tag(consoleTilt, 'console');
  startBtn.userData.part = stopBtn.userData.part = 'composterStart';
  estop.userData.part = 'estop';
  consoleOuter.userData = { open: 0, target: 0 };
  group.add(consoleOuter);
  for (const sx of [-1, 1]) {                         // side cheeks closing the wedge under the slope
    const cheek = new THREE.Shape();
    const back = cHgt * Math.sin(tilt);
    cheek.moveTo(0, 0); cheek.lineTo(0, -cHgt * Math.cos(tilt)); cheek.lineTo(back, -cHgt * Math.cos(tilt) + 0); cheek.closePath();
    const g = new THREE.Mesh(new THREE.ExtrudeGeometry(cheek, { depth: 0.006, bevelEnabled: false }), ss);
    g.rotation.y = -Math.PI / 2;
    g.position.set(sx * (frontW / 2 + 0.003) + 0.003, ctrlY1, Dd / 2 - back);
    group.add(g);
  }
  // compost drawer on full-extension slides
  const drawer = new THREE.Group();
  const dHh = drawerY1 - drawerY0;
  drawer.add(rbox(frontW - 0.004, dHh - 0.008, t, ss, 0, 0, 0, 0.004));
  const dLabel = canvasTex(400, 70, (ctx, w, h) => {
    ctx.fillStyle = '#2b3036'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2f4f6'; ctx.textAlign = 'center'; ctx.font = `600 34px ${FONT}`;
    ctx.fillText('ปุ๋ยพร้อมใช้ · ดึงออก', w / 2, 47);
  });
  const dl = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.063), new THREE.MeshStandardMaterial({ map: dLabel.tex, roughness: 0.6 }));
  dl.position.set(0, 0.04, t / 2 + 0.0005);
  drawer.add(dl);
  const dhn = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.44, 4, 10), ssDark);
  dhn.rotation.z = Math.PI / 2; dhn.position.set(0, -0.035, t / 2 + 0.022);
  drawer.add(dhn);
  for (const sx of [-1, 1]) drawer.add(rbox(0.016, 0.016, 0.026, ssDark, sx * 0.23, -0.035, t / 2 + 0.01, 0.003));
  const tubW = W - 0.1, tubD = Dd - 0.12, tubH = dHh - 0.05, tubZ = -tubD / 2 - t / 2, tubY = -dHh / 2 + 0.012 + tubH / 2, wall = 0.008;
  drawer.add(rbox(tubW - 2 * wall, wall, tubD, ssDark, 0, tubY - tubH / 2 + wall / 2, tubZ, 0.003));
  drawer.add(rbox(tubW - 2 * wall, tubH - wall, wall, ssDark, 0, tubY + wall / 2, tubZ - tubD / 2 + wall / 2, 0.003));
  for (const sx of [-1, 1]) {
    drawer.add(rbox(wall, tubH, tubD, ssDark, sx * (tubW / 2 - wall / 2), tubY, tubZ, 0.003));
    drawer.add(rbox(0.004, 0.035, tubD, steel, sx * (tubW / 2 + 0.004), tubY, tubZ, 0.001));      // drawer slide member
  }
  drawer.add(rbox(tubW - 2 * wall - 0.004, tubH * 0.55, tubD - wall - 0.004, compostMat, 0, tubY - tubH / 2 + wall + tubH * 0.275, tubZ + wall / 2, 0.02));
  const drawerZ = Dd / 2 - t / 2;
  drawer.position.set(0, drawerY0 + dHh / 2, drawerZ);
  tag(drawer, 'drawer');
  drawer.userData = { open: 0, target: 0 };
  const DRAWER_TRAVEL = 0.5;
  group.add(drawer);
  for (const sx of [-1, 1]) inside.add(rbox(0.006, 0.04, Dd - 0.14, galv, sx * (tubW / 2 + 0.01), drawerY0 + dHh / 2, -0.03, 0.001));   // cabinet slide members
  // drawer-bay ceiling shelf with the discharge hole
  const shelfY = drawerY1 + 0.005;
  {
    const sh = new THREE.Shape(), sw = xi, sd = zi;
    sh.moveTo(-sw, -sd); sh.lineTo(sw, -sd); sh.lineTo(sw, sd); sh.lineTo(-sw, sd); sh.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-0.15, dz - 0.06); hole.lineTo(0.15, dz - 0.06); hole.lineTo(0.15, dz + 0.06); hole.lineTo(-0.15, dz + 0.06); hole.closePath();
    sh.holes.push(hole);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: false }), ssDark);
    m.rotation.x = Math.PI / 2; m.position.y = shelfY + 0.005;
    inside.add(m);
  }

  /* ---------- trough: SUS304 sheet, heater pads, rock wool, cladding (all as true sections) ---------- */
  const rT1 = T.r + 0.003, rH1 = rT1 + 0.0015, rI1 = rH1 + 0.04, rC1 = rI1 + 0.001;
  both((s) => alongX(halfU(T.r, rT1, T.hs, s), T.xL, T.xR, ssIn));
  both((s) => alongX(halfU(rT1 + 0.0003, rH1 - 0.0003, 0, s, -Math.PI / 2, Math.PI / 3, false), T.xL + 0.03, T.xR - 0.03, heatMat));   // ±60° from the bottom
  both((s) => alongX(halfU(rH1, rI1 - 0.0008, T.hs, s), T.xL - 0.008, T.xR + 0.008, wool));   // hair inside the cladding: no coplanar faces
  both((s) => alongX(halfU(rI1, rC1, T.hs, s), T.xL - 0.049, T.xR + 0.049, clad));
  // the heater gap above the pads is filled with wool too, so the layer reads continuous
  both((s) => alongX(halfU(rT1 + 0.0003, rH1, T.hs, s, -Math.PI / 2 + s * Math.PI / 3, Math.PI / 6), T.xL - 0.008, T.xR + 0.008, wool));
  // end plates (8 mm, shaft hole Ø60), end insulation (hole for the gland), end cladding
  for (const ex of [-1, 1]) {
    const xs = ex < 0 ? [T.xL - 0.008, T.xL] : [T.xR, T.xR + 0.008];
    both((s) => alongX(halfPlate(rT1, T.hs, 0.03, s), xs[0], xs[1], ssIn));
    const xw = ex < 0 ? [T.xL - 0.048, T.xL - 0.008] : [T.xR + 0.008, T.xR + 0.048];
    both((s) => alongX(halfPlate(rI1 - 0.0008, T.hs - 0.0008, 0.045, s), xw[0], xw[1], wool));
    const xc = ex < 0 ? [T.xL - 0.049, T.xL - 0.048] : [T.xR + 0.048, T.xR + 0.049];
    both((s) => alongX(halfPlate(rI1, T.hs - 0.0004, 0.045, s), xc[0], xc[1], clad));
  }
  // top flange cover (4 mm) with the inlet throat and the exhaust port, split front / back
  const coverY = T.y0 + T.hs;
  for (const side of [-1, 1]) {
    const sh = new THREE.Shape(), x0 = T.xL - 0.049, x1 = T.xR + 0.049, a1 = side * rC1;
    if (side < 0) { sh.moveTo(x0, a1); sh.lineTo(x1, a1); sh.lineTo(x1, 0); sh.lineTo(0.18, 0); sh.lineTo(0.18, -0.09); sh.lineTo(-0.18, -0.09); sh.lineTo(-0.18, 0); sh.lineTo(x0, 0); }
    else { sh.moveTo(x0, 0); sh.lineTo(-0.18, 0); sh.lineTo(-0.18, 0.09); sh.lineTo(0.18, 0.09); sh.lineTo(0.18, 0); sh.lineTo(x1, 0); sh.lineTo(x1, a1); sh.lineTo(x0, a1); }
    sh.closePath();
    if (side < 0) { const p = new THREE.Path(); p.absarc(0.28, -0.2, 0.025, 0, Math.PI * 2, true); sh.holes.push(p); }
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false, curveSegments: 16 }), ssIn);
    m.rotation.x = Math.PI / 2;
    m.position.set(0, coverY + 0.004, dz);
    m.castShadow = m.receiveShadow = true;
    inside.add(m);
    if (side > 0) cutHide.push(m);
    for (let i = 0; i < 6; i++) {                     // M10 flange bolts along the long edges
      const b = hexBolt(0.01, blackOx);
      b.position.set(T.xL + 0.04 + i * (L_T - 0.08) / 5, coverY + 0.007, dz + side * (rC1 - 0.015));
      inside.add(b);
      if (side > 0) cutHide.push(b);
    }
  }
  // trough side lugs resting on the load cells
  for (const lx of [T.xL + 0.12, T.xR - 0.12]) for (const side of [-1, 1]) {
    const lug = rbox(0.07, 0.01, 0.05, ssDark, lx, 0.637, dz + side * (rC1 + 0.016), 0.002);
    const gus = rbox(0.008, 0.05, 0.03, ssDark, lx, 0.662, dz + side * (rC1 + 0.006), 0.001);
    inside.add(lug, gus);
  }

  /* ---------- compost bed + scraps (bed is sectioned too) ---------- */
  const bedB = -0.06;
  function bedHalf(side) {
    const r = T.r - 0.004, sh = new THREE.Shape();
    const aEnd = Math.asin(bedB / r);                // angle where the arc meets the bed surface
    sh.moveTo(0, -r);
    for (let k = 1; k <= N_ARC; k++) {
      const a = -Math.PI / 2 + side * (aEnd + Math.PI / 2) * (k / N_ARC);
      sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    sh.lineTo(0, bedB); sh.closePath();
    return sh;
  }
  both((s) => alongX(bedHalf(s), T.xL + 0.002, T.xR - 0.002, compostMat));
  {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const geos = [new THREE.DodecahedronGeometry(0.011, 0), new THREE.IcosahedronGeometry(0.008, 0), new THREE.BoxGeometry(0.024, 0.005, 0.016)];
    const mats = [0x6f8f2e, 0xd9822b, 0xe8dfb0, 0x3b2a1c, 0x5a3e28, 0xa8452a, 0xf2efe6].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
    const chord = Math.sqrt((T.r - 0.004) ** 2 - bedB ** 2) - 0.02;
    for (let i = 0; i < 130; i++) {
      const m = new THREE.Mesh(geos[i % 3], mats[Math.floor(rnd() * mats.length)]);
      const a = (rnd() * 2 - 1) * chord;
      m.position.set(T.xL + 0.03 + rnd() * (L_T - 0.06), T.y0 + bedB + 0.002 + rnd() * 0.005, dz + a);
      m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      m.scale.setScalar(0.7 + rnd() * 0.8);
      inside.add(m);
      if (a > 0.005) cutHide.push(m);
    }
  }

  /* ---------- mixer: Ø50 shaft, 7 plough paddles on split clamp collars ---------- */
  const rotor = new THREE.Group();
  rotor.position.set(0, T.y0, dz);
  const shaftX0 = -0.575, shaftX1 = 0.553;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, shaftX1 - shaftX0, 32).rotateZ(Math.PI / 2), steel);
  shaft.position.x = (shaftX0 + shaftX1) / 2;
  rotor.add(shaft);
  const armGeo = new THREE.BoxGeometry(0.05, T.r - 0.07 - 0.045, 0.012);
  const bladeGeo = new THREE.BoxGeometry(0.13, 0.055, 0.008);
  for (let i = 0; i < 7; i++) {
    const px = T.xL + 0.07 + i * ((L_T - 0.14) / 6), ang = i * (Math.PI / 2) + (i % 2 ? 0.2 : 0);
    const arm = new THREE.Group();
    arm.position.x = px;
    arm.rotation.x = ang;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.045, 28).rotateZ(Math.PI / 2), ssIn);
    arm.add(collar);
    for (const s of [-1, 1]) {                        // two clamp bolts across the split
      const b = hexBolt(0.01, blackOx);
      b.rotation.x = Math.PI / 2; b.position.set(0, s * 0.03, 0.046);
      arm.add(b);
    }
    const a = new THREE.Mesh(armGeo, ssIn);
    a.position.y = 0.045 + (T.r - 0.07 - 0.045) / 2;
    arm.add(a);
    const blade = new THREE.Mesh(bladeGeo, ssIn);
    blade.position.y = T.r - 0.012 - 0.0275;
    blade.rotation.y = (i % 2 ? 1 : -1) * 0.45;      // plough pitch, alternating so the bed rolls end to end
    arm.add(blade);
    for (const s of [-1, 1]) { const b = hexBolt(0.008, blackOx); b.rotation.x = Math.PI / 2; b.position.set(s * 0.04, T.r - 0.04, 0.006); arm.add(b); }
    rotor.add(arm);
  }
  for (const ex of [T.xL + 0.012, T.xR - 0.012]) {   // end scrapers that keep the end plates clean
    const sc = new THREE.Mesh(new THREE.BoxGeometry(0.01, T.r - 0.05, 0.05), ssIn);
    sc.position.set(ex, -(T.r - 0.05) / 2 - 0.02, 0);
    rotor.add(sc);
  }
  inside.add(rotor);
  // gland seal housings (packing gland, 4 studs) on both end walls
  for (const ex of [-1, 1]) {
    const gx = ex < 0 ? T.xL - 0.055 : T.xR + 0.055;
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 32).rotateZ(Math.PI / 2), cast);
    fl.position.set(gx, T.y0, dz);
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.028, 28).rotateZ(Math.PI / 2), steel);
    gl.position.set(gx + ex * 0.018, T.y0, dz);
    inside.add(fl, gl);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, b = hexBolt(0.01, blackOx);
      b.rotation.z = Math.PI / 2;
      b.position.set(gx + ex * 0.009, T.y0 + Math.cos(a) * 0.048, dz + Math.sin(a) * 0.048);
      inside.add(b);
    }
  }

  /* ---------- chassis: SHS 40x40 bearing towers, longitudinal rails, load cells ---------- */
  const bxL = T.xL - 0.09, bxR = T.xR + 0.09;       // UCP210 centres
  const U210 = UCP[210];
  const beamTop = T.y0 - U210.h;
  for (const bx of [bxL, bxR]) {
    inside.add(rbox(0.04, 0.04, 0.74, galv, bx, beamTop - 0.02, dz, 0.003));             // cross beam under the bearing
    for (const s of [-1, 1]) inside.add(rbox(0.04, beamTop - 0.04 - (shelfY + 0.005), 0.04, galv, bx, (beamTop - 0.04 + shelfY + 0.005) / 2, dz + s * 0.35, 0.003));
    const pb = pillowBlock(210, mechMats);
    pb.position.set(bx, T.y0, dz);
    inside.add(pb);
  }
  for (const s of [-1, 1]) inside.add(rbox(bxR - bxL, 0.04, 0.04, galv, (bxL + bxR) / 2, 0.58, dz + s * 0.35, 0.003));   // rails
  const lcMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.7, roughness: 0.3 });
  for (const lx of [T.xL + 0.12, T.xR - 0.12]) for (const s of [-1, 1]) {
    const lc = rbox(0.13, 0.03, 0.032, lcMat, lx, 0.615, dz + s * 0.35, 0.002);         // 100 kg shear beam
    inside.add(lc);
    const cbl = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.05, 8).rotateZ(Math.PI / 2), cableMat);
    cbl.position.set(lx - 0.09, 0.615, dz + s * 0.35);
    inside.add(cbl);
  }
  const jbLC = rbox(0.08, 0.06, 0.035, plastic(0x9aa1a7), 0, 0.6, dz - 0.35, 0.004);         // summing box
  inside.add(jbLC);

  /* ---------- drive: 0.4 kW worm gearmotor -> #50 chain 12T / 36T ---------- */
  const ch = CHAIN[50], N1 = 36, N2 = 12;
  const { d: centre, links } = solveCentreDistance(N1, N2, ch.p, 0.26);
  const driveX = 0.522;
  const drive = new THREE.Group();
  drive.position.set(driveX, 0, dz);
  drive.rotation.y = -Math.PI / 2;                  // local XY = world (Z, Y), local +Z = world -X
  const c1 = new THREE.Vector2(0, T.y0), c2 = new THREE.Vector2(0, T.y0 - centre);
  const sprocketA = sprocketMesh(N1, ch, blackOx, { bore: 0.05, holes: 5, hubR: 0.045, hubL: 0.035, screwMat: steel });
  sprocketA.position.set(c1.x, c1.y, 0);
  const sprocketB = sprocketMesh(N2, ch, blackOx, { bore: 0.025, hubR: 0.024, hubL: 0.03, screwMat: steel });
  sprocketB.position.set(c2.x, c2.y, 0);
  const path = chainPath(c1, N1, c2, N2, ch.p);
  const chain = rollerChain(path, ch, links, { roller: new THREE.MeshStandardMaterial({ color: 0x6a7078, metalness: 0.85, roughness: 0.35 }), pin: steel, plate: new THREE.MeshStandardMaterial({ color: 0x2e3238, metalness: 0.75, roughness: 0.4 }) });
  drive.add(sprocketA, sprocketB, chain.group);
  inside.add(drive);
  const ys = T.y0 - centre;
  // worm gearbox (output shaft along +X through the 12T), motor flanged on its +Z face
  const gb = new THREE.Group();
  gb.add(rbox(0.07, 0.12, 0.12, motorGrey, 0.445, ys, dz, 0.01));
  for (let i = 0; i < 5; i++) gb.add(rbox(0.074, 0.006, 0.1, motorGrey, 0.445, ys - 0.045 + i * 0.022, dz, 0.002));   // cooling ribs
  gb.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.06, 20).rotateZ(Math.PI / 2), steel).translateX(0.505).translateY(ys).translateZ(dz));
  gb.add(rbox(0.09, 0.012, 0.14, motorGrey, 0.445, ys - 0.066, dz, 0.003));                          // foot
  gb.add(rbox(0.09, ys - 0.072 - shelfY - 0.005, 0.12, galv, 0.445, (ys - 0.072 + shelfY + 0.005) / 2, dz, 0.003));   // pedestal
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 28).rotateX(Math.PI / 2), motorGrey);
  flange.position.set(0.445, ys, dz + 0.066);
  gb.add(flange);
  const mixMotor = tefcMotor(0.11, 0.19, { paint: motorBlue, dark: blackOx, steel, plate: new THREE.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 0.6, roughness: 0.4 }) });
  mixMotor.position.set(0.455, ys, dz + 0.072);
  gb.add(mixMotor);
  inside.add(gb);
  // chain guard (comes off in cutaway)
  {
    const g = new THREE.Group(), R1o = outsideRadius(ch.p, N1) + 0.012;
    const sh = new THREE.Shape();
    sh.absarc(0, 0, R1o, -Math.PI / 2 + 0.2, Math.PI / 2 - 0.2 + Math.PI * 1.0 + 0.4, false);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(R1o, R1o, 0.002, 40).rotateZ(Math.PI / 2), ss);
    plate.position.set(driveX + 0.028, T.y0, dz);
    const plate2 = new THREE.Mesh(new THREE.CylinderGeometry(outsideRadius(ch.p, N2) + 0.012, outsideRadius(ch.p, N2) + 0.012, 0.002, 28).rotateZ(Math.PI / 2), ss);
    plate2.position.set(driveX + 0.028, ys, dz);
    const web = rbox(0.001, centre, 2 * (outsideRadius(ch.p, N2) + 0.012), ss, driveX + 0.028, (T.y0 + ys) / 2, dz, 0.001);
    g.add(plate, plate2, web);
    for (const yy of [T.y0 + R1o - 0.01, ys - outsideRadius(ch.p, N2) - 0.006]) g.add(rbox(0.05, 0.004, 0.1, ss, driveX + 0.002, yy, dz, 0.001));
    tag(g, 'drive');
    inside.add(g);
    cutHide.push(g);
  }

  /* ---------- feed: hopper funnel + twin-shaft shredder ---------- */
  const shY = 0.985, shLen = 0.36, aA = -0.046, aB = 0.046;
  const hsY0 = coverY + 0.004, hsY1 = 1.06, hz0 = 0.123;
  // housing: end plates (16 mm) + side walls (12 mm); the front wall comes off in cutaway
  for (const ex of [-1, 1]) inside.add(rbox(0.016, hsY1 - hsY0, 2 * hz0, ssIn, ex * (shLen / 2 + 0.008), (hsY0 + hsY1) / 2, dz, 0.002));
  const hsBack = rbox(shLen, hsY1 - hsY0, 0.012, ssIn, 0, (hsY0 + hsY1) / 2, dz - hz0 + 0.006, 0.002);
  const hsFront = rbox(shLen, hsY1 - hsY0, 0.012, ssIn, 0, (hsY0 + hsY1) / 2, dz + hz0 - 0.006, 0.002);
  inside.add(hsBack, hsFront);
  cutHide.push(hsFront);
  // hopper: four sloped plates from the hatch opening down to the housing throat
  {
    const top = [[-0.29, H - t, hatchZ - 0.15], [0.29, H - t, hatchZ - 0.15], [0.29, H - t, hatchZ + 0.15], [-0.29, H - t, hatchZ + 0.15]];
    const bot = [[-shLen / 2 - 0.016, hsY1, dz - hz0], [shLen / 2 + 0.016, hsY1, dz - hz0], [shLen / 2 + 0.016, hsY1, dz + hz0], [-shLen / 2 - 0.016, hsY1, dz + hz0]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute([...top[i], ...top[j], ...bot[j], ...top[i], ...bot[j], ...bot[i]], 3));
      gg.computeVertexNormals();
      const m = new THREE.Mesh(gg, ssIn);
      m.castShadow = m.receiveShadow = true;
      inside.add(m);
      if (i === 2) cutHide.push(m);                  // front plate
    }
  }
  // cutters (10 mm, 3 hooks, hex bore), spacers, combs; 30 slots of 12 mm, shafts interleaved
  const cutterGeo = new THREE.ExtrudeGeometry(cutterShape(0.042, 0.055, 3, 0.03), { depth: 0.0105, bevelEnabled: false, curveSegments: 4 }).rotateY(Math.PI / 2);
  const spacerSh = new THREE.Shape(); spacerSh.absarc(0, 0, 0.033, 0, Math.PI * 2, false); spacerSh.holes.push(hexPath(0.015));
  const spacerGeo = new THREE.ExtrudeGeometry(spacerSh, { depth: 0.0105, bevelEnabled: false, curveSegments: 20 }).rotateY(Math.PI / 2);
  const gearGeo = new THREE.ExtrudeGeometry(spurGearShape(23, 0.004, { bore: 0.03 }), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 1 }).rotateY(Math.PI / 2);
  const shredders = [];
  for (const [k, a] of [[0, aA], [1, aB]]) {
    const sh = new THREE.Group();
    sh.position.set(0, shY, dz + a);
    const hexShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0173, 0.0173, shLen + 0.012, 6).rotateZ(Math.PI / 2), steel);
    sh.add(hexShaft);
    const journal = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 20).rotateZ(Math.PI / 2), steel);
    journal.position.x = shLen / 2 + 0.05;
    sh.add(journal);
    const j2 = journal.clone(); j2.position.x = -(shLen / 2 + 0.03); sh.add(j2);
    for (let i = 0; i < 30; i++) {
      const x = -shLen / 2 + i * 0.012 + 0.00025;
      const isCutter = (i + k) % 2 === 0;
      const m = new THREE.Mesh(isCutter ? cutterGeo : spacerGeo, isCutter ? steel : ssDark);
      m.position.x = x;
      if (isCutter) m.rotation.x = i * 0.9;           // cutters staggered round the shaft
      sh.add(m);
    }
    const gear = new THREE.Mesh(gearGeo, blackOx);
    gear.position.x = shLen / 2 + 0.024;
    gear.rotation.x = k ? Math.PI / 23 : 0;           // half a tooth out so the pair meshes
    sh.add(gear);
    inside.add(sh);
    shredders.push(sh);
  }
  // combs: fingers between each shaft's cutters, scraping its spacers
  for (const [k, a, wallA] of [[0, aA, -hz0 + 0.012], [1, aB, hz0 - 0.012]]) {
    const g = new THREE.Group();
    for (let i = 0; i < 30; i++) {
      if ((i + k) % 2 === 0) continue;
      const len = Math.abs(wallA - a) - 0.036;
      g.add(rbox(0.0095, 0.05, len, ssDark, -shLen / 2 + i * 0.012 + 0.006, shY, dz + wallA - Math.sign(wallA) * len / 2, 0.001));
    }
    inside.add(g);
    if (k === 1) cutHide.push(g);
  }
  // flange bearings on both end plates, gear guard and the shredder gearmotor (coaxial with shaft A)
  for (const ex of [-1, 1]) for (const a of [aA, aB]) {
    const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 24).rotateZ(Math.PI / 2), cast);
    fb.position.set(ex * (shLen / 2 + 0.027), shY, dz + a);
    inside.add(fb);
  }
  const gearGuard = rbox(0.04, 0.13, 0.25, ss, shLen / 2 + 0.036, shY, dz, 0.004);
  inside.add(gearGuard);
  cutHide.push(gearGuard);
  const shGb = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.09, 28).rotateZ(Math.PI / 2), motorGrey);
  shGb.position.set(0.3, shY, dz + aA);
  inside.add(shGb);
  const shMotor = tefcMotor(0.105, 0.18, { paint: motorBlue, dark: blackOx, steel });
  shMotor.rotation.y = Math.PI / 2;                 // motor axis +X
  shMotor.position.set(0.345, shY, dz + aA);
  inside.add(shMotor);
  inside.add(rbox(0.08, 0.012, 0.1, galv, 0.3, shY - 0.062, dz + aA, 0.002));                   // gearbox bracket
  inside.add(rbox(0.012, shY - 0.062 - hsY0, 0.06, galv, 0.3, (shY - 0.062 + hsY0) / 2, dz + aA, 0.002));

  /* ---------- discharge: knife gate + 24 V linear actuator + chute ---------- */
  const portY = T.y0 - rC1;
  inside.add(rbox(0.3, portY - (shelfY + 0.03), 0.12, ssIn, 0, (portY + shelfY + 0.03) / 2, dz, 0.002));
  const gate = new THREE.Group();
  gate.add(rbox(0.32, 0.006, 0.14, ssDark, 0, 0, 0, 0.002));
  gate.position.set(0, shelfY + 0.024, dz);
  inside.add(gate);
  for (const s of [-1, 1]) inside.add(rbox(0.012, 0.016, 0.32, galv, s * 0.17, shelfY + 0.024, dz + 0.07, 0.002));   // gate guides
  const act = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 20).rotateX(Math.PI / 2), plastic(0x2b2f33));
  act.position.set(0, shelfY + 0.026, dz + 0.27);
  inside.add(act);
  const actRod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 12).rotateX(Math.PI / 2), steel);
  actRod.position.set(0, shelfY + 0.026, dz + 0.1);
  inside.add(actRod);

  /* ---------- air: side-channel blower in, exhaust -> carbon filter -> fan out ---------- */
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0xd9dde0, metalness: 0.6, roughness: 0.35 });
  const tube = (pts, r, mat = pipeMat, tension = 0.15) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', tension), 64, r, 12, false), mat);
    m.castShadow = true;
    inside.add(m);
    return m;
  };
  const blX = -0.548, blY = 0.45, blZ = -0.12;
  const blower = new THREE.Group();
  blower.add(new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.042, 32).rotateZ(Math.PI / 2), plastic(0x3a3f45)));
  for (let i = 0; i < 12; i++) { const f = rbox(0.044, 0.004, 0.012, plastic(0x3a3f45), 0, Math.cos(i / 12 * Math.PI * 2) * 0.058, Math.sin(i / 12 * Math.PI * 2) * 0.058, 0.001); f.rotation.x = -(i / 12) * Math.PI * 2; blower.add(f); }
  blower.position.set(blX, blY, blZ);
  inside.add(blower);
  tube([[blX, blY + 0.058, blZ], [blX, blY + 0.09, blZ], [blX + 0.02, 0.52, dz - 0.12], [T.xL - 0.05, 0.52, dz - 0.12]], 0.011);
  // exhaust port -> duct -> carbon filter (Ø140 x 220) -> 120 mm fan behind the right louvres
  const portX = 0.28, portZ = dz - 0.2;
  inside.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 24), pipeMat).translateX(portX).translateY(coverY + 0.019).translateZ(portZ));
  const fX = 0.46, fZ = -0.29, fY0 = 0.93, fY1 = 1.15;
  const filter = new THREE.Group();
  filter.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, fY1 - fY0 - 0.004, 32), plastic(0x24282c)));
  for (const yy of [-(fY1 - fY0) / 2 + 0.01, (fY1 - fY0) / 2 - 0.01]) filter.add(new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.073, 0.02, 32), steel).translateY(yy));
  const flab = canvasTex(256, 96, (ctx, w, h) => { ctx.fillStyle = '#f0f0f0'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#1d2228'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitText(ctx, 'ACTIVATED CARBON', w / 2, h * 0.35, w * 0.9, h * 0.3, 700); fitText(ctx, 'เปลี่ยนทุก 6 เดือน', w / 2, h * 0.72, w * 0.9, h * 0.26, 500); });
  const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.0705, 0.0705, 0.06, 32, 1, true, -0.6, 1.2), new THREE.MeshStandardMaterial({ map: flab.tex, roughness: 0.6 }));
  filter.add(fl);
  filter.position.set(fX, (fY0 + fY1) / 2, fZ);
  inside.add(filter);
  tube([[portX, coverY + 0.034, portZ], [portX, 0.95, portZ], [0.36, 0.95, fZ], [fX - 0.075, 0.96, fZ]], 0.024);
  const fanX = xi - 0.016, fanY = 1.06, fanZ = -0.2;
  tube([[fX, fY1, fZ], [fX, fY1 + 0.02, fZ], [0.53, 1.12, -0.24], [fanX - 0.03, fanY, fanZ]], 0.024);
  // 120 x 120 x 25 mm axial fan (24 V, ~2800 rpm, 90 m³/h) blowing out through the right-side louvres
  const fanLabel = canvasTex(128, 128, (ctx, w, h) => { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(64, 64, 64, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ddd'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 22px ${FONT}`; ctx.fillText('24V DC', 64, 52); ctx.font = `400 16px ${FONT}`; ctx.fillText('0.25 A', 64, 80); });
  const fanParts = axialFan(0.12, { frame: plastic(0x23262a), blade: plastic(0x2f3337), guard: steel, label: new THREE.MeshStandardMaterial({ map: fanLabel.tex, roughness: 0.6 }) });
  fanParts.group.rotation.y = Math.PI / 2;          // axis -> +X, outlet against the wall
  fanParts.group.position.set(fanX - 0.002, fanY, fanZ);
  inside.add(fanParts.group);
  const fan = fanParts.rotor;
  // shroud from the duct to the fan inlet
  inside.add(new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.03, 0.03, 28, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.5, side: THREE.DoubleSide })).translateX(fanX - 0.03).translateY(fanY).translateZ(fanZ));

  /* ---------- drain + PT100 ---------- */
  const drX = -0.4;
  tube([[drX, portY + 0.004, dz], [drX, shelfY + 0.025, dz], [drX, shelfY + 0.025, dz - 0.1], [drX, shelfY + 0.025, -zi - 0.03]], 0.0125, pipeMat, 0.05);
  const pt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 12).rotateX(Math.PI / 2), steel);
  pt.position.set(0.1, T.y0 - 0.12, dz - rC1 + 0.02);
  inside.add(pt, new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 16).rotateX(Math.PI / 2), plastic(0x9aa1a7)).translateX(0.1).translateY(T.y0 - 0.12).translateZ(dz - rC1 - 0.012));

  /* ---------- electrical panel (top-left), DIN-rail layout ---------- */
  const ep = new THREE.Group();
  const eW = 0.24, eH = 0.24, eD = 0.15;
  ep.position.set(-xi + 0.012 + eW / 2, 1.05, 0.02);
  const encMat = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.5, metalness: 0.2 });
  ep.add(rbox(eW, eH, 0.004, encMat, 0, 0, -eD / 2, 0.002));
  for (const s of [-1, 1]) { ep.add(rbox(0.004, eH - 0.008, eD, encMat, s * (eW / 2 - 0.002), 0, 0, 0.002)); ep.add(rbox(eW, 0.004, eD, encMat, 0, s * (eH / 2 - 0.002), 0, 0.002)); }
  const mp = -eD / 2 + 0.006;
  ep.add(rbox(eW - 0.02, eH - 0.02, 0.003, new THREE.MeshStandardMaterial({ color: 0xf0b429, roughness: 0.6 }), 0, 0, mp, 0.001));
  const din = (y) => ep.add(rbox(eW - 0.03, 0.035, 0.007, steel, 0, y, mp + 0.005, 0.001));
  const mod = (x, y, w, h, color, d = 0.06, face = null) => {
    const m = rbox(w, h, d, plastic(color), x, y, mp + 0.008 + d / 2, 0.002);
    ep.add(m);
    if (face) { const f = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, Math.min(h * 0.3, 0.02)), new THREE.MeshStandardMaterial({ map: legend(face), roughness: 0.6 })); f.position.set(x, y + h * 0.18, mp + 0.008 + d + 0.0005); ep.add(f); }
    return m;
  };
  din(0.065); din(-0.045);
  let x = -0.1;
  for (const [w, c, f] of [[0.036, 0xf4f4f2, 'RCBO'], [0.018, 0xf4f4f2, 'MCB'], [0.018, 0xf4f4f2, 'MCB'], [0.018, 0xf4f4f2, 'MCB'], [0.045, 0x9ca3af, '24V'], [0.054, 0x1f2937, 'PLC']]) { mod(x + w / 2, 0.065, w, 0.085, c, 0.065, f); x += w + 0.002; }
  x = -0.1;
  for (const [w, c, f] of [[0.045, 0x374151, 'KM1'], [0.045, 0x374151, 'KM2'], [0.072, 0x1e3a8a, 'VFD'], [0.025, 0x111827, 'SSR']]) { mod(x + w / 2, -0.045, w, w === 0.072 ? 0.1 : 0.08, c, 0.07, f); x += w + 0.003; }
  ep.add(rbox(0.045, 0.06, 0.02, steel, 0.085, -0.04, mp + 0.035, 0.002));          // SSR heat sink
  for (let i = 0; i < 12; i++) ep.add(rbox(0.006, 0.03, 0.04, plastic(i % 3 === 2 ? 0x2563eb : 0x9ca3af), -0.09 + i * 0.0068, -0.1, mp + 0.025, 0.001));   // terminals
  for (const y of [0.115, 0.01]) ep.add(rbox(eW - 0.03, 0.022, 0.03, plastic(0x9aa0a6), 0, y, mp + 0.018, 0.001));       // wire ducts
  const epDoor = new THREE.Group();
  epDoor.position.set(-eW / 2, 0, eD / 2);
  epDoor.add(rbox(eW, eH, 0.006, encMat, eW / 2, 0, 0.003, 0.003));
  const shock = canvasTex(160, 140, (ctx, w, h) => { ctx.fillStyle = '#f2c200'; ctx.beginPath(); ctx.moveTo(w / 2, 8); ctx.lineTo(w - 8, h - 8); ctx.lineTo(8, h - 8); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 8; ctx.stroke(); ctx.fillStyle = '#111'; ctx.font = `700 70px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('⚡', w / 2, h - 30); });
  const sk = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.052), new THREE.MeshStandardMaterial({ map: shock.tex, roughness: 0.6, transparent: true }));
  sk.position.set(eW / 2, 0.05, 0.0065);
  sk.userData.noMerge = true;
  epDoor.add(sk);
  ep.add(epDoor);
  epDoor.userData = { open: 0, target: 0 };
  inside.add(ep);
  // field cables in a slotted duct along the back wall, dropping to each load
  const ductY = 0.885, ductZ = -zi + 0.016;
  inside.add(rbox(0.96, 0.04, 0.025, plastic(0x9aa0a6), 0, ductY, ductZ, 0.002));
  const cable = (pts, r = 0.005) => tube(pts, r, cableMat, 0.1);
  const epB = [ep.position.x, ep.position.y - eH / 2, ep.position.z];
  cable([[epB[0] + 0.05, epB[1], epB[2]], [epB[0] + 0.05, ductY + 0.03, ductZ + 0.02], [epB[0] + 0.1, ductY, ductZ + 0.015]], 0.009);   // bundle into the duct
  cable([[0.45, ductY - 0.02, ductZ + 0.01], [0.5, 0.7, -0.3], [0.455, ys + 0.09, dz + 0.16]]);                                     // mixer motor
  cable([[0.4, ductY + 0.02, ductZ + 0.01], [0.42, 1.0, -0.2], [0.36, shY + 0.06, dz + aA]]);                                       // shredder motor
  cable([[-0.1, ductY - 0.02, ductZ + 0.01], [-0.12, 0.6, dz - rC1 - 0.006], [-0.1, portY + 0.08, dz - rC1 - 0.006]], 0.004);       // heater
  cable([[-0.45, ductY - 0.02, ductZ + 0.01], [blX, 0.7, -0.32], [blX, blY + 0.06, blZ - 0.04]], 0.004);                           // blower
  cable([[0.5, ductY + 0.02, ductZ + 0.01], [0.56, 0.98, -0.3], [fanX - 0.01, fanY - 0.06, fanZ - 0.04]], 0.003);                   // fan
  cable([[0.1, ductY - 0.02, ductZ + 0.01], [0.1, T.y0 - 0.06, ductZ + 0.01], [0.1, T.y0 - 0.12, dz - rC1 - 0.025]], 0.003);        // PT100
  cable([[0.0, ductY - 0.02, ductZ + 0.01], [0.02, 0.66, dz - 0.36], [0, 0.63, dz - 0.35]], 0.004);                                // load-cell summing box

  inside.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(inside);

  /* ---------- back: power inlet, drain valve, exhaust-free back wall, rating plate ---------- */
  const back = new THREE.Group();
  const bz = -Dd / 2 - 0.001;
  const glandB = hexBolt(0.025, black); glandB.rotation.x = Math.PI / 2; glandB.position.set(-0.4, 0.2, bz - 0.006);
  back.add(glandB);
  back.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.4, 0.2, bz - 0.01), new THREE.Vector3(-0.4, 0.18, bz - 0.06), new THREE.Vector3(-0.4, 0.02, bz - 0.08), new THREE.Vector3(-0.3, 0.008, bz - 0.2)]), 32, 0.008, 10, false), cableMat));
  const valve = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), brass);
  valve.position.set(drX, shelfY + 0.025, bz - 0.03);
  back.add(valve, rbox(0.07, 0.008, 0.012, plastic(0xc62828), drX + 0.03, shelfY + 0.05, bz - 0.03, 0.003));
  back.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.05, 16).rotateX(Math.PI / 2), pipeMat).translateX(drX).translateY(shelfY + 0.025).translateZ(bz - 0.005));
  const rp = canvasTex(600, 400, (ctx, w, h) => {
    ctx.fillStyle = '#e8ebee'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#111827'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const rows = [['เครื่องหมักปุ๋ยจากเศษอาหาร', 700, 34], [`ความจุห้องหมัก ${C.capacityL} L · ${C.dailyKg} กก./วัน`, 500, 26], ['ไฟฟ้า 230 V ~ 50 Hz · 16 A · 2.7 kW', 500, 26], ['ใบกวน 0.4 kW · เครื่องย่อย 0.75 kW', 400, 24], ['ฮีตเตอร์ 1.5 kW · พัดลม/ปั๊มลม 70 W', 400, 24], ['น้ำหนักเครื่อง ~320 กก. · IP54', 400, 24]];
    rows.forEach(([txt, wt, sz], i) => { ctx.font = `${wt} ${sz}px ${FONT}`; ctx.fillText(txt, 30, 50 + i * 58); });
  });
  const rpm = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.1), new THREE.MeshStandardMaterial({ map: rp.tex, roughness: 0.5, metalness: 0.3 }));
  rpm.rotation.y = Math.PI;                         // goes on the rear door below
  const earth = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 10).rotateX(Math.PI / 2), brass);
  earth.position.set(-0.3, 0.2, bz - 0.01);
  back.add(earth);
  tag(back, 'composter');
  group.add(back);

  /* ---------- rear service door: hinged on the right (seen from the back), 2 quarter-turn locks, gasket ---------- */
  const rear = new THREE.Group();
  const rW = W - 2 * rc - 0.002, rH = H - rc - rearY0 - 0.004;
  rear.position.set(rW / 2, rearY0 + 0.002 + rH / 2, -Dd / 2);
  rear.add(rbox(rW, rH, 0.016, ss, -rW / 2, 0, 0.008 - 0.016, 0.003));
  for (const [w, h, xx, yy] of [[rW - 0.04, 0.008, -rW / 2, rH / 2 - 0.012], [rW - 0.04, 0.008, -rW / 2, -rH / 2 + 0.012], [0.008, rH - 0.03, -0.014, 0], [0.008, rH - 0.03, -rW + 0.014, 0]])
    rear.add(rbox(w, h, 0.006, rubber, xx, yy, 0.003, 0.002));
  for (const yy of [rH * 0.36, -rH * 0.36]) {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.07, 14), steel);
    k.position.set(0.002, yy, -0.012);
    rear.add(k);
  }
  for (const yy of [rH * 0.3, -rH * 0.3]) {
    const lk = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 24).rotateX(Math.PI / 2), steel);
    lk.position.set(-rW + 0.03, yy, -0.02);
    rear.add(lk, rbox(0.003, 0.012, 0.002, black, -rW + 0.03, yy, -0.025, 0.0005));
  }
  const rearPull = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.12, 4, 12), ssDark);
  rearPull.position.set(-rW + 0.06, 0, -0.035);
  rear.add(rearPull, rbox(0.014, 0.014, 0.024, ssDark, -rW + 0.06, 0.06, -0.024, 0.003), rbox(0.014, 0.014, 0.024, ssDark, -rW + 0.06, -0.06, -0.024, 0.003));
  rpm.position.set(0.3 - rW / 2, 0.9 - rear.position.y, -0.0165);
  rear.add(rpm);
  tag(rear, 'rearDoor');
  rear.userData = { open: 0, target: 0 };
  group.add(rear);

  /* ---------- right side: built-in bag display, same SUS finish as the machine ---------- */
  const disp = new THREE.Group();
  const dW = 0.72, dHt = 0.6, dY0 = 0.3, dx = W / 2 + 0.022;
  const perf = canvasTex(1024, Math.round(1024 * dHt / dW), (ctx, w, h) => {
    ctx.fillStyle = '#c8cdd2'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2000; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; ctx.fillRect(0, Math.random() * h, w, 1); }
    const pxm = w / dW, p = 0.025 * pxm;
    ctx.fillStyle = '#2b2f33';
    for (let y = p / 2; y < h; y += p) for (let xx = p / 2; xx < w; xx += p) { ctx.beginPath(); ctx.arc(xx, y, 0.0025 * pxm, 0, Math.PI * 2); ctx.fill(); }
  });
  perf.tex.anisotropy = 16;
  const pp = new THREE.Mesh(new THREE.BoxGeometry(0.003, dHt, dW), [new THREE.MeshStandardMaterial({ map: perf.tex, metalness: 0.75, roughness: 0.35 }), ss, ss, ss, ss, ss]);
  pp.position.set(dx, dY0 + dHt / 2, 0);
  disp.add(pp);
  for (const [w, h, y, z] of [[dW + 0.012, 0.015, dY0 - 0.004, 0], [dW + 0.012, 0.015, dY0 + dHt + 0.004, 0]]) disp.add(rbox(0.025, h, w, ss, dx - 0.01, y, z, 0.003));   // folded top/bottom returns
  for (const s of [-1, 1]) disp.add(rbox(0.025, dHt + 0.02, 0.012, ss, dx - 0.01, dY0 + dHt / 2, s * (dW / 2 + 0.002), 0.003));
  const header = canvasTex(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1f7a3a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f3c200'; ctx.fillRect(0, h * 0.86, w, h * 0.08);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, 'ถุงปุ๋ยหมัก กทม. · ร้านอยู่ฝั่งตรงข้าม', w / 2, h * 0.44, w * 0.92, h * 0.56, 600);
  });
  const hd = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, dW + 0.02), [new THREE.MeshStandardMaterial({ map: header.tex, roughness: 0.5 }), ss, ss, ss, ss, ss]);
  hd.position.set(dx + 0.002, dY0 + dHt + 0.06, 0);
  disp.add(hd);
  // peg hooks with stacks of flat empty BMA bags (1 kg and 5 kg), and an A5 leaflet box
  const hookGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.2, 8).rotateZ(Math.PI / 2);
  let seed2 = 5;
  const rnd2 = () => ((seed2 = (seed2 * 16807) % 2147483647) / 2147483647);
  for (const [kg, w, h, z, n] of [[1, 0.2, 0.3, -0.22, 12], [5, 0.3, 0.45, 0.1, 10]]) {
    const hy = dY0 + dHt - 0.05;
    const arm = new THREE.Mesh(hookGeo, steel);
    arm.position.set(dx + 0.1, hy, z); arm.rotation.z = 0.05;
    disp.add(arm, new THREE.Mesh(new THREE.SphereGeometry(0.0045, 10, 8), steel).translateX(dx + 0.2).translateY(hy + 0.01).translateZ(z));
    const faceH = h - 0.035;
    const face = new THREE.MeshStandardMaterial({ map: bmaBagTex(kg, w, faceH), roughness: 0.55 });
    const film = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.55 });
    const bodyG = new THREE.BoxGeometry(0.0008, faceH, w), faceG = new THREE.PlaneGeometry(w, faceH).rotateY(Math.PI / 2);
    const hdr = new THREE.Shape(); hdr.moveTo(-w / 2, -0.0175); hdr.lineTo(w / 2, -0.0175); hdr.lineTo(w / 2, 0.0175); hdr.lineTo(-w / 2, 0.0175); hdr.closePath();
    const slot = new THREE.Path(); slot.absellipse(0, 0, 0.013, 0.0055, 0, Math.PI * 2, true); hdr.holes.push(slot);
    const hdrG = new THREE.ExtrudeGeometry(hdr, { depth: 0.0012, bevelEnabled: false }).rotateY(Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const bx = dx + 0.025 + i * 0.0022, bag = new THREE.Group();
      bag.position.set(bx, hy + (bx - dx) * 0.05, z);
      bag.rotation.x = (rnd2() - 0.5) * 0.03; bag.rotation.z = -0.012 - rnd2() * 0.01;
      const b = new THREE.Mesh(bodyG, film); b.position.y = -0.0175 - faceH / 2;
      const f = new THREE.Mesh(faceG, face); f.position.set(0.001, b.position.y, 0);
      bag.add(new THREE.Mesh(hdrG, film), b, f);
      disp.add(bag);
    }
  }
  const lf = canvasTex(300, 420, (ctx, w, h) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1f7a3a'; ctx.fillRect(0, 0, w, h * 0.22);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, 'กทม.', w / 2, h * 0.11, w * 0.8, h * 0.14, 700);
    ctx.fillStyle = '#1d2228';
    fitText(ctx, 'ปุ๋ยหมักจากเศษอาหาร', w / 2, h * 0.32, w * 0.9, h * 0.07, 600);
    ['ถุง 1 / 5 / 10 กก.', 'ซื้อได้ที่ร้านฝั่งตรงข้าม', 'เขียนชื่อร้าน · บ้านเลขที่', 'บนถุงก่อนรับปุ๋ย'].forEach((s, i) => fitText(ctx, s, w / 2, h * (0.46 + i * 0.1), w * 0.86, h * 0.05, 400));
    ctx.fillStyle = '#f3c200'; ctx.fillRect(0, h * 0.9, w, h * 0.1);
  });
  const boxZ = 0.31, boxY = dY0 + dHt - 0.2;
  const acrylic = new THREE.MeshStandardMaterial({ color: 0xe6f0f5, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false });
  const leaflet = new THREE.Mesh(new THREE.PlaneGeometry(0.105, 0.148), new THREE.MeshStandardMaterial({ map: lf.tex, roughness: 0.6 }));
  leaflet.rotation.y = Math.PI / 2; leaflet.position.set(dx + 0.012, boxY, boxZ - 0.03);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.1), acrylic);
  front.rotation.y = Math.PI / 2; front.position.set(dx + 0.03, boxY - 0.03, boxZ - 0.03);
  front.userData.noMerge = true;
  disp.add(leaflet, front);
  for (const s of [-1, 1]) disp.add(rbox(0.03, 0.1, 0.003, acrylic, dx + 0.016, boxY - 0.03, boxZ - 0.03 + s * 0.0575, 0.001));
  tag(disp, 'compostBag');
  group.add(disp);

  /* ---------- numbered callouts for the cutaway (legend lists them with real specs) ---------- */
  const PARTS = [];
  const callout = (name, spec, x, y, z) => {
    const n = PARTS.length + 1;
    PARTS.push({ n, name, spec });
    const el = document.createElement('div');
    el.className = 'dim hw callout';
    el.textContent = String(n);
    el.title = `${name} — ${spec}`;
    const o = new CSS2DObject(el);
    o.position.set(x, y, z);
    o.visible = false;
    group.add(o);
    callouts.push(o);
  };
  callout('ห้องหมักรูปตัว U', `SUS304 หนา 3 มม. · r 290 × ยาว 800 มม. · ~${C.capacityL} L`, -0.2, T.y0 + 0.12, dz + 0.05);
  callout('แผ่นฮีตเตอร์ซิลิโคน + ฉนวน', '1.5 kW คุม 55–65°C · ร็อกวูล 40 มม. · หุ้มแผ่น 1 มม.', -0.25, T.y0 - T.r - 0.02, dz + 0.02);
  callout('แกนกวน + ใบไถ 7 ใบ', 'เพลา Ø50 SUS304 · 2 รอบ/นาที กลับทิศทุก 60 วิ', 0.05, T.y0 + 0.02, dz + 0.02);
  callout('ลูกปืนตุ๊กตา UCP210', 'รูเพลา 50 มม. · สูงศูนย์ 57.2 มม. · อัดจาระบี', bxL, T.y0 + 0.07, dz + 0.06);
  callout('โซ่ส่งกำลัง #50', `เฟือง 36T / 12T · ระยะห่างศูนย์ ${(centre * 1000).toFixed(0)} มม. · ${links} ข้อ`, driveX, T.y0 - centre / 2, dz + 0.1);
  callout('มอเตอร์เกียร์หนอน 0.4 kW', 'ขาออก 6 รอบ/นาที → ใบกวน 2 รอบ/นาที', 0.455, ys - 0.07, dz + 0.2);
  callout('เครื่องย่อย 2 แกน', 'ใบมีดตะขอ 30 ชุด หนา 10 มม. · 25 รอบ/นาที หมุนสวน', -0.05, shY + 0.07, dz + 0.08);
  callout('มอเตอร์เครื่องย่อย 0.75 kW', 'เกียร์ในตัว + เฟืองซิงก์ m4 z23', 0.42, shY + 0.07, dz + aA);
  callout('โหลดเซลล์ 4 ตัว', 'แบบ shear beam 100 กก./ตัว · ชั่งน้ำหนักในถังตลอดเวลา', T.xR - 0.12, 0.65, dz + 0.36);
  callout('ประตูปล่อยปุ๋ย', 'ใบมีดเลื่อน + แอคชูเอเตอร์ 24 V · เปิดเมื่อดึงลิ้นชัก', 0.1, shelfY + 0.05, dz + 0.15);
  callout('ปั๊มลมเติมอากาศ', 'side-channel 40 W · เป่าเข้ากองหมัก', blX, blY + 0.08, blZ + 0.04);
  callout('ฟิลเตอร์คาร์บอนดับกลิ่น', 'Ø140 × 220 มม. → พัดลม 120 มม. ออกช่องระบายขวา', fX, fY1 + 0.03, fZ + 0.05);
  callout('ตู้ไฟฟ้า', 'RCBO · MCB · คอนแทกเตอร์ · VFD · SSR · PLC · 24 V', ep.position.x, ep.position.y + 0.14, ep.position.z + 0.06);
  callout('ท่อระบายน้ำชะ', 'DN20 + บอลวาล์วทองเหลืองด้านหลัง', drX, shelfY + 0.06, dz + 0.02);

  /* ---------- merge static meshes ---------- */
  tag(inside, 'composterInside');
  for (const o of [hatch]) tag(o, 'hatch');
  tag(drawer, 'drawer');
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.part ??= 'composter'; } });
  startBtn.userData.part = stopBtn.userData.part = 'composterStart';
  estop.userData.part = 'estop';
  const animated = [rotor, drive, gate, fanParts.group, ep, ...shredders];
  const keepInside = (n) => animated.includes(n) || cutHide.includes(n);
  mergeStatic(inside, keepInside);
  for (const s of shredders) mergeStatic(s);
  mergeStatic(rotor);
  mergeStatic(group, (n) => [hatch, drawer, door, rear, consoleOuter, inside, disp].includes(n));
  mergeStatic(disp);

  /* ---------- state ---------- */
  let running = false, cutaway = false, clock = 0, chainS = 0, dirT = 0, dir = 1;
  function drawScreen() {
    const ctx = screen.canvas.getContext('2d'), w = 800, h = 480;
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1f7a3a'; ctx.fillRect(0, 0, w, 64);
    ctx.fillStyle = '#fff'; ctx.font = `600 34px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('กทม. · เครื่องหมักปุ๋ย 200 L', 24, 33);
    ctx.textAlign = 'right'; ctx.fillText(running ? 'อัตโนมัติ' : 'พร้อม', w - 24, 33);
    const tiles = [['อุณหภูมิ', running ? '58.4 °C' : '31.0 °C'], ['ความชื้น', '55 %'], ['น้ำหนักในถัง', '68.2 กก.'], ['ใบกวน', running ? `${dir > 0 ? '▶' : '◀'} 2.0 rpm` : 'หยุด']];
    tiles.forEach(([k, v], i) => {
      const x = 24 + (i % 2) * 388, y = 88 + Math.floor(i / 2) * 150;
      ctx.fillStyle = '#16213a'; ctx.fillRect(x, y, 364, 130);
      ctx.textAlign = 'left'; ctx.fillStyle = '#9fb3c8'; ctx.font = `500 26px ${FONT}`; ctx.fillText(k, x + 18, y + 32);
      ctx.fillStyle = running && i === 0 ? '#fb923c' : '#e6edf3'; ctx.font = `700 52px ${FONT}`; ctx.fillText(v, x + 18, y + 88);
    });
    ctx.fillStyle = running ? '#22c55e' : '#64748b'; ctx.fillRect(24, 400, 752, 56);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `600 30px ${FONT}`;
    ctx.fillText(running ? 'กำลังหมัก · ปุ๋ยพร้อมในอีก 18 ชม.' : 'เปิดฝาบน เทเศษอาหาร แล้วกดเริ่ม', w / 2, 428);
    screen.tex.needsUpdate = true;
  }
  drawScreen();
  function layChain() {
    chain.update(chainS);
    sprocketA.rotation.z = path.phase1(chainS);
    sprocketB.rotation.z = path.phase2(chainS);
    rotor.rotation.x = -chainS / path.k1;            // shaft turns with the big sprocket (local +Z = world -X)
  }
  layChain();

  function setCutaway(v) {
    cutaway = v;
    cutHide.forEach((m) => (m.visible = !v));
    door.userData.target = v ? 1 : 0;
    consoleOuter.userData.target = v ? 1 : 0;
    epDoor.userData.target = v ? 1 : 0;
    callouts.forEach((l) => (l.visible = v));
  }
  const ease = (u, dt, k) => { if (Math.abs(u.target - u.open) <= 1e-4) return false; u.open += (u.target - u.open) * Math.min(1, dt * k); if (Math.abs(u.target - u.open) <= 1e-4) u.open = u.target; return true; };

  return {
    group,
    startButton: startBtn,
    parts: PARTS,
    // inspection cameras in composter-local coordinates [position, target]
    views: {
      chamber: [[0.0, 1.05, 1.05], [-0.05, 0.66, -0.05]],
      drive: [[0.12, 0.8, 1.45], [0.48, 0.56, -0.02]],
      shredder: [[0.05, 1.22, 1.0], [0.0, 0.98, -0.02]],
      electrical: [[-0.3, 1.0, 0.95], [-0.46, 1.06, 0.0]],
      air: [[0.2, 1.35, 0.95], [0.45, 1.02, -0.25]],
      back: [[0.4, 0.9, -1.9], [0.0, 0.6, 0.0]],
      bags: [[1.45, 0.85, 0.35], [0.62, 0.6, 0.0]],
    },
    setRunning(v) { running = v; ledRun.emissiveIntensity = v ? 2 : 0; drawScreen(); },
    isRunning: () => running,
    isHatchOpen: () => !!hatch.userData.target,
    setCutaway,
    isCutaway: () => cutaway,
    toggleHatch() { hatch.userData.target = hatch.userData.target ? 0 : 1; },
    isDrawerOpen: () => !!drawer.userData.target,
    toggleDrawer() { drawer.userData.target = drawer.userData.target ? 0 : 1; },
    toggleDoor() { door.userData.target = door.userData.target ? 0 : 1; },
    toggleRear() { rear.userData.target = rear.userData.target ? 0 : 1; },
    isRearOpen: () => !!rear.userData.target,
    setRearOpen(v) { rear.userData.target = v ? 1 : 0; },
    // returns 2 = geometry moved (shadows need update), 1 = repaint only, 0 = idle
    update(dt) {
      let res = 0;
      if (ease(hatch.userData, dt, 6)) { hatch.rotation.x = -hatch.userData.open * 1.75; res = 2; }
      if (ease(drawer.userData, dt, 5)) { drawer.position.z = drawerZ + drawer.userData.open * DRAWER_TRAVEL; res = 2; }
      if (ease(door.userData, dt, 4)) { door.rotation.y = -door.userData.open * 1.75; res = 2; }
      if (ease(rear.userData, dt, 4)) { rear.rotation.y = -rear.userData.open * 1.75; res = 2; }
      if (ease(consoleOuter.userData, dt, 4)) { consoleOuter.rotation.x = -consoleOuter.userData.open * 1.85; res = 2; }
      if (ease(epDoor.userData, dt, 4)) { epDoor.rotation.y = -epDoor.userData.open * 1.7; res = 2; }
      const gz = dz + drawer.userData.open * 0.13;    // knife gate rides the actuator open with the drawer
      if (gate.position.z !== gz) { gate.position.z = gz; actRod.position.z = dz + 0.1 + drawer.userData.open * 0.13; res = Math.max(res, 2); }
      const heat = running ? 0.9 : 0;
      if (heatMat.emissiveIntensity !== heat) { heatMat.emissiveIntensity = heat; ledHeat.emissiveIntensity = heat * 1.5; res = Math.max(res, 1); }
      // the shredder only runs with the hatch shut (interlock)
      const shredOn = running && hatch.userData.open < 0.01;
      if (running) {
        clock += dt; dirT += dt;
        if (dirT > 60) { dirT = 0; dir = -dir; drawScreen(); }   // mixer reverses every 60 s
        // real speeds: mixer 2 rpm (chain speed = ω · pitch length per radian), fan ~2800 rpm (shown slower)
        chainS += dir * (2 * Math.PI * 2 / 60) * path.k1 * dt;
        layChain();
        fan.rotation.z += dt * 30;
        if (cutaway) res = Math.max(res, 1);
      }
      if (shredOn) {
        const w = (2 * Math.PI * 25) / 60;
        shredders[0].rotation.x += w * dt; shredders[1].rotation.x -= w * dt;
      }
      return res;
    },
  };
}
