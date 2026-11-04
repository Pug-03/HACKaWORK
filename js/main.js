import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CONFIG } from './config.js';
import { buildStation } from './binStation.js';
import { buildEnvironment, STREET } from './environment.js';
import { buildTruck } from './truck.js';
import { buildCircuitPanel } from './circuit.js';
import { buildRiser, RISER } from './riser.js';
import { buildHardware } from './hardware.js';
import { buildComposter, COMPOSTER } from './composter.js';
import { buildShop, SHOP } from './shop.js';

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
camera.position.set(3.6, 2.1, 4.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.4, 0.7, 0);
controls.enableDamping = true;
controls.minDistance = 0.25;                       // close enough to inspect the trays under the riser
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
let riserOn = true, dimsRef = null;
const lift = () => (riserOn ? RISER.height : 0);
function placeStation() {
  station.group.position.y = env.padHeight + lift();
  riser.group.visible = riserOn;
  if (dimsRef) dimsRef.position.y = env.padHeight + lift();   // same base as the station group
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

// fertilizer shop stand across the sidewalk, facing the composter (opposite side of the walkway)
const shop = buildShop();
const SHOP_X = COMPOSTER_X, SHOP_Z = 0.1 + COMPOSTER.depth / 2 + 4.0 + SHOP.depth / 2;   // 4 m back, across the walkway
shop.group.position.set(SHOP_X, 0, SHOP_Z);
shop.group.rotation.y = Math.PI;
scene.add(shop.group);

// electric mini garbage truck: drives along the road behind the station on out-of-round calls
const truck = buildTruck();
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
  fanSwitch: 'สวิตช์พัดลม อัตโนมัติ / ปิด / เปิด (อัตโนมัติ = เทอร์โมสตัท 35°C) — คลิกเพื่อสลับโหมด',
  cabinet: 'ตู้ครอบรวม SUS304 หนา 2 มม. (56×46×17 ซม.) กันน้ำ IP55 · หลังคากันแดดสองชั้น · พัดลม 120 มม. คุมด้วยเทอร์โมสตัท · สายเข้าทางด้านล่างเท่านั้น · บานพับซ่อน + มือจับล็อก 3 จุด + กุญแจคล้อง — คลิกเพื่อเปิด/ปิดตู้',
  trunking: 'รางครอบสายเหล็กชุบกัลวาไนซ์ · ท่อเหล็กข้างใน · ฝายึดสกรูกันงัด ตัดสายไม่ได้',
  unit: 'กล่องควบคุม · รับข้อมูลเซ็นเซอร์ + ส่งเข้าแดชบอร์ดเขต — คลิกเพื่อซูมดูวงจร',
  unitInside: 'ภายในกล่องควบคุม: MCU · โมดูล 4G · LoRa gateway · DC-DC · รีเลย์ไฟ · ขั้วต่อสาย',
  batteryInside: 'ภายในตู้แบต: แพ็ก LiFePO4 + BMS · ตัวคุมชาร์จ MPPT · เบรกเกอร์ DC · บัสบาร์',
  trayLid: 'ฝาถาด · สลักบานพับทั้งสองขอบ ยกได้ทั้งตอนดึงออกด้านหน้าหรือด้านหลัง + กุญแจ — คลิกเพื่อเปิด/ปิดฝา',
  stepHatch: 'แผ่นบันไดถอดได้หน้าถาด · พื้นเจาะรูระบายน้ำฝน · สลักสปริงใต้มุมหน้า 2 ข้าง ต้องบีบแถบแดงใต้ขอบพร้อมกันทั้งสองมุมจึงยกออกได้ — คลิกเพื่อยกออก ดึง/ดันถาดด้านหน้า',
  tray: 'ถาดบริการใต้ฐาน 62×42×8 ซม. (ล็อกกุญแจ) · ดึงออกสุด 62 ซม. ได้ทั้งด้านหน้า (ลอดใต้บันได) และด้านหลัง แล้วยกฝาเติมเหยื่อ — คลิกเพื่อเปิดทางฝั่งที่มองอยู่/ปิด',
  riser: `ฐานยกกันหนู สูง ${RISER.height * 100} ซม. · ใต้ฐานโล่ง ทำความสะอาดง่าย · ถาดแขวนบนโครงเหล็กกล่อง + รางเหล็กฉาก`,
  ratGuard: 'แผ่นกันหนูปีน (rat guard) Ø 26 ซม. · หนูปีนเสาขึ้นมาแล้วติดใต้กรวย อ้อมขึ้นไปไม่ได้',
  composter: `เครื่องหมักปุ๋ยจากเศษอาหาร ${COMPOSTER.capacityL} ลิตร`,
  hatch: 'ช่องเติมเศษอาหาร — คลิกเพื่อเปิด/ปิด',
  drawer: 'ลิ้นชักปุ๋ยพร้อมใช้ — คลิกเพื่อดึงออก/ดันกลับ',
  composterStart: 'ปุ่มเดินเครื่องหมัก — คลิกเพื่อเริ่ม/หยุด',
  flap: 'ช่องทิ้งแบบบานผลัก — คลิกเพื่อดันบานเข้าไป แล้วบานจะปิดกลับเอง',
  sensor: 'เซ็นเซอร์อัลตราโซนิกไร้สาย · แบตในตัว ~5 ปี · ส่ง LoRa ไปกล่องควบคุม (ไม่ต้องเดินสาย เพราะถังถูกเข็นออกทุกรอบ)',
  solar: 'แผงโซลาร์ 50 W (67×54 ซม.) เอียง 15° · ติดสูงเหนือระยะเปิดฝา',
  battery: 'ตู้แบต LiFePO4 12.8V 20Ah (256 Wh) + MPPT · สำรองไฟ 3–4 วัน — คลิกเพื่อซูมดูวงจร',
  beacon: 'ไฟแจ้งเตือน 2 สี · แดง = รอรถ · เขียว = เก็บแล้ว',
  pole: 'เสาเหล็ก Ø 60 มม. · ใช้เป็นท่อร้อยสายไปแผงโซลาร์และไฟแจ้งเตือน',
  cableSolar: 'ท่อร้อยสาย: แผงโซลาร์ → ตู้แบต',
  cableBatt: 'ท่อร้อยสาย: ตู้แบต → กล่องควบคุม',
  cableBeacon: 'ท่อร้อยสาย: กล่องควบคุม → เสา → ไฟแจ้งเตือน',
  truck: 'รถเก็บขยะไฟฟ้ามินิ (EV) · บรรทุก ~500 กก. · ร่วมกับภาคเอกชน',
  frame: `โครงเหล็กสถานี · ยาว ${(L * 100).toFixed(0)} × ลึก ${(D * 100).toFixed(0)} × สูง ${(H * 100).toFixed(0)} ซม.`,
  lattice: 'ตะแกรงเจาะรูช่องถุงดำ · ระบายอากาศและมองเห็นว่าในช่องมีถุงอยู่',
  bags: 'ถุงขยะมัดปาก (ถุงดำ) · ระดับในช่องตามแถบ "ถุงดำ" ในแผงจำลอง',
  estop: 'ปุ่มหยุดฉุกเฉินเครื่องหมัก · ตัดมอเตอร์และฮีตเตอร์ทันที',
  shop: 'ร้านขายปุ๋ย กทม. · ชั้นแขวนแผ่นเพ็กบอร์ด 1.2 ม. · ถุงเปล่า 1 / 5 / 10 กก. แขวนตะขอ 10 ซม. · ช่องท้ายเป็นแบรนด์อื่น (ชื่อสมมติ)',
  rearDoor: 'ประตูหลัง (บานพับขวา · ล็อกหมุน 2 จุด · ซีลยาง) เข้าถึงฟิลเตอร์ รางสาย และท่อด้านหลัง — คลิกเพื่อเปิด/ปิด',
  serviceDoor: 'ประตูบริการหน้าเครื่อง (บานพับซ้าย · ล็อกหมุน 2 จุด · ซีลยาง) — คลิกเพื่อเปิด/ปิด',
  console: 'แผงควบคุมเอียง 18° · จอ HMI 7" · ไฟแสดงสถานะ 22 มม. · สวิตช์ อัตโนมัติ/ปิด/มือ · เริ่ม/หยุด · หยุดฉุกเฉิน',
  composterInside: 'ภายในเครื่องหมัก — เปิด "มองภายใน" เพื่อดูหมายเลขชิ้นส่วนและสเปก',
  drive: 'ฝาครอบโซ่ (ถอดออกในโหมดมองภายใน)',
  compostBag: 'แผงถุงปุ๋ยติดข้างเครื่อง (สแตนเลสเจาะรูแบบเดียวกับตัวเครื่อง) · ถุงเปล่า 1 / 5 กก. · ใบปลิวบอกทางไปร้านฝั่งตรงข้าม',
};
const CLICKABLE = new Set(['callButton', 'fanSwitch', 'cabinet', 'serviceDoor', 'rearDoor', 'tray', 'trayLid', 'stepHatch', 'hatch', 'composterStart', 'flap', 'drawer', 'unit', 'unitInside', 'battery', 'batteryInside',
  'solar', 'beacon', 'sensor', 'cableSolar', 'cableBatt', 'cableBeacon']);
