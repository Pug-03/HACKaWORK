import * as THREE from 'three';
import { rbox, mergeStatic } from './geom.js';
import { makeBrushedTexture } from './textures.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Stand-alone food-waste composter cabinet (separate unit beside the bin station).
// 200 L horizontal stainless drum (~50 kg food waste/day) with a heated jacket and a rotating paddle shaft.
// Food scraps go in through the top hatch; finished compost comes out of the bottom drawer.
export const COMPOSTER = {
  width: 1.2, depth: 0.8, height: 1.2,
  drum: { radius: 0.27, length: 0.9, y: 0.62 },   // pi * 0.27^2 * 0.9 ≈ 206 L gross, 200 L working
  capacityL: 200,
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
  const black = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.6 });
  const frontMat = new THREE.MeshStandardMaterial({ color: 0xc3c8cd, metalness: 0.85, roughness: 0.32, roughnessMap: brushed, transparent: true, opacity: 1 });

  // recessed plinth (kick base) hides the leveling feet, like commercial units
  const rc = 0.045;                                    // corner radius of the cabinet
  group.add(rbox(W - 0.07, foot, Dd - 0.07, black, 0, foot / 2, 0, 0.01));

  // cabinet shell
  const y0 = foot, bodyH = H - foot;
  group.add(rbox(W - 2 * rc, t, Dd - 2 * rc, ss, 0, y0 + t / 2, 0, 0.004));       // floor
  // rounded vertical corners (r = 45 mm) and rounded top edges; flat walls run between them
  const colH = H - rc - y0;
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
  group.add(rbox(W - 2 * rc, wallH, t, ss, 0, y0 + wallH / 2, -Dd / 2 + t / 2, 0.003));     // back
  const sideL = rbox(t, wallH, Dd - 2 * rc, ss, -W / 2 + t / 2, y0 + wallH / 2, 0, 0.003);
  const sideR = rbox(t, wallH, Dd - 2 * rc, ss, W / 2 - t / 2, y0 + wallH / 2, 0, 0.003);
  group.add(sideL, sideR);
  // upper back / side fillers between the top-edge rounds and the walls
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

  // front: control panel (top), branding panel (middle, see-through in cutaway), drawer (bottom)
  const ctrlY0 = H - 0.25, ctrlY1 = H - rc, brandY0 = 0.32, brandY1 = ctrlY0, drawerY0 = y0 + t, drawerY1 = 0.32;
  const frontW = W - 2 * rc - 0.002;         // front panels fit between the rounded corner columns
  const ctrl = rbox(frontW, ctrlY1 - ctrlY0, t, ss, 0, (ctrlY0 + ctrlY1) / 2, Dd / 2 - t / 2, 0.004);
  group.add(ctrl);
  const screen = canvasTex(480, 200, () => {});
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.15), new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false }));
  screenMesh.position.set(-0.3, (ctrlY0 + ctrlY1) / 2, Dd / 2 + 0.002);   // in front of the bezel
  group.add(screenMesh);
  group.add(rbox(0.38, 0.17, 0.006, black, -0.3, (ctrlY0 + ctrlY1) / 2, Dd / 2 - 0.002, 0.004));   // bezel
  const ledRun = new THREE.MeshStandardMaterial({ color: 0x1b5e20, emissive: 0x22c55e, emissiveIntensity: 0 });
  const ledHeat = new THREE.MeshStandardMaterial({ color: 0x7a3b00, emissive: 0xff7a00, emissiveIntensity: 0 });
  [[ledRun, 0.05], [ledHeat, 0.1]].forEach(([m, x]) => {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), m);
    led.position.set(x, (ctrlY0 + ctrlY1) / 2 + 0.03, Dd / 2 + 0.002);
    group.add(led);
  });
  const startBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.014, 24), new THREE.MeshStandardMaterial({ color: 0x1f8a3a, roughness: 0.4 }));
  startBtn.rotation.x = Math.PI / 2;
  startBtn.position.set(0.25, (ctrlY0 + ctrlY1) / 2, Dd / 2 + 0.007);
  startBtn.userData.part = 'composterStart';
  group.add(startBtn);
  const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.018, 24), new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.4 }));
  estop.rotation.x = Math.PI / 2;
  estop.position.set(0.42, (ctrlY0 + ctrlY1) / 2, Dd / 2 + 0.009);
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

  /* ---------- interior: in-vessel composting mechanism ----------
     Drum axis runs along X. In cutaway mode the cabinet front and the drum's front half are
     removed so the mechanism is visible (no transparency). */
  const inside = new THREE.Group();
  const R = C.drum.radius, Lg = C.drum.length, dy = C.drum.y, dz = -0.02;
  const steelIn = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x8e959b, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide });
  const drumMat = steelIn;   // kept for compatibility with older code paths
  const along = (m) => { m.rotation.z = Math.PI / 2; m.position.set(0, dy, dz); return m; };   // cylinder axis -> X
  // drum shell in two halves (theta 0 = front / +Z)
  const drumBack = along(new THREE.Mesh(new THREE.CylinderGeometry(R, R, Lg, 48, 1, true, Math.PI / 2, Math.PI), steelIn));
  const drumFront = along(new THREE.Mesh(new THREE.CylinderGeometry(R, R, Lg, 48, 1, true, -Math.PI / 2, Math.PI), steelIn));
  inside.add(drumBack, drumFront);
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 48), capMat);
    cap.rotation.y = sx * Math.PI / 2;
    cap.position.set(sx * Lg / 2, dy, dz);
    inside.add(cap);
    const flange = new THREE.Mesh(new THREE.TorusGeometry(R, 0.01, 8, 48), capMat);
    flange.rotation.y = Math.PI / 2;
    flange.position.set(sx * Lg / 2, dy, dz);
    inside.add(flange);
  }
  // heater pads wrapped round the lower half + insulation blanket behind
  const heatMat = new THREE.MeshStandardMaterial({ color: 0x6b2a12, emissive: 0xff5a00, emissiveIntensity: 0, roughness: 0.6, side: THREE.DoubleSide });
  inside.add(along(new THREE.Mesh(new THREE.CylinderGeometry(R + 0.005, R + 0.005, Lg - 0.08, 40, 1, true, Math.PI * 1.2, Math.PI * 0.6), heatMat)));
  const insul = new THREE.MeshStandardMaterial({ color: 0x55595e, roughness: 0.95, side: THREE.DoubleSide });
  inside.add(along(new THREE.Mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, Lg - 0.02, 40, 1, true, Math.PI / 2, Math.PI), insul)));
  // compost bed: solid circular segment filling ~45 % of the drum
  {
    const r = R - 0.006, c = -R * 0.12, a = Math.asin(c / r);
    const sh = new THREE.Shape();
    sh.absarc(0, 0, r, Math.PI - a, 2 * Math.PI + a, false);
    sh.closePath();
    const depth = Lg - 0.02;
    const bedGeo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 32 });
    const bed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 1 }));
    bed.rotation.y = Math.PI / 2;
    bed.position.set(-depth / 2, dy, dz);
    inside.add(bed);
  }
  // rotor: shaft + double helical ribbon on spokes (ribbon mixer), turns slowly and reverses
  const rotor = new THREE.Group();
  rotor.position.set(0, dy, dz);
  const shaftLen = Lg + 0.26;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, shaftLen, 16), steelIn);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 0.04;
  rotor.add(shaft);
  const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.85, roughness: 0.35 });
  for (const [rh, phase] of [[R - 0.035, 0], [R * 0.55, Math.PI]]) {
    const turns = 1.5, len = Lg * 0.88;
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const u = i / 120, ang = phase + u * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(-len / 2 + u * len, Math.cos(ang) * rh, Math.sin(ang) * rh));
    }
    const ribbon = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.009, 8, false), ribbonMat);
    ribbon.scale.set(1, 1, 1);
    rotor.add(ribbon);
    // spokes tying the ribbon to the shaft every half turn
    for (let k = 0; k <= turns * 2; k++) {
      const u = k / (turns * 2), ang = phase + u * turns * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, rh, 8), ribbonMat);
      spoke.position.set(-len / 2 + u * len, Math.cos(ang) * rh / 2, Math.sin(ang) * rh / 2);
      spoke.rotation.x = ang;
      rotor.add(spoke);
    }
  }
  inside.add(rotor);
  // shelf over the drawer bay, with the discharge opening under the drum
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
  // discharge slide gate (opens when the drawer is pulled out) and short chute
  const gate = rbox(0.34, 0.008, 0.16, ssDark, 0, dy - R - 0.012, dz, 0.003);
  inside.add(gate);
  for (const sx of [-1, 1]) inside.add(rbox(0.008, dy - R - shelfY, 0.16, ssDark, sx * 0.165, (dy - R + shelfY) / 2, dz, 0.002));
  // pillow-block bearings on stands
  const bearingMat = new THREE.MeshStandardMaterial({ color: 0x2f3b4a, metalness: 0.5, roughness: 0.45 });
  for (const sx of [-1, 1]) {
    const bx = sx * (Lg / 2 + 0.045);
    inside.add(rbox(0.05, 0.07, 0.11, bearingMat, bx, dy, dz, 0.008));
    inside.add(rbox(0.04, dy - 0.035 - shelfY, 0.08, ssDark, bx, (dy - 0.035 + shelfY) / 2, dz, 0.004));
  }
  // chain drive: big sprocket on the shaft, gear motor below, roller chain loop
  const sprocketMat = new THREE.MeshStandardMaterial({ color: 0x6b7178, metalness: 0.9, roughness: 0.3 });
  const sx = Lg / 2 + 0.12, motorY = dy - 0.19, r1 = 0.07, r2 = 0.035;
  const disc = (r, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 36), mat); m.rotation.z = Math.PI / 2; return m; };
  const sprocketA = new THREE.Group();
  sprocketA.position.set(sx, dy, dz);
  sprocketA.add(disc(r1, sprocketMat));
  for (let i = 0; i < 18; i++) {
    const tooth = rbox(0.012, 0.014, 0.01, sprocketMat, 0, Math.cos((i / 18) * Math.PI * 2) * (r1 + 0.005), Math.sin((i / 18) * Math.PI * 2) * (r1 + 0.005), 0.002);
    tooth.rotation.x = -(i / 18) * Math.PI * 2;
    sprocketA.add(tooth);
  }
  inside.add(sprocketA);
  const sprocketB = new THREE.Group();
  sprocketB.position.set(sx, motorY, dz);
  sprocketB.add(disc(r2, sprocketMat));
  inside.add(sprocketB);
  {
    // chain path: top arc round A, straight down, bottom arc round B, straight up (in the YZ plane)
    const pts = [], seg = 24, dyAB = dy - motorY, ang = Math.asin((r1 - r2) / dyAB);
    for (let i = 0; i <= seg; i++) { const a = -ang + (i / seg) * (Math.PI + 2 * ang); pts.push(new THREE.Vector3(sx, dy + Math.sin(a) * r1, dz + Math.cos(a) * r1)); }
    for (let i = 0; i <= seg; i++) { const a = Math.PI + ang + (i / seg) * (Math.PI - 2 * ang); pts.push(new THREE.Vector3(sx, motorY + Math.sin(a) * r2, dz + Math.cos(a) * r2)); }
    const chain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 120, 0.005, 6, true), new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.7, roughness: 0.4 }));
    inside.add(chain);
  }
  const motorMat = new THREE.MeshStandardMaterial({ color: 0x2f5d8a, metalness: 0.4, roughness: 0.45 });
  inside.add(rbox(0.07, 0.09, 0.09, motorMat, sx - 0.045, motorY, dz, 0.01));                  // gearbox
  const motorCan = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 24), motorMat);
  motorCan.rotation.x = Math.PI / 2;
  motorCan.position.set(sx - 0.045, motorY, dz - 0.12);
  inside.add(motorCan);
  // exhaust: drum vent stub -> activated-carbon filter -> fan behind the side louvres
  const ductMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a7, metalness: 0.6, roughness: 0.45 });
  const filterX = -0.42, filterZ = -0.26, filterY = 0.98;
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 24), new THREE.MeshStandardMaterial({ color: 0x1f2326, roughness: 0.7 }));
  filter.position.set(filterX, filterY, filterZ);
  inside.add(filter);
  const fanX = W / 2 - t - 0.05, fanY = H * 0.62 + 0.09, fanZ = -0.05;
  const duct = (pts) => inside.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 64, 0.022, 12, false), ductMat));
  duct([new THREE.Vector3(-0.38, dy + R - 0.01, dz), new THREE.Vector3(-0.38, dy + R + 0.08, dz), new THREE.Vector3(filterX, filterY - 0.14, filterZ + 0.05), new THREE.Vector3(filterX, filterY - 0.11, filterZ)]);
  duct([new THREE.Vector3(filterX, filterY + 0.11, filterZ), new THREE.Vector3(filterX + 0.05, filterY + 0.15, filterZ), new THREE.Vector3(0.0, filterY + 0.16, filterZ), new THREE.Vector3(fanX - 0.06, fanY + 0.05, fanZ - 0.1), new THREE.Vector3(fanX - 0.03, fanY, fanZ)]);
  const fanRing = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.01, 8, 32), ductMat);
  fanRing.rotation.y = Math.PI / 2;
  fanRing.position.set(fanX, fanY, fanZ);
  inside.add(fanRing);
  const fan = new THREE.Group();
  fan.position.set(fanX, fanY, fanZ);
  for (let i = 0; i < 5; i++) {
    const blade = rbox(0.004, 0.06, 0.03, new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.5 }), 0, 0.035, 0, 0.002);
    const holder = new THREE.Group();
    holder.rotation.x = (i / 5) * Math.PI * 2;
    blade.rotation.y = 0.4;
    holder.add(blade);
    fan.add(holder);
  }
  inside.add(fan);
  // temperature / moisture probe through the drum top
  const probeX = 0.2;
  const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 10), sprocketMat);
  probe.position.set(probeX, dy + R - 0.02, dz - 0.12);
  inside.add(probe);
  inside.add(rbox(0.04, 0.03, 0.04, new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 }), probeX, dy + R + 0.09, dz - 0.12, 0.006));
  // PLC / control box on the back wall
  const plc = new THREE.Group();
  plc.position.set(0.25, 1.03, -Dd / 2 + t + 0.045);
  plc.add(rbox(0.26, 0.16, 0.08, new THREE.MeshStandardMaterial({ color: 0xd4d7da, roughness: 0.6 }), 0, 0, 0, 0.006));
  const din = [[0x2f6f3e, 0.05], [0x1f2937, 0.03], [0x1f2937, 0.03], [0xd97706, 0.025], [0x334155, 0.04]];
  let xx = -0.1;
  for (const [c, w] of din) { plc.add(rbox(w, 0.09, 0.03, new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), xx + w / 2, 0, 0.05, 0.002)); xx += w + 0.006; }
  inside.add(plc);

  inside.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  group.add(inside);

  // labels for the cutaway view
  const cutLabels = [];
  const cutLabel = (text, x, y, z) => {
    const el = document.createElement('div');
    el.className = 'dim hw';
    el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.set(x, y, z);
    o.visible = false;
    group.add(o);
    cutLabels.push(o);
  };
  cutLabel(`ถังหมักสแตนเลส ${C.capacityL} ลิตร`, -0.25, dy + R + 0.03, dz + 0.1);
  cutLabel('ใบกวนเกลียวริบบอน (หมุนสลับทิศ)', 0.05, dy + 0.02, dz + 0.2);
  cutLabel('แผ่นฮีตเตอร์ 55–65°C + ฉนวน', -0.1, dy - R + 0.02, dz + 0.2);
  cutLabel('มอเตอร์เกียร์ + โซ่ขับ', sx - 0.05, motorY - 0.06, dz + 0.1);
  cutLabel('ตลับลูกปืน', -(Lg / 2 + 0.045), dy + 0.06, dz + 0.05);
  cutLabel('ฟิลเตอร์คาร์บอนดับกลิ่น', filterX, filterY + 0.14, filterZ + 0.1);
  cutLabel('พัดลมดูดอากาศ', fanX - 0.05, fanY - 0.1, fanZ + 0.05);
  cutLabel('หัววัดอุณหภูมิ/ความชื้น', probeX, dy + R + 0.12, dz - 0.08);
  cutLabel('ตู้ควบคุม PLC', 0.25, 1.13, -Dd / 2 + 0.1);
  cutLabel('ปล่องเติมเศษอาหาร (จากฝาด้านบน)', 0, H - 0.2, hatchZ + 0.1);
  cutLabel('ประตูปล่อยปุ๋ยลงลิ้นชัก', 0.22, dy - R - 0.05, dz + 0.16);
  // the control-panel strip also comes off in cutaway so the PLC and carbon filter behind it show
  const frontTop = group.children.filter((o) => o !== inside && o.position.y >= ctrlY0 - 0.02 && o.position.z >= Dd / 2 - t - 0.002);
  // sloped control console: the whole control strip leans back 18° about its bottom edge
  const consolePivot = new THREE.Group();
  consolePivot.position.set(0, ctrlY0, Dd / 2);
  group.add(consolePivot);
  frontTop.forEach((o) => consolePivot.attach(o));
  consolePivot.rotation.x = -0.31;
  // side cheeks closing the wedge between the sloped console and the corner columns
  for (const sx of [-1, 1]) {
    const cheek = new THREE.Shape();
    const hgt = ctrlY1 - ctrlY0, back = hgt * Math.sin(0.31);
    cheek.moveTo(0, 0); cheek.lineTo(0, hgt * Math.cos(0.31)); cheek.lineTo(-back, hgt * Math.cos(0.31)); cheek.closePath();
    const g = new THREE.Mesh(new THREE.ExtrudeGeometry(cheek, { depth: 0.006, bevelEnabled: false }), ss);
    g.rotation.y = -Math.PI / 2;
    g.position.set(sx * (frontW / 2 + 0.003) + 0.003, ctrlY0, Dd / 2);
    group.add(g);
  }

  /* ---------- merge static meshes ---------- */
  tag(inside, 'composterInside');
  for (const o of [hatch]) tag(o, 'hatch');
  tag(drawer, 'drawer');
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.part ??= 'composter'; } });

  mergeStatic(inside, (n) => [rotor, sprocketA, sprocketB, fan, gate, drumFront].includes(n));
  mergeStatic(group, (n) => [hatch, drawer, consolePivot, brandPanel, inside].includes(n));

  /* ---------- state ---------- */
  let running = false, cutaway = false, clock = 0;
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

  // cutaway = remove the branding panel and the drum's front half (no transparency, so AO stays clean)
  function setCutaway(v) {
    cutaway = v;
    brandPanel.visible = !v;
    consolePivot.visible = !v;
    drumFront.visible = !v;
    cutLabels.forEach((l) => (l.visible = v));
  }
  const ease = (u, dt, k) => { if (Math.abs(u.target - u.open) <= 1e-4) return false; u.open += (u.target - u.open) * Math.min(1, dt * k); if (Math.abs(u.target - u.open) <= 1e-4) u.open = u.target; return true; };

  return {
    group,
    startButton: startBtn,
    setRunning(v) { running = v; ledRun.emissiveIntensity = v ? 2 : 0; drawScreen(); },
    isRunning: () => running,
    isHatchOpen: () => !!hatch.userData.target,
    setCutaway,
    toggleHatch() { hatch.userData.target = hatch.userData.target ? 0 : 1; },
    isDrawerOpen: () => !!drawer.userData.target,
    toggleDrawer() { drawer.userData.target = drawer.userData.target ? 0 : 1; },
    // returns 2 = geometry moved (shadows need update), 1 = repaint only, 0 = idle
    update(dt) {
      let res = 0;
      const u = hatch.userData;
      if (Math.abs(u.target - u.open) > 1e-4) {
        u.open += (u.target - u.open) * Math.min(1, dt * 6);
        if (Math.abs(u.target - u.open) <= 1e-4) u.open = u.target;
        hatch.rotation.x = -u.open * 1.7;
        res = 2;
      }
      const d = drawer.userData;
      if (Math.abs(d.target - d.open) > 1e-4) {
        d.open += (d.target - d.open) * Math.min(1, dt * 5);
        if (Math.abs(d.target - d.open) <= 1e-4) d.open = d.target;
        drawer.position.z = drawerZ + d.open * DRAWER_TRAVEL;
        res = 2;
      }
      const gz = dz + d.open * 0.16;                 // discharge gate slides open with the drawer
      if (gate.position.z !== gz) { gate.position.z = gz; res = Math.max(res, 2); }
      const heat = running ? 0.9 : 0;
      if (heatMat.emissiveIntensity !== heat) {
        heatMat.emissiveIntensity = heat; ledHeat.emissiveIntensity = heat * 1.5;
        res = Math.max(res, 1);
      }
      if (running) {
        clock += dt;
        // slow mixing that reverses every ~10 s (like real in-vessel composters)
        const w = 0.9 * Math.sign(Math.sin(clock * 0.3) || 1);
        rotor.rotation.x += w * dt;
        sprocketA.rotation.x += w * dt;
        sprocketB.rotation.x += w * dt * (r1 / r2);
        fan.rotation.x += dt * 25;
        if (cutaway) res = Math.max(res, 1);    // only worth repainting when the inside is visible
      }
      return res;
    },
  };
}
