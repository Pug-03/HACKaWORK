import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { makePavingTexture, makeAsphaltTexture, makeNoiseTexture } from './textures.js';

// Street context like the site photos: paver sidewalk, concrete curb, asphalt road behind
// the station, a painted concrete pad under it, sky gradient, sun + sky light.
export const STREET = {
  curbZ: -1.35,      // back face of the sidewalk (road side), metres from station centre
  curbHeight: 0.15,
  curbWidth: 0.15,
  roadWidth: 7,
  size: 40,
};

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#9fb8d4');
  g.addColorStop(0.45, '#d6e0ea');
  g.addColorStop(0.5, '#e3e7eb');
  g.addColorStop(1, '#e3e7eb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

export function buildEnvironment(scene, renderer, stationLength, stationDepth) {
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xdde3e9, 16, 38);
  // outdoor image-based lighting from a physical sky (sun in the same direction as the key light),
  // so metal and glossy plastic reflect a real sky instead of an indoor studio
  const sunDir = new THREE.Vector3(4.5, 8, 5.5).normalize();
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const u = sky.material.uniforms;
  u.turbidity.value = 10; u.rayleigh.value = 1.2; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDir);
  const skyScene = new THREE.Scene();
  skyScene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(skyScene, 0.02).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.38;

  // lights: warm sun from the front-right, cool sky fill
  scene.add(new THREE.HemisphereLight(0xdbe7f5, 0x7d756b, 0.85));
  const sun = new THREE.DirectionalLight(0xfff1de, 2.6);
  sun.position.set(4.5, 8, 5.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.006;
  scene.add(sun);

  const S = STREET.size;
  const noise = makeNoiseTexture(renderer, 256, 0.55, 0.25);
  noise.repeat.set(S / 2, S / 2);

  // sidewalk (front of curb)
  const sideDepth = S / 2 - STREET.curbZ;
  const paving = makePavingTexture(renderer);
  paving.repeat.set(S / 1.2, sideDepth / 1.2);
  const walk = new THREE.Mesh(
    new THREE.PlaneGeometry(S, sideDepth),
    new THREE.MeshStandardMaterial({ map: paving, roughness: 0.92, roughnessMap: noise })
  );
  walk.rotation.x = -Math.PI / 2;
  walk.position.z = STREET.curbZ + sideDepth / 2;
  walk.receiveShadow = true;
  scene.add(walk);

  // curb
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb8b6b0, roughness: 0.9, roughnessMap: noise });
  const curb = new THREE.Mesh(new THREE.BoxGeometry(S, STREET.curbHeight, STREET.curbWidth), concrete);
  curb.position.set(0, -STREET.curbHeight / 2 + 0.0005, STREET.curbZ - STREET.curbWidth / 2);
  curb.receiveShadow = curb.castShadow = true;
  scene.add(curb);

  // road (one curb height lower) with an edge line
  const roadZ0 = STREET.curbZ - STREET.curbWidth;
  const asphalt = makeAsphaltTexture(renderer);
  const roadDepth = S / 2 + roadZ0;
  asphalt.repeat.set(S / 4, roadDepth / 4);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(S, roadDepth),
    new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -STREET.curbHeight, roadZ0 - roadDepth / 2);
  road.receiveShadow = true;
  scene.add(road);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(S, 0.12), new THREE.MeshStandardMaterial({ color: 0xe8e2cf, roughness: 0.8 }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, -STREET.curbHeight + 0.002, roadZ0 - 0.45);
  scene.add(line);
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(S, 0.12), new THREE.MeshStandardMaterial({ color: 0xe8e2cf, roughness: 0.8 }));
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, -STREET.curbHeight + 0.002, roadZ0 - 3.6);
  scene.add(lane);

  // painted concrete pad under the station (grey-blue slab seen in photo 2)
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(stationLength + 0.5, 0.012, stationDepth + 0.5),
    new THREE.MeshStandardMaterial({ color: 0x8f9aa3, roughness: 0.85, roughnessMap: noise })
  );
  pad.position.y = 0.006;
  pad.receiveShadow = true;
  scene.add(pad);

  return { sun, padHeight: 0.012 };
}
