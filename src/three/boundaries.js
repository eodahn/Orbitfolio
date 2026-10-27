import { WORLD } from '../../shared/world-config.js';
const axes = ['x','y','z'];
export function insideWorld(position, radius = 0) {
  return axes.every(axis => Number.isFinite(position[axis]) && position[axis] >= WORLD.min + radius && position[axis] <= WORLD.max - radius);
}
export function clampWorld(position, radius = 0) {
  for (const axis of axes) position[axis] = Math.max(WORLD.min + radius, Math.min(WORLD.max - radius, position[axis]));
  return position;
}
/** Slow only outward motion. Tangential movement and escape from the edge remain responsive. */
export function containFlight(ship, origin, delta) {
  const radius = ship.userData.radius + WORLD.cameraMargin;
  for (const axis of axes) {
    const global = ship.position[axis] + origin[axis], v = ship.userData.velocity[axis];
    const distance = v > 0 ? WORLD.max - radius - global : global - WORLD.min - radius;
    const proximity = Math.max(0, 1 - distance / WORLD.boundaryZone);
    if (proximity > 0) ship.userData.velocity[axis] = Math.sign(v) * Math.min(
      Math.abs(v) * Math.exp(-24 * proximity * proximity * delta), Math.max(0,distance) * 2
    );
    const fixed = Math.max(WORLD.min + radius, Math.min(WORLD.max - radius, global));
    if (fixed !== global) {
      ship.position[axis] = fixed - origin[axis];
      if ((global > fixed && v > 0) || (global < fixed && v < 0)) ship.userData.velocity[axis] = 0;
    }
  }
}
export function containCamera(camera, origin) {
  for (const axis of axes) camera.position[axis] = Math.max(WORLD.min + 1, Math.min(WORLD.max - 1, camera.position[axis] + origin[axis])) - origin[axis];
}
