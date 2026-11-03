import * as THREE from 'three';
import { CONFIG, totalLength } from './config.js';
import { createWheelieBin } from './wheelieBin.js';
import { rbox, roundedBoxGeometry } from './geom.js';
import { makeBinPanelTexture, makeBagPanelTexture, makeBrushedTexture, makeNoiseTexture } from './textures.js';

const F = CONFIG.frame;

// square steel tube / folded sheet: rounded edges catch highlights like real metal
const box = (w, h, d, mat, x, y, z) => rbox(w, h, d, mat, x, y, z, 0.004);

// Steel sheet with a grid of square holes, lying in the XY plane, origin bottom-left.
function latticeGeometry(w, h, thick) {
  const { hole, bar } = CONFIG.lattice;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(w, 0); shape.lineTo(w, h); shape.lineTo(0, h); shape.closePath();
  const cols = Math.floor((w - bar) / (hole + bar));
  const rows = Math.floor((h - bar) / (hole + bar));
  const padX = (w - (cols * (hole + bar) - bar)) / 2;
  const padY = (h - (rows * (hole + bar) - bar)) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * (hole + bar), y = padY + r * (hole + bar);
      const p = new THREE.Path();
      p.moveTo(x, y); p.lineTo(x, y + hole); p.lineTo(x + hole, y + hole); p.lineTo(x + hole, y); p.closePath();
      shape.holes.push(p);
    }
  }
  return new THREE.ExtrudeGeometry(shape, { depth: thick - 0.002, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1 });
}

/* ---------------- black bag pile for the open bay ---------------- */
function createBagPile(w, d) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x121315, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.35 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.8 });
  const rnd = mulberry(7);
  // keep every bag inside the bay: max horizontal extent = 0.2 * 1.25 = 0.25 m
  const limX = w / 2 - 0.27, limZ = d / 2 - 0.29;
  for (let i = 0; i < 16; i++) {
    const r = 0.14 + rnd() * 0.06;
    const m = new THREE.Mesh(wrinkledBag(r, rnd), i % 5 === 4 ? white : mat);
    m.scale.set(1 + rnd() * 0.25, 0.75 + rnd() * 0.3, 1 + rnd() * 0.2);
    const layer = Math.floor(i / 6);
    m.position.set((rnd() * 2 - 1) * limX, 0.008 + r * 0.6 * m.scale.y + layer * 0.24 + rnd() * 0.04, (rnd() * 2 - 1) * limZ);
    m.rotation.set((rnd() - 0.5) * 0.3, rnd() * 6, (rnd() - 0.5) * 0.3);
    m.castShadow = true;
    g.add(m);
    if (i % 5 !== 4) {
      const knot = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 8), mat);
      knot.position.set(m.position.x, m.position.y + r * m.scale.y + 0.03, m.position.z);
      g.add(knot);
    }
  }
  return g;
}