// hardware part -> circuit focus key
const PART_FOCUS = { unit: 'unit', unitInside: 'unit', battery: 'battery', batteryInside: 'battery', solar: 'solar', beacon: 'beacon',
  sensor: 'sensor', cableSolar: 'solar', cableBatt: 'battery', cableBeacon: 'beacon' };

// push flap: swings in while "held", then springs back shut like the real gravity flap
function pushFlap(bin) {
  bin.userData.flap.hold = 1.2;               // seconds held open
  invalidate();
}

function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const isShown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const targets = [station.group, composter.group, shop.group, truck.group];
  if (riserOn) targets.push(riser.group);
  const partOf = (o) => { for (; o; o = o.parent) if (o.userData.part) return o.userData.part; return null; };
  const hits = raycaster.intersectObjects(targets, true).filter((h) => {
    const m = Array.isArray(h.object.material) ? h.object.material[h.face?.materialIndex ?? 0] : h.object.material;
    return isShown(h.object) && m && m.visible;
  });
  // the call button sits in a hole in the cabinet door: a ray grazing the hole edge must still press it
  const hit = hits.find((h) => hits[0] && h.distance - hits[0].distance < 0.04 && partOf(h.object) === 'callButton') || hits[0];
  if (!hit) return {};
  let o = hit.object, bin = null, bayId = null, part = null;
  while (o) {
    if (o.userData.part) part ??= o.userData.part;
    if (o.userData.bayId) bayId ??= o.userData.bayId;
    if (station.bins.includes(o)) bin = o;
    o = o.parent;
  }
  const owner = bin;                            // bin this part belongs to (for the push flap)
  if (part && part !== 'unit') bin = null;   // hardware parts take priority over the bin under them
  return { bin, bayId, part, owner };
}
// a click = one pointer pressed and released in place; multi-touch gestures (pinch/rotate) never count
const activePointers = new Set();
let gestured = false;
renderer.domElement.addEventListener('pointerdown', (e) => {
  activePointers.add(e.pointerId);
  if (activePointers.size > 1) gestured = true;
  downAt = activePointers.size === 1 ? [e.clientX, e.clientY, e.pointerId] : null;
});
const endPointer = (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size === 0) setTimeout(() => (gestured = false), 0);
};
renderer.domElement.addEventListener('pointercancel', (e) => { endPointer(e); downAt = null; });
renderer.domElement.addEventListener('pointerup', (e) => {
  const wasGesture = gestured;
  endPointer(e);
  const start = downAt;
  downAt = null;
  if (wasGesture || !start || start[2] !== e.pointerId || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5) return;
  const { bin, part, owner } = pick(e);
  if (part === 'flap' && owner) pushFlap(owner);
  else if (part === 'callButton') requestPickup();
  else if (part === 'stepHatch') { riser.setTraysOpen(riser.traysState() === 1 ? 0 : 1); syncAll(); }
  else if (part === 'trayLid' && riser.traysState()) { riser.setLidOpen(!riser.isLidOpen()); syncAll(); }
  else if (part === 'tray' || part === 'trayLid') {
    // open toward whichever side the viewer is on (front = step side, back = road side); click again to close
    const side = camera.position.z >= riser.group.getWorldPosition(new THREE.Vector3()).z ? 1 : -1;
    riser.setTraysOpen(riser.traysState() ? 0 : side); syncAll();
  }
  else if (part === 'hatch') { composter.toggleHatch(); syncAll(); }
  else if (part === 'serviceDoor') { composter.toggleDoor(); invalidate(true); }
  else if (part === 'rearDoor') { composter.toggleRear(); syncAll(); }
  else if (part === 'drawer') { composter.toggleDrawer(); syncAll(); }
  else if (part === 'fanSwitch') { hardware.cycleFanMode(); syncFanSeg(); invalidate(true); }
  else if (part === 'cabinet') { hardware.toggleCabinet(); invalidate(true); }
  else if (PART_FOCUS[part]) focusCircuit(PART_FOCUS[part]);
  else if (part === 'composterStart') { composter.setRunning(!composter.isRunning()); syncAll(); }
  else if (bin) bin.userData.target = bin.userData.target ? 0 : 1;
  syncAll();
  invalidate(true);
});
let hoverEvent = null;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons) { tooltip.hidden = true; hoverEvent = null; return; }
  hoverEvent = e;                       // processed once per frame in the loop
});
function processHover() {
  const e = hoverEvent;
  hoverEvent = null;
  const { bin, bayId, part } = pick(e);
  const partText = PART_TIPS[part];
  const clickable = bin || CLICKABLE.has(part);
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
bindToggle('t-bags', () => station.bagPile.visible, (v) => (station.bagPile.visible = v));
const anyOpen = () => station.bins.some((b) => b.userData.target);
const syncers = [];
syncers.push(bindToggle('t-lids', anyOpen, (v) => station.bins.forEach((b) => (b.userData.target = v ? 1 : 0))));
syncers.push(bindToggle('t-hw-open', () => hardware.isInsideView(), (v) => {
  hardware.setInsideView(v);
  if (v) document.querySelector('[data-view=smart]').click();
}));
syncers.push(bindToggle('t-riser', () => riserOn, (v) => { riserOn = v; placeStation(); }));
const setTrays = (v) => { if (!riserOn && v) { riserOn = true; placeStation(); } riser.setTraysOpen(v); };
syncers.push(bindToggle('t-trays', () => riser.traysState() === 1, (v) => setTrays(v ? 1 : 0)));
syncers.push(bindToggle('t-trays-back', () => riser.traysState() === -1, (v) => setTrays(v ? -1 : 0)));
syncers.push(bindToggle('t-tray-lid', () => riser.isLidOpen(), (v) => { if (!riserOn && v) { riserOn = true; placeStation(); } riser.setLidOpen(v); }));
syncers.push(bindToggle('t-comp-run', () => composter.isRunning(), (v) => composter.setRunning(v)));
// cabinet fan mode (AUTO / ON / OFF), mirrored by the selector knob inside the cabinet
const fanBtns = document.querySelectorAll('#fan-seg [data-fan]');
function syncFanSeg() { fanBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fan === hardware.getFanMode()))); }
fanBtns.forEach((b) => b.addEventListener('click', () => { hardware.setFanMode(b.dataset.fan); syncFanSeg(); invalidate(true); }));
hardware.setFanMode('auto');
syncFanSeg();
const legendEl = $('comp-legend');
$('comp-legend-list').innerHTML = composter.parts.map((p) => `<li><span class="n">${p.n}</span><div><b>${p.name}</b><small>${p.spec}</small></div></li>`).join('');
function setComposterCut(v) { cutaway = v; composter.setCutaway(v); legendEl.hidden = !v; $('smart').hidden = v; }
syncers.push(bindToggle('t-comp-cut', () => cutaway, (v) => setComposterCut(v)));
// inspection cameras: fly to a part of the composter with the cutaway on (outside views keep it closed)
document.querySelectorAll('[data-cview]').forEach((btn) => btn.addEventListener('click', () => {
  const key = btn.dataset.cview, [p, tg] = composter.views[key], o = composter.group.position;
  setComposterCut(!['back', 'bags'].includes(key));
  if (key === 'back') composter.setRearOpen(true);
  syncAll();
  flight = { from: camera.position.clone(), to: new THREE.Vector3(p[0] + o.x, p[1] + o.y, p[2] + o.z), t: 0,
             tFrom: controls.target.clone(), tTo: new THREE.Vector3(tg[0] + o.x, tg[1] + o.y, tg[2] + o.z) };
  invalidate(true);
}));
syncers.push(bindToggle('t-comp-hatch', () => hatchOpen(), () => composter.toggleHatch()));
syncers.push(bindToggle('t-comp-rear', () => composter.isRearOpen(), (v) => composter.setRearOpen(v)));
syncers.push(bindToggle('t-comp-drawer', () => composter.isDrawerOpen(), () => composter.toggleDrawer()));
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
  if (riserOn === false) { /* nothing */ }
  hardware.setUnitOpen(key === 'unit' || key === 'overview');
  hardware.setBatteryOpen(key === 'battery' || key === 'overview');
  station.bins[0].userData.target = key === 'sensor' ? 1 : station.bins[0].userData.target;
  hardware.setFlow(true);
  circuit.show(key);
  $('smart').hidden = true;
  // camera framing per device (positions derived from the device's world placement)
  const T = hardware.focusTargets;
  const obj = key === 'sensor' ? T.sensor() : key === 'overview' ? T.unit : T[key];
  const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
  const q = obj.getWorldQuaternion(new THREE.Quaternion());
  const front = new THREE.Vector3(0, 0, 1).applyQuaternion(q);       // device's own front direction
  let pos;
  if (key === 'unit' || key === 'battery') pos = c.clone().addScaledVector(front, 0.55).add(new THREE.Vector3(0, 0.08, 0.18));
  else if (key === 'overview') { c.z -= 0.12; pos = c.clone().addScaledVector(front, 1.0).add(new THREE.Vector3(0, 0.2, 0.25)); }
  else if (key === 'solar') pos = c.clone().add(new THREE.Vector3(-0.9, 0.7, 1.2));
  else if (key === 'beacon') pos = c.clone().add(new THREE.Vector3(-0.7, 0.15, 0.7));
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
addEventListener('keydown', (e) => { if (e.key === 'Escape') exitCircuit(); });
const VIEWS = {
  front: [[0, 1.2, 5.4], [0, 0.75, 0]],
  side: [[5.2, 1.2, 0], [0, 0.75, 0]],
  top: [[0, 6.2, 0.01], [0, 0.6, 0]],
  iso: [[3.6, 2.1, 4.2], [0.4, 0.7, 0]],
  back: [[-2.8, 2.0, -4.2], [0, 0.75, 0]],
  composter: [[COMPOSTER_X + 1.6, 1.9, 2.8], [COMPOSTER_X, 0.65, 0.1]],
  shop: [[SHOP_X - 0.5, 1.45, SHOP_Z - 2.1], [SHOP_X, 1.0, SHOP_Z]],
  truck: [[-5.6, 3.2, -8.2], [0, 0.8, -1.8]],
  tray: [[-L / 2 - 0.5, 0.11, 0.3], [-L / 4, 0.12, 0.05]],          // from the side, under the deck, past the step
  smart: [[-L / 2 - 1.25, 1.35, 0.55], [-L / 2, 0.95, -0.03]],
};
document.querySelectorAll('[data-view]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const [pos, tgt] = VIEWS[btn.dataset.view];
    if (btn.dataset.view === 'tray') { if (!riserOn) { riserOn = true; placeStation(); } riser.setTraysOpen(true); syncAll(); }
    flight = { from: camera.position.clone(), to: new THREE.Vector3(...pos), t: 0,
               tFrom: controls.target.clone(), tTo: new THREE.Vector3(...tgt) };
    invalidate();
  })
);

