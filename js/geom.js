import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map();

// Box with rounded edges. Radius is clamped so thin sheets still work.
// RoundedBoxGeometry keeps BoxGeometry's 6 material groups, so material arrays still apply.
export function roundedBoxGeometry(w, h, d, radius = 0.004) {
  const r = Math.max(0.0005, Math.min(radius, Math.min(w, h, d) / 2 - 0.0002));
  const key = [w, h, d, r].map((n) => n.toFixed(5)).join('|');
  // tiny parts: a plain box is indistinguishable; small radii: 1 segment; larger: 2 (was 3 everywhere, ~590 tris/box)
  if (!cache.has(key)) {
    const big = Math.max(w, h, d);
    cache.set(key, r < 0.0015 || big < 0.02 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, r < 0.004 ? 1 : 2, r));
  }
  return cache.get(key);
}

export function rbox(w, h, d, mat, x, y, z, radius) {
  const m = new THREE.Mesh(roundedBoxGeometry(w, h, d, radius), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Smooth shading across curves, hard edges kept above the crease angle.
export function smooth(geo, creaseDeg = 35) {
  return toCreasedNormals(geo, THREE.MathUtils.degToRad(creaseDeg));
}

// Rounded-rectangle outline (centre at origin) as a Shape or Path.
export function roundedRect(target, w, d, r) {
  const x = w / 2, z = d / 2;
  target.moveTo(-x + r, -z);
  target.lineTo(x - r, -z); target.quadraticCurveTo(x, -z, x, -z + r);
  target.lineTo(x, z - r); target.quadraticCurveTo(x, z, x - r, z);
  target.lineTo(-x + r, z); target.quadraticCurveTo(-x, z, -x, z - r);
  target.lineTo(-x, -z + r); target.quadraticCurveTo(-x, -z, -x + r, -z);
  return target;
}

// Merge static meshes under `root` into one mesh per (material, hover part, bay, shadow flag) to cut draw
// calls. Subtrees for which skip(node) is true (animated / toggled / focus targets) are left untouched.
// Only single-material, opaque, visible leaf meshes are merged; hover/click metadata is kept per bucket.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export function mergeStatic(root, skip = () => false) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  const walk = (node) => {
    for (const o of node.children.slice()) {
      if (skip(o)) continue;
      if (o.isMesh && !Array.isArray(o.material) && o.visible && !o.material.transparent && o.children.length === 0 && !o.userData.noMerge) {
        const key = `${o.material.uuid}|${o.userData.part ?? ''}|${o.userData.bayId ?? ''}|${o.castShadow}`;
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.clearGroups();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        if (!buckets.has(key)) buckets.set(key, { mat: o.material, part: o.userData.part, bayId: o.userData.bayId, cast: o.castShadow, geos: [] });
        buckets.get(key).geos.push(g);
        victims.push(o);
      } else if (o.children.length) walk(o);
    }
  };
  walk(root);
  for (const v of victims) v.parent.remove(v);
  for (const b of buckets.values()) {
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.mat);
    if (b.part) m.userData.part = b.part;
    if (b.bayId) m.userData.bayId = b.bayId;
    m.castShadow = b.cast;
    m.receiveShadow = true;
    root.add(m);
  }
  return victims.length;
}
