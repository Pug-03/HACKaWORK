import * as THREE from 'three';
import { rbox } from './geom.js';
import { makeBrushedTexture } from './textures.js';

// Stand-alone food-waste composter cabinet (separate unit beside the bin station).
// 40 L horizontal stainless drum with a heated jacket and a rotating paddle shaft.
// Food scraps go in through the top hatch; finished compost comes out of the bottom drawer.
export const COMPOSTER = {
  width: 0.6, depth: 0.56, height: 1.0,
  drum: { radius: 0.17, length: 0.46, y: 0.5 },   // pi * 0.17^2 * 0.46 ≈ 42 L gross, 40 L working
  capacityL: 40,
  dailyKg: 10,                                     // realistic intake for a 40 L drum on a 24 h cycle
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

function brandingTexture() {
  return canvasTex(840, 690, (ctx, w, h) => {
    ctx.fillStyle = '#eef1f3'; ctx.fillRect(0, 0, w, h);
    // header band
    ctx.fillStyle = '#1f7a3a'; ctx.fillRect(0, 0, w, 210);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.font = `700 140px ${FONT}`; ctx.fillText('กทม.', w / 2, 160);
    ctx.fillStyle = '#1d2228';
    ctx.font = `600 54px ${FONT}`; ctx.fillText('เครื่องหมักปุ๋ยจากเศษอาหาร', w / 2, 290);
    ctx.fillStyle = '#5b646e';
    ctx.font = `500 30px ${FONT}`; ctx.fillText(`FOOD WASTE COMPOSTER · ${COMPOSTER.capacityL} L`, w / 2, 336);
    // rules
    ctx.strokeStyle = '#cfd5da'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(60, 372); ctx.lineTo(w - 60, 372); ctx.stroke();
    ctx.fillStyle = '#2f3a44';
    ctx.font = `500 32px ${FONT}`;
    ctx.fillText('รับเฉพาะเศษอาหาร · ไม่รับพลาสติก แก้ว โลหะ', w / 2, 422);
    ctx.font = `400 28px ${FONT}`;
    ctx.fillText(`รับได้ประมาณ ${COMPOSTER.dailyKg} กก./วัน`, w / 2, 466);
    // order box
    ctx.fillStyle = '#f3c200'; ctx.fillRect(50, 510, w - 100, 150);
    ctx.fillStyle = '#1d2228';
    ctx.font = `600 36px ${FONT}`; ctx.fillText('ติดต่อซื้อ-ขายปุ๋ยกับ กทม.', w / 2, 562);
    ctx.font = `700 64px ${FONT}`; ctx.fillText(`โทร. ${COMPOSTER.phone}`, w / 2, 634);
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
    const v = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.012), ventMat);
    v.rotation.y = Math.PI / 2;
    v.position.set(W / 2 + 0.0005, 0.62 + i * 0.03, -0.05);
    group.add(v);
  }

  // top with feeding hatch (front half)
  const hatchW = 0.4, hatchD = 0.22, hatchZ = -0.02;   // centred over the drum axis
  const topBackD = Dd - (Dd / 2 - hatchZ + hatchD / 2);
  group.add(rbox(W, t, topBackD, ss, 0, H - t / 2, -Dd / 2 + topBackD / 2, 0.004));
  const frontStrip = Dd / 2 - (hatchZ + hatchD / 2);
  group.add(rbox(W, t, frontStrip, ss, 0, H - t / 2, Dd / 2 - frontStrip / 2, 0.004));
  for (const sx of [-1, 1]) group.add(rbox((W - hatchW) / 2, t, hatchD, ss, sx * (W / 2 - (W - hatchW) / 4), H - t / 2, hatchZ, 0.004));
  // hopper chute down to the drum
  const chuteH = H - t - 0.62;                       // reaches into the drum opening
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
  const ctrlY0 = 0.8, ctrlY1 = H - t, brandY0 = 0.3, brandY1 = 0.8, drawerY0 = y0 + t, drawerY1 = 0.3;
  const ctrl = rbox(W, ctrlY1 - ctrlY0, t, ss, 0, (ctrlY0 + ctrlY1) / 2, Dd / 2 - t / 2, 0.004);
  group.add(ctrl);
  const screen = canvasTex(480, 200, () => {});
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.1), new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false }));
  screenMesh.position.set(-0.1, (ctrlY0 + ctrlY1) / 2, Dd / 2 + 0.002);   // in front of the bezel
  group.add(screenMesh);
  group.add(rbox(0.26, 0.12, 0.006, black, -0.1, (ctrlY0 + ctrlY1) / 2, Dd / 2 - 0.002, 0.004));   // bezel
  const ledRun = new THREE.MeshStandardMaterial({ color: 0x1b5e20, emissive: 0x22c55e, emissiveIntensity: 0 });
  const ledHeat = new THREE.MeshStandardMaterial({ color: 0x7a3b00, emissive: 0xff7a00, emissiveIntensity: 0 });
  [[ledRun, 0.09], [ledHeat, 0.13]].forEach(([m, x]) => {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), m);
    led.position.set(x, (ctrlY0 + ctrlY1) / 2 + 0.03, Dd / 2 + 0.002);
    group.add(led);
  });
  const startBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.014, 24), new THREE.MeshStandardMaterial({ color: 0x1f8a3a, roughness: 0.4 }));
  startBtn.rotation.x = Math.PI / 2;
  startBtn.position.set(0.11, (ctrlY0 + ctrlY1) / 2 - 0.025, Dd / 2 + 0.007);
  startBtn.userData.part = 'composterStart';
  group.add(startBtn);
  const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.018, 24), new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.4 }));
  estop.rotation.x = Math.PI / 2;
  estop.position.set(0.2, (ctrlY0 + ctrlY1) / 2, Dd / 2 + 0.009);
  group.add(estop);

  const brand = brandingTexture();
  const brandFace = new THREE.MeshStandardMaterial({ map: brand.tex, roughness: 0.55, metalness: 0.1, transparent: true, opacity: 1 });
  const brandPanel = new THREE.Mesh(new THREE.BoxGeometry(W - 0.004, brandY1 - brandY0, t), [frontMat, frontMat, frontMat, frontMat, brandFace, frontMat]);
  brandPanel.position.set(0, (brandY0 + brandY1) / 2, Dd / 2 - t / 2);
  brandPanel.castShadow = true;
  group.add(brandPanel);

  const drawer = new THREE.Group();
  const dH = drawerY1 - drawerY0;
  drawer.add(rbox(W - 0.01, dH - 0.008, t, ss, 0, 0, 0, 0.004));
  const dLabel = canvasTex(400, 70, (ctx, w, h) => {
    ctx.fillStyle = '#2b3036'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2f4f6'; ctx.textAlign = 'center'; ctx.font = `600 34px ${FONT}`;
    ctx.fillText('ปุ๋ยพร้อมใช้ · ดึงออก', w / 2, 47);
  });
  const dl = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.042), new THREE.MeshStandardMaterial({ map: dLabel.tex, roughness: 0.6 }));
  dl.position.set(0, 0.04, t / 2 + 0.0005);
  drawer.add(dl);
  const dh = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.24, 4, 10), ssDark);
  dh.rotation.z = Math.PI / 2;
  dh.position.set(0, -0.035, t / 2 + 0.022);
  drawer.add(dh);
  for (const sx of [-1, 1]) drawer.add(rbox(0.014, 0.014, 0.024, ssDark, sx * 0.13, -0.035, t / 2 + 0.01, 0.003));
  // drawer bin behind the front
  drawer.add(rbox(W - 0.08, dH - 0.04, Dd - 0.12, ssDark, 0, -0.005, -(Dd - 0.12) / 2 - t / 2, 0.004));
  drawer.position.set(0, drawerY0 + dH / 2, Dd / 2 - t / 2);
  group.add(drawer);

  /* ---------- interior: drum, paddles, heater, motor ---------- */
  const inside = new THREE.Group();
  const R = C.drum.radius, Lg = C.drum.length, dy = C.drum.y, dz = -0.02;
  const drumMat = new THREE.MeshStandardMaterial({ color: 0xd5d9dd, metalness: 0.9, roughness: 0.25, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Lg, 48, 1, true), drumMat);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0, dy, dz);
  inside.add(drum);
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 48), ssDark);
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
  for (const x of [-0.15, 0, 0.15]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(R + 0.006, 0.006, 8, 48), heatMat);
    band.rotation.y = Math.PI / 2;
    band.position.set(x, dy, dz);
    inside.add(band);
  }
  // paddle shaft
  const rotor = new THREE.Group();
  rotor.position.set(0, dy, dz);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, Lg + 0.08, 16), ssDark);
  shaft.rotation.z = Math.PI / 2;
  rotor.add(shaft);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.x = (i / 4) * Math.PI * 2;
    arm.position.x = -0.15 + i * 0.1;
    arm.add(rbox(0.012, R - 0.03, 0.012, ssDark, 0, (R - 0.03) / 2, 0, 0.003));
    const blade = rbox(0.07, 0.01, 0.05, ssDark, 0, R - 0.025, 0, 0.003);
    blade.rotation.y = 0.5;
    arm.add(blade);
    rotor.add(arm);
  }
  inside.add(rotor);
  // drum cradle + gear motor on the right
  for (const sx of [-1, 1]) inside.add(rbox(0.03, dy - R - y0 - t, 0.3, ssDark, sx * (Lg / 2 - 0.03), y0 + t + (dy - R - y0 - t) / 2, dz, 0.004));
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.045, 24), new THREE.MeshStandardMaterial({ color: 0x2f5d8a, metalness: 0.4, roughness: 0.45 }));
  motor.rotation.z = Math.PI / 2;
  motor.position.set(Lg / 2 + 0.03, dy, dz);                  // stays inside the cabinet wall
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
