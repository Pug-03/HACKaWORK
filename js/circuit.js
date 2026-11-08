// Circuit panel: a single-line diagram of the station's low-cost smart kit (power + data).
// Selecting a device (in 3D or by clicking a block here) highlights its blocks and wires.

import { KIT_COST, kitTotal } from './hardware.js';

// focus key -> blocks / wires to highlight + description
export const FOCUS = {
  unit: {
    title: 'กล่องฮับ ESP32',
    nodes: ['mcu', 'nbiot', 'button', 'display'],
    edges: ['e-nb', 'e-cloud', 'e-btn', 'e-disp'],
    text: 'กล่อง IP65 16×12×7.5 ซม. · ข้างในเป็นเมนบอร์ดแผ่นเดียว 13×4 ซม. (แบบ Mac mini: เล็กแต่ครบ) รวม ESP32-C3, โมเด็ม NB-IoT ใต้ฮีตซิงก์, วงจรชาร์จ MPPT, RTC และ microSD เก็บข้อมูลสำรอง อุปกรณ์ทุกตัวเสียบผ่านคอนเน็กเตอร์มีป้าย ไม่มีสายต่อลอย · ESP32-C3 หลับลึก (deep sleep) แล้วตื่นทุก 10 นาที สแกน BLE ~10 วินาทีเพื่อรับค่าจากเซ็นเซอร์ฝาถัง · ส่งขึ้นแดชบอร์ดเขตผ่าน NB-IoT ทุก 30 นาที หรือทันทีเมื่อถังเกิน 80% · ปุ่มเรียกรถปลุก ESP32 ผ่านขา GPIO · ไฟ LED วงแหวนรอบปุ่มบอกสถานะแทนไฟบนเสา (แดง = รอรถ · เขียว = เก็บแล้ว · กระพริบ = เรียกรถนอกรอบ) · จอ e-paper 2.9″ บนฝาโชว์ % แต่ละถังและสถานะรถ ภาพค้างโดยไม่กินไฟ ESP32 วาดใหม่ผ่าน SPI เฉพาะตอนค่าเปลี่ยน · พัดลมจิ๋ว 30 มม. ข้างกล่องเป่าลมร้อนออกทางช่องระบายมีครอบกันฝน · ไฟ LED ใต้ผนังบนติดเองเมื่อเปิดฝา (สวิตช์แม่เหล็ก) และเฉพาะตอนมืด',
  },
  battery: {
    title: 'ไฟเลี้ยง',
    nodes: ['solar', 'charger', 'cells'],
    edges: ['e-pv', 'e-bat', 'e-load'],
    text: 'แผงโซลาร์ 6V 2W เหนือกล่อง สายลงตรงเข้าขั้วกันน้ำด้านบน (แผงบังฝนให้) → วงจรชาร์จ → ถ่าน 18650 ×2 (ขนาน 3.7V ~6,800 mAh) → ESP32 · ระบบใช้ไฟเฉลี่ย ~40 mAh/วัน ถ่านเต็มอยู่ได้ราว 5 เดือนแม้ไม่มีแดด · ไม่ต้องมีตู้แบตหรือเบรกเกอร์ · พัดลมจิ๋ว 5V 30 มม. ติดเฉพาะตอนในกล่องร้อนเกิน 45°C',
  },
  sensor: {
    title: 'เซ็นเซอร์ฝาถัง BLE',
    nodes: ['sensors', 'mcu'],
    edges: ['e-ble'],
    text: 'ติดใต้ฝาทุกถัง: เซ็นเซอร์วัดระยะ ToF (VL53L1X) + โมดูล BLE nRF52 + ถ่าน AA ×2 · สวิตช์เอียงปลุกให้วัดตอนฝาปิด แล้วประกาศค่า % ผ่าน BLE advertising ให้ฮับมาสแกนเอง ไม่ต้องจับคู่ · ใช้ nRF52 แทน ESP32 เพราะกินไฟตอนประกาศ BLE ต่ำกว่ามาก ถ่านอยู่ได้ ~2–3 ปี · ไม่มีสายเพราะถังถูกเข็นออกไปเททุกรอบ',
  },
  overview: {
    title: 'วงจรทั้งระบบ',
    nodes: [],
    edges: [],
    text: 'สีแดง = ไฟฟ้า · สีฟ้า = ข้อมูล · เส้นประ = ไร้สาย · คลิกกล่องในผังเพื่อซูมไปที่อุปกรณ์',
    cost: true,
  },
};

// node id -> focus key (clicking a block)
const NODE_FOCUS = { solar: 'battery', charger: 'battery', cells: 'battery', mcu: 'unit', nbiot: 'unit', button: 'unit', display: 'unit', sensors: 'sensor', cloud: null };

