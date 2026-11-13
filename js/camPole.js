import * as THREE from 'three';
import { rbox } from './geom.js';

// Variant C camera pole: a short solar pole standing right beside the station's right end panel
// (two tie straps to the frame), with a boom that reaches over the middle of the station so the
// camera looks down on all four lids. Universal mount (4-hole junction plate + dovetail quick-release)
// takes any of five camera bodies. Every camera's cover opens onto a working inside: lens + IR-cut
// filter + sensor board + SoC board + PoE board, IR LEDs, and the mechanics of that body type
// (gimbal, ball joint, pan/tilt gears, blower fan). The pole box opens onto battery / MPPT / 4G / timer.

const FONT = 'Kanit, Thonburi, sans-serif';
const MONO = 'Menlo, Consolas, monospace';

export const POLE_H = 2.8;

// pole kit, THB (rough Thai retail)
export const POLE_COST = [
  ['เสาเหล็กกัลวาไนซ์ Ø76 สูง 2.8 ม. + แขนยื่น 1.5 ม. + เพลทฐาน', 3200],
  ['แผงโซลาร์ 40W + ขาปรับมุม', 900],
  ['แบต LiFePO4 12.8V 20Ah', 2600],
  ['ชาร์จเจอร์ MPPT 10A + รีเลย์ตั้งเวลา', 550],
  ['เราเตอร์ 4G + ซิม IoT', 1350],
  ['กล่อง IP65 + สาย PoE + แคลมป์ยึดโครงถัง', 650],
];
export const poleTotal = () => POLE_COST.reduce((s, [, p]) => s + p, 0);

// camera bodies the universal mount takes; fov = vertical field of view of the simulated feed
export const CAM_TYPES = {
  dome:    { label: 'โดม', name: 'กล้องโดม 4MP', fov: 74, cost: 1290, note: 'เลนส์ 2.8 มม. มุมกว้าง · ทนแรงกระแทก IK10 · ปรับมุม 3 แกน', open: 'คลายสกรูกันงัด 3 ตัว ฝาโดมห้อยลงบนสายกันตก' },
  bullet:  { label: 'บูลเล็ต', name: 'กล้องบูลเล็ต 4MP', fov: 66, cost: 1190, note: 'มีกันแดด · IR 30 ม. · ราคาถูกสุด', open: 'เลื่อนกันแดดออก แล้วเปิดฝาบนแบบฝาหอย' },
  ptz:     { label: 'PTZ', name: 'มินิ PTZ 4MP ซูม 4×', fov: 62, cost: 3900, note: 'หมุน 355° ก้ม 90° ซูม 4× สั่งจากศูนย์ได้', open: 'ฝาหน้าหัวกล้องพับขึ้น + ฝาข้างฐานเปิดดูมอเตอร์' },
  fisheye: { label: 'ฟิชอาย 360°', name: 'กล้องฟิชอาย 360° 5MP', fov: 118, cost: 2790, note: 'มองลงตรง ๆ เห็นรอบสถานีในภาพเดียว', open: 'หมุนฝาล่างคลายเกลียว ฝาห้อยลงบนสายกันตก 3 เส้น' },
  ai:      { label: 'กล้อง AI', name: 'กล้อง AI ในตัว (edge)', fov: 66, cost: 4500, note: 'ชิป NPU 2 TOPS ในกล้อง ส่งแค่ผลลัพธ์ ประหยัดเน็ต 4G', open: 'คลายสกรูมือ 2 ตัว ฝาข้างเปิดแบบบานพับ' },
  none:    { label: 'ถอดออก', name: 'ไม่ติดกล้อง', fov: 0, cost: 0, note: 'กดสลักแดง เลื่อนกล้องออกจากราง ถอดได้ในไม่กี่วินาที', open: '' },
};

// hover tips for the pole and every inside part (main.js merges these into PART_TIPS)
export const CAM_TIPS = {
  camPole: 'เสากล้องข้างถัง (แบบ C) สูง 2.8 ม. + แขนยื่นเหนือถัง 1.5 ม. · ฐานเทปูน + ยึดแผงข้างโครงถัง 2 จุด — คลิกเพื่อดูภาพจากกล้อง',
  camSolar: 'แผงโซลาร์ 40W เอียง 15° · กล้องเปิดถ่ายภาพนิ่งทุก 5 นาทีแล้วตัดไฟ (ไม่สตรีม 24 ชม.) ไฟจึงพอทั้งปี — คลิกเพื่อดูภาพจากกล้อง',
  camBox: 'กล่องไฟ IP65 บนเสา · แบต LiFePO4 + MPPT + รีเลย์ตั้งเวลา + เราเตอร์ 4G — คลิกเพื่อเปิด/ปิดฝา',
  camMount: 'แท่นติดกล้องสากล · แผ่นกลม 4 รู (ระยะรูกล่องพักสายมาตรฐาน) + รางหางเหยี่ยวปลดเร็ว · กดสลักแดงแล้วเลื่อนกล้องออก ใส่ได้ทุกแบบ',
  camShell: 'ฝากล้อง — คลิกเพื่อเปิด/ปิดฝา ดูระบบภายใน',
  camScrew: 'สกรูกันงัดหัว Torx มีหมุดกลาง (ไขควงธรรมดาเปิดไม่ได้) · ร้อยค้างในฝา ไม่หล่นหาย — คลิกเพื่อเปิด/ปิดฝา',
  camLens: 'ชุดเลนส์ M12 · แหวนโฟกัสหมุนเกลียว + น็อตล็อก · กระจกเคลือบกันแสงสะท้อน (สีม่วงอมเขียวที่เห็นคือชั้นเคลือบ)',
  camIrcut: 'ฟิลเตอร์ IR-cut สองตำแหน่ง ขยับด้วยขดลวดแม่เหล็ก · กลางวันเลื่อนเข้า (กันแสงอินฟราเรด สีไม่เพี้ยน) กลางคืนเลื่อนออกให้แสง IR เข้าเซ็นเซอร์ — ลองกด "โหมดกลางคืน"',
  camSensor: 'บอร์ดเซ็นเซอร์ภาพ CMOS 1/2.7″ 4MP · ส่งภาพดิบผ่านสายแพ MIPI ไปบอร์ดหลัก',
  camSoc: 'บอร์ดหลัก: ชิป SoC (ISP + เข้ารหัส H.265) ใต้ฮีตซิงก์ · DDR3 · แฟลช SPI · ไฟเขียวกะพริบ = ระบบทำงาน',
  camSd: 'ช่อง microSD 128GB · เก็บภาพย้อนหลังในกล้อง ถ้า 4G หลุดก็ไม่เสียภาพ ส่งตามทีหลังได้ (ไฟแดงกะพริบ = กำลังเขียนการ์ด)',
  camPoe: 'บอร์ดไฟ PoE 802.3af · หม้อแปลงแยกกราวด์ (สีเหลือง) + คอนเดนเซอร์กรองไฟ · รับทั้งไฟและข้อมูลในสาย LAN เส้นเดียว',
  camIr: 'ไฟ IR 850 นาโนเมตร · ติดเองตอนมืด (มีเซ็นเซอร์แสง) ตาคนเห็นเป็นจุดแดงจาง ๆ กล้องเห็นชัดในความมืด 30 ม.',
  camGimbal: 'ข้อต่อปรับมุม (หมุน/ก้ม/บิด) + สกรูล็อกหัวเกลียวมือ · ตั้งมุมครั้งเดียวตอนติดตั้ง',
  camMotor: 'มอเตอร์สเต็ป + เฟืองทดรอบ · หมุนหัวกล้องแม่นยำ 0.1° · สลิปริงตรงกลางทำให้หมุนรอบตัวได้โดยสายไม่พัน',
  camFan: 'พัดลมโบลเวอร์ 5V ดึงลมผ่านฮีตซิงก์ทองแดงของชิป NPU (ชิป AI ร้อนกว่ากล้องทั่วไป)',
  camNpu: 'บอร์ด AI: ชิป NPU 2 TOPS ประมวลผลในกล้อง · eMMC 8GB + LPDDR4 · การ์ด M.2 · ส่งเฉพาะผล "ถังล้น/ปกติ" ขนาดไม่กี่ไบต์',
  camGland: 'ข้อต่อกันน้ำ IP67 + สายหาง RJ45 / DC 12V · ยางซีลกันน้ำเข้า',
  camHeater: 'แผ่นฮีตเตอร์ไล่ฝ้า + ซองกันชื้น · กันไอน้ำเกาะกระจกหน้าเลนส์ช่วงฝนตก',
  boxBattery: 'แบต LiFePO4 12.8V 20Ah (256 Wh) · มี BMS ในตัว ทนร้อน อายุ ~2,000 รอบ · สำรองไฟ ~3 วันไม่มีแดด',
  boxMppt: 'ชาร์จเจอร์ MPPT 10A · จอโชว์แรงดันแผง/แบต/กระแสชาร์จ (ตัวเลขในจอเปลี่ยนตามเวลา)',
  boxRelay: 'รีเลย์ตั้งเวลา · จ่ายไฟให้กล้องทุก 5 นาที ครั้งละ ~40 วินาที (ไฟเขียวติด = กำลังถ่ายภาพ · ในโมเดลเร่งเป็นทุก 6 วินาที)',
  boxRouter: 'เราเตอร์ 4G + ซิม IoT · ส่งภาพนิ่งเข้าศูนย์ ~150 KB/ครั้ง ~1.3 GB/เดือน · ไฟฟ้ากะพริบ = กำลังส่ง',
  boxFuse: 'ฟิวส์แยกวงจร (แผง/แบต/โหลด) + เทอร์มินัลราง DIN',
};