// plastic bag: sphere with soft folds, flattened bottom where it rests
function wrinkledBag(r, rnd) {
  const geo = new THREE.SphereGeometry(r, 36, 28);
  const p = geo.attributes.position, v = new THREE.Vector3();
  const f = [3 + rnd() * 4, 5 + rnd() * 5, 9 + rnd() * 6], ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = 0.06 * Math.sin(f[0] * v.x + ph[0]) * Math.sin(f[0] * v.z + ph[1])
            + 0.035 * Math.sin(f[1] * (v.x + v.y) + ph[2])
            + 0.02 * Math.sin(f[2] * (v.z - v.y) + ph[0]);
    v.multiplyScalar(r * (1 + n));
    if (v.y < -r * 0.6) v.y = -r * 0.6 - (v.y + r * 0.6) * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------------- full station ---------------- */
export function buildStation(renderer) {
  const group = new THREE.Group();
  const L = totalLength();
  const H = F.height, D = F.depth, P = F.post, S = F.sheet;
  const brushed = makeBrushedTexture(renderer);
  const powder = makeNoiseTexture(renderer, 256, 0.6, 0.18);
  const steel = new THREE.MeshStandardMaterial({ color: F.steel, metalness: 0.75, roughness: 0.45, roughnessMap: brushed });
  const gray = new THREE.MeshStandardMaterial({ color: F.grayPanel, metalness: 0.3, roughness: 0.65, roughnessMap: powder });
  const grayInner = new THREE.MeshStandardMaterial({ color: 0x5c6166, metalness: 0.3, roughness: 0.7, side: THREE.DoubleSide });

  const zf = D / 2, zb = -D / 2;
  const bins = [];
  let bagPile = null;

  // boundaries along X
  const xs = [-L / 2];
  CONFIG.bays.forEach((b) => xs.push(xs[xs.length - 1] + b.width));

  // posts, feet
  xs.forEach((x, i) => {
    const px = x + (i === 0 ? P / 2 : i === xs.length - 1 ? -P / 2 : 0);
    for (const z of [zf - P / 2, zb + P / 2]) {
      group.add(box(P, H - 0.003, P, steel, px, (H - 0.003) / 2, z));
    }
  });

  // rails
  const R = P - 0.004; // rail section, slightly inside the posts
  group.add(box(L - 0.004, 0.05, R, steel, 0, H - 0.025, zf - P / 2));            // front top
  group.add(box(L - 0.004, 0.05, R, steel, 0, H - 0.025, zb + P / 2));            // back top
  group.add(box(L - 0.004, 0.04, R, steel, 0, F.footHeight + 0.02, zf - P / 2));  // front bottom
  group.add(box(L - 0.004, 0.04, R, steel, 0, F.footHeight + 0.02, zb + P / 2));  // back bottom
  for (const x of [xs[0] + P / 2, xs[xs.length - 1] - P / 2]) {
    group.add(box(R, 0.048, D - 2 * P, steel, x, H - 0.026, 0));
    group.add(box(R, 0.038, D - 2 * P, steel, x, F.footHeight + 0.02, 0));
  }

  // base plate
  group.add(box(L - 0.01, 0.008, D - 0.01, grayInner, 0, F.footHeight + 0.004, 0));

  // back panel (full)
  group.add(box(L, H - F.footHeight - 0.002, S, gray, 0, F.footHeight + (H - F.footHeight - 0.002) / 2, zb + 0.001));

  // left end panel (full)
  group.add(box(S, H - F.footHeight - 0.002, D, gray, xs[0] - 0.001, F.footHeight + (H - F.footHeight - 0.002) / 2, 0));

  // dividers between bays
  for (let i = 1; i < xs.length - 1; i++) {
    group.add(box(S, H - F.footHeight - 0.05, D - 2 * P, gray, xs[i], F.footHeight + (H - F.footHeight - 0.05) / 2, 0));
    group.add(box(R, 0.048, D - 2 * P, steel, xs[i], H - 0.026, 0)); // top cross rail
  }

  const latH = CONFIG.lattice.height;
  const solidTop = H - 0.03 - latH;

  CONFIG.bays.forEach((bay, i) => {
    const x0 = xs[i], x1 = xs[i + 1], cx = (x0 + x1) / 2;
    const inner = bay.width - P;

    if (bay.type === 'bin') {
      const { bottom } = CONFIG.coloredPanel;
      const top = H - 0.05;                  // flush under the top rail, no gap
      const ph = top - bottom;
      const tex = makeBinPanelTexture(bay, inner, ph, renderer);
      const faceMat = new THREE.MeshStandardMaterial({ map: tex.map, alphaMap: tex.alpha, alphaTest: 0.5, metalness: 0.2, roughness: 0.5 });
      const edge = new THREE.MeshStandardMaterial({ color: bay.panel, metalness: 0.2, roughness: 0.5 });
      const panel = new THREE.Mesh(roundedBoxGeometry(inner, ph, S, 0.003), [edge, edge, edge, edge, faceMat, edge]);
      panel.position.set(cx, bottom + ph / 2, zf + S / 2);
      panel.castShadow = panel.receiveShadow = true;
      panel.userData.bayId = bay.id;
      group.add(panel);

      const bin = createWheelieBin(bay.bin);
      bin.position.set(cx, F.footHeight + 0.008, 0.015);
      bin.userData.bayId = bay.id;
      group.add(bin);
      bins.push(bin);
    } else {
      // open bay: solid lower panel with sign + lattice band on the front
      const ph = solidTop - CONFIG.coloredPanel.bottom;
      const tex = makeBagPanelTexture(bay, inner, ph, renderer);
      const faceMat = new THREE.MeshStandardMaterial({ map: tex.map, alphaMap: tex.alpha, alphaTest: 0.5, metalness: 0.35, roughness: 0.55 });
      const panel = new THREE.Mesh(roundedBoxGeometry(inner, ph, S, 0.003), [gray, gray, gray, gray, faceMat, gray]);
      panel.position.set(cx, CONFIG.coloredPanel.bottom + ph / 2, zf + S / 2);
      panel.castShadow = panel.receiveShadow = true;
      panel.userData.bayId = bay.id;
      group.add(panel);

      const latFront = new THREE.Mesh(latticeGeometry(inner, latH, S), gray);
      latFront.userData.part = 'lattice';
      latFront.position.set(x0 + P / 2, solidTop, zf);
      latFront.castShadow = true;
      group.add(latFront);

      // right end: solid sheet to the top (as in the site photo)
      group.add(box(S, H - F.footHeight - 0.002, D, gray, x1 + 0.001, F.footHeight + (H - F.footHeight - 0.002) / 2, 0));

      bagPile = createBagPile(inner, D);
      bagPile.position.set(cx, F.footHeight, 0);
      group.add(bagPile);
    }
  });

  // hover names for everything that isn't a bin or a sign panel
  bagPile?.traverse((o) => { if (o.isMesh) o.userData.part = 'bags'; });
  group.traverse((o) => {
    if (!o.isMesh || o.userData.part || o.userData.bayId) return;
    for (let p = o.parent; p; p = p.parent) if (bins.includes(p)) return;   // bin parts keep their own handling
    o.userData.part = 'frame';
  });

  return { group, bins, bagPile, length: L, xs };
}
