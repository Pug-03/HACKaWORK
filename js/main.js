import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CONFIG } from './config.js';
import { buildStation } from './binStation.js';
import { buildEnvironment, STREET } from './environment.js';
import { buildTruck } from './truck.js';
import { buildCircuitPanel } from './circuit.js';
import { buildRiser, RISER } from './riser.js';
import { buildHardware, kitTotal } from './hardware.js';
import { buildComposter, COMPOSTER } from './composter.js';
import { buildShop, SHOP } from './shop.js';
import { buildVariants, ARROW_LAYER, COMPARE, VARIANT_INFO } from './variants.js';
import { CAM_TYPES, CAM_TIPS, poleTotal } from './camPole.js';

await Promise.all([
  document.fonts.load('600 80px Kanit'),
  document.fonts.load('500 30px Kanit'),
]).catch(() => {});

const viewport = document.getElementById('viewport');

/* ---------- renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
const DPR = Math.min(devicePixelRatio, 1.5);   // 1.5 is visually close to 2 at ~half the pixels
renderer.setPixelRatio(DPR);
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;           // shadows re-rendered only when something moves
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.setAttribute('aria-label', 'โมเดล 3 มิติสถานีคัดแยกขยะ กทม. 4 ช่อง พร้อมฐานยกกันหนู เครื่องหมักปุ๋ย และรถเก็บขยะไฟฟ้า · ใช้ปุ่มในแผงด้านข้างเพื่อเปิดฝา ดูภายใน และจำลองระบบ');
viewport.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(viewport.clientWidth, viewport.clientHeight);
labelRenderer.domElement.className = 'labels';
viewport.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
// render-on-demand flags (see loop below); declared early because setup code calls invalidate()
let dirty = true, shadowsDirty = true, needHQ = true, lastMotion = 0, lightDirty = false;

const camera = new THREE.PerspectiveCamera(38, viewport.clientWidth / viewport.clientHeight, 0.05, 100);
camera.layers.enable(1);                         // explain layer: sky arrows, CCTV field of view
camera.position.set(3.6, 2.1, 4.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.4, 0.7, 0);
// portrait screens see a much narrower slice: start further back so the whole station fits
camera.position.sub(controls.target).multiplyScalar(Math.min(2, Math.max(1, 1.1 / camera.aspect))).add(controls.target);
controls.enableDamping = true;
controls.minDistance = 0.06;                       // close enough to inspect the trays under the riser
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.6;            // can drop below the deck and look slightly up
controls.autoRotateSpeed = 1.2;

/* ---------- station ---------- */
const station = buildStation(renderer);
const L = station.length, D = CONFIG.frame.depth, H = CONFIG.frame.height;
const env = buildEnvironment(scene, renderer, L, D);
const B = CONFIG.bin;
// heights are measured from the station's own base (the dimension group sits on the pad / riser with it)
const lidTop = CONFIG.frame.footHeight + 0.008 + B.rimHeight + 0.005 + B.lidThickness + B.hoodHeight;
scene.add(station.group);

// separate raised anti-rodent base; the station is placed on top of it
const riser = buildRiser(renderer, L, D);
riser.group.position.y = env.padHeight;
scene.add(riser.group);
let riserOn = true, dimsRef = null, variants = null;
const lift = () => (riserOn ? RISER.height : 0);
function placeStation() {
  station.group.position.y = env.padHeight + lift();
  riser.group.visible = riserOn;
  if (dimsRef) dimsRef.position.y = env.padHeight + lift();   // same base as the station group
  variants?.setRiser(riserOn);
}
placeStation();

// smart hardware rides with the station
const hardware = buildHardware(station);
station.group.add(hardware.group);

// stand-alone composter cabinet beside the station
const composter = buildComposter(renderer);
const COMPOSTER_X = L / 2 + 0.5 + COMPOSTER.width / 2;   // 0.5 m walkway beside the station
composter.group.position.set(COMPOSTER_X, 0, 0.1);
scene.add(composter.group);

// fertilizer shop hut beside the composter, on its bag-panel side (+X), backed up to the curb line;
// 1.2 m clear walkway between the composter's bag pockets and the hut's side wall
const shop = buildShop();
const SHOP_X = COMPOSTER_X + COMPOSTER.width / 2 + 0.08 + 1.2 + SHOP.width / 2;
const SHOP_Z = 0.05;                                   // back wall 0.3 m in from the curb line
shop.group.position.set(SHOP_X, 0, SHOP_Z);
scene.add(shop.group);

// electric mini garbage truck: drives along the road behind the station on out-of-round calls
const truck = buildTruck();

// two more stations to compare how fill is measured: B = weighing plates, C = the BMA's CCTV + AI
variants = buildVariants({ renderer, scene, mainStation: station, padHeight: env.padHeight, onPick: (k) => flyToVariant(k) });
const allBins = [...station.bins, ...variants.bins];
truck.group.position.set(0, -STREET.curbHeight, STREET.curbZ - STREET.curbWidth - 1.25);
scene.add(truck.group);


/* ---------- dimension lines ---------- */
const dims = new THREE.Group();
const dimMat = new THREE.LineBasicMaterial({ color: 0xd1301f, depthTest: false });

function dimLine(a, b, text, tick) {
  const g = new THREE.Group();
  const pts = [a, b];
  for (const p of [a, b]) pts.push(p.clone().add(tick), p.clone().sub(tick));
  const geo = new THREE.BufferGeometry().setFromPoints([a, b, pts[2], pts[3], pts[4], pts[5]]);
  const line = new THREE.LineSegments(geo, dimMat);
  line.renderOrder = 10;
  g.add(line);
  const el = document.createElement('div');
  el.className = 'dim';
  el.textContent = text;
  const lbl = new CSS2DObject(el);
  lbl.position.copy(a).add(b).multiplyScalar(0.5);
  g.add(lbl);
  return g;
}
const fmt = (m) => `${(m * 100).toFixed(0)} ซม.`;
const off = 0.18;
dims.add(dimLine(new THREE.Vector3(-L / 2, 0.01, D / 2 + off), new THREE.Vector3(L / 2, 0.01, D / 2 + off), `ยาว ${fmt(L)}`, new THREE.Vector3(0, 0, 0.05)));
dims.add(dimLine(new THREE.Vector3(L / 2 + off, 0.01, D / 2), new THREE.Vector3(L / 2 + off, 0.01, -D / 2), `ลึก ${fmt(D)}`, new THREE.Vector3(0.05, 0, 0)));
dims.add(dimLine(new THREE.Vector3(L / 2 + off, 0, D / 2), new THREE.Vector3(L / 2 + off, H, D / 2), `สูงโครง ${fmt(H)}`, new THREE.Vector3(0.05, 0, 0)));
dims.add(dimLine(new THREE.Vector3(-L / 2 - off, 0, -0.05), new THREE.Vector3(-L / 2 - off, lidTop, -0.05), `สูงรวมถัง ${fmt(lidTop)}`, new THREE.Vector3(0.05, 0, 0)));
let x = -L / 2;
for (const bay of CONFIG.bays) {
  dims.add(dimLine(new THREE.Vector3(x, H + 0.25, D / 2), new THREE.Vector3(x + bay.width, H + 0.25, D / 2), fmt(bay.width), new THREE.Vector3(0, 0.03, 0)));
  x += bay.width;
}
dims.visible = false;
scene.add(dims);
dimsRef = dims;
placeStation();

/* ---------- 1.70 m human for scale ---------- */
const human = new THREE.Group();
{
  const hh = CONFIG.humanHeight;
  const mat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.8, transparent: true, opacity: 0.85 });
  const head = 0.23;
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, hh * 0.47 - 0.22, 4, 12), mat);
  legs.position.y = hh * 0.47 / 2 + 0.0;
  legs.scale.x = 1.5;
  // torso spans from hips (~0.46 h) up to the chin (~0.865 h)
  const t0 = hh * 0.46, t1 = hh - head + 0.02;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, t1 - t0 - 0.32, 4, 12), mat);
  torso.position.y = (t0 + t1) / 2;
  torso.scale.z = 0.65;
  const h = new THREE.Mesh(new THREE.SphereGeometry(head / 2, 20, 16), mat);
  h.position.y = hh - head / 2;
  for (const m of [legs, torso, h]) { m.castShadow = true; human.add(m); }
  const el = document.createElement('div');
  el.className = 'dim human';
  el.textContent = `คน ${fmt(hh)}`;
  const lbl = new CSS2DObject(el);
  lbl.position.y = hh + 0.12;
  human.add(lbl);
  human.position.set(-L / 2 - 0.65, 0, 0.35);
  human.visible = false;
  scene.add(human);
}