/* ---------------------------------------------------------------- materials */
const M = {
  galv: new THREE.MeshStandardMaterial({ color: 0xaeb4ba, metalness: 0.85, roughness: 0.42 }),
  galvDark: new THREE.MeshStandardMaterial({ color: 0x7d848b, metalness: 0.8, roughness: 0.5 }),
  white: new THREE.MeshPhysicalMaterial({ color: 0xf2f3f4, roughness: 0.35, clearcoat: 0.5, side: THREE.DoubleSide }),
  whiteIn: new THREE.MeshStandardMaterial({ color: 0xdfe2e5, roughness: 0.6, side: THREE.DoubleSide }),
  graphite: new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide }),
  graphiteIn: new THREE.MeshStandardMaterial({ color: 0x23262c, metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide }),
  black: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5 }),
  matte: new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.85, side: THREE.DoubleSide }),
  smoke: new THREE.MeshPhysicalMaterial({ color: 0x1c2026, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
  clearGlass: new THREE.MeshPhysicalMaterial({ color: 0xdfe8ef, roughness: 0.04, transparent: true, opacity: 0.22, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
  coat: new THREE.MeshPhysicalMaterial({ color: 0x0a0c10, roughness: 0.04, metalness: 0.6, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 600] }),
  ircut: new THREE.MeshPhysicalMaterial({ color: 0x5a7dd6, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75, iridescence: 0.8, iridescenceIOR: 1.4 }),
  box: new THREE.MeshPhysicalMaterial({ color: 0xc9cdd1, roughness: 0.45, clearcoat: 0.3 }),
  boxIn: new THREE.MeshStandardMaterial({ color: 0xe9ebed, roughness: 0.7 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xa9a7a1, roughness: 0.92 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.9 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 1, roughness: 0.3 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xb8734a, metalness: 1, roughness: 0.32 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xd5d9dd, metalness: 1, roughness: 0.22 }),
  alu: new THREE.MeshStandardMaterial({ color: 0xc4c9ce, metalness: 0.9, roughness: 0.35 }),
  chip: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.55 }),
  cap: new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.6 }),
  res: new THREE.MeshStandardMaterial({ color: 0x202124, roughness: 0.6 }),
  flex: new THREE.MeshStandardMaterial({ color: 0xc88a1e, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide }),
  connector: new THREE.MeshStandardMaterial({ color: 0xe8e1cf, roughness: 0.6 }),
  transformer: new THREE.MeshStandardMaterial({ color: 0xe0b72e, roughness: 0.55 }),
  elcap: new THREE.MeshStandardMaterial({ color: 0x1f3a8a, roughness: 0.4, metalness: 0.2 }),
  sd: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 }),
  desiccant: new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.95 }),
  heater: new THREE.MeshStandardMaterial({ color: 0xa8662f, roughness: 0.5, metalness: 0.3 }),
  wireR: new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.5 }),
  wireK: new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.5 }),
  wireY: new THREE.MeshStandardMaterial({ color: 0xe5b200, roughness: 0.5 }),
  wireB: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5 }),
  battery: new THREE.MeshStandardMaterial({ color: 0x1e5aa8, roughness: 0.5 }),
  din: new THREE.MeshStandardMaterial({ color: 0xbfc4c9, metalness: 0.8, roughness: 0.35 }),
  module: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.55 }),
  term: new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.6 }),
  red: new THREE.MeshStandardMaterial({ color: 0xd93a2b, roughness: 0.5 }),
  fan: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.6 }),
};
// lights that blink / glow: each one gets its own material so it can be driven separately
const glow = (hex, i = 0) => new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: i, roughness: 0.3 });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// seeded PRNG so every board looks the same on every load
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// solder mask + copper traces + vias + gold pads + silkscreen
const pcbCache = new Map();
function pcbMat(label, seed, mask = '#0d4d36') {
  const key = label + seed + mask;
  if (pcbCache.has(key)) return pcbCache.get(key);
  const tex = canvasTex(512, 512, (c, w, h) => {
    const r = rng(seed);
    c.fillStyle = mask; c.fillRect(0, 0, w, h);
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(120,200,150,.28)';
    for (let i = 0; i < 90; i++) {
      let x = r() * w, y = r() * h;
      c.lineWidth = r() < 0.2 ? 5 : 1.6;
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        const d = 20 + r() * 90, dir = Math.floor(r() * 4);
        if (dir === 0) x += d; else if (dir === 1) y += d; else if (dir === 2) { x += d * 0.7; y += d * 0.7; } else { x -= d * 0.7; y += d * 0.7; }
        c.lineTo(x, y);
      }
      c.stroke();
    }
    c.fillStyle = '#c9a227';
    for (let i = 0; i < 160; i++) { c.beginPath(); c.arc(r() * w, r() * h, 2.2, 0, 7); c.fill(); }
    c.fillStyle = '#d4af37';
    for (let i = 0; i < 40; i++) c.fillRect(r() * w, r() * h, 6 + r() * 6, 4);
    c.fillStyle = 'rgba(240,240,235,.85)'; c.strokeStyle = 'rgba(240,240,235,.7)'; c.lineWidth = 2;
    c.font = `600 22px ${MONO}`; c.fillText(label, 18, h - 22);
    c.font = `500 14px ${MONO}`;
    for (let i = 0; i < 14; i++) { const x = r() * (w - 60), y = r() * (h - 30) + 20; c.strokeRect(x, y, 20 + r() * 30, 12 + r() * 16); c.fillText(['C', 'R', 'U', 'L', 'Q', 'D'][i % 6] + (1 + Math.floor(r() * 40)), x, y - 3); }
    c.beginPath(); c.arc(30, 30, 12, 0, 7); c.stroke();
  });
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
  pcbCache.set(key, m);
  return m;
}
function labelTex(w, h, draw) { return new THREE.MeshStandardMaterial({ map: canvasTex(w, h, draw), roughness: 0.5 }); }

/* ---------------------------------------------------------------- geometry helpers */
const bx = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cyl = (r0, r1, h, mat, seg = 24) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const cz = (r, len, mat, seg = 24) => { const m = cyl(r, r, len, mat, seg); m.rotation.x = Math.PI / 2; return m; };
const cx = (r, len, mat, seg = 24) => { const m = cyl(r, r, len, mat, seg); m.rotation.z = Math.PI / 2; return m; };
const torus = (r, t, mat, seg = 32) => new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, seg), mat);
function tube(points, r, mat, seg = 20) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 6, false), mat);
}
function tag(o, part) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.part = part; } }); return o; }
function lensMarker(x, y, z) { const o = new THREE.Object3D(); o.name = 'lens'; o.position.set(x, y, z); return o; }

// knurled ring along z (focus rings, thumb screws)
function knurl(r, len, mat, n = 28) {
  const g = new THREE.Group();
  g.add(cz(r * 0.96, len, mat, 32));
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = bx(r * 0.09, r * 0.09, len * 0.92, mat, Math.cos(t) * r * 0.97, Math.sin(t) * r * 0.97, 0);
    k.rotation.z = t; g.add(k);
  }
  return g;
}
// spur gear in the XZ plane (axis y)
function gear(r, teeth, thick, mat) {
  const g = new THREE.Group();
  g.add(cyl(r * 0.92, r * 0.92, thick, mat, 40));
  const tw = (Math.PI * 2 * r) / teeth * 0.5;
  for (let i = 0; i < teeth; i++) {
    const t = (i / teeth) * Math.PI * 2;
    const k = bx(tw, thick, r * 0.16, mat, Math.cos(t) * r, 0, Math.sin(t) * r);
    k.rotation.y = -t + Math.PI / 2; g.add(k);
  }
  g.add(cyl(r * 0.18, r * 0.18, thick * 1.4, M.steel, 16));
  return g;
}
// scatter SMD passives over a board (board top face at y = 0, extent w x d)
function smd(g, w, d, n, seed, keep = []) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * (w - 0.004), z = (r() - 0.5) * (d - 0.004);
    if (keep.some(([kx, kz, kw, kd]) => Math.abs(x - kx) < kw / 2 + 0.001 && Math.abs(z - kz) < kd / 2 + 0.001)) continue;
    const big = r() < 0.25;
    const m = bx(big ? 0.0016 : 0.001, 0.0006, big ? 0.0008 : 0.0005, r() < 0.55 ? M.cap : M.res, x, 0.0003, z);
    m.rotation.y = r() < 0.5 ? 0 : Math.PI / 2;
    g.add(m);
  }
}
// horizontal PCB, top face at y = 0 (local), components go on +y
function board(w, d, label, seed, mask) {
  const g = new THREE.Group();
  const edge = new THREE.MeshStandardMaterial({ color: 0x1f4d2e, roughness: 0.7 });
  const top = pcbMat(label, seed, mask);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0016, d), [edge, edge, top, edge, edge, edge]);
  m.position.y = -0.0008; g.add(m);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(torus(0.0015, 0.0004, M.brass, 12).rotateX(Math.PI / 2), sx * (w / 2 - 0.0028), 0.0001, sz * (d / 2 - 0.0028)));
  return g;
}
function qfp(s, mat = M.chip, legs = true) {
  const g = new THREE.Group();
  g.add(bx(s, 0.0012, s, mat, 0, 0.0006, 0));
  g.add(at(new THREE.Mesh(new THREE.CircleGeometry(s * 0.06, 10).rotateX(-Math.PI / 2), M.steel), -s * 0.36, 0.00122, -s * 0.36));
  if (legs) {
    const n = Math.max(4, Math.min(14, Math.round(s / 0.0009)));
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1) - 0.5) * s * 0.84;
      for (const [x, z, rx] of [[u, s / 2 + 0.0004, 0], [u, -s / 2 - 0.0004, 0], [s / 2 + 0.0004, u, 1], [-s / 2 - 0.0004, u, 1]]) {
        g.add(bx(rx ? 0.0009 : 0.0003, 0.0003, rx ? 0.0003 : 0.0009, M.steel, x, 0.00025, z));
      }
    }
  }
  return g;
}
function heatsink(w, d, h, fins, mat = M.alu) {
  const g = new THREE.Group();
  g.add(bx(w, 0.0015, d, mat, 0, 0.00075, 0));
  for (let i = 0; i < fins; i++) g.add(bx(w / fins * 0.38, h, d, mat, -w / 2 + (i + 0.5) * (w / fins), 0.0015 + h / 2, 0));
  return g;
}
function elcap(r, h) { const g = new THREE.Group(); g.add(at(cyl(r, r, h, M.elcap, 20), 0, h / 2, 0)); g.add(at(cyl(r * 0.98, r * 0.98, 0.0004, M.steel, 20), 0, h + 0.0002, 0)); return g; }

