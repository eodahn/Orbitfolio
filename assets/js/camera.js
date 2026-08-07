import * as THREE from "three";

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 8, 20);
  return camera;
}

const desiredPosition = new THREE.Vector3();
const desiredLookAt = new THREE.Vector3();
const offset = new THREE.Vector3(0, 4, 12);

export function updateCameraFollow(camera, ship) {
  const rotatedOffset = offset.clone().applyQuaternion(ship.quaternion);
  desiredPosition.copy(ship.position).add(rotatedOffset);
  camera.position.lerp(desiredPosition, 0.06);

  desiredLookAt.copy(ship.position);
  camera.lookAt(desiredLookAt);
}