/* ---------- interaction: click a bin to open/close its lid ---------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
const tooltip = document.getElementById('tooltip');
const bayNames = Object.fromEntries(CONFIG.bays.map((b) => [b.id, `${b.th} · ${b.en}`]));
const PART_TIPS = {
  callButton: 'ปุ่มเรียกรถเก็บนอกรอบ · ค่าบริการ 500 บาท — คลิกเพื่อกด',
  unit: 'กล่องฮับ ESP32 · IP65 16×12×7.5 ซม. · รับค่าเซ็นเซอร์ฝาถังผ่าน BLE แล้วส่งเข้าแดชบอร์ดเขตผ่าน NB-IoT — คลิกเพื่อซูมดูวงจร',
  display: 'จอ e-paper 2.9″ 3 สี (ขาว/ดำ/แดง) · โชว์ระดับขยะแต่ละถัง แบต สัญญาณ และสถานะรถ · ภาพค้างได้โดยไม่กินไฟ อ่านชัดกลางแดด กินไฟเฉพาะตอนเปลี่ยนภาพ — คลิกเพื่อซูมดูวงจร',
  fan: 'พัดลมจิ๋ว 5V 30 มม. · เป่าลมร้อนออกทางช่องระบายมีครอบกันฝนด้านข้าง · ESP32 เปิดเฉพาะตอนในกล่องร้อนเกิน 45°C (บ่ายแดดจัด) จึงแทบไม่กินแบต — คลิกเพื่อซูมดูวงจร',
  unitLight: 'ไฟ LED ในกล่อง · ติดเองเมื่อเปิดฝา (สวิตช์แม่เหล็ก reed + แม่เหล็กที่ฝา) · มีเซ็นเซอร์แสง ติดเฉพาะตอนมืด ช่างมาเปิดกลางคืนก็เห็นชัด ปิดฝาแล้วดับเอง',
  unitInside: 'ภายในกล่องฮับ: ESP32-C3 · โมดูล NB-IoT + เสาอากาศแปะ · วงจรชาร์จโซลาร์ · ถ่าน 18650 ×2',
  batteryInside: 'ถ่าน 18650 ×2 (3.7V ~6,800 mAh) · ระบบใช้ไฟ ~40 mAh/วัน สำรองได้ราว 5 เดือนแม้ไม่มีแดด — คลิกเพื่อดูวงจรไฟเลี้ยง',
  trayLid: 'ฝาตลับเหยื่อ · บานพับขอบใน + กุญแจล็อก · เปิดได้เมื่อยกตลับออกมาวางแล้ว — คลิกเพื่อเปิด/ปิดฝา',
  tray: 'ตลับเหยื่อถอดได้ 42×56×8 ซม. · อยู่หัวท้ายฐาน ข้างละตลับ เลื่อนออกด้านข้างระหว่างขาฐาน (ไม่มีอะไรขวาง) ~45 ซม. แล้วยกออกไปเติมเหยื่อ เสร็จแล้วใส่คืน — คลิกเพื่อถอดออก/ใส่คืน',
  trayGate: 'ประตูล็อกช่องตลับ (เหล็กแบนสีเหลือง) + กุญแจคล้อง · ปิดล็อกไว้ คนทั่วไปดึงตลับออกไม่ได้ — คลิกเพื่อปลดล็อกแล้วถอดตลับ',
  riser: `ฐานยกกันหนู สูง ${RISER.height * 100} ซม. · ใต้ฐานโล่ง ทำความสะอาดง่าย · ตลับเหยื่อหัวท้ายฐานบนรางเหล็กฉาก ถอดออกด้านข้างได้`,
  ratGuard: 'แผ่นกันหนูปีน (rat guard) Ø 26 ซม. · หนูปีนเสาขึ้นมาแล้วติดใต้กรวย อ้อมขึ้นไปไม่ได้',
  composter: `เครื่องหมักปุ๋ยจากเศษอาหาร ${COMPOSTER.capacityL} ลิตร`,
  hatch: 'ช่องเติมเศษอาหาร — คลิกเพื่อเปิด/ปิด',
  drawer: 'ลิ้นชักปุ๋ยพร้อมใช้ (ล็อกไว้) — ชำระ 20 บาทที่แผงหยอดเหรียญ / สแกน QR ก่อน แล้วคลิกเพื่อดึงออก · ดันกลับแล้วล็อกใหม่',
  payPanel: 'แผงชำระเงินซื้อปุ๋ย · หยอดเหรียญ 1·2·5·10 บาท หรือสแกนพร้อมเพย์ 20 บาท/ลิ้นชัก · เงินลงกล่องเหรียญล็อกแยกหลังประตู',
  coinSlot: 'ช่องหยอดเหรียญ — คลิกเพื่อหยอดเหรียญ 10 บาท',
  payQR: 'Thai QR พร้อมเพย์ — คลิกเพื่อจำลองสแกนจ่าย',
  coinReturn: 'ปุ่มคืนเหรียญ — คลิกเพื่อคืนเหรียญที่หยอดค้างไว้',
  coinCup: 'ช่องรับเหรียญคืน — คลิกเพื่อหยิบเหรียญ',
  cashBox: 'กล่องเหรียญนิรภัย ล็อกกุญแจแยกจากประตูซ่อมบำรุง · เจ้าหน้าที่เขตเก็บเงิน',
  composterStart: 'ปุ่มเดินเครื่องหมัก — คลิกเพื่อเริ่ม/หยุด',
  flap: 'ช่องทิ้งแบบบานผลัก — คลิกเพื่อดันบานเข้าไป แล้วบานจะปิดกลับเอง',
  sensor: 'เซ็นเซอร์ฝาถัง BLE · ToF วัดระยะ + nRF52 + ถ่าน AA ×2 (~2–3 ปี) · วัดตอนฝาปิดแล้วประกาศค่าให้กล่องฮับ (ไม่ต้องเดินสาย เพราะถังถูกเข็นออกทุกรอบ)',
  solar: 'แผงโซลาร์ 6V 2W (17×13 ซม.) บนกล่องฮับ เอียง 15° · ชาร์จถ่าน 18650 ในกล่อง',
  truck: 'รถเก็บขยะไฟฟ้ามินิ (EV) · บรรทุก ~500 กก. · ร่วมกับภาคเอกชน',
  frame: `โครงเหล็กสถานี · ยาว ${(L * 100).toFixed(0)} × ลึก ${(D * 100).toFixed(0)} × สูง ${(H * 100).toFixed(0)} ซม.`,
  lattice: 'ตะแกรงเจาะรูช่องถุงดำ · ระบายอากาศและมองเห็นว่าในช่องมีถุงอยู่',
  bags: 'ถุงขยะมัดปาก (ถุงดำ) · ระดับในช่องตามแถบ "ถุงดำ" ในแผงจำลอง',
  estop: 'ปุ่มหยุดฉุกเฉินเครื่องหมัก · ตัดมอเตอร์และฮีตเตอร์ทันที',
  shop: 'ร้านขายปุ๋ย กทม. · กระท่อมไม้ 2.2 × 2.2 ม. หลังคามุงจาก · ปุ๋ยหมักเต็มถุง 1 / 5 / 10 กก. วางบนพาเลทและชั้นไม้ · เคาน์เตอร์พร้อมตาชั่ง · ชั้นล่างเป็นแบรนด์อื่น (ชื่อสมมติ)',
  rearDoor: 'ประตูหลัง (บานพับขวา · ล็อกหมุน 2 จุด · ซีลยาง) เข้าถึงฟิลเตอร์ รางสาย และท่อด้านหลัง — คลิกเพื่อเปิด/ปิด',
  serviceDoor: 'ประตูบริการหน้าเครื่อง (บานพับซ้าย · ล็อกหมุน 2 จุด · ซีลยาง) — คลิกเพื่อเปิด/ปิด',
  console: 'แผงควบคุมเอียง 18° · จอ HMI 7" · ไฟแสดงสถานะ 22 มม. · สวิตช์ อัตโนมัติ/ปิด/มือ · เริ่ม/หยุด · หยุดฉุกเฉิน',
  composterInside: 'ภายในเครื่องหมัก — เปิด "มองภายใน" เพื่อดูหมายเลขชิ้นส่วนและสเปก',
  drive: 'ฝาครอบโซ่ (ถอดออกในโหมดมองภายใน)',
  weighPlate: 'แผ่นชั่งใต้ถัง (แบบ B) · พื้นเหล็กลายกันลื่นลอยบนโหลดเซลล์ 50 กก. 4 จุด + บอร์ด HX711 · ชั่งทั้งถังแล้วหักน้ำหนักถังเปล่า 9.5 กก. แปลงเป็น % ตามความหนาแน่นของขยะแต่ละประเภท · ทางลาดด้านหลังให้เข็นถังขึ้น — คลิกเพื่อมองทะลุแผงหน้า',
  weighCable: 'สายโหลดเซลล์ (แบบ B) · รางสายหน้าพื้นสถานี ออกทางข้อต่อกันน้ำที่แผงซ้าย แล้วขึ้นท่อเข้าฮับ ESP32 · ถังไม่มีอุปกรณ์ใด ๆ เข็นออกไปเทได้เลย',
  qrCall: 'ป้าย QR เรียกรถนอกรอบ (แบบ C) · แทนปุ่มกดและกล่องฮับ ไม่มีอุปกรณ์ไฟฟ้าที่สถานี — คลิกเพื่อจำลองสแกนเรียกรถ',
  compostBag: 'แผงถุงปุ๋ยติดข้างเครื่อง (สแตนเลสเจาะรูแบบเดียวกับตัวเครื่อง) · ช่องดึงถุงเปล่า 1 / 5 กก. ดึงออกทีละใบแล้วเอาไปได้เลย',
  ...CAM_TIPS,
};
const CLICKABLE = new Set(['callButton', 'display', 'fan', 'serviceDoor', 'rearDoor', 'tray', 'trayLid', 'trayGate', 'hatch', 'composterStart', 'flap', 'drawer', 'coinSlot', 'payQR', 'coinReturn', 'coinCup', 'unit', 'unitInside', 'batteryInside',
  'solar', 'sensor', 'weighPlate', 'qrCall', 'camPole', 'camSolar', 'camBox', 'camShell', 'camScrew', 'boxBattery', 'boxMppt', 'boxRelay', 'boxRouter', 'boxFuse']);
// station B reuses the hub: its tips must not promise lid sensors or a circuit zoom
const VARIANT_CLICK = new Set(['flap', 'callButton', 'qrCall', 'weighPlate', 'weighCable', 'camPole', 'camSolar', 'camBox', 'camShell', 'camScrew', 'boxBattery', 'boxMppt', 'boxRelay', 'boxRouter', 'boxFuse']);
const VARIANT_TIPS = { B: { unit: 'กล่องฮับ ESP32 (ตัวเดียวกับแบบ A) · อ่านแผ่นชั่ง 3 แผ่นผ่านสาย (HX711) แทนการรับ BLE · ส่งเข้าแดชบอร์ดเขตผ่าน NB-IoT' } };
// hardware part -> circuit focus key
const PART_FOCUS = { unit: 'unit', unitLight: 'unit', fan: 'unit', display: 'unit', unitInside: 'unit', batteryInside: 'battery', solar: 'battery', sensor: 'sensor' };

// push flap: swings in while "held", then springs back shut like the real gravity flap
function pushFlap(bin) {
  bin.userData.flap.hold = 1.2;               // seconds held open
  invalidate();
}

/* ---------- layout mode: drag the station, composter and shop around the sidewalk ---------- */
const MOVABLES = [
  { key: 'station', name: 'ชุดถังขยะ', groups: () => [station.group, riser.group, dims, env.pad], hit: () => [station.group, riser.group] },
  { key: 'composter', name: 'เครื่องหมักปุ๋ย', groups: () => [composter.group], hit: () => [composter.group] },
  { key: 'shop', name: 'ร้านขายปุ๋ย', groups: () => [shop.group], hit: () => [shop.group] },
  { key: 'varB', name: 'ชุดถังแบบ B (ชั่งน้ำหนัก)', groups: () => [variants.roots.B], hit: () => [variants.roots.B] },
  { key: 'varC', name: 'ชุดถังแบบ C (เสากล้องข้างถัง)', groups: () => [variants.roots.C], hit: () => [variants.roots.C] },
];
const LAYOUT_KEY = 'hackawork-layout-v1';
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const DEFAULT_LAYOUT = {};
let moveMode = false, drag = null, selected = null, hitHeight = 0;
function setPointer(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
}
function movableAt(ev) {
  setPointer(ev);
  let best = null;
  for (const m of MOVABLES) {
    const h = raycaster.intersectObjects(m.hit(), true).find((x) => !x.object.isLine && !x.object.isPoints && x.object.visible);
    if (h && (!best || h.distance < best.d)) best = { m, d: h.distance, y: h.point.y };
  }
  if (best) hitHeight = best.y;
  return best?.m || null;
}
function groundAt(ev) {
  setPointer(ev);
  return raycaster.ray.intersectPlane(ground, new THREE.Vector3());
}
function placeMovable(m, x, z, rot) {
  // keep it on the sidewalk (in front of the curb) and inside the shadow-map area
  x = THREE.MathUtils.clamp(x, -9, 9);
  z = THREE.MathUtils.clamp(z, STREET.curbZ + 0.6, 8);
  for (const g of m.groups()) { g.position.x = x; g.position.z = z; if (rot !== undefined) g.rotation.y = rot; }
}
// double-press to drag, with or without layout mode: the first press only selects (and still orbits
// the camera as usual), a second press on the same object within the window picks it up; hold and drag
// to move it. Clicks on a movable wait out the window so picking something up doesn't also operate it.
const DOUBLE_PRESS_MS = 300;
let lastPress = null, pendingClick = null;
function takePendingClick() {
  if (!pendingClick) return null;
  clearTimeout(pendingClick.timer);
  const { e } = pendingClick;
  pendingClick = null;
  return e;
}
function startDrag(e) {
  const m = movableAt(e);
  // drag on a level plane through the grabbed point so it stays under the cursor; kept below the
  // camera because a plane near eye level would turn small mouse moves into huge jumps
  if (m) ground.constant = -Math.min(hitHeight, camera.position.y - 0.5);
  const p = m && groundAt(e);
  const prev = lastPress;
  lastPress = m ? { m, t: performance.now(), x: e.clientX, y: e.clientY } : null;
  if (!p) return;
  selected = m;
  if (!prev || prev.m !== m || lastPress.t - prev.t > DOUBLE_PRESS_MS || Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 12) return;
  lastPress = null;
  const g = m.groups()[0];
  drag = { m, id: e.pointerId, dx: g.position.x - p.x, dz: g.position.z - p.z, x: e.clientX, y: e.clientY, moved: false, firstClick: takePendingClick() };
  selected = m;
  controls.enabled = false;
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch {}
}
function dragTo(e) {
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) <= 5) return;   // hand jitter on a double-click is not a move
  const p = groundAt(e);
  if (!p) return;
  drag.moved = true;
  placeMovable(drag.m, p.x + drag.dx, p.z + drag.dz);
  tooltip.hidden = true;
  invalidate(true);
}
function endDrag() {
  if (!drag) return;
  const { moved } = drag;
  drag = null;
  controls.enabled = true;
  if (moved) saveLayout();
}
function rotateSelected(deg) {
  if (!selected) { toast('คลิกหรือลากชิ้นที่ต้องการหมุนก่อน'); return; }
  const g = selected.groups()[0];
  placeMovable(selected, g.position.x, g.position.z, g.rotation.y + THREE.MathUtils.degToRad(deg));
  saveLayout();
  invalidate(true);
}
function saveLayout() {
  const data = {};
  for (const m of MOVABLES) { const g = m.groups()[0]; data[m.key] = [g.position.x, g.position.z, g.rotation.y]; }
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(data)); } catch {}
}
function loadLayout() {
  for (const m of MOVABLES) { const g = m.groups()[0]; DEFAULT_LAYOUT[m.key] = [g.position.x, g.position.z, g.rotation.y]; }
  let data = null;
  try { data = JSON.parse(localStorage.getItem(LAYOUT_KEY)); } catch {}
  if (!data) return;
  for (const m of MOVABLES) if (Array.isArray(data[m.key])) placeMovable(m, ...data[m.key]);
}
function resetLayout() {
  for (const m of MOVABLES) placeMovable(m, ...DEFAULT_LAYOUT[m.key]);
  try { localStorage.removeItem(LAYOUT_KEY); } catch {}
  selected = null;
  invalidate(true);
}
function setMoveMode(v) {
  moveMode = v;
  if (!v) { endDrag(); selected = null; }
  else toast('โหมดจัดวาง: ดับเบิ้ลคลิกค้างที่ชุดถังขยะ (A/B/C) เครื่องหมัก หรือร้านปุ๋ย แล้วลากไปวาง · Q/E หรือปุ่มหมุน เพื่อหมุนทีละ 15°');
  $('move-tools').hidden = !v;
}

