// All dimensions in metres (1 unit = 1 m) so the model is true to scale.
// Values are estimated from site photos + standard 240 L wheelie-bin specs
// (EN 840: ~580 W x 730 D x 1070 H mm). Adjust here when real drawings arrive.

export const CONFIG = {
  frame: {
    height: 1.0,        // top of steel frame from ground
    depth: 0.70,        // front to back
    footHeight: 0.05,   // clearance under base plate
    post: 0.04,         // square tube size
    sheet: 0.006,       // sheet thickness
    steel: 0x9aa0a6,
    grayPanel: 0x7c8187,
  },

  bays: [
    { id: 'recycle', type: 'bin', width: 0.58, th: 'รีไซเคิล',   en: 'RECYCLE',        panel: '#f3c200', bin: 0xf0a800, ink: '#2a2208' },
    { id: 'food',    type: 'bin', width: 0.58, th: 'เศษอาหาร',   en: 'FOOD WASTE',     panel: '#2f9e45', bin: 0x1f8a3a, ink: '#0f2a14' },
    { id: 'general', type: 'bin', width: 0.58, th: 'ขยะทั่วไป',  en: 'GENERAL WASTE',  panel: '#2f7bd0', bin: 0x1d55c0, ink: '#0b1f3d' },
    { id: 'bag',     type: 'open', width: 1.10, th: 'ถุงขยะ(มัด)', en: 'SEALED BIN BAG', panel: '#8c9196', ink: '#1e2124' },
  ],

  // 120 L wheelie bin with waste-slot lid, per TAB120HW drawing (mm -> m):
  // overall 500 W x 550 D x 1100 H, body height 910, hood 140 high (452 base / 328 top), wheel 205
  bin: {
    model: 'TAB120HW',
    capacityL: 120,
    width: 0.50,            // lid width (overall)
    depth: 0.55,            // overall incl. handle
    height: 1.10,           // overall incl. hood
    rimHeight: 0.91,        // ground to top of collar
    collarWidth: 0.47,
    collarDepth: 0.49,
    bodyTopWidth: 0.45,
    bodyTopDepth: 0.47,
    bodyBottomWidth: 0.348,
    bodyBottomDepth: 0.38,
    lidThickness: 0.043,   // 910 rim + 5 gap + 43 lid + 140 hood ≈ 1100
    hoodHeight: 0.14,
    hoodBaseWidth: 0.452,
    hoodTopWidth: 0.328,
    wheel: 0.205,
    wheelSpan: 0.48,
    openAngle: 1.62,        // rad (~93°): lid rests just past vertical, clear of the frame's back rail
  },

  coloredPanel: { bottom: 0.07, top: 0.93 },
  lattice: { height: 0.16, hole: 0.05, bar: 0.02 },   // two rows of square holes
  humanHeight: 1.7,
};

export const totalLength = () => CONFIG.bays.reduce((s, b) => s + b.width, 0);
