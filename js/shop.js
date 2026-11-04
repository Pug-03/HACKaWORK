import * as THREE from 'three';
import { rbox, mergeStatic } from './geom.js';

// Fertilizer shop beside the composter (1 unit = 1 m): a small square timber hut
// (2.2 x 2.2 m) on concrete footings with a raised plank floor, weatherboard walls on three sides,
// an open front with a serving counter + walk-in doorway and a thatched pyramid roof with 0.35 m eaves.
// Inside, full bags of finished compost: 10 kg and 5 kg sacks stacked flat on timber pallets, 1 kg
// bags standing on wall shelves, a few on the counter by the scale. One other brand (a made-up
// placeholder, not a real company) sits on the bottom shelf. Local +Z = shop front.
export const SHOP = { width: 2.2, depth: 2.2, height: 3.15 };

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

// horizontal planks: 1 x 1 m tile, 150 mm boards with a dark shadow gap, grain streaks; repeat = metres
function plankTex(base, dark, boardM = 0.15) {
  const t = tex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const bh = boardM * h;
    let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < h; y += bh) {
      ctx.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.08})`; ctx.fillRect(0, y, w, bh);   // board-to-board tone
      for (let i = 0; i < 26; i++) {                                                   // grain
        ctx.fillStyle = `rgba(60,35,15,${0.05 + r() * 0.08})`;
        ctx.fillRect(r() * w, y + r() * bh, 40 + r() * 160, 1 + r() * 2);
      }
      ctx.fillStyle = dark; ctx.fillRect(0, y, w, Math.max(3, bh * 0.05));           // gap between boards
    }
  }, 8);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function thatchTex() {
  const t = tex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#9c7a40'; ctx.fillRect(0, 0, w, h);
    let sd = 3; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const rows = 8, rh = h / rows;
    for (let k = 0; k < rows; k++) {                  // layered courses of straw, each overlapping the one below
      const y0 = k * rh;
      for (let i = 0; i < 700; i++) {
        const x = r() * w, y = y0 + r() * rh * 0.9, l = rh * (0.5 + r() * 0.6);
        const c = 120 + r() * 70;
        ctx.strokeStyle = `rgba(${c},${c * 0.8},${c * 0.42},0.55)`; ctx.lineWidth = 1 + r() * 1.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 6, y + l); ctx.stroke();
      }
      const g = ctx.createLinearGradient(0, y0 + rh * 0.75, 0, y0 + rh);
      g.addColorStop(0, 'rgba(40,25,8,0)'); g.addColorStop(1, 'rgba(40,25,8,0.45)');
      ctx.fillStyle = g; ctx.fillRect(0, y0, w, rh);
    }
  }, 8);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// a FULL bag: box with the faces bulged out like a filled pillow sack, sealed (flat) at the top and bottom
function fullBagGeo(w, h, t) {
  const g = new THREE.BoxGeometry(w, h, t, 10, 12, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2), z = p.getZ(i);
    const fx = 1 - Math.pow(Math.abs(x), 3), fy = 1 - Math.pow(Math.abs(y), 4);
    const bulge = Math.max(0, fx) * Math.max(0, fy);            // 0 at the seams, 1 in the middle
    p.setZ(i, Math.sign(z) * (t * 0.12 + t * 0.38 * Math.sqrt(bulge)));
    p.setX(i, p.getX(i) * (1 - 0.06 * Math.max(0, fy) * (1 - Math.abs(y) * 0.2)));   // sides pulled in by the fill
  }
  g.computeVertexNormals();
  return g;
}

export function buildShop() {
  const S = SHOP, W = S.width, D = S.depth;
  const group = new THREE.Group();
  group.name = 'shop';

  /* ---------- materials ---------- */
  const conc = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.9 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.75 });
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x5c3a20, roughness: 0.75 });
  const plankMat = (rx, ry, base = '#a87645', dark = '#4a2d16', rot = 0) => {
    const t = plankTex(base, dark); t.repeat.set(rx, ry); t.rotation = rot;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  };
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x9a6b3c, roughness: 0.75 });
  const palletMat = new THREE.MeshStandardMaterial({ color: 0xc9a46e, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc7ccd1, metalness: 0.85, roughness: 0.3 });

  /* ---------- footings + raised plank floor ---------- */
  const FY = 0.2;                                     // floor top
  for (const x of [-1, 0, 1]) for (const z of [-1, 0, 1])
    group.add(rbox(0.2, 0.12, 0.2, conc, x * (W / 2 - 0.1), 0.06, z * (D / 2 - 0.1), 0.01));
  for (const z of [-1, 0, 1]) group.add(rbox(W, 0.05, 0.08, beamMat, 0, 0.145, z * (D / 2 - 0.1), 0.004));   // bearers
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.03, D), [beamMat, beamMat, plankMat(D, 1, '#b07d4a', '#4a2d16', Math.PI / 2), beamMat, beamMat, beamMat]);
  floor.position.y = FY - 0.015;
  group.add(floor);
  // front step at the doorway (rise 100 mm + 100 mm)
  const doorX0 = 0.32, doorX1 = W / 2 - 0.06;         // walk-in doorway at the right of the front
  group.add(rbox(doorX1 - doorX0 + 0.1, 0.1, 0.3, beamMat, (doorX0 + doorX1) / 2, 0.05, D / 2 + 0.15, 0.004));

  /* ---------- frame: 100 x 100 posts, wall plates ---------- */
  const WH = 2.25;                                    // top of the wall plate
  const postH = WH - FY;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    group.add(rbox(0.1, postH, 0.1, postMat, x * (W / 2 - 0.05), FY + postH / 2, z * (D / 2 - 0.05), 0.006));
  group.add(rbox(0.09, postH, 0.09, postMat, doorX0 - 0.045, FY + postH / 2, D / 2 - 0.05, 0.006));   // counter / door post
  for (const z of [-1, 1]) group.add(rbox(W, 0.1, 0.1, beamMat, 0, WH - 0.05, z * (D / 2 - 0.05), 0.006));
  for (const x of [-1, 1]) group.add(rbox(0.1, 0.1, D - 0.2, beamMat, x * (W / 2 - 0.05), WH - 0.05, 0, 0.006));

  /* ---------- weatherboard walls: back + both sides (20 mm boards between the posts) ---------- */
  const wallH = WH - 0.1 - FY, wallY = FY + wallH / 2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, wallH, 0.02), plankMat(W - 0.2, wallH));
  back.position.set(0, wallY, -D / 2 + 0.05);
  group.add(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.02, wallH, D - 0.2), plankMat(D - 0.2, wallH));
    side.position.set(sx * (W / 2 - 0.05), wallY, 0);
    group.add(side);
  }
  // front: short wall under the counter (left), open above it; doorway on the right
  const ctrX0 = -W / 2 + 0.1, ctrX1 = doorX0 - 0.09, ctrW = ctrX1 - ctrX0, ctrCx = (ctrX0 + ctrX1) / 2, ctrTop = 0.95;
  const under = new THREE.Mesh(new THREE.BoxGeometry(ctrW, ctrTop - FY - 0.04, 0.02), plankMat(ctrW, ctrTop - FY));
  under.position.set(ctrCx, (FY + ctrTop - 0.04) / 2, D / 2 - 0.05);
  group.add(under);
  group.add(rbox(ctrW + 0.12, 0.04, 0.5, shelfMat, ctrCx, ctrTop - 0.02, D / 2 - 0.2, 0.006));        // counter top, 0.15 m overhang out front
  for (const x of [ctrX0 + 0.05, ctrX1 - 0.05]) group.add(rbox(0.05, ctrTop - 0.04 - FY, 0.05, postMat, x, (FY + ctrTop - 0.04) / 2, D / 2 - 0.42, 0.004));   // inner counter legs
  group.add(rbox(ctrW, 0.02, 0.4, shelfMat, ctrCx, 0.5, D / 2 - 0.25, 0.004));                     // shelf under the counter
  group.add(rbox(doorX1 - doorX0 + 0.1, 0.03, 0.12, beamMat, (doorX0 + doorX1) / 2, FY + 0.015, D / 2 - 0.05, 0.004));   // door threshold

  /* ---------- thatched pyramid roof (square hip roof), 0.35 m eaves, timber fascia ---------- */
  const eave = 0.35, rise = 0.95, thick = 0.12;
  const half = W / 2 + eave, rad = half * Math.SQRT2;
  const pyr = (r, hgt, mat) => {
    const g = new THREE.ConeGeometry(r, hgt, 4, 1, true).rotateY(Math.PI / 4).toNonIndexed();
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  };
  const tt = thatchTex(); tt.repeat.set(6, 3);
  const roof = pyr(rad, rise, new THREE.MeshStandardMaterial({ map: tt, roughness: 0.95, side: THREE.DoubleSide }));
  roof.position.y = WH + thick + rise / 2;
  group.add(roof);
  const ut = plankTex('#c8a26a', '#6b4a24', 0.1); ut.repeat.set(5, 5);   // woven bamboo soffit seen from inside
  const sRad = (half - 0.02) * Math.SQRT2, sRise = rise * sRad / rad;   // soffit meets the fascia's inner face, same pitch
  const soffit = pyr(sRad, sRise, new THREE.MeshStandardMaterial({ map: ut, roughness: 0.9, side: THREE.DoubleSide }));
  soffit.position.y = WH + sRise / 2;
  group.add(soffit);
  // fascia band closing the gap between thatch and soffit at the eave
  for (const r of [0, 1, 2, 3]) {
    const b = rbox(2 * half + 0.02 - (r % 2) * 0.004, thick + 0.01 + (r % 2) * 0.003, 0.03, beamMat, 0, WH + thick / 2, half - 0.005, 0.004);   // alternate sizes: no coplanar corner overlaps
    const piv = new THREE.Group(); piv.rotation.y = r * Math.PI / 2; piv.add(b); group.add(piv);
  }
  // hip rafters under the roof (visible from inside) and a finial at the apex
  for (const r of [0, 1, 2, 3]) {
    const len = Math.hypot(rad - 0.15, rise);
    const raf = rbox(0.06, 0.08, len, beamMat, 0, 0, 0, 0.004);
    const piv = new THREE.Group();
    piv.rotation.y = Math.PI / 4 + r * Math.PI / 2;
    raf.rotation.x = Math.atan2(rise, rad - 0.15);
    raf.position.set(0, WH + rise / 2 - 0.04, (rad - 0.15) / 2);
    piv.add(raf); group.add(piv);
  }
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4).rotateY(Math.PI / 4), beamMat);
  fin.position.y = WH + thick + rise + 0.05;
  group.add(fin);

  /* ---------- signs: front fascia board + price board inside ---------- */
  const signW = 1.9, signH = 0.32;
  const sign = signTex(signW, signH, (ctx, w, h) => {
    ctx.fillStyle = '#1f7a3a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f3c200'; ctx.fillRect(0, h * 0.86, w, h * 0.07);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    fit(ctx, 'ร้านขายปุ๋ย กทม.', w / 2, h * 0.38, w * 0.9, h * 0.5, 700);
    fit(ctx, 'ปุ๋ยหมักจากเศษอาหาร · ผลิตที่สถานีนี้', w / 2, h * 0.72, w * 0.9, h * 0.15, 500);
  });
  const sMat = new THREE.MeshStandardMaterial({ map: sign, roughness: 0.5 });
  const sb = new THREE.Mesh(new THREE.BoxGeometry(signW, signH, 0.025), [beamMat, beamMat, beamMat, beamMat, sMat, beamMat]);
  sb.position.set(0, WH - 0.12, D / 2 + 0.0125);       // hung on the front plate, just under the eave
  group.add(sb);
  const price = signTex(0.9, 0.5, (ctx, w, h) => {
    ctx.fillStyle = '#1d2a22'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#a87645'; ctx.lineWidth = w * 0.02; ctx.strokeRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f3c200';
    fit(ctx, 'ราคาปุ๋ยหมัก กทม.', w / 2, h * 0.16, w * 0.8, h * 0.14, 700);
    ctx.fillStyle = '#f2f4f2';
    [['ถุง 1 กก.', '20 บาท'], ['ถุง 5 กก.', '80 บาท'], ['ถุง 10 กก.', '150 บาท']].forEach(([a, b], i) => {
      const y = h * (0.38 + i * 0.17);
      ctx.textAlign = 'left'; fit(ctx, a, w * 0.12, y, w * 0.4, h * 0.11, 600);
      ctx.textAlign = 'right'; fit(ctx, b, w * 0.88, y, w * 0.4, h * 0.11, 700);
    });
    ctx.textAlign = 'center'; ctx.fillStyle = '#9fb3a6';
    fit(ctx, 'ราคาตัวอย่าง · จ่ายเงินสด หรือ สแกนพร้อมเพย์', w / 2, h * 0.9, w * 0.86, h * 0.07, 400);
  });
  const pb = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshStandardMaterial({ map: price, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  pb.position.set(0.15, 1.75, -D / 2 + 0.062);         // on the back wall above the pallets
  group.add(pb);

  /* ---------- full bags ---------- */
  const SIZES = { 1: [0.2, 0.3, 0.06], 5: [0.3, 0.45, 0.1], 10: [0.38, 0.58, 0.12] };
  const kinds = new Map();
  const film = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.55 });
  const kraft = new THREE.MeshStandardMaterial({ color: 0xb48c52, roughness: 0.85 });
  function kind(brand, kg) {
    const key = `${brand}${kg}`;
    if (kinds.has(key)) return kinds.get(key);
    const [w, h, t] = brand === 'bma' ? SIZES[kg] : [0.28, 0.46, 0.1];
    const face = new THREE.MeshStandardMaterial({ map: brand === 'bma' ? bmaBagTex(kg, w, h) : otherBagTex(kg, w, h), roughness: 0.55 });
    const edge = brand === 'bma' ? film : kraft;
    const k = { geo: fullBagGeo(w, h, t), mats: [edge, edge, edge, edge, face, edge], w, h, t };
    kinds.set(key, k);
    return k;
  }
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bag = (k, x, y, z, rx, ry, rz = 0) => {
    const m = new THREE.Mesh(k.geo, k.mats);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz, 'YXZ');
    group.add(m); return m;
  };
  // timber pallet (1.0 x 0.8 m, 0.12 m high): deck boards on three bearer blocks
  function pallet(cx, cz, pw = 0.8, pd = 0.8) {
    const ph = 0.12;
    for (const bx of [-1, 0, 1]) group.add(rbox(0.1, ph - 0.04, pd, palletMat, cx + bx * (pw / 2 - 0.05), FY + (ph - 0.04) / 2, cz, 0.003));
    for (let i = 0; i < 7; i++) group.add(rbox(pw, 0.02, 0.09, palletMat, cx, FY + ph - 0.03, cz - pd / 2 + 0.045 + i * (pd - 0.09) / 6, 0.002));
    for (let i = 0; i < 3; i++) group.add(rbox(pw, 0.02, 0.1, palletMat, cx, FY + ph - 0.01, cz - pd / 2 + 0.05 + i * (pd - 0.1) / 2, 0.002));
    return FY + ph;
  }
  // stack of bags lying flat, print up, 2 across; every layer laid a little differently like a hand-built pile
  function flatStack(kg, cx, cz, layers, across) {
    const top = pallet(cx, cz);
    const k = kind('bma', kg);
    for (let L = 0; L < layers; L++) {
      const y = top + k.t * 0.5 + L * (k.t * 0.92);        // filled bags settle into each other a little
      for (let i = 0; i < across; i++) {
        const x = cx + (i - (across - 1) / 2) * (k.w + 0.012) + (rnd() - 0.5) * 0.01;
        bag(k, x, y, cz + (rnd() - 0.5) * 0.02, -Math.PI / 2, (rnd() - 0.5) * 0.05, 0);
      }
    }
  }
  const backZ = -D / 2 + 0.06 + 0.42;
  flatStack(10, -0.5, backZ, 6, 2);                     // 12 x 10 kg
  flatStack(5, 0.5, backZ, 8, 2);                        // 16 x 5 kg

  // left wall shelves: 1 kg bags standing in rows, face out (+X); bottom shelf: other brand lying flat
  const shX = -W / 2 + 0.06 + 0.17, shZ0 = 0, shLen = 0.8;   // between the pallets (back) and the counter (front)
  for (const y of [0.42, 0.88, 1.32]) {
    group.add(rbox(0.34, 0.025, shLen, shelfMat, shX, y, shZ0 + shLen / 2 - 0.2, 0.003));
    for (const z of [shZ0 - 0.15, shZ0 + shLen - 0.25]) group.add(rbox(0.3, 0.04, 0.03, beamMat, shX - 0.02, y - 0.035, z, 0.003));   // brackets
  }
  const k1 = kind('bma', 1);
  for (const y of [0.88, 1.32]) for (let i = 0; i < 4; i++)
    bag(k1, shX, y + 0.0125 + k1.h / 2, shZ0 - 0.1 + i * 0.2, 0, Math.PI / 2 + (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.02);
  const ko = kind('other', 5);
  for (let L = 0; L < 3; L++)
    bag(ko, shX + (rnd() - 0.5) * 0.01, 0.42 + 0.0125 + ko.t * 0.5 + L * ko.t * 0.92, shZ0 + 0.2, -Math.PI / 2, (rnd() - 0.5) * 0.04);

  // counter: digital platform scale, a row of 1 kg bags, a few 5 kg bags on the shelf below
  group.add(rbox(0.3, 0.05, 0.3, metal, ctrCx - 0.35, ctrTop + 0.025, D / 2 - 0.25, 0.006));
  const scaleLcd = signTex(0.12, 0.04, (ctx, w, h) => { ctx.fillStyle = '#0b1a10'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#4ade80'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fit(ctx, '5.00 kg', w / 2, h / 2, w * 0.86, h * 0.7, 700); });
  const sl = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.04), new THREE.MeshBasicMaterial({ map: scaleLcd, toneMapped: false }));
  sl.position.set(ctrCx - 0.35, ctrTop + 0.025, D / 2 - 0.25 + 0.151);
  group.add(sl);
  const k5 = kind('bma', 5);
  bag(k5, ctrCx - 0.35, ctrTop + 0.05 + k5.t * 0.5, D / 2 - 0.25, -Math.PI / 2, 0.08);   // one on the scale
  for (let i = 0; i < 3; i++) bag(k1, ctrCx + 0.02 + i * 0.22, ctrTop + k1.h / 2, D / 2 - 0.3, 0, (rnd() - 0.5) * 0.06, 0);
  for (let i = 0; i < 2; i++) bag(k5, ctrCx - 0.2 + i * 0.36, 0.51 + k5.t * 0.5, D / 2 - 0.3, -Math.PI / 2, (rnd() - 0.5) * 0.04);

  // warm bulb under the roof (emissive only; no extra light, the scene lighting stays fixed)
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x111111 })).translateY(WH + 0.35));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffd27a, emissiveIntensity: 1.2 }));
  bulb.position.y = WH + 0.08;
  group.add(bulb);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.part ??= 'shop'; } });
  mergeStatic(group);
  return { group };
}