function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const isShown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const targets = [station.group, composter.group, shop.group, truck.group, variants.roots.B, variants.roots.C];
  if (riserOn) targets.push(riser.group);
  const partOf = (o) => { for (; o; o = o.parent) if (o.userData.part) return o.userData.part; return null; };
  const hits = raycaster.intersectObjects(targets, true).filter((h) => {
    const m = Array.isArray(h.object.material) ? h.object.material[h.face?.materialIndex ?? 0] : h.object.material;
    return !h.object.isLine && !h.object.isPoints && isShown(h.object) && m && m.visible;   // lines (airflow streaks) have a 1 m ray threshold: never let them eat clicks
  });
  // the call button sits in a bezel on the hub lid: a ray grazing the bezel edge must still press it
  const hit = hits.find((h) => hits[0] && h.distance - hits[0].distance < 0.04 && partOf(h.object) === 'callButton') || hits[0];
  if (!hit) return {};
  let o = hit.object, bin = null, bayId = null, part = null, variant = null;
  while (o) {
    if (o.userData.part) part ??= o.userData.part;
    if (o.userData.bayId) bayId ??= o.userData.bayId;
    if (o.userData.variant) variant = o.userData.variant;
    if (allBins.includes(o)) bin = o;
    o = o.parent;
  }
  const owner = bin;                            // bin this part belongs to (for the push flap)
  if (part && part !== 'unit') bin = null;   // hardware parts take priority over the bin under them
  return { bin, bayId, part, owner, variant };
}
// a click = one pointer pressed and released in place; multi-touch gestures (pinch/rotate) never count
const activePointers = new Set();
let gestured = false;
renderer.domElement.addEventListener('pointerdown', (e) => {
  activePointers.add(e.pointerId);
  if (activePointers.size > 1) { gestured = true; endDrag(); }
  downAt = activePointers.size === 1 ? [e.clientX, e.clientY, e.pointerId] : null;
  if (activePointers.size === 1) startDrag(e);
});
const endPointer = (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size === 0) setTimeout(() => (gestured = false), 0);
};
renderer.domElement.addEventListener('pointercancel', (e) => { endPointer(e); downAt = null; endDrag(); });
renderer.domElement.addEventListener('pointerup', (e) => {
  const wasGesture = gestured;
  endPointer(e);
  if (moveMode) { endDrag(); downAt = null; return; }   // layout mode: clicks only move things
  const start = downAt;
  downAt = null;
  if (drag && drag.id === e.pointerId) {
    const { moved, firstClick } = drag;
    endDrag();
    if (!moved) {   // a plain double-click: both clicks still count
      if (firstClick) clickAt(firstClick);
      clickAt(e);
    }
    return;
  }
  if (wasGesture || !start || start[2] !== e.pointerId || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5) return;
  const earlier = takePendingClick();
  if (earlier) clickAt(earlier);
  if (movableAt(e)) pendingClick = { e, timer: setTimeout(() => clickAt(takePendingClick()), DOUBLE_PRESS_MS) };
  else clickAt(e);
});
function clickAt(e) {
  const { bin, part, owner, variant } = pick(e);
  if (variant) {                               // stations B / C: their own parts, never the A-only circuit zoom or trays
    if (part === 'flap' && owner) pushFlap(owner);
    else if (part === 'callButton') requestPickup(variants.B.hardware);
    else if (part === 'qrCall') requestPickup(null);
    else if (part === 'camPole' || part === 'camSolar') setCctv(!cctvOn);
    else if (part === 'camShell' || part === 'camScrew') setCamOpen(!variants.camOpen());
    else if (part === 'camBox' || part.startsWith('box')) variants.setBoxOpen(!variants.boxOpen());
    else if (part === 'weighPlate' || part === 'weighCable') setXray(!xrayOn);
    else if (bin) { bin.userData.target = bin.userData.target >= 0.5 ? 0 : 1; variants.apply(smart); }   // C: a closed overfull lid rides up again
    syncAll();
    invalidate(true);
    return;
  }
  if (part === 'flap' && owner) pushFlap(owner);
  else if (part === 'callButton') requestPickup();
  else if (part === 'trayLid' && riser.traysState()) { riser.setLidOpen(!riser.isLidOpen()); syncAll(); }
  else if (part === 'tray' || part === 'trayLid' || part === 'trayGate') { riser.setTraysOpen(!riser.traysState()); syncAll(); }
  else if (part === 'hatch') { composter.toggleHatch(); syncAll(); }
  else if (part === 'serviceDoor') { composter.toggleDoor(); invalidate(true); }
  else if (part === 'rearDoor') { composter.toggleRear(); syncAll(); }
  else if (part === 'drawer') toggleCompostDrawer();
  else if (part === 'coinSlot') composter.insertCoin();
  else if (part === 'payQR') composter.payQR();
  else if (part === 'coinReturn') composter.returnCoins();
  else if (part === 'coinCup') composter.takeCoins();
  else if (PART_FOCUS[part]) focusCircuit(PART_FOCUS[part]);
  else if (part === 'composterStart') { composter.setRunning(!composter.isRunning()); syncAll(); }
  else if (bin) bin.userData.target = bin.userData.target ? 0 : 1;
  syncAll();
  invalidate(true);
}
let hoverEvent = null;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (drag && e.pointerId === drag.id) { dragTo(e); return; }
  if (e.buttons) { tooltip.hidden = true; hoverEvent = null; return; }
  hoverEvent = e;                       // processed once per frame in the loop
});
function processHover() {
  const e = hoverEvent;
  hoverEvent = null;
  if (moveMode) {
    const m = movableAt(e);
    renderer.domElement.style.cursor = m ? 'move' : 'grab';
    tooltip.hidden = !m;
    if (m) {
      tooltip.textContent = `${m.name} · ดับเบิ้ลคลิกค้างแล้วลากเพื่อย้าย · Q/E หมุน`;
      tooltip.style.left = `${e.clientX + 14}px`;
      tooltip.style.top = `${e.clientY + 14}px`;
    }
    return;
  }
  const { bin, bayId, part, variant } = pick(e);
  let partText = VARIANT_TIPS[variant]?.[part] || PART_TIPS[part];
  const variantDead = variant && !VARIANT_CLICK.has(part);     // e.g. B / C riser trays: only station A's operate
  if (variantDead) partText = partText?.replace(/ — คลิก.*$/, '');
  const clickable = bin || (CLICKABLE.has(part) && !variantDead);
  renderer.domElement.style.cursor = clickable ? 'pointer' : 'grab';
  if (partText || bayId) {
    tooltip.hidden = false;
    tooltip.textContent = partText || bayNames[bayId] + (bin ? ' — คลิกเพื่อเปิด/ปิดฝา' : '');
    tooltip.style.left = `${e.clientX + 14}px`;
    tooltip.style.top = `${e.clientY + 14}px`;
  } else tooltip.hidden = true;
}
renderer.domElement.addEventListener('pointerleave', () => { hoverEvent = null; tooltip.hidden = true; });   // drop the queued hover so it can't reappear over the UI