/* ---------------------------------------------------------------- camera core */
// Sensor module: lens (+z) on an M12 holder, IR-cut filter with its solenoid, sensor PCB in the XY plane at z = 0.
function sensorModule(anim, { lensLen = 0.018, zoom = false, big = false } = {}) {
  const g = new THREE.Group();
  const sb = board(0.032, 0.032, 'IMX-4MP', 11, '#0b3d2a'); sb.rotation.x = Math.PI / 2; g.add(sb);
  const front = new THREE.Group(); front.rotation.x = Math.PI / 2; g.add(front);
  smd(front, 0.032, 0.032, 40, 5, [[0, 0, 0.018, 0.018]]);
  front.add(at(bx(0.009, 0.0012, 0.0025, M.connector), 0, 0.0006, 0.0135));                           // FPC connector (bottom edge)
  front.add(at(bx(0.0032, 0.001, 0.002, M.steel), 0.011, 0.0005, -0.011));                             // crystal
  const holder = bx(0.016, 0.016, 0.011, M.matte, 0, 0, 0.0055 + 0.0016);
  g.add(holder);
  for (const [x, y] of [[-0.011, 0.011], [0.011, -0.011]]) g.add(at(cz(0.0012, 0.003, M.steel, 10), x, y, 0.0024));   // holder screws
  // IR-cut: two rails, solenoid coil at -x, sliding filter plate (day filter + clear night window)
  const icZ = 0.0128 + 0.0016;
  const ic = new THREE.Group(); g.add(ic);
  for (const y of [-0.0058, 0.0058]) ic.add(bx(0.026, 0.0016, 0.0032, M.matte, 0.002, y, icZ));
  ic.add(at(cx(0.0028, 0.006, M.copper, 16), -0.0125, 0, icZ));
  ic.add(at(cx(0.0012, 0.008, M.steel, 10), -0.008, 0, icZ));
  const plate = new THREE.Group(); plate.position.set(0, 0, icZ); ic.add(plate);
  plate.add(bx(0.011, 0.0098, 0.0007, M.ircut, 0, 0, 0.0004));
  plate.add(bx(0.011, 0.0098, 0.0007, M.clearGlass, 0.0115, 0, 0.0004));
  plate.add(bx(0.023, 0.0012, 0.001, M.matte, 0.0055, 0.0051, 0)); plate.add(bx(0.023, 0.0012, 0.001, M.matte, 0.0055, -0.0051, 0));
  anim.ircut.push(plate);
  // lens barrel + focus ring + lock nut + coated front element
  const L = big ? lensLen * 1.8 : lensLen, R = big ? 0.0105 : 0.0072;
  const lens = new THREE.Group(); lens.position.z = icZ + 0.0018; g.add(lens);
  lens.add(at(cz(R, L, M.black, 32), 0, 0, L / 2));
  lens.add(at(cz(R * 1.12, 0.002, M.alu, 6), 0, 0, 0.0012));
  const focus = knurl(R * 1.16, L * 0.32, M.black); focus.position.z = L * 0.55; lens.add(focus);
  anim.focus.push(focus);
  if (big) { const iris = knurl(R * 1.16, L * 0.22, M.graphite); iris.position.z = L * 0.2; lens.add(iris); lens.add(at(cx(0.0016, 0.008, M.steel, 10), R * 1.4, 0, L * 0.55)); lens.add(at(cx(0.0016, 0.008, M.steel, 10), R * 1.4, 0, L * 0.2)); }
  if (zoom) {
    lens.add(at(cz(0.0045, 0.012, M.steel, 16), R + 0.006, 0, L * 0.4));
    lens.add(at(bx(0.002, 0.003, L * 0.7, M.brass), R + 0.002, 0, L * 0.5));
    anim.zoom.push(lens);
  }
  lens.add(at(new THREE.Mesh(new THREE.CircleGeometry(R * 0.78, 32), M.coat), 0, 0, L + 0.0002));
  lens.add(at(torus(R * 0.86, R * 0.08, M.black, 32), 0, 0, L + 0.0002));
  tag(sb, 'camSensor'); tag(front, 'camSensor'); tag(holder, 'camLens'); tag(lens, 'camLens'); tag(ic, 'camIrcut');
  g.userData.lensTip = L + icZ + 0.0018;
  return g;
}
// ring of IR LEDs around the lens (XY plane, LEDs toward +z)
function irRing(anim, rIn, rOut, n) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 40), pcbMat('IR850', 31, '#141414')));
  const m = glow(0x5a0d0d, 0); anim.ir.push(m);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, r = (rIn + rOut) / 2;
    const led = new THREE.Group(); led.position.set(Math.cos(t) * r, Math.sin(t) * r, 0);
    led.add(at(cz(0.0026, 0.002, M.alu, 16), 0, 0, 0.001));
    led.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.0024, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), m), 0, 0, 0.002));
    g.add(led);
  }
  g.add(at(cz(0.0018, 0.0015, M.copper, 12), 0, rOut - 0.002, 0.0008));     // light sensor
  return tag(g, 'camIr');
}
// main SoC board, horizontal, components up (+y)
function mainBoard(anim, w = 0.038, d = 0.046, { sd = true } = {}) {
  const g = board(w, d, 'HI3516-MAIN', 23);
  const soc = qfp(0.011); soc.position.set(-0.004, 0, -0.004); g.add(soc);
  const hs = heatsink(0.013, 0.013, 0.006, 7); hs.position.set(-0.004, 0.0012, -0.004); g.add(hs);
  g.add(at(qfp(0.008, M.chip, false), w / 2 - 0.008, 0, -0.009));
  g.add(at(qfp(0.005), w / 2 - 0.007, 0, 0.004));
  g.add(at(bx(0.0048, 0.0015, 0.0048, M.steel), -w / 2 + 0.007, 0.00075, d / 2 - 0.011));
  const led = glow(0x16a34a, 0.2); anim.status.push(led);
  g.add(at(bx(0.0016, 0.0008, 0.0009, led), -w / 2 + 0.004, 0.0004, d / 2 - 0.003));
  const ledR = glow(0xdc2626, 0.1); anim.sd.push(ledR);
  g.add(at(bx(0.0016, 0.0008, 0.0009, ledR), -w / 2 + 0.007, 0.0004, d / 2 - 0.003));
  g.add(at(cyl(0.0014, 0.0014, 0.0015, M.chip, 12), -w / 2 + 0.011, 0.00075, d / 2 - 0.003));
  g.add(at(bx(0.009, 0.0024, 0.003, M.connector), 0, 0.0012, -d / 2 + 0.003));
  g.add(at(bx(0.008, 0.003, 0.004, M.connector), w / 2 - 0.008, 0.0015, d / 2 - 0.004));
  smd(g, w, d, 70, 3, [[-0.004, -0.004, 0.015, 0.015], [w / 2 - 0.008, -0.009, 0.01, 0.01], [0.004, d / 2 - 0.008, 0.016, 0.016], [-w / 2 + 0.007, d / 2 - 0.011, 0.007, 0.007]]);
  tag(g, 'camSoc');
  if (sd) {
    const slot = new THREE.Group(); slot.position.set(0.004, 0, d / 2 - 0.008);
    slot.add(bx(0.012, 0.0016, 0.011, M.steel, 0, 0.0008, 0));
    slot.add(bx(0.011, 0.0007, 0.015, M.sd, 0, 0.0012, 0.003));
    g.add(tag(slot, 'camSd'));
  }
  return g;
}
function poeBoard(w = 0.03, d = 0.026) {
  const g = board(w, d, 'POE-AF', 41, '#123f2c');
  g.add(at(bx(0.009, 0.007, 0.008, M.transformer), -w / 2 + 0.008, 0.0035, 0));
  g.add(at(bx(0.0055, 0.0055, 0.0055, M.chip), w / 2 - 0.007, 0.00275, -d / 2 + 0.007));
  g.add(at(elcap(0.003, 0.008), w / 2 - 0.006, 0, d / 2 - 0.006));
  g.add(at(elcap(0.0022, 0.006), 0.001, 0, d / 2 - 0.004));
  g.add(at(qfp(0.004), 0.003, 0, 0));
  smd(g, w, d, 26, 9, [[-w / 2 + 0.008, 0, 0.01, 0.009], [w / 2 - 0.007, -d / 2 + 0.007, 0.007, 0.007], [w / 2 - 0.006, d / 2 - 0.006, 0.007, 0.007]]);
  return tag(g, 'camPoe');
}
function ribbon(p0, p1, sag = 0.006, w = 0.008) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
  const mid = a.clone().lerp(b, 0.5); mid.y -= sag;
  const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(16), pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) { pos.push(pts[i].x - w / 2, pts[i].y, pts[i].z, pts[i].x + w / 2, pts[i].y, pts[i].z); if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return tag(new THREE.Mesh(geo, M.flex), 'camSensor');
}
function gland(r = 0.006) {
  const g = new THREE.Group();
  g.add(cyl(r * 1.25, r * 1.25, 0.004, M.black, 6));
  g.add(at(cyl(r, r * 0.9, 0.006, M.black, 16), 0, -0.005, 0));
  g.add(at(cyl(r * 0.45, r * 0.45, 0.04, M.rubber, 12), 0, -0.026, 0));
  return tag(g, 'camGland');
}
function torxScrew(r = 0.0028) {
  const g = new THREE.Group();
  g.add(cyl(r, r, 0.0018, M.steel, 20));
  for (let i = 0; i < 3; i++) { const k = bx(r * 0.32, 0.0006, r * 1.1, M.black, 0, 0.0009, 0); k.rotation.y = (i / 3) * Math.PI; g.add(k); }
  g.add(at(cyl(r * 0.15, r * 0.15, 0.001, M.steel, 8), 0, 0.0012, 0));
  return tag(g, 'camScrew');
}
// dovetail shoe on top of every camera: slides into the plate's rail, spring pin locks it
function shoe(mat = M.graphite) {
  const g = new THREE.Group();
  g.add(bx(0.05, 0.006, 0.02, mat, 0, -0.003, 0));
  g.add(bx(0.056, 0.003, 0.014, mat, 0, -0.0015, 0));
  g.add(at(cyl(0.0018, 0.0018, 0.004, M.steel, 10), 0.02, -0.002, 0));
  return g;
}
function modelLabel(text, sub, w = 0.05, bg = '#eef0f2', fg = '#111') {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.32), labelTex(250, 80, (c) => { c.fillStyle = bg; c.fillRect(0, 0, 250, 80); c.fillStyle = fg; c.font = `700 26px ${MONO}`; c.fillText(text, 10, 34); c.font = `500 17px ${MONO}`; c.fillText(sub, 10, 62); }));
}

/* ---------------------------------------------------------------- camera bodies */
// Each returns { g, anim, pose(k) }: origin = underside of the quick-release plate, +z = toward the aim, tilt = look-down angle.
function newAnim() { return { status: [], sd: [], ir: [], ircut: [], focus: [], zoom: [], fans: [], pan: null }; }

function domeCam(tilt) {
  const anim = newAnim();
  const g = new THREE.Group();
  g.add(tag(shoe(M.whiteIn), 'camMount'));
  const base = new THREE.Group();
  base.add(at(cyl(0.074, 0.078, 0.026, M.white, 48), 0, -0.019, 0));
  base.add(at(gland(), 0.05, -0.006, 0));
  base.add(at(torus(0.072, 0.0022, M.rubber, 48).rotateX(Math.PI / 2), 0, -0.0325, 0));
  base.add(at(cyl(0.07, 0.07, 0.002, M.alu, 48), 0, -0.033, 0));
  const lbl = modelLabel('DS-4MP-D28', 'SN 2569-0142 · IP67 IK10'); lbl.rotation.y = Math.PI / 2; base.add(at(lbl, 0.0765, -0.019, -0.01));
  g.add(tag(base, 'camShell'));
  // inside: main board flipped under the chassis plate (parts face down), PoE board beside it
  const mb = mainBoard(anim, 0.04, 0.046); mb.rotation.x = Math.PI; mb.position.set(-0.016, -0.0342, 0); g.add(mb);
  const pb = poeBoard(0.026, 0.024); pb.rotation.x = Math.PI; pb.position.set(0.032, -0.0342, -0.018); g.add(pb);
  g.add(tag(bx(0.016, 0.004, 0.012, M.desiccant, 0.034, -0.037, 0.024), 'camHeater'));
  // gimbal: pan ring with detent teeth -> yoke -> tilt cradle -> sensor module + IR ring
  const pan = new THREE.Group(); pan.position.y = -0.04; g.add(pan);
  pan.add(torus(0.03, 0.0025, M.graphite, 40).rotateX(Math.PI / 2));
  for (let i = 0; i < 36; i++) { const t = (i / 36) * Math.PI * 2; pan.add(at(bx(0.0015, 0.002, 0.003, M.graphite), Math.cos(t) * 0.0325, 0, Math.sin(t) * 0.0325)); }
  for (const sx of [-1, 1]) {
    pan.add(bx(0.004, 0.026, 0.014, M.graphite, sx * 0.027, -0.013, 0));
    const thumb = knurl(0.0045, 0.004, M.black, 16); thumb.rotation.y = Math.PI / 2; thumb.position.set(sx * 0.0315, -0.022, 0); pan.add(thumb);
    for (let k = 0; k < 7; k++) pan.add(at(bx(0.0002, 0.0004, k % 3 ? 0.0018 : 0.003, M.white), sx * 0.0292, -0.016 - k * 0.0018, 0.004));
  }
  tag(pan, 'camGimbal');
  const cradle = new THREE.Group(); cradle.position.y = -0.022; cradle.rotation.x = tilt; pan.add(cradle);
  cradle.add(tag(bx(0.05, 0.004, 0.006, M.graphite, 0, 0, -0.006), 'camGimbal'));
  const sm = sensorModule(anim); sm.position.z = -0.003; cradle.add(sm);
  const ir = irRing(anim, 0.0115, 0.02, 6); ir.position.z = 0.0142; cradle.add(ir);
  cradle.add(lensMarker(0, 0, sm.userData.lensTip));
  // opening assembly: trim ring + eyelid liner + smoke bubble + 3 captive tamper screws, hinged at +x, safety lanyard
  const hinge = new THREE.Group(); hinge.position.set(-0.074, -0.034, 0); g.add(hinge);
  const shell = new THREE.Group(); shell.position.set(0.074, 0, 0); hinge.add(shell);
  shell.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.074, 0.01, 48, 1, true), M.white), 0, -0.006, 0));
  const ringS = new THREE.Shape(); ringS.absarc(0, 0, 0.076, 0, Math.PI * 2, false); const rh = new THREE.Path(); rh.absarc(0, 0, 0.066, 0, Math.PI * 2, true); ringS.holes.push(rh);
  const ringM = new THREE.Mesh(new THREE.ShapeGeometry(ringS, 48), M.white); ringM.rotation.x = Math.PI / 2; ringM.position.y = -0.011; shell.add(ringM);
  const ringT = ringM.clone(); ringT.position.y = -0.001; shell.add(ringT);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.066, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.smoke);
  bubble.position.y = -0.011; shell.add(bubble);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.024, 40, 1, true, Math.PI * 0.35, Math.PI * 1.3), M.matte);   // eyelid liner, window toward +z
  lid.position.y = -0.024; shell.add(lid);
  const screws = [];
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const s = torxScrew(); s.rotation.x = Math.PI; s.position.set(Math.cos(t) * 0.071, -0.0118, Math.sin(t) * 0.071);
    shell.add(s); screws.push({ s, y0: s.position.y });
  }
  tag(shell, 'camShell'); screws.forEach(({ s }) => tag(s, 'camScrew'));
  const lanyard = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 10 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0x9aa1a8 }));
  lanyard.frustumCulled = false; g.add(lanyard);
  const la = new THREE.Vector3(-0.05, -0.034, 0.04);
  const anchor = new THREE.Object3D(); anchor.position.set(0.024, -0.006, 0.04); shell.add(anchor);
  return {
    g, anim,
    pose(k) {
      const a = Math.min(1, k / 0.3), b = Math.max(0, (k - 0.3) / 0.7);
      for (const { s, y0 } of screws) { s.position.y = y0 - 0.005 * a; s.rotation.y = a * Math.PI * 6; }
      hinge.rotation.z = -b * 1.85;
      hinge.updateMatrix(); shell.updateMatrix();
      const lb = anchor.position.clone().applyMatrix4(shell.matrix).applyMatrix4(hinge.matrix);
      const pts = [], d = la.distanceTo(lb);
      for (let i = 0; i < 10; i++) { const u = i / 9; const p = la.clone().lerp(lb, u); p.y -= Math.sin(u * Math.PI) * Math.max(0, 0.08 - d) * 0.5; pts.push(p); }
      lanyard.geometry.setFromPoints(pts);
      lanyard.visible = k > 0.25;
    },
  };
}

