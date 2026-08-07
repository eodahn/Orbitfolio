import * as THREE from "three";
import { clamp } from "./utils.js";

const ACCELERATION = 0.01;
const BRAKE_POWER = 0.015;
const DAMPING = 0.985;
const MAX_SPEED = 0.6;
const TURN_SPEED = 0.03;
const VERTICAL_ACCELERATION = 0.01;
const VERTICAL_MAX_SPEED = 0.4;

const forwardDirection = new THREE.Vector3();

export function updateShipPhysics(ship, input) {
  if (input.forward) ship.userData.speed += ACCELERATION;
  if (input.backward) ship.userData.speed -= BRAKE_POWER;

  ship.userData.speed *= DAMPING;
  ship.userData.speed = clamp(ship.userData.speed, -MAX_SPEED / 2, MAX_SPEED);

  if (input.left) ship.rotation.y += TURN_SPEED;
  if (input.right) ship.rotation.y -= TURN_SPEED;

  forwardDirection.set(0, 0, -1).applyQuaternion(ship.quaternion);
  ship.position.addScaledVector(forwardDirection, ship.userData.speed);

  if (input.up) ship.userData.verticalSpeed += VERTICAL_ACCELERATION;
  if (input.down) ship.userData.verticalSpeed -= VERTICAL_ACCELERATION;

  ship.userData.verticalSpeed *= DAMPING;
  ship.userData.verticalSpeed = clamp(
    ship.userData.verticalSpeed,
    -VERTICAL_MAX_SPEED,
    VERTICAL_MAX_SPEED
  );

  ship.position.y += ship.userData.verticalSpeed;
}