/* ---------- UI ---------- */
const $ = (id) => document.getElementById(id);
let cutaway = false;
const hatchOpen = () => composter.isHatchOpen();
function bindToggle(id, get, set) {
  const el = $(id);
  const sync = () => el.setAttribute('aria-pressed', String(get()));
  // a toggle can change other state too (e.g. trays switch the riser on), so resync every toggle
  el.addEventListener('click', () => { set(!get()); sync(); syncAll(); invalidate(true); });
  sync();
  return sync;
}
bindToggle('t-rotate', () => controls.autoRotate, (v) => (controls.autoRotate = v));
bindToggle('t-dims', () => dims.visible, (v) => (dims.visible = v));
bindToggle('t-human', () => human.visible, (v) => (human.visible = v));
bindToggle('t-move', () => moveMode, (v) => setMoveMode(v));
$('btn-rot-l').addEventListener('click', () => rotateSelected(15));
$('btn-rot-r').addEventListener('click', () => rotateSelected(-15));
$('btn-layout-reset').addEventListener('click', () => { resetLayout(); toast('คืนตำแหน่งเดิมแล้ว'); });
addEventListener('keydown', (e) => {
  if (!moveMode || e.target.closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'q') rotateSelected(15);
  else if (k === 'e') rotateSelected(-15);
});
loadLayout();
bindToggle('t-bags', () => station.bagPile.visible, (v) => (station.bagPile.visible = v));
const anyOpen = () => allBins.some((b) => b.userData.target >= 0.5);
const syncers = [];
syncers.push(bindToggle('t-lids', anyOpen, (v) => { allBins.forEach((b) => (b.userData.target = v ? 1 : 0)); if (!v) variants.apply(smart); }));
syncers.push(bindToggle('t-hw-open', () => hardware.isInsideView(), (v) => {
  hardware.setInsideView(v);
  if (v) document.querySelector('[data-view=smart]').click();
}));
syncers.push(bindToggle('t-riser', () => riserOn, (v) => { riserOn = v; placeStation(); }));
const setTrays = (v) => { if (!riserOn && v) { riserOn = true; placeStation(); } riser.setTraysOpen(v); };
syncers.push(bindToggle('t-trays-back', () => !!riser.traysState(), (v) => setTrays(v)));
syncers.push(bindToggle('t-tray-lid', () => riser.isLidOpen(), (v) => { if (!riserOn && v) { riserOn = true; placeStation(); } riser.setLidOpen(v); }));
syncers.push(bindToggle('t-comp-run', () => composter.isRunning(), (v) => composter.setRunning(v)));
const legendEl = $('comp-legend');
$('comp-legend-list').innerHTML = composter.parts.map((p) => `<li><span class="n">${p.n}</span><div><b>${p.name}</b><small>${p.spec}</small></div></li>`).join('');
function setComposterCut(v) {
  cutaway = v; composter.setCutaway(v); legendEl.hidden = !v;
  if (v) compareEl.hidden = true;
  $('smart').hidden = v || !compareEl.hidden || !!circuitKey;
}
syncers.push(bindToggle('t-comp-cut', () => cutaway, (v) => setComposterCut(v)));
// inspection cameras: fly to a part of the composter with the cutaway on (outside views keep it closed)
document.querySelectorAll('[data-cview]').forEach((btn) => btn.addEventListener('click', () => {
  const key = btn.dataset.cview, [p, tg] = composter.views[key], g = composter.group;
  g.updateMatrixWorld();
  setComposterCut(!['back', 'bags'].includes(key));
  if (key === 'back') composter.setRearOpen(true);
  syncAll();
  flight = { from: camera.position.clone(), to: g.localToWorld(new THREE.Vector3(...p)), t: 0,
             tFrom: controls.target.clone(), tTo: g.localToWorld(new THREE.Vector3(...tg)) };
  invalidate(true);
}));
syncers.push(bindToggle('t-comp-hatch', () => hatchOpen(), () => composter.toggleHatch()));
syncers.push(bindToggle('t-comp-rear', () => composter.isRearOpen(), (v) => composter.setRearOpen(v)));
function toggleCompostDrawer() {
  if (composter.toggleDrawer() === 'locked') toast(`ลิ้นชักปุ๋ยล็อกอยู่ · หยอดเหรียญหรือสแกน QR ${composter.price} บาทที่แผงบนประตูก่อน`);
  syncAll();
}
syncers.push(bindToggle('t-comp-drawer', () => composter.isDrawerOpen(), () => toggleCompostDrawer()));
function syncAll() { syncers.forEach((f) => f()); }