function bulletCam(tilt) {
  const anim = newAnim();
  const g = new THREE.Group();
  g.add(tag(shoe(M.whiteIn), 'camMount'));
  const br = new THREE.Group();
  br.add(at(cyl(0.032, 0.032, 0.012, M.white, 40), 0, -0.012, 0));
  for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI * 2; br.add(at(cyl(0.003, 0.003, 0.002, M.steel, 12), Math.cos(t) * 0.024, -0.0185, Math.sin(t) * 0.024)); }
  br.add(at(cyl(0.012, 0.014, 0.045, M.white, 24), 0, -0.04, 0));
  br.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.016, 24, 16), M.white), 0, -0.064, 0));
  const collar = knurl(0.0175, 0.008, M.whiteIn, 24); collar.rotation.x = Math.PI / 2; collar.position.y = -0.056; br.add(collar);
  g.add(tag(br, 'camGimbal'));
  const head = new THREE.Group(); head.position.set(0, -0.064, 0); head.rotation.x = tilt; g.add(head);
  const W = 0.072, H = 0.07, Lb = 0.2;
  const body = new THREE.Group(); body.position.set(0, -H / 2 - 0.012, 0.04); head.add(body);
  head.add(tag(rbox(0.03, 0.014, 0.05, M.white, 0, -0.008, 0.02, 0.004), 'camGimbal'));    // clamp saddle under the ball
  // lower half (fixed): trough + rear wall + front bezel with glass
  const lower = new THREE.Group();
  lower.add(rbox(W, 0.004, Lb, M.white, 0, -H / 2 + 0.002, 0, 0.0018));
  for (const sx of [-1, 1]) lower.add(rbox(0.004, H / 2, Lb, M.white, sx * (W / 2 - 0.002), -H / 4, 0, 0.0018));
  lower.add(rbox(W, H, 0.006, M.white, 0, 0, -Lb / 2 + 0.003, 0.0018));
  const bShape = new THREE.Shape(); bShape.moveTo(-W / 2, -H / 2); bShape.lineTo(W / 2, -H / 2); bShape.lineTo(W / 2, H / 2); bShape.lineTo(-W / 2, H / 2); bShape.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.029, 0, Math.PI * 2, true); bShape.holes.push(hole);
  const bezel = new THREE.Group(); bezel.position.z = Lb / 2;
  bezel.add(new THREE.Mesh(new THREE.ExtrudeGeometry(bShape, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2 }), M.white));
  bezel.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.029, 40), M.clearGlass), 0, 0, 0.003));
  bezel.add(at(torus(0.029, 0.0016, M.rubber, 40), 0, 0, 0.0065));
  lower.add(bezel);
  const sc = []; for (const sx of [-1, 1]) { const s = torxScrew(0.0022); s.rotation.z = -sx * Math.PI / 2; s.position.set(sx * (W / 2 + 0.0008), -0.004, Lb / 2 - 0.02); lower.add(s); sc.push(s); }
  body.add(tag(lower, 'camShell')); sc.forEach((s) => tag(s, 'camScrew'));
  const rg = gland(0.005); rg.rotation.x = -Math.PI / 2; rg.position.set(0, -0.012, -Lb / 2 - 0.001); body.add(rg);
  const lbl = modelLabel('DS-4MP-B36', '12V/PoE · IR 30m · IP67'); lbl.rotation.y = Math.PI / 2; body.add(tag(at(lbl, W / 2 + 0.0006, -0.018, -0.04), 'camShell'));
  // inside: sensor module behind the glass, IR ring, heater, main board on a sled, PoE at the back
  const sm = sensorModule(anim, { lensLen: 0.02 }); sm.position.set(0, 0.004, Lb / 2 - 0.045); body.add(sm);
  const ir = irRing(anim, 0.012, 0.026, 8); ir.position.set(0, 0.004, Lb / 2 - 0.004); body.add(ir);
  body.add(tag(bx(0.03, 0.0006, 0.012, M.heater, 0, -0.024, Lb / 2 - 0.012), 'camHeater'));
  body.add(tag(bx(0.016, 0.005, 0.012, M.desiccant, 0.02, -H / 2 + 0.0065, 0.035), 'camHeater'));
  const mb = mainBoard(anim, 0.056, 0.07); mb.position.set(0, -H / 2 + 0.012, -0.015); body.add(mb);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) body.add(at(cyl(0.0016, 0.0016, 0.008, M.brass, 8), sx * 0.024, -H / 2 + 0.008, -0.015 + sz * 0.03));
  const pb = poeBoard(0.05, 0.03); pb.position.set(0, -H / 2 + 0.012, -Lb / 2 + 0.024); pb.rotation.y = Math.PI; body.add(pb);
  body.add(ribbon([0, -0.012, Lb / 2 - 0.046], [0, -H / 2 + 0.0145, 0.018], 0.004));
  body.add(tag(tube([[0.008, -H / 2 + 0.016, 0.02], [0.018, -H / 2 + 0.022, -0.04], [0.008, -H / 2 + 0.016, -Lb / 2 + 0.035]], 0.0012, M.wireK), 'camPoe'));
  body.add(tag(tube([[-0.006, -H / 2 + 0.016, 0.02], [-0.016, -H / 2 + 0.021, -0.04], [-0.006, -H / 2 + 0.016, -Lb / 2 + 0.035]], 0.0012, M.wireR), 'camPoe'));
  body.add(lensMarker(0, 0.004, Lb / 2 + 0.006));
  // upper half: hinged at the rear top edge; sun shield rides on it and slides forward first
  const hinge = new THREE.Group(); hinge.position.set(0, H / 2, -Lb / 2 + 0.006); body.add(hinge);
  const upper = new THREE.Group(); upper.position.set(0, -H / 2, Lb / 2 - 0.006); hinge.add(upper);
  upper.add(rbox(W, 0.004, Lb - 0.012, M.white, 0, H / 2 - 0.002, 0.0, 0.0018));
  for (const sx of [-1, 1]) upper.add(rbox(0.004, H / 2, Lb - 0.012, M.white, sx * (W / 2 - 0.002), H / 4, 0.0, 0.0018));
  upper.add(at(torus(0.004, 0.0012, M.steel, 12).rotateY(Math.PI / 2), 0, H / 2 - 0.002, -Lb / 2 + 0.01));
  const shield = new THREE.Group(); upper.add(shield);
  shield.add(rbox(W + 0.016, 0.004, Lb + 0.03, M.white, 0, H / 2 + 0.009, 0.012, 0.0018));
  for (const sx of [-1, 1]) shield.add(rbox(0.004, 0.02, Lb + 0.02, M.white, sx * (W / 2 + 0.006), H / 2, 0.012, 0.0015));
  tag(upper, 'camShell');
  return {
    g, anim,
    pose(k) {
      const a = Math.min(1, k / 0.35), b = Math.max(0, (k - 0.35) / 0.65);
      shield.position.z = 0.045 * a;
      sc.forEach((s) => (s.position.x = Math.sign(s.position.x) * (W / 2 + 0.0008 + 0.004 * a)));
      hinge.rotation.x = -b * 1.25;
    },
  };
}