const SVG = `
<svg viewBox="0 0 340 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ผังวงจรไฟฟ้าและข้อมูลของชุดอัจฉริยะ">
  <defs>
    <marker id="arP" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#dc2626"/></marker>
    <marker id="arD" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#2563eb"/></marker>
  </defs>
  <rect class="grp" x="6" y="72" width="328" height="186" rx="8"/><text class="grpt" x="14" y="86">กล่องฮับ IP65 · 16×12×7.5 ซม.</text>

  <path id="e-pv" class="pw" d="M62 46 V96" marker-end="url(#arP)"/>
  <path id="e-bat" class="pw" d="M62 130 V158" marker-end="url(#arP)"/>
  <path id="e-load" class="pw" d="M110 175 H120 V150 H134" marker-end="url(#arP)"/>
  <path id="e-nb" class="dt" d="M224 128 H236 V113 H248" marker-end="url(#arD)"/>
  <path id="e-cloud" class="dt wl" d="M287 96 V50" marker-end="url(#arD)"/>
  <path id="e-btn" class="dt" d="M248 190 H236 V156 H226" marker-end="url(#arD)"/>
  <path id="e-disp" class="dt" d="M224 166 H230 V233 H248" marker-end="url(#arD)"/>
  <path id="e-ble" class="dt wl" d="M179 280 V176" marker-end="url(#arD)"/>

  <g class="nd" data-id="solar"><rect x="14" y="14" width="96" height="32" rx="6"/><text x="62" y="34">โซลาร์ 2W</text></g>
  <g class="nd" data-id="charger"><rect x="14" y="96" width="96" height="34" rx="6"/><text x="62" y="117">วงจรชาร์จ</text></g>
  <g class="nd" data-id="cells"><rect x="14" y="158" width="96" height="34" rx="6"/><text x="62" y="179">18650 ×2</text></g>
  <g class="nd" data-id="mcu"><rect x="134" y="112" width="90" height="64" rx="6"/><text x="179" y="140">ESP32-C3</text><text class="sm" x="179" y="156">BLE ในตัว · deep sleep</text></g>
  <g class="nd" data-id="nbiot"><rect x="248" y="96" width="78" height="34" rx="6"/><text x="287" y="117">NB-IoT</text></g>
  <g class="nd" data-id="button"><rect x="248" y="174" width="78" height="34" rx="6"/><text x="287" y="189">ปุ่ม + LED</text><text class="sm" x="287" y="201">ไฟสถานะ</text></g>
  <g class="nd" data-id="display"><rect x="248" y="216" width="78" height="34" rx="6"/><text x="287" y="231">จอ e-paper</text><text class="sm" x="287" y="243">2.9″ 3 สี</text></g>
  <g class="nd cloud" data-id="cloud"><rect x="248" y="14" width="78" height="36" rx="18"/><text x="287" y="36">แดชบอร์ดเขต</text></g>
  <g class="nd" data-id="sensors"><rect x="120" y="280" width="118" height="34" rx="6"/><text x="179" y="301">เซ็นเซอร์ฝาถัง BLE ×3</text></g>
</svg>`;

const baht = (n) => n.toLocaleString('th-TH');
const COST_HTML = `
  <table class="cp-cost">
    <caption>ต้นทุนชุดอัจฉริยะต่อสถานี (ประมาณการราคาปลีก)</caption>
    <tbody>
      ${KIT_COST.hub.map(([n, p]) => `<tr><td>${n}</td><td>${baht(p)}</td></tr>`).join('')}
      <tr><td>${KIT_COST.sensor[0][0]} ×${KIT_COST.sensors}</td><td>${baht(KIT_COST.sensor[0][1] * KIT_COST.sensors)}</td></tr>
    </tbody>
    <tfoot><tr><td>รวม (บาท)</td><td>${baht(kitTotal())}</td></tr></tfoot>
  </table>
  <p class="cp-note">ค่า SIM NB-IoT ราว 20–30 บาท/เดือน · แบบเดิม (ตู้สแตนเลส + แบต LiFePO4 + โซลาร์ 50W + เราเตอร์ 4G + LoRa gateway + เสา) ประมาณ 30,000 บาทขึ้นไป</p>`;

export function buildCircuitPanel(root, onSelect, onClose) {
  root.innerHTML = `
    <div class="cp-head"><strong id="cp-title">วงจร</strong><button class="cp-close" aria-label="ปิดโหมดวงจร">ปิด ✕</button></div>
    ${SVG}
    <p class="cp-text" id="cp-text"></p>
    <div id="cp-cost" hidden>${COST_HTML}</div>
    <div class="cp-legend"><span><i class="lp"></i>ไฟฟ้า</span><span><i class="ld"></i>ข้อมูล</span><span><i class="lw"></i>ไร้สาย</span></div>`;
  root.querySelector('.cp-close').addEventListener('click', onClose);
  root.querySelectorAll('.nd').forEach((g) => {
    const key = NODE_FOCUS[g.dataset.id];
    if (!key) return;
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    const go = () => onSelect(key);
    g.addEventListener('click', go);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  function select(key) {
    const f = FOCUS[key] ?? FOCUS.overview;
    root.querySelector('#cp-title').textContent = `วงจร · ${f.title}`;
    root.querySelector('#cp-text').textContent = f.text;
    root.querySelector('#cp-cost').hidden = !f.cost;
    root.querySelectorAll('.nd').forEach((g) => g.classList.toggle('on', f.nodes.includes(g.dataset.id)));
    root.querySelectorAll('path[id^="e-"]').forEach((p) => p.classList.toggle('on', f.edges.includes(p.id)));
    root.classList.toggle('dim-others', f.nodes.length > 0);
  }
  return {
    show(key) { root.hidden = false; select(key); },
    hide() { root.hidden = true; },
    select,
  };
}
