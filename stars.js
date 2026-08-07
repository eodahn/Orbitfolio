import * as THREE from "three";
import { randomRange } from "./utils.js";

export function createStars(scene, count = 800) {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = randomRange(-400, 400);
    positions[i * 3 + 1] = randomRange(-400, 400);
    positions[i * 3 + 2] = randomRange(-400, 400);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.2,
    sizeAttenuation: true,
  });

  const stars = new THREE.Points(geometry, material);
  scene.add(stars);

  return stars;
}
