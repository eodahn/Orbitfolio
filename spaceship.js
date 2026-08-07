import * as THREE from "three";

export function createSpaceship(scene) {
  const ship = new THREE.Group();

  const bodyGeometry = new THREE.ConeGeometry(0.6, 2, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.rotation.x = Math.PI / 2;
  ship.add(body);

  const wingGeometry = new THREE.BoxGeometry(1.8, 0.1, 0.6);
  const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x6a5cff });
  const wings = new THREE.Mesh(wingGeometry, wingMaterial);
  wings.position.z = 0.3;
  ship.add(wings);

  const engineGeometry = new THREE.SphereGeometry(0.25, 8, 8);
  const engineMaterial = new THREE.MeshStandardMaterial({
    color: 0xff5ca8,
    emissive: 0xff5ca8,
    emissiveIntensity: 0.6,
  });
  const engine = new THREE.Mesh(engineGeometry, engineMaterial);
  engine.position.z = 1.1;
  ship.add(engine);

  ship.position.set(0, 0, 0);
  ship.userData.speed = 0;
  ship.userData.verticalSpeed = 0;

  scene.add(ship);
  return ship;
}
