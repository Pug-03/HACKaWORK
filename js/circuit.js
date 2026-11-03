// Circuit panel: a single-line diagram of the station's power and data system.
// Selecting a device (in 3D or by clicking a block here) highlights its blocks and wires.

// focus key -> blocks / wires to highlight + description
export const FOCUS = {
  unit: {
    title: 'กล่องควบคุม',
    nodes: ['dcdc', 'mcu', 'lte', 'lora', 'relay', 'button'],
    edges: ['e-load', 'e-dcdc', 'e-lte', 'e-lora', 'e-relay', 'e-btn'],
    text: 'รับไฟ 12V จากตู้แบต → DC-DC แปลงเป็น 5V เลี้ยง MCU · MCU อ่านค่าเซ็นเซอร์ผ่าน LoRa gateway แล้วส่งขึ้นแดชบอร์ดเขตผ่าน 4G · สั่งไฟแจ้งเตือนผ่านรีเลย์ · ปุ่มเรียกรถต่อเข้า MCU โดยตรง',
  },
  battery: {
    title: 'ตู้แบตเตอรี่',
    nodes: ['mppt', 'battery', 'brk', 'fuse'],
    edges: ['e-pv', 'e-bat', 'e-load'],
    text: 'ไฟจากแผงโซลาร์เข้าเบรกเกอร์ PV → ตัวคุมชาร์จ MPPT ชาร์จแบต LiFePO4 12.8V 20Ah ผ่านเบรกเกอร์แบต · ขา LOAD ของ MPPT ผ่านฟิวส์ 10A ไปเลี้ยงกล่องควบคุม · แบตเต็มใช้ได้ 3–4 วันโดยไม่มีแดด',
  },
  solar: {
    title: 'แผงโซลาร์ 50 W',
    nodes: ['solar'],
    edges: ['e-pv'],
    text: 'แผงโมโน 50 W (67×54 ซม.) เอียง 15° · สายลงในเสาเหล็ก ออกทาง cable gland เข้าตู้แบต · ได้ราว 200 Wh/วัน มากกว่าที่ระบบใช้ (~60 Wh/วัน)',
  },
  beacon: {
    title: 'ไฟแจ้งเตือน 2 สี',
    nodes: ['beacon', 'relay'],
    edges: ['e-relay', 'e-beacon'],
    text: 'MCU สั่งรีเลย์สลับสี: แดง = รอรถมาเก็บ / ถังเกิน 80% · เขียว = เก็บแล้ว · กระพริบเมื่อมีคำขอเก็บนอกรอบ · สายเดินในท่อจากกล่องควบคุมเข้าเสาขึ้นไปที่ไฟ',
  },
  sensor: {
    title: 'เซ็นเซอร์ระดับขยะ',
    nodes: ['sensors', 'lora'],
    edges: ['e-sensors'],
    text: 'เซ็นเซอร์อัลตราโซนิกใต้ฝาทุกถัง ใช้ถ่านลิเธียมในตัว (~5 ปี) ส่งค่าระดับขยะแบบไร้สาย LoRa ไปที่ gateway ในกล่องควบคุม · ไม่มีสายเพราะถังต้องถูกเข็นออกไปเททุกรอบ',
  },
  overview: {
    title: 'วงจรทั้งระบบ',
    nodes: [],
    edges: [],
    text: 'สีแดง = ไฟฟ้ากำลัง · สีฟ้า = ข้อมูล · เส้นประ = ไร้สาย · คลิกกล่องในผังเพื่อซูมไปที่อุปกรณ์',
  },
};

// node id -> focus key (clicking a block)
const NODE_FOCUS = { solar: 'solar', mppt: 'battery', battery: 'battery', brk: 'battery', fuse: 'battery', dcdc: 'unit', mcu: 'unit', lte: 'unit', lora: 'unit', relay: 'beacon', button: 'unit', beacon: 'beacon', sensors: 'sensor', cloud: null };