// camera presets
let flight = null;
function flyTo(pos, tgt) {
  flight = { from: camera.position.clone(), to: pos.clone(), t: 0, tFrom: controls.target.clone(), tTo: tgt.clone() };
  invalidate();
}

/* ---------- circuit focus mode: click a device -> zoom in, open it, show its circuit ---------- */
let circuitKey = null, savedView = null;
const circuit = buildCircuitPanel($('circuit'), (key) => focusCircuit(key), () => exitCircuit());
function focusCircuit(key) {
  if (!circuitKey) savedView = { pos: camera.position.clone(), tgt: controls.target.clone() };
  circuitKey = key;
  hardware.setUnitOpen(key === 'unit' || key === 'battery');   // one hub box: the lid opens for both
  station.bins[0].userData.target = key === 'sensor' ? 1 : station.bins[0].userData.target;
  hardware.setFlow(true, key === 'sensor' || key === 'overview');
  circuit.show(key);
  compareEl.hidden = true;
  $('smart').hidden = true;
  // camera framing per device (positions derived from the device's world placement)
  const T = hardware.focusTargets;
  const obj = key === 'sensor' ? T.sensor() : key === 'overview' ? T.unit : T[key];
  const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
  const q = obj.getWorldQuaternion(new THREE.Quaternion());
  const front = new THREE.Vector3(0, 0, 1).applyQuaternion(q);       // device's own front direction
  let pos;
  if (key === 'unit' || key === 'battery') pos = c.clone().addScaledVector(front, 0.4).add(new THREE.Vector3(0, 0.1, 0.16));
  else if (key === 'overview') {            // hub plus the bins with their lid sensors
    c.addScaledVector(front, -0.45); c.y -= 0.05;
    pos = c.clone().addScaledVector(front, 1.9).add(new THREE.Vector3(0, 0.9, 1.6));
  }
  else pos = c.clone().add(new THREE.Vector3(0.15, -0.05, 0.75));     // sensor under the opened lid
  flyTo(pos, c);
  syncAll();
  invalidate(true);
}
function exitCircuit() {
  if (!circuitKey) return;
  circuitKey = null;
  hardware.setUnitOpen(false);
  hardware.setBatteryOpen(false);
  hardware.setFlow(false);
  circuit.hide();
  $('smart').hidden = false;
  if (savedView) flyTo(savedView.pos, savedView.tgt);
  syncAll();
  invalidate(true);
}
$('btn-circuit').addEventListener('click', () => (circuitKey ? exitCircuit() : focusCircuit('overview')));
addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; exitCircuit(); if (!compareEl.hidden) setCompare(false); else if (cctvOn) setCctv(false); });
const VIEWS = {
  front: [[0, 1.2, 5.4], [0, 0.75, 0]],
  side: [[5.2, 1.2, 0], [0, 0.75, 0]],
  top: [[0, 6.2, 0.01], [0, 0.6, 0]],
  iso: [[3.6, 2.1, 4.2], [0.4, 0.7, 0]],
  back: [[-2.8, 2.0, -4.2], [0, 0.75, 0]],
  truck: [[-5.6, 3.2, -8.2], [0, 0.8, -1.8]],
  tray: [[-L / 2 - 1.15, 0.55, 1.0], [-L / 2 - 0.15, 0.1, 0]],       // at the left end of the riser, where the cassette comes out
  smart: [[-L / 2 - 1.25, 1.35, 0.55], [-L / 2, 0.95, -0.03]],
};
document.querySelectorAll('[data-view]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const [pos, tgt] = VIEWS[btn.dataset.view] || groupView(btn.dataset.view);
    if (btn.dataset.view === 'tray') { if (!riserOn) { riserOn = true; placeStation(); } riser.setTraysOpen(true); syncAll(); }
    flight = { from: camera.position.clone(), to: new THREE.Vector3(...pos), t: 0,
               tFrom: controls.target.clone(), tTo: new THREE.Vector3(...tgt) };
    invalidate();
  })
);

// composter / shop cameras follow the objects wherever the user has moved / turned them
const GROUP_VIEWS = { composter: () => [composter.group, [1.6, 1.9, 2.7], [0, 0.65, 0]],
                      shop: () => [shop.group, [-1.6, 1.8, 4.2], [0, 1.1, 0]] };