function ptzCam(tilt) {
  const anim = newAnim();
  const g = new THREE.Group();
  g.add(tag(shoe(M.whiteIn), 'camMount'));
  const base = new THREE.Group();
  base.add(at(cyl(0.052, 0.052, 0.006, M.white, 40), 0, -0.003, 0));
  base.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.054, 0.034, 40, 1, true, Math.PI * 0.75, Math.PI * 1.5), M.white), 0, -0.023, 0));
  base.add(at(cyl(0.05, 0.05, 0.002, M.alu, 40), 0, -0.04, 0));
  const lbl = modelLabel('PTZ-4X-MINI', '355° · 4× · PoE+'); lbl.rotation.y = -Math.PI / 2; base.add(at(lbl, -0.0545, -0.023, 0));
  g.add(tag(base, 'camShell'));
  // pan drive: internal ring gear, stepper + pinion, slip ring, driver board
  const drive = new THREE.Group(); drive.position.y = -0.03; g.add(drive);
  drive.add(gear(0.036, 60, 0.005, M.graphite));
  const motor = new THREE.Group(); motor.position.set(0.026, 0.004, 0.026);
  motor.add(at(bx(0.02, 0.016, 0.02, M.steel), 0, 0.006, 0));
  motor.add(at(bx(0.021, 0.004, 0.021, M.black), 0, 0.0155, 0));
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.008), labelTex(160, 80, (c, w, h) => { c.fillStyle = '#e5e7eb'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `700 22px ${MONO}`; c.fillText('20BYJ46', 8, 32); c.font = `500 16px ${MONO}`; c.fillText('1.8°/step', 8, 60); }));
  lab.rotation.y = Math.PI / 4; motor.add(at(lab, 0.0072, 0.006, 0.0072));
  const pinion = gear(0.007, 14, 0.005, M.brass); pinion.position.set(-0.004, -0.004, -0.004); motor.add(pinion);
  [M.wireR, M.wireB, M.wireY, M.wireK].forEach((m, i) => motor.add(tube([[-0.004 + i * 0.0025, 0.017, 0.006], [-0.008 + i * 0.002, 0.02, -0.01], [-0.03 + i * 0.002, 0.012, -0.03]], 0.0007, m, 10)));
  drive.add(motor);
  for (let i = 0; i < 6; i++) drive.add(at(cyl(0.008, 0.008, 0.0016, i % 2 ? M.copper : M.chip, 24), 0, -0.004 + i * 0.002, 0));
  const db = board(0.03, 0.022, 'PTZ-DRV', 51); db.position.set(-0.02, 0.006, -0.016); db.rotation.y = 0.6; db.add(qfp(0.006)); smd(db, 0.03, 0.022, 22, 13, [[0, 0, 0.008, 0.008]]); drive.add(db);
  tag(drive, 'camMotor');
  // side hatch onto the drive (the gap in the base shell), hinged on one vertical edge
  const a0 = Math.PI * 0.25;
  const hatchHinge = new THREE.Group(); hatchHinge.position.set(Math.sin(a0) * 0.053, -0.023, Math.cos(a0) * 0.053); g.add(hatchHinge);
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.0525, 0.0545, 0.034, 20, 1, true, -Math.PI * 0.25, Math.PI * 0.5), M.white);
  hatch.position.set(-hatchHinge.position.x, 0, -hatchHinge.position.z); hatchHinge.add(hatch);
  hatchHinge.add(at(cyl(0.0015, 0.0015, 0.03, M.steel, 8), 0, 0, 0));
  tag(hatchHinge, 'camShell');
  // pan housing (rotates) + yoke + head
  const panG = new THREE.Group(); panG.position.y = -0.041; g.add(panG);
  panG.add(at(cyl(0.05, 0.046, 0.016, M.white, 40), 0, -0.008, 0));
  for (const sx of [-1, 1]) panG.add(rbox(0.012, 0.07, 0.042, M.white, sx * 0.054, -0.045, 0, 0.004));
  const tiltMotor = new THREE.Group(); tiltMotor.position.set(0.066, -0.062, 0);
  tiltMotor.add(cx(0.007, 0.012, M.steel, 16)); const tg = gear(0.009, 16, 0.003, M.brass); tg.rotation.z = Math.PI / 2; tg.position.set(-0.008, 0.012, 0); tiltMotor.add(tg);
  panG.add(tag(tiltMotor, 'camMotor'));
  const head = new THREE.Group(); head.position.y = -0.068; head.rotation.x = tilt; panG.add(head);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.046, 40, 24, Math.PI * 0.5 + 0.9, Math.PI * 2 - 1.8), M.graphite);
  head.add(tag(sphere, 'camShell'));
  const hg = gear(0.02, 30, 0.003, M.brass); hg.rotation.z = Math.PI / 2; hg.position.x = 0.0475; head.add(tag(hg, 'camMotor'));
  for (const sx of [-1, 1]) head.add(at(cx(0.006, 0.012, M.steel, 16), sx * 0.046, 0, 0));
  const sm = sensorModule(anim, { lensLen: 0.016, zoom: true }); sm.position.z = -0.014; sm.scale.setScalar(0.95); head.add(sm);
  const ir = irRing(anim, 0.012, 0.024, 8); ir.position.z = 0.03; ir.scale.setScalar(0.95); head.add(ir);
  const mb = mainBoard(anim, 0.034, 0.03, { sd: false }); mb.rotation.x = -Math.PI / 2; mb.position.set(0, 0, -0.03); head.add(mb);
  head.add(lensMarker(0, 0, 0.046));
  // front cover: spherical cap around +z with a flat glass window, hinged along the top
  const capHinge = new THREE.Group(); capHinge.position.set(0, 0.043, 0.016); head.add(capHinge);
  const cap = new THREE.Group(); cap.position.set(0, -0.043, -0.016); capHinge.add(cap);
  cap.add(new THREE.Mesh(new THREE.SphereGeometry(0.0465, 40, 20, Math.PI * 0.5 - 0.9, 1.8, 0.3, Math.PI - 0.6), M.graphite));
  cap.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.02, 32), M.clearGlass), 0, 0, 0.0455));
  cap.add(at(torus(0.02, 0.0018, M.black, 32), 0, 0, 0.0452));
  tag(cap, 'camShell');
  anim.pan = { panG, pinion };
  return {
    g, anim,
    pose(k) {
      const a = Math.min(1, k / 0.5), b = Math.max(0, (k - 0.3) / 0.7);
      hatchHinge.rotation.y = a * 1.6;
      capHinge.rotation.x = -b * 1.7;
    },
  };
}

function fisheyeCam() {
  const anim = newAnim();
  const g = new THREE.Group();
  g.add(tag(shoe(M.whiteIn), 'camMount'));
  const base = new THREE.Group();
  base.add(at(cyl(0.086, 0.088, 0.014, M.white, 56), 0, -0.007, 0));
  base.add(at(cyl(0.083, 0.083, 0.002, M.alu, 56), 0, -0.0145, 0));
  base.add(at(gland(), -0.06, -0.001, 0));
  g.add(tag(base, 'camShell'));
  // round main board facing down: fisheye lens centre, IR LEDs, mic, speaker, SD, PoE parts
  const pm = pcbMat('FISH-5MP-360', 61);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.0016, 48), [new THREE.MeshStandardMaterial({ color: 0x1f4d2e }), pm, pm]);
  disc.position.y = -0.0163; g.add(tag(disc, 'camSoc'));
  const smdG = new THREE.Group(); smdG.rotation.x = Math.PI; smdG.position.y = -0.0171; smd(smdG, 0.08, 0.08, 80, 19, [[0, 0, 0.03, 0.03], [0.032, 0.022, 0.016, 0.016], [-0.034, -0.03, 0.016, 0.016]]); g.add(tag(smdG, 'camSoc'));
  const lensG = new THREE.Group(); lensG.position.y = -0.0175; g.add(lensG);
  lensG.add(at(bx(0.02, 0.012, 0.02, M.matte), 0, -0.006, 0));
  lensG.add(at(cyl(0.015, 0.017, 0.014, M.black, 32), 0, -0.019, 0));
  const fk = knurl(0.0185, 0.006, M.black); fk.rotation.x = Math.PI / 2; fk.position.y = -0.016; lensG.add(fk); anim.focus.push(fk);
  lensG.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.016, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.coat), 0, -0.026, 0));
  tag(lensG, 'camLens');
  const icG = new THREE.Group(); icG.position.set(0, -0.0182, 0.016); g.add(icG);
  const plate = new THREE.Group(); icG.add(plate);
  plate.add(bx(0.012, 0.0008, 0.008, M.ircut)); plate.add(bx(0.012, 0.0008, 0.008, M.clearGlass, 0.013, 0, 0));
  icG.add(at(cx(0.0026, 0.007, M.copper, 14), -0.013, -0.002, 0));
  tag(icG, 'camIrcut'); anim.ircut.push(plate);
  const irM = glow(0x5a0d0d, 0); anim.ir.push(irM);
  for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2 + 0.3; const led = new THREE.Group(); led.position.set(Math.cos(t) * 0.045, -0.0175, Math.sin(t) * 0.045); led.add(at(cyl(0.004, 0.004, 0.002, M.alu, 16), 0, -0.001, 0)); led.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.0036, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), irM), 0, -0.002, 0)); g.add(tag(led, 'camIr')); }
  const spk = new THREE.Group(); spk.position.set(0.03, -0.0175, -0.034); spk.add(at(cyl(0.009, 0.009, 0.004, M.black, 24), 0, -0.002, 0)); for (let i = 0; i < 5; i++) spk.add(at(bx(0.012, 0.0004, 0.0008, M.steel), 0, -0.0042, -0.004 + i * 0.002)); g.add(tag(spk, 'camSoc'));
  const sdS = new THREE.Group(); sdS.position.set(-0.034, -0.0175, -0.03); sdS.add(bx(0.012, 0.0016, 0.011, M.steel, 0, -0.0008, 0)); sdS.add(bx(0.011, 0.0007, 0.015, M.sd, 0, -0.0012, 0.003)); g.add(tag(sdS, 'camSd'));
  const soc = qfp(0.011); soc.rotation.x = Math.PI; soc.position.set(0.032, -0.0172, 0.022); g.add(tag(soc, 'camSoc'));
  const hs = heatsink(0.013, 0.013, 0.005, 7); hs.rotation.x = Math.PI; hs.position.set(0.032, -0.0184, 0.022); g.add(tag(hs, 'camSoc'));
  g.add(tag(bx(0.009, 0.007, 0.008, M.transformer, -0.04, -0.021, 0.022), 'camPoe'));
  const ec = elcap(0.003, 0.008); ec.rotation.x = Math.PI; ec.position.set(-0.028, -0.0172, 0.04); g.add(tag(ec, 'camPoe'));
  const led = glow(0x16a34a, 0.2); anim.status.push(led); g.add(at(bx(0.0016, 0.0008, 0.0009, led), 0.05, -0.0176, 0.0));
  const ledR = glow(0xdc2626, 0.1); anim.sd.push(ledR); g.add(at(bx(0.0016, 0.0008, 0.0009, ledR), 0.05, -0.0176, 0.004));
  g.add(lensMarker(0, -0.045, 0));
  // lower cover: twists off its bayonet and drops on three tether cords
  const cover = new THREE.Group(); cover.position.y = -0.015; g.add(cover);
  const cs = new THREE.Shape(); cs.absarc(0, 0, 0.085, 0, Math.PI * 2, false); const ch = new THREE.Path(); ch.absarc(0, 0, 0.024, 0, Math.PI * 2, true); cs.holes.push(ch);
  const ring = new THREE.Mesh(new THREE.ExtrudeGeometry(cs, { depth: 0.02, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 3, curveSegments: 48 }), M.white);
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.003; cover.add(ring);
  cover.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.026, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.clearGlass), 0, -0.014, 0));
  for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2 + 0.3; cover.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.006, 16).rotateX(Math.PI / 2), M.smoke), Math.cos(t) * 0.045, -0.0262, Math.sin(t) * 0.045)); }
  for (let i = 0; i < 3; i++) { const t = (i / 3) * Math.PI * 2; cover.add(at(bx(0.01, 0.003, 0.004, M.white), Math.cos(t) * 0.086, -0.004, Math.sin(t) * 0.086)); }
  const flbl = modelLabel('FE-5MP-360', 'IR 10m · Mic · IP66', 0.04); flbl.rotation.x = Math.PI / 2; cover.add(at(flbl, 0, -0.0262, 0.058));
  tag(cover, 'camShell');
  const cords = [];
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * Math.PI * 2 + 0.5;
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x8a9098 }));
    l.frustumCulled = false; l.visible = false; g.add(l); cords.push({ l, t });
  }
  return {
    g, anim,
    pose(k) {
      const a = Math.min(1, k / 0.35), b = Math.max(0, (k - 0.35) / 0.65);
      cover.rotation.y = a * 0.7;
      cover.position.y = -0.015 - b * 0.055;
      for (const { l, t } of cords) {
        const tt = t - cover.rotation.y;
        l.geometry.setFromPoints([new THREE.Vector3(Math.cos(t) * 0.075, -0.016, Math.sin(t) * 0.075), new THREE.Vector3(Math.cos(tt) * 0.075, cover.position.y - 0.004, Math.sin(tt) * 0.075)]);
        l.visible = k > 0.36;
      }
    },
  };
}

