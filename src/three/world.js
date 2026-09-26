import { Vector3 } from "three";
export const WORLD = Object.freeze({
  min: -320,
  max: 320,
  margin: 8,
  shipRadius: 3,
  shipMass: 10,
  minRadius: 6,
  maxRadius: 25,
  restitution: 0.72,
});
// Ship including exhaust is < 5.4 units long; the minimum diameter is 12 (> 2 × 5.4).
// Log growth from bytes, capped at 10 GiB: r=6+19*log1p(bytes/MiB)/log1p(10240).
export function projectRadius(bytes = 0) {
  return (
    WORLD.minRadius +
    (WORLD.maxRadius - WORLD.minRadius) *
      Math.min(
        1,
        Math.log1p(Math.max(0, Number(bytes) || 0) / 1048576) /
          Math.log1p(10240),
      )
  );
}
export const planetMass = (radius) => 30 * (radius / WORLD.minRadius) ** 3;
export function randomPosition(radius, rng = Math.random) {
  return new Vector3(
    ...Array.from(
      { length: 3 },
      () => WORLD.min + radius + rng() * (WORLD.max - WORLD.min - 2 * radius),
    ),
  );
}
export function availablePosition(radius, bodies, rng = Math.random) {
  const valid = (p) =>
    bodies.every(
      (b) =>
        p.distanceToSquared(b.position) >
        (radius + b.userData.radius + WORLD.margin) ** 2,
    );
  for (let i = 0; i < 1200; i++) {
    const p = randomPosition(radius, rng);
    if (valid(p)) return p;
  }
  // Bounded fallback: report saturation rather than overlap or loop forever.
  const step = 2 * radius + WORLD.margin;
  for (let x = WORLD.min + radius; x <= WORLD.max - radius; x += step)
    for (let y = WORLD.min + radius; y <= WORLD.max - radius; y += step)
      for (let z = WORLD.min + radius; z <= WORLD.max - radius; z += step) {
        const p = new Vector3(x, y, z);
        if (valid(p)) return p;
      }
  return null;
}