function groupView(key) {
  const [g, p, t] = GROUP_VIEWS[key]();
  g.updateMatrixWorld();
  return [g.localToWorld(new THREE.Vector3(...p)).toArray(), g.localToWorld(new THREE.Vector3(...t)).toArray()];
}


/* ---------- three ways to measure fill: sky arrows, CCTV feed with AI boxes, x-ray, comparison ---------- */
let cctvOn = false, xrayOn = false;
const cctvEl = $('cctv'), cctvScreen = $('cctv-screen'), cctvBoxes = $('cctv-boxes'), compareEl = $('compare');
function setCctv(v) {
  cctvOn = v;
  cctvEl.hidden = !v;
  // ≤1100 px the feed docks on the left, where compare / smart live: show one at a time
  if (v && innerWidth <= 1100) { compareEl.hidden = true; $('smart').hidden = true; }
  else if (!v) $('smart').hidden = !compareEl.hidden || !!circuitKey || cutaway;
  document.body.classList.toggle('cctv-on', v);
  variants.setFov(v);
  if (v) tickCctvClock();
  syncAll();
  invalidate();
}
// camera pole beside station C: on/off, camera body, cover, night mode, power box; the feed panel follows
const camChips = [...document.querySelectorAll('[data-cam]')];
const baht = (n) => n.toLocaleString('th-TH');
function syncCamUi() {
  const src = variants.feedSource(), type = variants.camType(), info = CAM_TYPES[type];
  camChips.forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.cam === type)); b.disabled = !src.poleOn; });
  $('cam-cost').innerHTML = !src.poleOn
    ? 'ถอดเสาออก · จุดที่มีกล้อง กทม. มองเห็นอยู่แล้วใช้ภาพเดิมเข้า AI ได้ ค่าอุปกรณ์ ~0 บาท'
    : `<b>${info.name}</b>${info.cost ? ` ~${baht(info.cost)} บาท` : ''} · ${info.note}${info.open ? `<br>เปิดฝา: ${info.open}` : ''}<br>ชุดเสา + โซลาร์ + 4G ~${baht(poleTotal())} บาท · รวม ~${baht(poleTotal() + info.cost)} บาท`;
  $('cctv-camid').textContent = src.live ? `POLE-C · ${info.label}` : '—';
  $('cctv-osd').textContent = src.live ? `CAM C-01 · ${info.label}${variants.night() ? ' · IR' : ''}` : 'CAM C-01';
  cctvScreen.classList.toggle('fish', src.live && type === 'fisheye');
  cctvScreen.classList.toggle('night', src.live && variants.night());
  cctvScreen.classList.toggle('nosig', !src.live);
  $('t-camopen').disabled = !src.live;
}
function setCamType(k) { variants.setCamType(k); syncCamUi(); syncAll(); invalidate(true); }
function setCamOpen(v) { if (v && !variants.canCamOpen()) return; variants.setCamOpen(v); syncAll(); invalidate(true); }
camChips.forEach((b) => b.addEventListener('click', () => { setCamType(b.dataset.cam); if (!cctvOn) setCctv(true); }));
syncers.push(bindToggle('t-campole', () => variants.camPoleOn(), (v) => { variants.setCamPole(v); syncCamUi(); invalidate(true); }));
syncers.push(bindToggle('t-camopen', () => variants.camOpen(), (v) => setCamOpen(v)));
syncers.push(bindToggle('t-camnight', () => variants.night(), (v) => { variants.setNight(v); syncCamUi(); invalidate(true); }));
syncers.push(bindToggle('t-boxopen', () => variants.boxOpen(), (v) => { variants.setBoxOpen(v); invalidate(true); }));
syncCamUi();
function setXray(v) { xrayOn = v; variants.setXray(v); syncAll(); invalidate(true); }
syncers.push(bindToggle('t-arrows', () => variants.arrowsOn(), (v) => variants.setArrows(v)));
syncers.push(bindToggle('t-cctv', () => cctvOn, (v) => setCctv(v)));
syncers.push(bindToggle('t-xray', () => xrayOn, (v) => setXray(v)));
$('cctv-close').addEventListener('click', () => setCctv(false));
function tickCctvClock() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  $('cctv-time').textContent = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear() + 543} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
setInterval(() => { if (cctvOn) tickCctvClock(); }, 1000);

// camera framings per variant (follow the stations wherever they were dragged)
const VARIANT_VIEWS = {
  A: () => [station.group, [2.3, 1.9, 3.4], [0, 0.55, 0]],
  B: () => [variants.roots.B, [2.5, 2.5, 4.1], [0, 0.85, 0]],
  C: () => [variants.roots.C, [2.4, 3.4, 5.0], [0.3, 1.5, 0]],
  campole: () => { const p = variants.C.camPole.group.position; return [variants.roots.C, [p.x + 1.7, 2.3, p.z + 2.6], [p.x - 0.55, 1.75, p.z]]; },
  camhead: () => {
    // frame whichever body is on the mount (a dome is 15 cm across, the AI box camera ~25 cm long)
    const root = variants.roots.C, box = new THREE.Box3().setFromObject(variants.C.camPole.head());
    const c = root.worldToLocal(box.getCenter(new THREE.Vector3())), d = Math.max(0.16, box.getSize(new THREE.Vector3()).length());
    return [root, [c.x + d * 1.0, c.y - d * 0.45, c.z + d * 1.9], [c.x, c.y - d * 0.08, c.z]];
  },
  camhead2: () => { const p = variants.C.camPole.group.position; return [variants.roots.C, [p.x + 0.75, 1.62, p.z + 0.25], [p.x + 0.12, 1.45, p.z]]; },
};
function flyToVariant(key) {
  if (key === 'all') {
    const box = new THREE.Box3();
    for (const g of [station.group, variants.roots.B, variants.roots.C]) box.expandByPoint(g.getWorldPosition(new THREE.Vector3()));
    const span = Math.max(6, box.getSize(new THREE.Vector3()).length() + L + 1.5);
    const mid = box.getCenter(new THREE.Vector3());
    // the side panels cover ~250 px left and right: back off a little more on narrow screens
    const fit = span * 1.1 / Math.min(1, camera.aspect) * (innerWidth < 1100 ? 1.15 : 1);
    flyTo(new THREE.Vector3(mid.x + 1.0, 2.6 + fit * 0.4, mid.z + fit), new THREE.Vector3(mid.x, 1.4, mid.z));
    return;
  }
  const [g, p, t] = VARIANT_VIEWS[key]();
  g.updateMatrixWorld();
  flyTo(g.localToWorld(new THREE.Vector3(...p)), g.localToWorld(new THREE.Vector3(...t)));
  if (key === 'B' && !xrayOn) setXray(true);
  if ((key === 'campole' || key === 'camhead' || key === 'camhead2') && !variants.camPoleOn()) { variants.setCamPole(true); syncCamUi(); }
  if (key === 'camhead') { if (variants.camType() === 'none') setCamType('dome'); setCamOpen(true); }
  if (key === 'camhead2') { variants.setBoxOpen(true); syncAll(); }
  if ((key === 'C' || key === 'campole') && !cctvOn) setCctv(true);
}
document.querySelectorAll('[data-vview]').forEach((btn) => btn.addEventListener('click', () => flyToVariant(btn.dataset.vview)));

