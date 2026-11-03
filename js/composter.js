import * as THREE from 'three';
import { rbox } from './geom.js';
import { makeBrushedTexture } from './textures.js';

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
  const W = C.width, Dd = C.depth, H = C.height, t = 0.012, foot = 0.05;
  const group = new THREE.Group();
  group.name = 'composter';

  const brushed = makeBrushedTexture(renderer);
  const ss = new THREE.MeshStandardMaterial({ color: 0xc3c8cd, metalness: 0.85, roughness: 0.32, roughnessMap: brushed });
  const ssDark = new THREE.MeshStandardMaterial({ color: 0x8e959b, metalness: 0.8, roughness: 0.4 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.6 });
  const frontMat = new THREE.MeshStandardMaterial({ color: 0xc3c8cd, metalness: 0.85, roughness: 0.32, roughnessMap: brushed, transparent: true, opacity: 1 });

  // leveling feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - 0.06), z = sz * (Dd / 2 - 0.06);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, foot, 12), ssDark);
    stem.position.set(x, foot / 2, z);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.012, 20), black);
    pad.position.set(x, 0.006, z);
    group.add(stem, pad);
  }

  // cabinet shell
  const y0 = foot, bodyH = H - foot;
  group.add(rbox(W, t, Dd, ss, 0, y0 + t / 2, 0, 0.004));                          // floor
  group.add(rbox(W, bodyH, t, ss, 0, y0 + bodyH / 2, -Dd / 2 + t / 2, 0.004));     // back
  const sideL = rbox(t, bodyH, Dd, ss, -W / 2 + t / 2, y0 + bodyH / 2, 0, 0.004);
  const sideR = rbox(t, bodyH, Dd, ss, W / 2 - t / 2, y0 + bodyH / 2, 0, 0.004);
  group.add(sideL, sideR);
  // vent slots on the right side
  const ventMat = new THREE.MeshBasicMaterial({ color: 0x15181b });
  for (let i = 0; i < 6; i++) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.014), ventMat);
    v.rotation.y = Math.PI / 2;
    v.position.set(W / 2 + 0.0005, H * 0.62 + i * 0.035, -0.05);
    group.add(v);
  }

  // top with feeding hatch (front half)
  const hatchW = 0.6, hatchD = 0.32, hatchZ = -0.02;   // centred over the drum axis
  const topBackD = Dd - (Dd / 2 - hatchZ + hatchD / 2);
  group.add(rbox(W, t, topBackD, ss, 0, H - t / 2, -Dd / 2 + topBackD / 2, 0.004));
  const frontStrip = Dd / 2 - (hatchZ + hatchD / 2);
  group.add(rbox(W, t, frontStrip, ss, 0, H - t / 2, Dd / 2 - frontStrip / 2, 0.004));
  for (const sx of [-1, 1]) group.add(rbox((W - hatchW) / 2, t, hatchD, ss, sx * (W / 2 - (W - hatchW) / 4), H - t / 2, hatchZ, 0.004));
  // hopper chute down to the drum
  const chuteBottom = C.drum.y + Math.sqrt(C.drum.radius ** 2 - (hatchD / 2) ** 2) - 0.03;
  const chuteH = H - t - chuteBottom;                // reaches into the drum opening
  const chuteWall = new THREE.MeshStandardMaterial({ color: 0x5d646a, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide });
  const open = new THREE.MeshBasicMaterial({ visible: false });
  const chute = new THREE.Mesh(new THREE.BoxGeometry(hatchW - 0.04, chuteH, hatchD - 0.04), [chuteWall, chuteWall, open, open, chuteWall, chuteWall]);
  chute.position.set(0, H - t - chuteH / 2, hatchZ);
  group.add(chute);
  // hatch lid (hinged at its back edge)
  const hatch = new THREE.Group();
  hatch.position.set(0, H, hatchZ - hatchD / 2);
  const lid = rbox(hatchW + 0.02, 0.016, hatchD + 0.02, ss, 0, 0.008, hatchD / 2, 0.005);
  lid.userData.part = 'hatch';
  hatch.add(lid);
  const hh = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.12, 4, 10), ssDark);
  hh.rotation.z = Math.PI / 2;
  hh.position.set(0, 0.03, hatchD - 0.01);
  hatch.add(hh);
  for (const sx of [-1, 1]) hatch.add(rbox(0.012, 0.022, 0.012, ssDark, sx * 0.06, 0.02, hatchD - 0.01, 0.003));
  hatch.userData = { open: 0, target: 0 };
  group.add(hatch);

  // front: control panel (top), branding panel (middle, see-through in cutaway), drawer (bottom)
  const ctrlY0 = H - 0.25, ctrlY1 = H - t, brandY0 = 0.32, brandY1 = ctrlY0, drawerY0 = y0 + t, drawerY1 = 0.32;
  const frontW = W - 2 * t - 0.002;          // front panels fit between the side walls (no shared faces)
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
  group.add(estop);

  const brand = brandingTexture(frontW, brandY1 - brandY0);
  const brandFace = new THREE.MeshStandardMaterial({ map: brand.tex, roughness: 0.55, metalness: 0.1, transparent: true, opacity: 1 });
  const brandPanel = new THREE.Mesh(new THREE.BoxGeometry(frontW, brandY1 - brandY0, t), [frontMat, frontMat, frontMat, frontMat, brandFace, frontMat]);
  brandPanel.position.set(0, (brandY0 + brandY1) / 2, Dd / 2 - t / 2);
  brandPanel.castShadow = true;
  group.add(brandPanel);

  const drawer = new THREE.Group();
  const dH = drawerY1 - drawerY0;
  drawer.add(rbox(frontW - 0.004, dH - 0.008, t, ss, 0, 0, 0, 0.004));
  const dLabel = canvasTex(400, 70, (ctx, w, h) => {
    ctx.fillStyle = '#2b3036'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2f4f6'; ctx.textAlign = 'center'; ctx.font = `600 34px ${FONT}`;
    ctx.fillText('ปุ๋ยพร้อมใช้ · ดึงออก', w / 2, 47);
  });
  const dl = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.063), new THREE.MeshStandardMaterial({ map: dLabel.tex, roughness: 0.6 }));
  dl.position.set(0, 0.04, t / 2 + 0.0005);
  drawer.add(dl);
  const dh = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.44, 4, 10), ssDark);
  dh.rotation.z = Math.PI / 2;
  dh.position.set(0, -0.035, t / 2 + 0.022);
  drawer.add(dh);
  for (const sx of [-1, 1]) drawer.add(rbox(0.016, 0.016, 0.026, ssDark, sx * 0.23, -0.035, t / 2 + 0.01, 0.003));
  // open-top drawer tub behind the front, filled with finished compost
  const tubW = W - 0.08, tubD = Dd - 0.12, tubH = dH - 0.05, tubZ = -tubD / 2 - t / 2, tubY = -dH / 2 + 0.012 + tubH / 2;
  const wall = 0.008;
  drawer.add(rbox(tubW, wall, tubD, ssDark, 0, tubY - tubH / 2 + wall / 2, tubZ, 0.003));                 // floor
  drawer.add(rbox(tubW, tubH, wall, ssDark, 0, tubY, tubZ - tubD / 2 + wall / 2, 0.003));                 // back
  for (const sx of [-1, 1]) drawer.add(rbox(wall, tubH, tubD, ssDark, sx * (tubW / 2 - wall / 2), tubY, tubZ, 0.003));
  const compostMat = new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 1 });
  const fill = rbox(tubW - 2 * wall - 0.004, tubH * 0.6, tubD - wall - 0.004, compostMat, 0, tubY - tubH / 2 + wall + tubH * 0.3, tubZ + wall / 2, 0.02);
  drawer.add(fill);
  const drawerZ = Dd / 2 - t / 2;
  drawer.position.set(0, drawerY0 + dH / 2, drawerZ);
  drawer.traverse((o) => { if (o.isMesh) o.userData.part = 'drawer'; });
  drawer.userData = { open: 0, target: 0 };
  const DRAWER_TRAVEL = 0.5;
  group.add(drawer);

  /* ---------- interior: drum, paddles, heater, motor ---------- */
  const inside = new THREE.Group();
  const R = C.drum.radius, Lg = C.drum.length, dy = C.drum.y, dz = -0.02;
  const capMat = new THREE.MeshStandardMaterial({ color: 0x8e959b, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide });
  const drumMat = new THREE.MeshStandardMaterial({ color: 0xd5d9dd, metalness: 0.9, roughness: 0.25, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Lg, 48, 1, true), drumMat);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0, dy, dz);
  inside.add(drum);
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 48), capMat);   // double-sided: visible through the see-through drum
    cap.rotation.y = sx * Math.PI / 2;
    cap.position.set(sx * Lg / 2, dy, dz);
    inside.add(cap);
  }
  // compost bed (lower ~45 % of the drum)
  const bed = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.004, R - 0.004, Lg - 0.01, 40, 1, false, Math.PI * 0.62, Math.PI * 0.76),
    new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 1 }));
  bed.rotation.z = Math.PI / 2;
  bed.position.set(0, dy, dz);
  inside.add(bed);
  // heater bands around the drum
  const heatMat = new THREE.MeshStandardMaterial({ color: 0x5a2a10, emissive: 0xff5a00, emissiveIntensity: 0, roughness: 0.5 });
  for (const x of [-Lg / 3, 0, Lg / 3]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(R + 0.006, 0.006, 8, 48), heatMat);
    band.rotation.y = Math.PI / 2;
    band.position.set(x, dy, dz);
    inside.add(band);
  }
  // paddle shaft
  const rotor = new THREE.Group();
  rotor.position.set(0, dy, dz);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, Lg + 0.08, 16), ssDark);
  shaft.rotation.z = Math.PI / 2;
  rotor.add(shaft);
  const ARMS = 6;
  for (let i = 0; i < ARMS; i++) {
    const arm = new THREE.Group();
    arm.rotation.x = (i / ARMS) * Math.PI * 2;
    arm.position.x = -Lg * 0.4 + i * (Lg * 0.8 / (ARMS - 1));
    arm.add(rbox(0.012, R - 0.03, 0.012, ssDark, 0, (R - 0.03) / 2, 0, 0.003));
    const blade = rbox(0.1, 0.012, 0.07, ssDark, 0, R - 0.025, 0, 0.003);
    blade.rotation.y = 0.5;
    arm.add(blade);
    rotor.add(arm);
  }
  inside.add(rotor);
  // drum cradle + gear motor on the right
  // shelf separating the drum compartment from the drawer bay, with the drum cradles on top
  const shelfY = drawerY1 + 0.005;
  inside.add(rbox(W - 2 * t, 0.01, Dd - 2 * t, ssDark, 0, shelfY, 0, 0.003));
  const cradleH = dy - R - shelfY - 0.005;
  for (const sx of [-1, 1]) inside.add(rbox(0.04, cradleH, 0.45, ssDark, sx * (Lg / 2 - 0.03), shelfY + 0.005 + cradleH / 2, dz, 0.004));
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.09, 24), new THREE.MeshStandardMaterial({ color: 0x2f5d8a, metalness: 0.4, roughness: 0.45 }));
  motor.rotation.z = Math.PI / 2;
  motor.position.set(Lg / 2 + 0.06, dy, dz);                  // gear motor, inside the cabinet wall
  inside.add(motor);
  inside.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  group.add(inside);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.part ??= 'composter'; } });

  /* ---------- state ---------- */
  let running = false, cutaway = false, clock = 0;
  function drawScreen() {
    const ctx = screen.canvas.getContext('2d');
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, 480, 200);
    ctx.textAlign = 'left';
    ctx.fillStyle = running ? '#22c55e' : '#9aa4ae';
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(running ? 'กำลังหมัก' : 'พร้อมรับเศษอาหาร', 20, 50);
    ctx.fillStyle = '#e6edf3';
    ctx.font = `400 28px ${FONT}`;
    ctx.fillText(running ? 'อุณหภูมิ 58°C · ความชื้น 55%' : 'เปิดฝาด้านบนแล้วเทเศษอาหาร', 20, 105);
    ctx.fillText(running ? 'ปุ๋ยพร้อมในอีก 18 ชม.' : `ความจุ ${C.capacityL} ลิตร`, 20, 155);
    screen.tex.needsUpdate = true;
  }
  drawScreen();

  function setCutaway(v) {
    cutaway = v;
    frontMat.opacity = brandFace.opacity = v ? 0.12 : 1;
    frontMat.depthWrite = brandFace.depthWrite = !v;
    drumMat.opacity = v ? 0.35 : 1;
    drumMat.depthWrite = !v;
  }

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
      const heat = running ? 1.2 : 0;
      if (heatMat.emissiveIntensity !== heat) {
        heatMat.emissiveIntensity = heat; ledHeat.emissiveIntensity = heat * 1.5;
        res = Math.max(res, 1);
      }
      if (running) {
        clock += dt;
        rotor.rotation.x += dt * 1.2;           // slow mixing
        if (cutaway) res = Math.max(res, 1);    // only worth repainting when the inside is visible
      }
      return res;
    },
  };
}