function aiCam(tilt) {
  const anim = newAnim();
  const g = new THREE.Group();
  g.add(tag(shoe(), 'camMount'));
  const br = new THREE.Group();
  br.add(rbox(0.06, 0.012, 0.06, M.graphite, 0, -0.006, 0, 0.003));
  br.add(rbox(0.018, 0.034, 0.018, M.graphite, 0, -0.028, 0, 0.003));
  br.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.013, 20, 14), M.graphite), 0, -0.048, 0));
  const lock = knurl(0.008, 0.006, M.black, 16); lock.rotation.y = Math.PI / 2; lock.position.set(0.016, -0.048, 0); br.add(lock);
  g.add(tag(br, 'camGimbal'));
  const head = new THREE.Group(); head.position.y = -0.048; head.rotation.x = tilt; g.add(head);
  const W = 0.086, H = 0.076, Lb = 0.17;
  const body = new THREE.Group(); body.position.set(0, -H / 2 - 0.01, 0.03); head.add(body);
  head.add(tag(rbox(0.03, 0.012, 0.04, M.graphite, 0, -0.008, 0.02, 0.003), 'camGimbal'));
  const shellG = new THREE.Group();
  shellG.add(rbox(0.004, H, Lb, M.graphite, -W / 2 + 0.002, 0, 0, 0.0015));
  shellG.add(rbox(W, 0.004, Lb, M.graphite, 0, -H / 2 + 0.002, 0, 0.0015));
  shellG.add(rbox(W, 0.004, Lb, M.graphite, 0, H / 2 - 0.002, 0, 0.0015));
  shellG.add(rbox(W, H, 0.004, M.graphite, 0, 0, -Lb / 2 + 0.002, 0.0015));
  for (let i = -3; i <= 3; i++) shellG.add(bx(0.004, 0.012, 0.14, M.galvDark, i * 0.011, H / 2 + 0.006, 0));
  const fr = new THREE.Shape(); fr.moveTo(-W / 2, -H / 2); fr.lineTo(W / 2, -H / 2); fr.lineTo(W / 2, H / 2); fr.lineTo(-W / 2, H / 2); fr.closePath();
  const fh = new THREE.Path(); fh.absarc(0, 0, 0.022, 0, Math.PI * 2, true); fr.holes.push(fh);
  shellG.add(at(new THREE.Mesh(new THREE.ExtrudeGeometry(fr, { depth: 0.005, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2 }), M.graphite), 0, 0, Lb / 2 - 0.005));
  const ledM = glow(0x8b5cf6, 1.2);
  shellG.add(at(bx(0.06, 0.003, 0.0008, ledM), 0, -H / 2 + 0.008, Lb / 2 + 0.0012));
  body.add(tag(shellG, 'camShell'));
  const ag = gland(0.005); ag.rotation.x = -Math.PI / 2; ag.position.set(0, -0.01, -Lb / 2 - 0.001); body.add(ag);
  // inside: C-mount lens + sensor at the front, NPU board on the left wall facing the door, blower fan, M.2, PoE
  const sm = sensorModule(anim, { big: true, lensLen: 0.016 }); sm.position.set(0, 0, Lb / 2 - 0.052); body.add(sm);
  const npuG = new THREE.Group(); npuG.rotation.z = -Math.PI / 2; npuG.position.set(-W / 2 + 0.008, 0, -0.022); body.add(npuG);
  npuG.add(board(0.064, 0.12, 'EDGE-NPU-2T', 71, '#14213d'));
  npuG.add(at(qfp(0.014), 0.008, 0, -0.03));
  const chs = heatsink(0.024, 0.024, 0.012, 9, M.copper); chs.position.set(0.008, 0.0014, -0.03); npuG.add(chs);
  for (const [x, z] of [[-0.016, -0.03], [-0.016, -0.012], [0.022, -0.008]]) npuG.add(at(qfp(0.008, M.chip, false), x, 0, z));
  const m2 = new THREE.Group(); m2.position.set(-0.006, 0.003, 0.03); m2.add(board(0.022, 0.042, 'M.2 2242', 81, '#0f172a')); m2.add(at(qfp(0.009, M.chip, false), 0, 0.0005, -0.006)); m2.add(at(qfp(0.006, M.chip, false), 0, 0.0005, 0.01)); npuG.add(m2);
  smd(npuG, 0.064, 0.12, 90, 17, [[0.008, -0.03, 0.028, 0.028], [-0.006, 0.03, 0.024, 0.044]]);
  tag(npuG, 'camNpu');
  const fan = new THREE.Group(); fan.position.set(0.008, 0.016, -0.03);
  fan.add(at(cyl(0.012, 0.012, 0.006, M.fan, 32), 0, 0, 0));
  const rotor = new THREE.Group(); rotor.position.y = 0.0032;
  for (let i = 0; i < 9; i++) { const p = new THREE.Group(); p.rotation.y = (i / 9) * Math.PI * 2; const bl = bx(0.0008, 0.001, 0.0085, M.matte, 0, 0, 0.0055); bl.rotation.y = 0.5; p.add(bl); rotor.add(p); }
  rotor.add(at(cyl(0.004, 0.004, 0.0014, M.matte, 20), 0, 0, 0));
  fan.add(rotor); npuG.add(tag(fan, 'camFan')); anim.fans.push(rotor);
  const pb = poeBoard(0.04, 0.026); pb.position.set(0.012, -H / 2 + 0.008, -Lb / 2 + 0.02); body.add(pb);
  body.add(ribbon([0, -0.02, Lb / 2 - 0.054], [-W / 2 + 0.012, -0.02, 0.03], 0.002));
  body.add(tag(tube([[0.006, -H / 2 + 0.013, -Lb / 2 + 0.03], [0.004, -0.02, -0.02], [-W / 2 + 0.012, -0.012, -0.05]], 0.0013, M.wireR), 'camPoe'));
  body.add(tag(tube([[0.014, -H / 2 + 0.013, -Lb / 2 + 0.03], [0.01, -0.024, -0.02], [-W / 2 + 0.012, -0.016, -0.05]], 0.0013, M.wireK), 'camPoe'));
  body.add(lensMarker(0, 0, Lb / 2 + 0.002));
  // right side door, hinged on its front vertical edge, two thumb screws at the back
  const hinge = new THREE.Group(); hinge.position.set(W / 2, 0, Lb / 2 - 0.002); body.add(hinge);
  const door = new THREE.Group(); door.position.set(0, 0, -Lb / 2 + 0.002); hinge.add(door);
  door.add(rbox(0.004, H, Lb - 0.004, M.graphite, -0.002, 0, 0, 0.0015));
  const tagM = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.016), labelTex(240, 76, (c, w, h) => { c.fillStyle = '#2a2e35'; c.fillRect(0, 0, w, h); c.fillStyle = '#c4b5fd'; c.font = `700 34px ${FONT}`; c.fillText('EDGE AI', 12, 44); c.fillStyle = '#9ca3af'; c.font = `500 16px ${MONO}`; c.fillText('NPU 2 TOPS · 4MP', 12, 66); }));
  tagM.rotation.y = Math.PI / 2; door.add(at(tagM, 0.0002, -0.012, 0.02));
  const ts = []; for (const y of [-0.026, 0.026]) { const t = knurl(0.0045, 0.005, M.steel, 14); t.rotation.y = Math.PI / 2; t.position.set(0.002, y, -Lb / 2 + 0.014); door.add(t); ts.push(t); }
  tag(door, 'camShell'); ts.forEach((t) => tag(t, 'camScrew'));
  return {
    g, anim,
    pose(k) {
      const a = Math.min(1, k / 0.3), b = Math.max(0, (k - 0.3) / 0.7);
      ts.forEach((t) => { t.position.x = 0.002 + 0.004 * a; t.rotation.x = a * 8; });
      hinge.rotation.y = b * 1.75;
    },
  };
}