// CCTV picture-in-picture: the same scene from the BMA dome, plus the (simulated) AI boxes on top
const _v = new THREE.Vector3(), _box = new THREE.Box3();
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());
// drawn into a corner of the main canvas, copied into the panel's own 2D canvas in the same task, then
// covered by the main render (so CSS labels of the main view never show through the feed)
const feed = $('cctv-feed'), feedCtx = feed.getContext('2d');
function renderCctv() {
  if (!cctvOn) return;
  if (!variants.feedSource().live) {           // no camera on the mount: no signal, no AI
    if (cctvBoxes.dataset.key) { cctvBoxes.innerHTML = ''; cctvBoxes.dataset.key = ''; }
    feedCtx.clearRect(0, 0, feed.width, feed.height);
    const ai = $('cctv-ai'); ai.textContent = 'ไม่มีกล้องบนแท่น'; ai.dataset.state = 'bad';
    return;
  }
  const r = cctvScreen.getBoundingClientRect();
  const W = renderer.domElement.clientWidth, Hh = renderer.domElement.clientHeight;
  const w = Math.min(Math.round(r.width), W), h = Math.min(Math.round(r.height), Hh);
  if (w < 4 || h < 4) return;
  const cam = variants.cctvCam;
  if (Math.abs(cam.aspect - w / h) > 1e-3) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
  const pr = renderer.getPixelRatio();
  if (feed.width !== Math.round(w * pr) || feed.height !== Math.round(h * pr)) { feed.width = Math.round(w * pr); feed.height = Math.round(h * pr); }
  renderer.setScissorTest(true);
  renderer.setScissor(0, Hh - h, w, h);
  renderer.setViewport(0, Hh - h, w, h);
  renderer.render(scene, cam);
  feedCtx.drawImage(renderer.domElement, 0, 0, w * pr, h * pr, 0, 0, feed.width, feed.height);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, Hh);         // the main render that follows paints over the borrowed corner
  drawAiBoxes(w, h);
}
const AI_NAMES = { recycle: 'รีไซเคิล', food: 'อาหาร', general: 'ทั่วไป', bag: 'ถุงดำ' };
function drawAiBoxes(w, h) {
  const cam = variants.cctvCam, html = [];
  let alerts = 0;
  for (const t of variants.aiTargets()) {
    if (t.bagBay) {
      const g = variants.C.station.group, D2 = CONFIG.frame.depth / 2;
      let k = 0;
      for (const xx of [t.x0, t.x1]) for (const yy of [0.06, CONFIG.frame.height]) for (const zz of [-D2, D2]) g.localToWorld(_corners[k++].set(xx, yy, zz));
    } else {
      _box.setFromObject(t.obj);
      _box.expandByVector(_v.set(-0.04, 0, -0.03));             // the hood overhangs the bin pitch: trim so neighbours don't overlap
      let k = 0;
      for (const xx of [_box.min.x, _box.max.x]) for (const yy of [_box.min.y, _box.max.y]) for (const zz of [_box.min.z, _box.max.z]) _corners[k++].set(xx, yy, zz);
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of _corners) {
      _v.copy(c).project(cam);
      const sx = (_v.x + 1) / 2 * w, sy = (1 - _v.y) / 2 * h;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    x0 = Math.max(2, x0); y0 = Math.max(2, y0); x1 = Math.min(w - 2, x1); y1 = Math.min(h - 2, y1);
    if (x1 - x0 < 6 || y1 - y0 < 6) continue;
    const f = Math.round(smart.fills[t.i]);
    let text, cls;
    if (t.bagBay) [text, cls] = f >= 90 ? ['ล้นช่อง', 'bad'] : [`~${f}%`, f >= 60 ? 'warn' : 'ok'];
    else if (t.obj.userData.target >= 0.5) [text, cls] = ['ฝาเปิด', 'warn'];
    else [text, cls] = f >= 90 ? ['ล้น ฝาเผยอ', 'bad'] : ['ฝาปิด', 'ok'];
    if (cls === 'bad') alerts++;
    const conf = (0.88 + ((t.i * 37) % 10) / 100).toFixed(2);
    const name = AI_NAMES[t.bay.id] || t.bay.th;
    // chips alternate above / below the boxes so neighbours never overlap
    html.push(`<div class="aib ${cls}${t.i % 2 ? ' below' : ''}" style="left:${x0.toFixed(1)}px;top:${y0.toFixed(1)}px;width:${(x1 - x0).toFixed(1)}px;height:${(y1 - y0).toFixed(1)}px"><span>${name} · ${text} <i>${conf}</i></span></div>`);
  }
  const key = html.join('');
  if (cctvBoxes.dataset.key !== key) { cctvBoxes.innerHTML = key; cctvBoxes.dataset.key = key; }
  const ai = $('cctv-ai');
  ai.textContent = alerts ? `พบ ${alerts} จุดล้น · แจ้งเขตเรียกรถ` : 'ปกติ · ไม่มีถังล้น';
  ai.dataset.state = alerts ? 'bad' : 'ok';
}

// comparison panel: what each variant measures, costs and gives up
const fmtBaht = (n) => n.toLocaleString('th-TH');
{
  const max = Math.max(...COMPARE.map((c) => c.cost()));
  const rows = COMPARE.map((c) => {
    const info = VARIANT_INFO[c.k], cost = c.cost();
    return `<article class="cmp" style="--c:${info.color}">
      <header><b>${c.k}</b><div><strong>${info.title}</strong><small>วัด: ${c.measures}</small></div></header>
      <div class="bar"><i style="width:${Math.max(2, (cost / max) * 100)}%"></i><span>${cost ? `~${fmtBaht(cost)} บาท/สถานี` : '~0 บาท · ใช้กล้องเดิม'}</span></div>
      <ul>${c.pros.map((p) => `<li class="pro">${p}</li>`).join('')}${c.cons.map((p) => `<li class="con">${p}</li>`).join('')}</ul>
      <button class="cmp-go" data-k="${c.k}">ดูแบบ ${c.k} ในโมเดล</button>
    </article>`;
  }).join('');
  const per100 = COMPARE.map((c) => `<td>${c.cost() ? fmtBaht(c.cost() * 100) : '~0'}</td>`).join('');
  compareEl.innerHTML = `<div class="cp-head"><b>เทียบ 3 แบบ · รู้ได้ยังไงว่าถังเต็ม</b><button class="cp-close" id="cmp-close">ปิด</button></div>
    ${rows}
    <table class="cp-cost"><caption>ค่าอุปกรณ์ 1 เขต (สมมติ 100 สถานี · บาท)</caption><tr><td>แบบ A</td><td>แบบ B</td><td>แบบ C</td></tr><tr class="big">${per100}</tr></table>
    <p class="cmp-note"><b>แบบ C ไม่มีอุปกรณ์บนถังเลย:</b> เสากล้องข้างถังมีโซลาร์ แบต และ 4G ในตัว ไม่ต้องเดินสายไฟ · จุดที่กล้อง กทม. มองเห็นสถานีอยู่แล้ว ใช้ภาพเดิมเข้า AI ได้ ค่าอุปกรณ์ ~0 บาท ถูกที่สุด · ส่วน AI อ่านภาพเป็นงานเฟสถัดไป (ตอนนี้กรอบ AI ในภาพเป็นการจำลอง)</p>`;
  $('cmp-close').addEventListener('click', () => setCompare(false));
  compareEl.querySelectorAll('.cmp-go').forEach((b) => b.addEventListener('click', () => flyToVariant(b.dataset.k)));
}
function setCompare(v) {
  if (v) exitCircuit();
  if (v && cctvOn && innerWidth <= 1100) setCctv(false);
  compareEl.hidden = !v;
  $('smart').hidden = v || !!circuitKey || cutaway;
}
$('btn-compare').addEventListener('click', () => setCompare(compareEl.hidden));

// spec sheet
$('spec').innerHTML = `
  <div><dt>ยาวรวม</dt><dd>${fmt(L)}</dd></div>
  <div><dt>ลึก</dt><dd>${fmt(D)}</dd></div>
  <div><dt>สูงโครง</dt><dd>${fmt(H)}</dd></div>
  <div><dt>สูงรวมถัง</dt><dd>${fmt(lidTop)}</dd></div>
  <div><dt>ฐานยกกันหนู</dt><dd>${fmt(RISER.height)}</dd></div>
  <div><dt>ถังล้อเลื่อน</dt><dd>${CONFIG.bin.capacityL} ลิตร × 3</dd></div>
  <div><dt>รุ่นถัง</dt><dd>${CONFIG.bin.model} (50×55×110)</dd></div>
  <div><dt>ชุดอัจฉริยะ</dt><dd>ESP32 + BLE ~${kitTotal().toLocaleString('th-TH')} บาท</dd></div>
  <div><dt>แบบ B ชั่งน้ำหนัก</dt><dd>${VARIANT_INFO.B.cost()}</dd></div>
  <div><dt>แบบ C เสากล้อง</dt><dd>${VARIANT_INFO.C.cost()}</dd></div>
  <div><dt>เครื่องหมักปุ๋ย</dt><dd>${COMPOSTER.capacityL} ลิตร · ~${COMPOSTER.dailyKg} กก./วัน</dd></div>`;

/* ---------- smart system simulation (shared with dashboard.html) ---------- */
const STATION_ID = 'BKK-PTW-001';
// named tabs: the dashboard's "back to 3D" link reuses this tab instead of opening a second simulation
window.name = 'hackawork-3d';
const smart = {
  id: STATION_ID, name: 'สถานีจำลอง 3D · หน้าสยาม', district: 'ปทุมวัน',
  fills: [35, 62, 48, 30], status: 'collected', callRequested: false,
  lastPickup: Date.now() - 3 * 3600e3, requests: [],
  // composter beside the station; compost output is simulated at an accelerated rate while it runs
  composter: { running: false, compostKg: 0, capacityL: COMPOSTER.capacityL, dailyKg: COMPOSTER.dailyKg },
  truck: 'away',                                   // EV mini truck: away / arriving / parked / leaving
};
// keep today's out-of-round requests across reloads (they feed the dashboard's 'today' KPIs)
const isToday = (t) => new Date(t).toDateString() === new Date().toDateString();
try {
  const saved = JSON.parse(localStorage.getItem('hackawork-station') || 'null');
  if (saved?.id === STATION_ID && Array.isArray(saved.requests)) smart.requests = saved.requests.filter((r) => isToday(r.at));
} catch {}
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('hackawork') : null;
function publish() {
  smart.ts = Date.now();                       // heartbeat: the dashboard marks the station offline without it
  const payload = JSON.stringify(smart);
  try { localStorage.setItem('hackawork-station', payload); } catch {}
  channel?.postMessage({ type: 'station', station: smart });
}
function applySmart() {
  const full = smart.fills.some((f) => f >= 80);
  smart.status = smart.callRequested || full ? 'pending' : 'collected';
  // a bin at 80 % or more also dispatches the EV mini truck (the dashboard queues the same job)
  if (full && (truck.state() === 'away' || truck.state() === 'leaving')) {
    truck.arrive(() => toast('รถเก็บขยะไฟฟ้ามินิมาถึงแล้ว · กด "จำลอง: รถมาเก็บแล้ว" เมื่อเก็บเสร็จ'));
    toast('ถังใกล้เต็ม (≥ 80%) · ระบบจัดรถมินิ EV มาเก็บอัตโนมัติ');
  }
  hardware.apply(smart);
  variants.apply(smart);
  smart.fills.forEach((f, i) => {
    const r = $(`fill-${i}`);
    if (r && +r.value !== Math.round(f)) r.value = Math.round(f);
    const o = $(`fill-${i}-out`);
    if (o) o.textContent = `${Math.round(f)}%`;
  });
  const chip = $('status-chip');
  chip.dataset.state = smart.status;
  chip.textContent = smart.callRequested ? 'เรียกรถนอกรอบแล้ว · รอรถ' : smart.status === 'pending' ? 'ไฟแดง · รอรถมาเก็บ' : 'ไฟเขียว · เก็บแล้ว';
  publish();
  invalidate(true);
}
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4200);
}
function requestPickup(hw = hardware) {
  hw?.press();
  if (smart.callRequested) { toast('ส่งคำขอไปแล้ว · รถมินิ EV กำลังมา'); return; }
  smart.callRequested = true;
  smart.requests.push({ at: Date.now(), fee: 500 });
  toast('ส่งคำขอเรียกรถเก็บนอกรอบแล้ว · ค่าบริการ 500 บาท · แจ้งเขตปทุมวันแล้ว');
  truck.arrive(() => toast('รถเก็บขยะไฟฟ้ามินิมาถึงแล้ว · กด "จำลอง: รถมาเก็บแล้ว" เมื่อเก็บเสร็จ'));
  applySmart();
}
function markCollected() {
  smart.fills = smart.fills.map(() => 3);
  smart.callRequested = false;
  smart.lastPickup = Date.now();
  truck.leave();
  toast('รถมาเก็บแล้ว · ไฟเปลี่ยนเป็นสีเขียว');
  applySmart();
}
for (let i = 0; i < 4; i++) {
  $(`fill-${i}`).addEventListener('input', (e) => { smart.fills[i] = +e.target.value; applySmart(); });
}
$('btn-call').addEventListener('click', requestPickup);
$('btn-flaps').addEventListener('click', () => allBins.forEach(pushFlap));   // keyboard/touch equivalent of clicking a flap
$('btn-collected').addEventListener('click', markCollected);
channel?.addEventListener('message', (e) => {
  if (e.data?.type === 'collected' && e.data.id === STATION_ID) markCollected();
  if (e.data?.type === 'hello') publish();
});
setInterval(publish, 5000);
if (innerWidth < 640) { $('smart').open = false; $('controls').open = false; }   // phones: start with panels folded
applySmart();
variants.setArrows(true);                     // the A / B / C arrows drop in from the sky on load
syncAll();
flyToVariant('all');                          // open on all three stations so the arrows have something to point at

