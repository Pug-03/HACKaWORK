import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map();

// Box with rounded edges. Radius is clamped so thin sheets still work.
// RoundedBoxGeometry keeps BoxGeometry's 6 material groups, so material arrays still apply.
export function roundedBoxGeometry(w, h, d, radius = 0.004) {
  const r = Math.max(0.0005, Math.min(radius, Math.min(w, h, d) / 2 - 0.0002));
  const key = [w, h, d, r].map((n) => n.toFixed(5)).join('|');
  if (!cache.has(key)) cache.set(key, new RoundedBoxGeometry(w, h, d, 3, r));
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
