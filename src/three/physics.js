import { Vector3 } from "three";
import { WORLD } from "./world.js";
const normal = new Vector3(),
  relative = new Vector3();
export function resolveCollision(a, b) {
  normal.subVectors(b.position, a.position);
  const radius = a.userData.radius + b.userData.radius,
    distance = normal.length();
  if (distance >= radius) return false;
  if (distance < 1e-8) normal.set(1, 0, 0);
  else normal.divideScalar(distance);
  const invA = 1 / a.userData.mass,
    invB = 1 / b.userData.mass,
    sum = invA + invB;
  // Correct penetration in inverse-mass proportions, then apply only approaching impulse.
  const correction = (Math.max(0, radius - distance - 0.001) * 0.95) / sum;
  a.position.addScaledVector(normal, -correction * invA);
  b.position.addScaledVector(normal, correction * invB);
  const speed = relative
    .subVectors(b.userData.velocity, a.userData.velocity)
    .dot(normal);
  if (speed < 0) {
    const impulse = (-(1 + WORLD.restitution) * speed) / sum;
    a.userData.velocity.addScaledVector(normal, -impulse * invA);
    b.userData.velocity.addScaledVector(normal, impulse * invB);
  }
  return true;
}
export function contain(body) {
  for (const axis of ["x", "y", "z"]) {
    const low = WORLD.min + body.userData.radius,
      high = WORLD.max - body.userData.radius;
    if (body.position[axis] < low) {
      body.position[axis] = low;
      body.userData.velocity[axis] =
        Math.abs(body.userData.velocity[axis]) * WORLD.restitution;
    }
    if (body.position[axis] > high) {
      body.position[axis] = high;
      body.userData.velocity[axis] =
        -Math.abs(body.userData.velocity[axis]) * WORLD.restitution;
    }
  }
}
// Spatial hash broad phase; cells cover the largest diameter so only 27 cells are examined.
export function collisionPairs(bodies) {
  const size = Math.max(...bodies.map((b) => b.userData.radius * 2), 1),
    cells = new Map(),
    pairs = [];
  for (const body of bodies) {
    const cell = ["x", "y", "z"].map((k) =>
      Math.floor(body.position[k] / size),
    );
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          const bucket = cells.get(
            `${cell[0] + x},${cell[1] + y},${cell[2] + z}`,
          );
          if (bucket) for (const other of bucket) pairs.push([body, other]);
        }
    const key = cell.join(",");
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(body);
  }
  return pairs;
}
export function stepPhysics(bodies, delta, { bounded = true } = {}) {
  // At max ship speed 30, 120 Hz steps move .25 units, well below the smallest radius.
  const steps = Math.max(1, Math.ceil(delta * 120)),
    dt = delta / steps;
  for (let i = 0; i < steps; i++) {
    for (const b of bodies) b.position.addScaledVector(b.userData.velocity, dt);
    for (let pass = 0; pass < 3; pass++)
      for (const [a, b] of collisionPairs(bodies)) resolveCollision(a, b);
    if (bounded) for (const b of bodies) contain(b);
  }
}