/* ---------- loop: render on demand ----------
   One render path only (MSAA + soft shadow maps), so the picture looks the same while moving,
   after stopping and at any zoom. Idle: nothing is drawn. */
function invalidate(sceneChanged = false) {
  dirty = true;
  if (sceneChanged) shadowsDirty = true;
}
controls.addEventListener('change', () => invalidate());

function hqRender() { renderCctv(); renderer.render(scene, camera); }

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  for (const b of allBins) {
    const u = b.userData;
    if (Math.abs(u.target - u.open) > 1e-4) {
      u.open += (u.target - u.open) * Math.min(1, dt * 6);
      if (Math.abs(u.target - u.open) <= 1e-4) u.open = u.target;
      u.lidPivot.rotation.x = -u.open * CONFIG.bin.openAngle;
      invalidate(true);
    }
    const f = u.flap;
    if (!f) continue;
    if (f.hold > 0) f.hold = Math.max(0, f.hold - dt);
    const ft = f.hold > 0 ? 1 : 0;
    if (Math.abs(ft - f.open) > 1e-3) {
      f.open += (ft - f.open) * Math.min(1, dt * (ft ? 10 : 5));   // pushes in fast, swings back slower
      if (Math.abs(ft - f.open) <= 1e-3) f.open = ft;
      f.hinge.rotation.x = f.open * 1.15;
      invalidate();
    }
  }
  if (flight) {
    flight.t = Math.min(1, flight.t + dt * 1.4);
    const k = 1 - Math.pow(1 - flight.t, 3);
    camera.position.lerpVectors(flight.from, flight.to, k);
    controls.target.lerpVectors(flight.tFrom, flight.tTo, k);
    if (flight.t >= 1) flight = null;
    dirty = true;
  }
  if (riser.update(dt)) invalidate(true);
  // light-only changes (blinking status ring / truck roof light) repaint at full quality directly,
  // so the image doesn't alternate between the fast no-AO frame and the AO frame
  const hw = hardware.update(dt, camera.position);
  if (hw === 3) lightDirty = true; else if (hw) invalidate(hw === 2);
  const tr = truck.update(dt);
  if (smart.truck !== truck.state()) { smart.truck = truck.state(); publish(); }
  if (tr === 3) lightDirty = true; else if (tr) invalidate(tr === 2);
  if (composter.isRunning()) smart.composter.compostKg += dt * 0.05;   // demo rate (accelerated)
  if (smart.composter.running !== composter.isRunning()) { smart.composter.running = composter.isRunning(); publish(); }
  const c = composter.update(dt);
  if (c) invalidate(c === 2);
  const vr = variants.update(dt);
  if (vr === 3) lightDirty = true; else if (vr) invalidate(vr === 2);
  controls.update();                    // fires 'change' while damping / auto-rotating
  {
    const near = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * 0.04, 0.004, 0.05);
    if (Math.abs(near - camera.near) > 1e-4) { camera.near = near; camera.updateProjectionMatrix(); }
  }
  if (camera.position.y < 0.06) { camera.position.y = 0.06; camera.lookAt(controls.target); }   // never go under the pavement
  if (hoverEvent) processHover();

  if (dirty) {
    if (shadowsDirty) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; }
    renderCctv();                         // first: it borrows a corner of the canvas the main view then covers
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    dirty = false;
    needHQ = true;
    lastMotion = now;
  } else if (lightDirty) {
    hqRender();
    lightDirty = false;
  }
}
animate();

new ResizeObserver(() => {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  invalidate();
}).observe(viewport);

document.body.classList.add('ready');
setTimeout(() => ($('loading').hidden = true), 500);

// expose for future features / debugging
// call HACKaWORK.invalidate(true) after changing the scene from outside so it re-renders
window.HACKaWORK = { scene, camera, controls, station, riser, hardware, composter, variants, smart, CONFIG, invalidate };