function emptyCap() {
  const g = new THREE.Group();
  g.add(at(cyl(0.022, 0.026, 0.026, M.rubber), 0, -0.013, 0));
  const tg = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.03), new THREE.MeshStandardMaterial({ roughness: 0.5, side: THREE.DoubleSide, map: canvasTex(300, 100, (c, w, h) => {
    c.fillStyle = '#facc15'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `600 36px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('พร้อมติดกล้อง', w / 2, h / 2 + 2);
  }) }));
  g.add(at(tg, 0, -0.045, 0.03));
  tag(g, 'camMount');
  return { g, anim: newAnim(), pose() {} };
}

const BUILDERS = { dome: domeCam, bullet: bulletCam, ptz: ptzCam, fisheye: fisheyeCam, ai: aiCam, none: emptyCap };

/* ---------------------------------------------------------------- pole parts */
function solarTex() {
  return canvasTex(512, 456, (c, w, h) => {
    c.fillStyle = '#d7dbe0'; c.fillRect(0, 0, w, h);
    const cols = 6, rows = 6, pad = 12, gx = 4;
    const cw = (w - pad * 2 - gx * (cols - 1)) / cols, ch = (h - pad * 2 - gx * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const x = pad + k * (cw + gx), y = pad + r * (ch + gx);
      const gr = c.createLinearGradient(x, y, x + cw, y + ch);
      gr.addColorStop(0, '#1c2a4a'); gr.addColorStop(1, '#0f1a33');
      c.fillStyle = gr; c.fillRect(x, y, cw, ch);
      c.strokeStyle = 'rgba(190,200,215,.55)'; c.lineWidth = 1.2;
      for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(x + (cw * i) / 3, y); c.lineTo(x + (cw * i) / 3, y + ch); c.stroke(); }
      c.strokeStyle = 'rgba(190,200,215,.18)'; c.lineWidth = 0.6;
      for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(x, y + (ch * i) / 8); c.lineTo(x + cw, y + (ch * i) / 8); c.stroke(); }
    }
  });
}

// power box: door opens onto battery, MPPT (live LCD), timer relay, 4G router, fuses, terminals
function powerBox(anim) {
  const g = new THREE.Group();
  const W = 0.26, H = 0.36, D = 0.15, t = 0.003;
  const shell = new THREE.Group();
  shell.add(bx(W, H, t, M.box, 0, 0, -D / 2 + t / 2));
  for (const sx of [-1, 1]) shell.add(bx(t, H, D, M.box, sx * (W / 2 - t / 2), 0, 0));
  shell.add(bx(W, t, D, M.box, 0, H / 2 - t / 2, 0)); shell.add(bx(W, t, D, M.box, 0, -H / 2 + t / 2, 0));
  shell.add(rbox(W + 0.024, 0.012, D + 0.02, M.box, 0, H / 2 + 0.006, 0.006, 0.003));
  for (let i = 0; i < 3; i++) { const gl = gland(0.006); gl.rotation.x = Math.PI; gl.position.set(-0.07 + i * 0.07, -H / 2 - 0.002, 0); shell.add(gl); }
  g.add(tag(shell, 'camBox'));
  g.add(tag(bx(W - 0.016, H - 0.016, 0.002, M.boxIn, 0, 0, -D / 2 + 0.004), 'camBox'));
  // battery on the floor
  const bat = new THREE.Group(); bat.position.set(0, -H / 2 + 0.06, -0.01);
  bat.add(rbox(0.18, 0.11, 0.1, M.battery, 0, 0, 0, 0.005));
  const bl = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.08), labelTex(450, 240, (c, w, h) => { c.fillStyle = '#1e5aa8'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = `700 52px ${FONT}`; c.fillText('LiFePO4', 22, 70); c.font = `600 34px ${MONO}`; c.fillText('12.8V 20Ah', 22, 124); c.font = `500 24px ${MONO}`; c.fillText('256Wh · BMS · IP65', 22, 168); c.fillStyle = '#facc15'; c.fillRect(22, 196, 120, 14); }));
  bat.add(at(bl, 0, 0, 0.0505));
  bat.add(at(cyl(0.006, 0.006, 0.01, M.wireR, 12), -0.06, 0.06, 0.02)); bat.add(at(cyl(0.006, 0.006, 0.01, M.wireK, 12), 0.06, 0.06, 0.02));
  g.add(tag(bat, 'boxBattery'));
  // DIN rail + modules
  const railY = 0.06, rz = -D / 2 + 0.009;
  g.add(tag(bx(0.22, 0.035, 0.008, M.din, 0, railY, rz), 'boxFuse'));
  const mppt = new THREE.Group(); mppt.position.set(-0.07, railY + 0.01, rz + 0.04);
  mppt.add(rbox(0.07, 0.1, 0.07, new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 }), 0, 0, 0, 0.004));
  const lcdC = document.createElement('canvas'); lcdC.width = 200; lcdC.height = 120;
  const lcdT = new THREE.CanvasTexture(lcdC); lcdT.colorSpace = THREE.SRGBColorSpace;
  mppt.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.03), new THREE.MeshStandardMaterial({ map: lcdT, emissive: 0xffffff, emissiveMap: lcdT, emissiveIntensity: 0.55, roughness: 0.3 })), 0, 0.022, 0.0352));
  for (let i = 0; i < 3; i++) mppt.add(at(cyl(0.003, 0.003, 0.003, M.chip, 12).rotateX(Math.PI / 2), -0.014 + i * 0.014, -0.006, 0.0355));
  for (let i = 0; i < 6; i++) mppt.add(at(bx(0.008, 0.012, 0.01, M.term), -0.025 + i * 0.01, -0.044, 0.03));
  const mlab = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.01), labelTex(250, 50, (c, w, h) => { c.fillStyle = '#1f2937'; c.fillRect(0, 0, w, h); c.fillStyle = '#e5e7eb'; c.font = `700 30px ${MONO}`; c.fillText('MPPT 10A', 8, 36); }));
  mppt.add(at(mlab, 0, -0.024, 0.0352));
  g.add(tag(mppt, 'boxMppt'));
  anim.lcd = { c: lcdC, t: lcdT, k: 0 };
  const relay = new THREE.Group(); relay.position.set(0.0, railY, rz + 0.03);
  relay.add(rbox(0.018, 0.09, 0.06, M.module, 0, 0, 0, 0.002));
  const rl = glow(0x22c55e, 0.05); anim.relay = rl;
  relay.add(at(cyl(0.002, 0.002, 0.002, rl, 12).rotateX(Math.PI / 2), 0, 0.028, 0.031));
  relay.add(at(cyl(0.006, 0.006, 0.004, M.term, 20).rotateX(Math.PI / 2), 0, 0.01, 0.031));
  relay.add(at(bx(0.001, 0.005, 0.001, M.chip), 0, 0.012, 0.0335));
  g.add(tag(relay, 'boxRelay'));
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group(); f.position.set(0.024 + i * 0.019, railY, rz + 0.025);
    f.add(rbox(0.017, 0.08, 0.05, M.term, 0, 0, 0, 0.002)); f.add(at(cyl(0.005, 0.005, 0.012, M.red, 16).rotateX(Math.PI / 2), 0, 0.012, 0.028));
    g.add(tag(f, 'boxFuse'));
  }
  for (let i = 0; i < 4; i++) g.add(tag(bx(0.006, 0.05, 0.04, i === 3 ? M.wireB : M.term, 0.083 + i * 0.007, railY - 0.003, rz + 0.02), 'boxFuse'));
  const router = new THREE.Group(); router.position.set(0.0, H / 2 - 0.06, rz + 0.022);
  router.add(rbox(0.16, 0.06, 0.04, M.module, 0, 0, 0, 0.006));
  const rlab = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.014), labelTex(240, 56, (c, w, h) => { c.fillStyle = '#e6e8ea'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `700 30px ${MONO}`; c.fillText('LTE CAT4', 10, 38); }));
  router.add(at(rlab, -0.04, 0.012, 0.0202));
  const rLeds = [];
  for (let i = 0; i < 4; i++) { const m = glow([0x22c55e, 0x22c55e, 0x3b82f6, 0xf59e0b][i], 0.3); rLeds.push(m); router.add(at(bx(0.004, 0.003, 0.001, m), 0.02 + i * 0.01, 0.012, 0.0205)); }
  anim.router = rLeds;
  for (const sx of [-1, 1]) router.add(tube([[sx * 0.07, 0.02, 0], [sx * 0.08, 0.04, 0.02], [sx * 0.06, 0.055, 0.04]], 0.0018, M.wireK, 10));
  g.add(tag(router, 'boxRouter'));
  const wires = new THREE.Group();
  wires.add(tube([[-0.06, -H / 2 + 0.12, 0.01], [-0.09, -0.02, 0.0], [-0.09, railY - 0.04, rz + 0.06]], 0.0022, M.wireR));
  wires.add(tube([[0.06, -H / 2 + 0.12, 0.01], [0.1, -0.02, 0.0], [0.06, railY - 0.04, rz + 0.05]], 0.0022, M.wireK));
  wires.add(tube([[0.0, railY - 0.045, rz + 0.05], [0.025, railY + 0.06, rz + 0.055], [0.03, H / 2 - 0.09, rz + 0.04]], 0.0016, M.wireB));
  wires.add(tube([[-0.07, railY + 0.06, rz + 0.06], [-0.075, H / 2 - 0.05, rz + 0.06], [-0.05, H / 2 - 0.035, rz + 0.03]], 0.0018, M.wireY));
  g.add(tag(wires, 'boxFuse'));
  // door: hinged on the left edge, gasket, two quarter-turn locks, label
  const hinge = new THREE.Group(); hinge.position.set(-W / 2, 0, D / 2); g.add(hinge);
  const door = new THREE.Group(); door.position.set(W / 2, 0, 0); hinge.add(door);
  const doorTex = canvasTex(260, 360, (c, w, h) => {
    c.fillStyle = '#c9cdd1'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.beginPath(); c.roundRect(18, 24, w - 36, 124, 12); c.fill();
    c.fillStyle = '#7c3aed'; c.font = `700 40px ${FONT}`; c.textAlign = 'center'; c.fillText('CAM-POLE', w / 2, 74);
    c.fillStyle = '#374151'; c.font = `500 22px ${FONT}`; c.fillText('แบต 12.8V 20Ah · 4G', w / 2, 108); c.fillText('โซลาร์ 40W', w / 2, 134);
    c.fillStyle = '#facc15'; c.beginPath(); c.moveTo(w / 2, 186); c.lineTo(w / 2 + 40, 254); c.lineTo(w / 2 - 40, 254); c.fill();
    c.fillStyle = '#111'; c.font = `700 46px ${FONT}`; c.fillText('!', w / 2, 246);
    c.fillStyle = '#6b7280'; c.font = `500 20px ${FONT}`; c.fillText('เจ้าหน้าที่เท่านั้น', w / 2, 300);
  });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(W + 0.004, H + 0.004, 0.006), [M.box, M.box, M.box, M.box, new THREE.MeshPhysicalMaterial({ map: doorTex, roughness: 0.45, clearcoat: 0.3 }), M.boxIn]);
  panel.position.z = 0.003; door.add(panel);
  for (const [w, h, x, y] of [[W - 0.02, 0.005, 0, H / 2 - 0.012], [W - 0.02, 0.005, 0, -H / 2 + 0.012], [0.005, H - 0.02, W / 2 - 0.012, 0], [0.005, H - 0.02, -W / 2 + 0.012, 0]]) door.add(bx(w, h, 0.004, M.rubber, x, y, -0.002));   // gasket
  for (const y of [-0.12, 0.12]) { door.add(at(cyl(0.008, 0.008, 0.006, M.chip, 20).rotateX(Math.PI / 2), W / 2 - 0.024, y, 0.009)); door.add(at(bx(0.002, 0.009, 0.002, M.steel), W / 2 - 0.024, y, 0.0125)); }
  const statusLed = glow(0x22c55e, 0.6); anim.boxLed = statusLed;
  door.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.005, 16), statusLed), W / 2 - 0.03, -H / 2 + 0.03, 0.0062));
  for (let i = 0; i < 3; i++) door.add(at(cyl(0.004, 0.004, 0.03, M.steel, 10), -W / 2 - 0.004, -0.12 + i * 0.12, 0.003));
  tag(door, 'camBox');
  return { g, hinge };
}

function drawLcd(a, time) {
  const c = a.c.getContext('2d');
  const v = 13.1 + Math.sin(time * 0.3) * 0.25, i = 1.6 + Math.sin(time * 0.7) * 0.5, pv = 18.4 + Math.sin(time * 0.5) * 0.6;
  c.fillStyle = '#8fbf5a'; c.fillRect(0, 0, 200, 120);
  c.fillStyle = '#1b2a10'; c.font = `700 26px ${MONO}`;
  c.fillText(`PV  ${pv.toFixed(1)}V`, 10, 32); c.fillText(`BAT ${v.toFixed(2)}V`, 10, 66); c.fillText(`CHG ${i.toFixed(2)}A`, 10, 100);
  c.fillRect(170, 14, 18, 92); c.fillStyle = '#8fbf5a'; c.fillRect(173, 17, 12, 86 * (1 - (v - 12.6) / 1.2));
  a.t.needsUpdate = true;
}

/* ---------------------------------------------------------------- the pole */
/**
 * aim: point (pole-local) the camera looks at. boom: how far the arm reaches toward -x (over the station).
 */
export function buildCamPole(aim, { boom = 1.5, initial = 'dome' } = {}) {
  const g = new THREE.Group();
  const H = POLE_H, R = 0.038, boomY = H - 0.08;

  const foot = new THREE.Group();
  foot.add(rbox(0.3, 0.06, 0.3, M.concrete, 0, 0.03, 0, 0.008));
  foot.add(rbox(0.2, 0.012, 0.2, M.galv, 0, 0.066, 0, 0.002));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { foot.add(at(cyl(0.011, 0.011, 0.012, M.galvDark, 6), sx * 0.075, 0.078, sz * 0.075)); foot.add(at(cyl(0.006, 0.006, 0.02, M.galv, 10), sx * 0.075, 0.09, sz * 0.075)); }
  for (let i = 0; i < 4; i++) { const pv = new THREE.Group(); pv.rotation.y = i * Math.PI / 2 + Math.PI / 4; pv.add(rbox(0.006, 0.08, 0.05, M.galv, 0, 0.112, R + 0.024, 0.001)); foot.add(pv); }
  g.add(tag(foot, 'camPole'));
  const shaft = new THREE.Group();
  shaft.add(at(cyl(R, R, H - 0.07, M.galv, 32), 0, 0.072 + (H - 0.07) / 2, 0));
  shaft.add(at(new THREE.Mesh(new THREE.SphereGeometry(R + 0.002, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.galv), 0, H, 0));
  shaft.add(rbox(0.05, 0.12, 0.004, M.galvDark, 0, 0.45, R + 0.001, 0.003));          // hand-hole cover
  for (const y of [0.4, 0.5]) shaft.add(at(cyl(0.004, 0.004, 0.004, M.steel, 8).rotateX(Math.PI / 2), 0, y, R + 0.004));
  g.add(tag(shaft, 'camPole'));

  // boom over the station (toward -x) with a diagonal brace and an end cap
  const boomG = new THREE.Group();
  boomG.add(at(cx(0.024, boom, M.galv, 24), -boom / 2, boomY, 0));
  boomG.add(at(cx(0.026, 0.006, M.galvDark, 24), -boom, boomY, 0));
  const br = new THREE.Vector3(0, boomY - 0.5, 0), bt = new THREE.Vector3(-boom * 0.45, boomY - 0.02, 0);
  const brace = cyl(0.012, 0.012, br.distanceTo(bt), M.galv, 16); brace.position.copy(br).lerp(bt, 0.5);
  brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bt.clone().sub(br).normalize()); boomG.add(brace);
  for (const y of [boomY, boomY - 0.5]) { boomG.add(at(torus(R + 0.005, 0.008, M.galvDark, 24).rotateX(Math.PI / 2), 0, y, 0)); boomG.add(rbox(0.05, 0.05, 0.02, M.galvDark, -0.05, y, 0, 0.004)); }
  g.add(tag(boomG, 'camPole'));

  const ties = new THREE.Group(); g.add(ties);

  const solar = new THREE.Group(); solar.position.y = H + 0.06;
  solar.add(at(cyl(0.022, 0.022, 0.08, M.galvDark), 0, -0.04, 0));
  const tilt = new THREE.Group(); tilt.rotation.x = -0.26; solar.add(tilt);
  tilt.add(rbox(0.56, 0.03, 0.5, M.galv, 0, 0, 0, 0.004));
  tilt.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.48).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ map: solarTex(), roughness: 0.18, metalness: 0.3, clearcoat: 1 })), 0, 0.0155, 0));
  tilt.add(rbox(0.08, 0.02, 0.05, M.black, 0, -0.025, -0.15, 0.004));
  for (const sx of [-1, 1]) tilt.add(rbox(0.03, 0.03, 0.42, M.galvDark, sx * 0.12, -0.03, 0, 0.003));
  g.add(tag(solar, 'camSolar'));

  // power box on the outer face (+x, away from the station) on two pole bands
  const anim = { open: 0, target: 0 };
  const pbx = powerBox(anim);
  pbx.g.rotation.y = Math.PI / 2;
  pbx.g.position.set(R + 0.08, 1.45, 0); g.add(pbx.g);
  for (const y of [1.36, 1.54]) { g.add(tag(at(torus(R + 0.004, 0.006, M.galvDark, 24).rotateX(Math.PI / 2), 0, y, 0), 'camBox')); g.add(tag(rbox(0.012, 0.03, 0.06, M.galvDark, R + 0.006, y, 0, 0.003), 'camBox')); }
  g.add(tag(at(cyl(0.006, 0.004, 0.13, M.black, 10), R + 0.08, 1.45 + 0.25, -0.1), 'boxRouter'));
  // cables: box -> up the pole -> along the boom to the mount; solar -> down to the box
  g.add(tag(tube([[R + 0.06, 1.45 + 0.19, 0.05], [R + 0.012, 1.8, 0.03], [R + 0.01, boomY - 0.06, 0.02], [-0.12, boomY - 0.028, 0.026], [-boom + 0.1, boomY - 0.026, 0.026]], 0.0055, M.wireK, 40), 'camPole'));
  g.add(tag(tube([[0, H + 0.02, 0.03], [-R - 0.01, H - 0.2, 0], [-R - 0.01, 1.8, 0], [R + 0.06, 1.45 + 0.19, -0.05]], 0.004, M.wireK, 30), 'camSolar'));

  // universal mount under the boom tip: junction plate (4 holes) + female dovetail + red spring latch
  const mount = new THREE.Group(); mount.position.set(-boom + 0.06, boomY - 0.024, 0);
  mount.add(at(cyl(0.008, 0.008, 0.02, M.galv, 12), 0, -0.002, 0));
  const plate = new THREE.Group(); plate.position.y = -0.016; mount.add(plate);
  plate.add(cyl(0.07, 0.07, 0.01, M.galv, 48));
  for (let i = 0; i < 4; i++) { const t = (i / 4) * Math.PI * 2 + Math.PI / 4; plate.add(at(cyl(0.006, 0.006, 0.012, M.galvDark, 6), Math.cos(t) * 0.05, 0, Math.sin(t) * 0.05)); }
  plate.add(at(bx(0.064, 0.006, 0.006, M.graphite), 0, -0.008, 0.012)); plate.add(at(bx(0.064, 0.006, 0.006, M.graphite), 0, -0.008, -0.012));
  const latch = new THREE.Group(); latch.position.set(0.034, -0.008, 0);
  latch.add(bx(0.012, 0.008, 0.016, M.red)); latch.add(at(cyl(0.0018, 0.0018, 0.01, M.steel, 8).rotateZ(Math.PI / 2), -0.008, 0, 0));
  plate.add(latch);
  const ml = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.012), labelTex(300, 60, (c, w, h) => { c.fillStyle = '#aeb4ba'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = `600 30px ${MONO}`; c.fillText('UNI-MOUNT 83.5', 12, 42); }));
  plate.add(at(ml, 0, 0, 0.0702));
  g.add(tag(mount, 'camMount'));

  const slot = new THREE.Group();
  slot.position.set(mount.position.x, mount.position.y - 0.016 - 0.011, 0);
  const toAim = aim.clone().sub(slot.position);
  slot.rotation.y = Math.atan2(toAim.x, toAim.z);
  g.add(slot);
  const lookDown = Math.atan2(-toAim.y, Math.hypot(toAim.x, toAim.z));

  const cams = {};
  for (const [k, fn] of Object.entries(BUILDERS)) {
    const c = fn(lookDown);
    c.g.visible = false;
    c.open = 0; c.target = 0;
    c.pose(0);
    slot.add(c.g);
    cams[k] = c;
  }
  let cur = initial, next = null, t = 1, phase = 'idle', night = false, time = 0, nightV = 0;
  cams[cur].g.visible = true;

  function setLightsFor(c, k) {
    c.anim.ir.forEach((m) => (m.emissiveIntensity = 2.2 * k));
    c.anim.ircut.forEach((p) => (p.position.x = -0.0115 * k));
  }
  const e = (x) => x * x * (3 - 2 * x);
  function swapPose(c, k) {           // k: 0 = seated, 1 = slid out and dropped
    const press = Math.min(1, k / 0.2), slide = Math.min(1, Math.max(0, (k - 0.2) / 0.45)), drop = Math.max(0, (k - 0.65) / 0.35);
    latch.position.x = 0.034 + 0.006 * press;
    c.g.position.set(-0.08 * e(slide), -0.12 * e(drop), 0);
    c.g.scale.setScalar(1 - 0.85 * e(drop));
  }

  return {
    group: g,
    slot,
    aim,
    type: () => next ?? cur,
    head: () => cams[next ?? cur].g,
    lens(type = next ?? cur) {
      const l = cams[type].g.getObjectByName('lens');
      if (!l) return null;
      cams[type].g.updateMatrixWorld(true);
      return l.getWorldPosition(new THREE.Vector3());
    },
    setType(k) {
      if (!cams[k] || k === (next ?? cur)) return;
      if (phase === 'in') { swapPose(cams[cur], 0); }
      cams[cur].target = 0;
      next = k; phase = 'out'; t = 0;
    },
    setOpen(v) { if (phase === 'idle') cams[cur].target = v ? 1 : 0; },
    isOpen: () => phase === 'idle' && cams[cur].target === 1,
    canOpen: () => (next ?? cur) !== 'none',
    setBoxOpen(v) { anim.target = v ? 1 : 0; },
    isBoxOpen: () => anim.target === 1,
    setNight(v) { night = v; },
    isNight: () => night,
    tieTo(off, ys) {
      ties.clear();
      ties.rotation.y = Math.atan2(off.x, off.z);
      const d = Math.hypot(off.x, off.z), len = d - R;
      for (const y of ys) {
        ties.add(at(torus(R + 0.004, 0.006, M.galvDark, 24).rotateX(Math.PI / 2), 0, y, 0));
        ties.add(rbox(0.006, 0.03, len, M.galvDark, 0, y, R + len / 2, 0.002));
        ties.add(rbox(0.07, 0.06, 0.006, M.galvDark, 0, y, d - 0.003, 0.002));
        for (const sx of [-1, 1]) ties.add(at(cyl(0.004, 0.004, 0.008, M.steel, 6).rotateX(Math.PI / 2), sx * 0.022, y, d - 0.008));
      }
      tag(ties, 'camPole');
    },
    // 0 idle · 1 repaint · 2 moved · 3 light only
    update(dt) {
      let res = 0;
      time += dt;
      let c = cams[cur];
      // swap: cover shuts first, then press the latch, slide the shoe out of the rail and drop; reverse for the new body
      if (phase === 'out' && c.open <= 0.001) {
        t = Math.min(1, t + dt / 0.6); swapPose(c, t);
        if (t >= 1) { swapPose(c, 0); c.g.visible = false; cur = next; next = null; phase = 'in'; t = 0; c = cams[cur]; c.g.visible = true; setLightsFor(c, nightV); swapPose(c, 1); }
        res = 2;
      } else if (phase === 'in') {
        t = Math.min(1, t + dt / 0.6); swapPose(c, 1 - t);
        if (t >= 1) { swapPose(c, 0); phase = 'idle'; }
        res = 2;
      }
      const goal = phase === 'out' ? 0 : c.target;
      if (Math.abs(goal - c.open) > 1e-4) {
        c.open += Math.sign(goal - c.open) * Math.min(Math.abs(goal - c.open), dt * (phase === 'out' ? 2 : 0.9));
        c.pose(e(c.open));
        res = 2;
      }
      const nk = night ? 1 : 0;
      if (Math.abs(nk - nightV) > 1e-3) { nightV += Math.sign(nk - nightV) * Math.min(Math.abs(nk - nightV), dt * 4); setLightsFor(c, nightV); res = Math.max(res, 1); }
      // working inside: animated only while somebody is looking (cover or box open)
      const live = c.open > 0.05 || anim.open > 0.05;
      if (live) {
        const blink = Math.sin(time * 6) > 0 ? 1.6 : 0.1;
        c.anim.status.forEach((m) => (m.emissiveIntensity = blink));
        c.anim.sd.forEach((m) => (m.emissiveIntensity = Math.sin(time * 23) > 0.6 ? 1.4 : 0.05));
        c.anim.focus.forEach((f) => (f.rotation.z = Math.sin(time * 0.8) * 0.5));
        c.anim.zoom.forEach((z) => (z.position.z = (z.userData.z0 ??= z.position.z) + (Math.sin(time * 0.7) * 0.5 + 0.5) * 0.004));
        c.anim.fans.forEach((f) => (f.rotation.y += dt * 40));
        if (c.anim.pan) {
          const yaw = Math.sin(time * 0.5) * 0.35;
          c.anim.pan.panG.rotation.y = yaw;
          c.anim.pan.pinion.rotation.y = -yaw * (60 / 14);
        }
        // capture cycle: every 6 s the relay powers the camera and the router sends
        const cap = time % 6 < 1.6;
        anim.relay.emissiveIntensity = cap ? 1.6 : 0.05;
        anim.router.forEach((m, i) => (m.emissiveIntensity = i === 2 ? (cap && Math.sin(time * 30) > 0 ? 1.8 : 0.1) : i === 3 ? 0.2 : 1.1));
        anim.boxLed.emissiveIntensity = cap ? 1.4 : 0.4;
        anim.lcd.k += dt; if (anim.lcd.k > 0.5) { anim.lcd.k = 0; drawLcd(anim.lcd, time); }
        res = Math.max(res, c.anim.fans.length || c.anim.pan || c.anim.zoom.length || c.anim.focus.length ? 1 : 3);
      } else if (c.anim.pan && c.anim.pan.panG.rotation.y !== 0 && c.open <= 0.05) {
        c.anim.pan.panG.rotation.y = 0; res = Math.max(res, 1);
      }
      if (Math.abs(anim.target - anim.open) > 1e-4) {
        anim.open += Math.sign(anim.target - anim.open) * Math.min(Math.abs(anim.target - anim.open), dt * 1.2);
        pbx.hinge.rotation.y = -e(anim.open) * 1.9;
        if (anim.open > 0.01 && anim.lcd.k === 0) drawLcd(anim.lcd, time);
        res = 2;
      }
      return res;
    },
  };
}
