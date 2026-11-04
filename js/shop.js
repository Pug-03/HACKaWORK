import * as THREE from 'three';
import { rbox, mergeStatic } from './geom.js';

// Fertilizer shop display stand beside the composter (1 unit = 1 m).
// A standard single-sided pegboard gondola: 1.2 m bay, 6 mm holes on a 25.4 mm grid,
// 40x40 uprights, kick-plate base shelf and a header sign. Empty, flat compost bags hang
// in stacks on 100 mm peg hooks with label-strip holders, like a garden-shop wall.
// BMA bags take the main bay under the "ร้านขายปุ๋ย กทม." header; one other brand
// (a made-up placeholder, not a real company) takes the narrow end bay.
export const SHOP = { width: 1.2, depth: 0.42, height: 1.95 };

const FONT = 'Kanit, Thonburi, sans-serif';

function tex(wPx, hPx, draw, aniso = 8) {
  const c = document.createElement('canvas');
  c.width = wPx; c.height = hPx;
  draw(c.getContext('2d'), wPx, hPx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
function fit(ctx, text, x, y, maxW, size, weight) {
  let px = size;
  do { ctx.font = `${weight} ${Math.round(px)}px ${FONT}`; px *= 0.94; } while (ctx.measureText(text).width > maxW && px > 6);
  ctx.fillText(text, x, y);
}

// BMA bag print (flat empty bag face, header strip excluded)
export function bmaBagTex(kg, wM, hM) {
  const s = 1600;
  return tex(Math.round(wM * s), Math.round(hM * s), (ctx, w, h) => {
    const u = w / 100;
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const band = h * 0.2;
    ctx.fillStyle = '#1f7a3a'; ctx.fillRect(0, 0, w, band);
    ctx.fillStyle = '#fff';
    fit(ctx, 'กทม.', w / 2, band * 0.42, w * 0.8, band * 0.62, 700);
    fit(ctx, 'กรุงเทพมหานคร', w / 2, band * 0.82, w * 0.8, band * 0.2, 500);
    ctx.fillStyle = '#f3c200'; ctx.fillRect(0, band, w, h * 0.012);
    ctx.fillStyle = '#1d2228';
    fit(ctx, 'ปุ๋ยหมักจากเศษอาหาร', w / 2, h * 0.27, w * 0.88, h * 0.06, 600);
    const wy = h * 0.4, wh = h * 0.15;
    ctx.strokeStyle = '#1f7a3a'; ctx.lineWidth = u * 1.2;
    ctx.strokeRect(w * 0.12, wy - wh / 2, w * 0.76, wh);
    ctx.fillStyle = '#1f7a3a';
    fit(ctx, `${kg} kg`, w / 2, wy - wh * 0.06, w * 0.7, wh * 0.72, 700);
    ctx.fillStyle = '#3a434c';
    fit(ctx, `น้ำหนักสุทธิ ${kg} กิโลกรัม`, w / 2, wy + wh / 2 + h * 0.03, w * 0.8, h * 0.035, 500);
    ctx.textAlign = 'left';
    const fx = w * 0.08, fr = w * 0.92;
    ['ร้าน', 'บ้านเลขที่', 'วันที่'].forEach((f, i) => {
      const y = h * 0.58 + i * h * 0.095;
      ctx.fillStyle = '#1d2228';
      ctx.font = `600 ${Math.round(h * 0.036)}px ${FONT}`;
      ctx.fillText(f, fx, y);
      const lx = fx + ctx.measureText(f).width + u * 2;
      ctx.strokeStyle = '#7a838c'; ctx.lineWidth = Math.max(2, u * 0.4);
      ctx.setLineDash([u * 1.2, u * 0.9]);
      ctx.beginPath(); ctx.moveTo(lx, y + h * 0.018); ctx.lineTo(fr, y + h * 0.018); ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1f7a3a'; ctx.fillRect(0, h * 0.9, w, h * 0.1);
    ctx.fillStyle = '#fff';
    fit(ctx, 'ผลิตจากเครื่องหมักปุ๋ย กทม. · สถานีคัดแยกขยะ', w / 2, h * 0.95, w * 0.9, h * 0.032, 500);
  });
}

// Placeholder second brand (fictional): kraft-look bag, earthy colours, different layout
const OTHER = { name: 'ใบทอง', tag: 'ปุ๋ยอินทรีย์ชีวภาพ', en: 'BAITHONG ORGANIC' };
function otherBagTex(kg, wM, hM) {
  const s = 1600;
  return tex(Math.round(wM * s), Math.round(hM * s), (ctx, w, h) => {
    ctx.fillStyle = '#c9a46a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {                 // kraft paper fibres
      ctx.fillStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 30},20,0.08)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * w * 0.06, 1.5);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // leaf emblem
    ctx.fillStyle = '#8a5a12';
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.17, w * 0.13, w * 0.07, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f3e3b8'; ctx.lineWidth = w * 0.008;
    ctx.beginPath(); ctx.moveTo(w * 0.41, h * 0.2); ctx.lineTo(w * 0.59, h * 0.14); ctx.stroke();
    ctx.fillStyle = '#4b2e0c';
    fit(ctx, `ตรา ${OTHER.name}`, w / 2, h * 0.32, w * 0.86, h * 0.09, 700);
    fit(ctx, OTHER.tag, w / 2, h * 0.41, w * 0.86, h * 0.05, 500);
    ctx.fillStyle = '#2f5d2a'; ctx.fillRect(w * 0.1, h * 0.5, w * 0.8, h * 0.17);
    ctx.fillStyle = '#f7efd8';
    fit(ctx, `${kg} kg`, w / 2, h * 0.585, w * 0.7, h * 0.12, 700);
    ctx.fillStyle = '#4b2e0c';
    fit(ctx, OTHER.en, w / 2, h * 0.76, w * 0.86, h * 0.04, 600);
    fit(ctx, 'สำหรับไม้ดอก ไม้ประดับ พืชผัก', w / 2, h * 0.83, w * 0.86, h * 0.035, 400);
  });
}

function signTex(wM, hM, draw) { return tex(Math.round(wM * 1400), Math.round(hM * 1400), draw, 8); }

export function buildShop() {
  const S = SHOP, W = S.width, D = S.depth;
  const group = new THREE.Group();
  group.name = 'shop';

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3b4046, metalness: 0.5, roughness: 0.5 });
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0xe6e7e8, metalness: 0.2, roughness: 0.6 });
  const hookMat = new THREE.MeshStandardMaterial({ color: 0xc7ccd1, metalness: 0.9, roughness: 0.25 });
  const stripMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.5, transparent: true, opacity: 0.85 });
  const filmMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.55 });
  const kraftEdge = new THREE.MeshStandardMaterial({ color: 0xb48c52, roughness: 0.85 });

  // base: kick plate + deck shelf, uprights, back frame
  const baseH = 0.15, boardY0 = 0.2, boardY1 = 1.55, boardZ = -D / 2 + 0.05;
  group.add(rbox(W, 0.1, D - 0.02, frameMat, 0, 0.05, 0, 0.004));                          // kick plate box
  group.add(rbox(W - 0.004, 0.02, D, shelfMat, 0, baseH - 0.01, 0.01, 0.003));              // base deck
  for (const sx of [-1, 1]) {
    group.add(rbox(0.04, S.height, 0.04, frameMat, sx * (W / 2 - 0.02), S.height / 2, boardZ - 0.03, 0.003));   // uprights
    group.add(rbox(0.05, 0.03, D, frameMat, sx * (W / 2 - 0.025), 0.015, 0, 0.003));                        // feet
    for (const z of [-D / 2 + 0.02, D / 2 - 0.02]) {                                                       // levelling glides
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.01, 16), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
      g.position.set(sx * (W / 2 - 0.025), 0.004, z);
      group.add(g);
    }
  }
  // pegboard: 6 mm holes on a 25.4 mm grid (hole pattern drawn into the texture), 4 mm thick
  const pbW = W - 0.08, pbH = boardY1 - boardY0;
  const pegTex = tex(1024, Math.round(1024 * pbH / pbW), (ctx, w, h) => {
    ctx.fillStyle = '#eceeef'; ctx.fillRect(0, 0, w, h);
    const pxm = w / pbW, pitch = 0.0254 * pxm, r = 0.003 * pxm;
    ctx.fillStyle = '#2b2f33';
    for (let y = pitch / 2; y < h; y += pitch) for (let x = pitch / 2; x < w; x += pitch) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  }, 16);
  const peg = new THREE.Mesh(new THREE.BoxGeometry(pbW, pbH, 0.004), [shelfMat, shelfMat, shelfMat, shelfMat, new THREE.MeshStandardMaterial({ map: pegTex, roughness: 0.6 }), shelfMat]);
  peg.position.set(0, (boardY0 + boardY1) / 2, boardZ);
  peg.castShadow = peg.receiveShadow = true;
  group.add(peg);
  group.add(rbox(pbW, 0.03, 0.02, frameMat, 0, boardY0 - 0.015, boardZ, 0.002));
  group.add(rbox(pbW, 0.03, 0.02, frameMat, 0, boardY1 + 0.015, boardZ, 0.002));
  // back cladding above the board up to the header
  group.add(rbox(pbW, S.height - 0.3 - boardY1 - 0.03, 0.01, shelfMat, 0, (boardY1 + 0.03 + S.height - 0.3) / 2, boardZ - 0.004, 0.002));

  // sections: BMA main bay (left 0.82 m) and the other brand's end bay (right 0.3 m)
  const divX = W / 2 - 0.04 - 0.3;
  group.add(rbox(0.012, pbH, 0.06, new THREE.MeshStandardMaterial({ color: 0x1f7a3a, roughness: 0.5 }), divX, (boardY0 + boardY1) / 2, boardZ + 0.03, 0.002));

  // header signs
  const headY = S.height - 0.15, headZ = boardZ + 0.02;
  const bmaW = divX + W / 2 - 0.02, bmaCx = (-W / 2 + 0.02 + divX) / 2;
  const bmaSign = signTex(bmaW, 0.28, (ctx, w, h) => {
    ctx.fillStyle = '#1f7a3a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f3c200'; ctx.fillRect(0, h * 0.86, w, h * 0.06);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    fit(ctx, 'ร้านขายปุ๋ย กทม.', w / 2, h * 0.38, w * 0.9, h * 0.5, 700);
    fit(ctx, 'ปุ๋ยหมักจากเศษอาหาร · ผลิตที่สถานีนี้', w / 2, h * 0.72, w * 0.9, h * 0.15, 500);
  });
  const bs = new THREE.Mesh(new THREE.BoxGeometry(bmaW, 0.28, 0.02), [frameMat, frameMat, frameMat, frameMat, new THREE.MeshStandardMaterial({ map: bmaSign, roughness: 0.5 }), frameMat]);
  bs.position.set(bmaCx, headY, headZ);
  group.add(bs);
  const oW = W / 2 - 0.02 - divX;
  const otherSign = signTex(oW, 0.2, (ctx, w, h) => {
    ctx.fillStyle = '#6b4415'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f7e9c4';
    fit(ctx, `ตรา ${OTHER.name}`, w / 2, h * 0.4, w * 0.88, h * 0.42, 700);
    fit(ctx, OTHER.tag, w / 2, h * 0.76, w * 0.88, h * 0.18, 400);
  });
  const os = new THREE.Mesh(new THREE.BoxGeometry(oW, 0.2, 0.02), [frameMat, frameMat, frameMat, frameMat, new THREE.MeshStandardMaterial({ map: otherSign, roughness: 0.6 }), frameMat]);
  os.position.set((divX + W / 2 - 0.02) / 2, headY + 0.04, headZ);
  group.add(os);

  // peg hook with label-strip holder; a stack of flat empty bags threaded on it by the header slot
  const hookLen = 0.1;                       // short 100 mm hooks: the stack is only ~5 cm deep, nothing sticks out into the walkway
  const hookGeo = new THREE.CylinderGeometry(0.003, 0.003, hookLen, 8).rotateX(Math.PI / 2);
  const tipGeo = new THREE.SphereGeometry(0.0045, 10, 8);
  const bagCache = new Map();
  function bagKind(brand, kg, w, h) {
    const key = `${brand}|${kg}`;
    if (bagCache.has(key)) return bagCache.get(key);
    const faceH = h - 0.035;
    const faceTex = brand === 'bma' ? bmaBagTex(kg, w, faceH) : otherBagTex(kg, w, faceH);
    const face = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.55 });
    const edge = brand === 'bma' ? filmMat : kraftEdge;
    // flat empty bag: 0.8 mm laminated film body with the print on the front, sealed header strip with euro slot
    const body = new THREE.BoxGeometry(w, faceH, 0.0008);
    const header = new THREE.Shape();
    header.moveTo(-w / 2, 0); header.lineTo(w / 2, 0); header.lineTo(w / 2, 0.035); header.lineTo(-w / 2, 0.035); header.closePath();
    const slot = new THREE.Path();
    slot.absellipse(0, 0.0175, 0.013, 0.0055, 0, Math.PI * 2, true);
    header.holes.push(slot);
    const headerGeo = new THREE.ExtrudeGeometry(header, { depth: 0.0012, bevelEnabled: false, curveSegments: 12 });
    headerGeo.translate(0, -0.0175, -0.0006);       // slot centre at the origin
    const facePlane = new THREE.PlaneGeometry(w, faceH);
    const k = { body, headerGeo, face, facePlane, edge, faceH };
    bagCache.set(key, k);
    return k;
  }
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  function hookWithBags(x, y, brand, kg, w, h, count, label) {
    const z0 = boardZ + 0.002;
    // back plate that hooks into two pegboard holes + the wire arm
    group.add(rbox(0.02, 0.05, 0.006, hookMat, x, y + 0.012, z0 + 0.003, 0.001));
    const arm = new THREE.Mesh(hookGeo, hookMat);
    arm.position.set(x, y, z0 + hookLen / 2);
    arm.rotation.x = -0.05;                          // slight upward rise toward the tip
    group.add(arm);
    const tip = new THREE.Mesh(tipGeo, hookMat);
    tip.position.set(x, y + hookLen * 0.05, z0 + hookLen);
    group.add(tip);
    // scan-label holder at the hook tip
    const lblTex = signTex(0.07, 0.035, (ctx, cw, ch) => {
      ctx.fillStyle = brand === 'bma' ? '#ffffff' : '#fff6e0'; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = brand === 'bma' ? '#1f7a3a' : '#6b4415'; ctx.fillRect(0, 0, cw, ch * 0.3);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; fit(ctx, brand === 'bma' ? 'กทม.' : `ตรา ${OTHER.name}`, cw / 2, ch * 0.16, cw * 0.9, ch * 0.24, 600);
      ctx.fillStyle = '#1d2228'; fit(ctx, label, cw / 2, ch * 0.63, cw * 0.9, ch * 0.42, 700);
    });
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.035), new THREE.MeshStandardMaterial({ map: lblTex, roughness: 0.4 }));
    lbl.position.set(x, y + hookLen * 0.05 + 0.026, z0 + hookLen + 0.004);
    group.add(lbl);
    group.add(rbox(0.074, 0.039, 0.003, stripMat, x, y + hookLen * 0.05 + 0.026, z0 + hookLen + 0.001, 0.001));
    // the stack: bags pressed together from the board out, each hanging a hair differently
    const k = bagKind(brand, kg, w, h);
    for (let i = 0; i < count; i++) {
      const bz = z0 + 0.02 + i * 0.0022;
      const bag = new THREE.Group();
      bag.position.set(x, y + (bz - z0) * 0.05, bz);
      bag.rotation.z = (rnd() - 0.5) * 0.03;
      bag.rotation.x = 0.012 + rnd() * 0.01;          // hangs a touch off vertical away from the board
      const hd = new THREE.Mesh(k.headerGeo, k.edge);
      const bd = new THREE.Mesh(k.body, k.edge);
      bd.position.y = -0.0175 - k.faceH / 2;
      const fc = new THREE.Mesh(k.facePlane, k.face);   // printed front (a plane keeps it mergeable)
      fc.position.set(0, bd.position.y, 0.00045);
      bag.add(hd, bd, fc);
      group.add(bag);
    }
  }
  // main bay (BMA): top row 1 kg, 1 kg, 5 kg; bottom row 10 kg x2 — real empty-bag sizes
  const L0 = -W / 2 + 0.04;
  const top = boardY1 - 0.06, bottom = boardY1 - 0.64;
  const SIZES = { 1: [0.2, 0.3], 5: [0.3, 0.45], 10: [0.38, 0.58] };
  [[1, L0 + 0.13], [1, L0 + 0.36], [5, L0 + 0.64]].forEach(([kg, x]) => hookWithBags(x, top, 'bma', kg, ...SIZES[kg], 14, `ถุง ${kg} กก.`));
  [[10, L0 + 0.21], [10, L0 + 0.6]].forEach(([kg, x]) => hookWithBags(x, bottom, 'bma', kg, ...SIZES[kg], 12, `ถุง ${kg} กก.`));
  // end bay (other brand): 5 kg on top, 10 kg below
  const ox = (divX + W / 2 - 0.04) / 2;
  hookWithBags(ox, top, 'other', 5, 0.26, 0.42, 10, 'ถุง 5 กก.');
  hookWithBags(ox, bottom, 'other', 10, 0.28, 0.52, 9, 'ถุง 10 กก.');

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.part ??= 'shop'; } });
  mergeStatic(group);
  return { group };
}
