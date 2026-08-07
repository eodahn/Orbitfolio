import * as THREE from "three";

export function createLights(scene) {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const sunLight = new THREE.PointLight(0xffffff, 2, 0, 0);
  sunLight.position.set(0, 50, 0);
  scene.add(sunLight);
}