const SVG = `
<svg viewBox="0 0 340 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ผังวงจรไฟฟ้าและข้อมูลของสถานี">
  <defs>
    <marker id="arP" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#dc2626"/></marker>
    <marker id="arD" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#2563eb"/></marker>
    <marker id="arB" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#d97706"/></marker>
  </defs>
  <rect class="grp" x="6" y="64" width="124" height="196" rx="8"/><text class="grpt" x="14" y="78">ตู้แบต</text>
  <rect class="grp" x="138" y="64" width="196" height="196" rx="8"/><text class="grpt" x="146" y="78">กล่องควบคุม</text>

  <path id="e-pv" class="pw" d="M62 46 V88" marker-end="url(#arP)"/>
  <path id="e-bat" class="pw" d="M62 128 V150" marker-end="url(#arP)"/>
  <path id="e-load" class="pw" d="M62 208 V230 H120 V104 H150" marker-end="url(#arP)"/>
  <path id="e-dcdc" class="pw" d="M190 118 V134" marker-end="url(#arP)"/>
  <path id="e-lte" class="dt" d="M230 150 H248" marker-end="url(#arD)"/>
  <path id="e-cloud" class="dt wl" d="M286 88 V48" marker-end="url(#arD)"/>
  <path id="e-lora" class="dt" d="M230 160 H248 V196" marker-end="url(#arD)"/>
  <path id="e-sensors" class="dt wl" d="M286 286 V224" marker-end="url(#arD)"/>
  <path id="e-relay" class="dt" d="M190 168 V196" marker-end="url(#arD)"/>
  <path id="e-beacon" class="bc" d="M190 226 V286" marker-end="url(#arB)"/>
  <path id="e-btn" class="dt" d="M286 236 V246 H214 V170" />

  <g class="nd" data-id="solar"><rect x="14" y="14" width="96" height="32" rx="6"/><text x="62" y="34">แผงโซลาร์ 50W</text></g>
  <g class="nd" data-id="mppt"><rect x="14" y="88" width="96" height="40" rx="6"/><text x="62" y="106">MPPT</text><text class="sm" x="62" y="120">เบรกเกอร์ PV/BAT</text></g>
  <g class="nd" data-id="battery"><rect x="14" y="150" width="96" height="34" rx="6"/><text x="62" y="171">LiFePO4 12.8V</text></g>
  <g class="nd" data-id="fuse"><rect x="14" y="190" width="96" height="18" rx="5"/><text class="sm" x="62" y="203">ฟิวส์ 10A · LOAD</text></g>
  <g class="nd" data-id="dcdc"><rect x="150" y="88" width="80" height="30" rx="6"/><text x="190" y="107">DC-DC 5V</text></g>
  <g class="nd" data-id="mcu"><rect x="150" y="134" width="80" height="34" rx="6"/><text x="190" y="156">MCU</text></g>
  <g class="nd" data-id="lte"><rect x="248" y="88" width="78" height="30" rx="6"/><text x="287" y="107">4G LTE</text></g>
  <g class="nd" data-id="lora"><rect x="248" y="196" width="78" height="28" rx="6"/><text x="287" y="214">LoRa GW</text></g>
  <g class="nd" data-id="relay"><rect x="150" y="196" width="80" height="30" rx="6"/><text x="190" y="215">รีเลย์</text></g>
  <g class="nd" data-id="button"><rect x="248" y="134" width="78" height="30" rx="6"/><text x="287" y="153">ปุ่มเรียกรถ</text></g>
  <g class="nd cloud" data-id="cloud"><rect x="248" y="14" width="78" height="34" rx="17"/><text x="287" y="35">แดชบอร์ดเขต</text></g>
  <g class="nd" data-id="beacon"><rect x="150" y="286" width="80" height="30" rx="6"/><text x="190" y="305">ไฟแจ้งเตือน</text></g>
  <g class="nd" data-id="sensors"><rect x="248" y="286" width="78" height="30" rx="6"/><text x="287" y="305">เซ็นเซอร์ ×3</text></g>
</svg>`;

export function buildCircuitPanel(root, onSelect, onClose) {
  root.innerHTML = `
    <div class="cp-head"><strong id="cp-title">วงจร</strong><button class="cp-close" aria-label="ปิดโหมดวงจร">ปิด ✕</button></div>
    ${SVG}
    <p class="cp-text" id="cp-text"></p>
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
