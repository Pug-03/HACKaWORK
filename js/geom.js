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