// spec sheet
$('spec').innerHTML = `
  <div><dt>ยาวรวม</dt><dd>${fmt(L)}</dd></div>
  <div><dt>ลึก</dt><dd>${fmt(D)}</dd></div>
  <div><dt>สูงโครง</dt><dd>${fmt(H)}</dd></div>
  <div><dt>สูงรวมถัง</dt><dd>${fmt(lidTop)}</dd></div>
  <div><dt>ฐานยกกันหนู</dt><dd>${fmt(RISER.height)}</dd></div>
  <div><dt>ถังล้อเลื่อน</dt><dd>${CONFIG.bin.capacityL} ลิตร × 3</dd></div>
  <div><dt>รุ่นถัง</dt><dd>${CONFIG.bin.model} (50×55×110)</dd></div>
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
function requestPickup() {
  hardware.press();
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
$('btn-flaps').addEventListener('click', () => station.bins.forEach(pushFlap));   // keyboard/touch equivalent of clicking a flap
$('btn-collected').addEventListener('click', markCollected);
channel?.addEventListener('message', (e) => {
  if (e.data?.type === 'collected' && e.data.id === STATION_ID) markCollected();
  if (e.data?.type === 'hello') publish();
});
setInterval(publish, 5000);
if (innerWidth < 640) { $('smart').open = false; $('controls').open = false; }   // phones: start with panels folded
applySmart();

/* ---------- loop: render on demand ----------
   One render path only (MSAA + soft shadow maps), so the picture looks the same while moving,
   after stopping and at any zoom. Idle: nothing is drawn. */
function invalidate(sceneChanged = false) {
  dirty = true;
  if (sceneChanged) shadowsDirty = true;
}
controls.addEventListener('change', () => invalidate());

function hqRender() { renderer.render(scene, camera); }

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  for (const b of station.bins) {
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
  // light-only changes (blinking beacon / truck roof light) repaint at full quality directly,
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
  controls.update();                    // fires 'change' while damping / auto-rotating
  if (camera.position.y < 0.06) { camera.position.y = 0.06; camera.lookAt(controls.target); }   // never go under the pavement
  if (hoverEvent) processHover();

  if (dirty) {
    if (shadowsDirty) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; }
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
window.HACKaWORK = { scene, camera, controls, station, riser, hardware, composter, smart, CONFIG, invalidate };
