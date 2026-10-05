export const WORLD = Object.freeze({
  min: -960,
  max: 960,
  margin: 8,
  boundaryZone: 96,
  cameraMargin: 16,
  safeApproachMargin: 12,
  shipRadius: 3,
  shipMass: 10,
  minRadius: 6,
  maxRadius: 25,
  restitution: 0.72,
});
// r = 6 + 19 * min(1, log1p(bytes/MiB) / log1p(10240)); diameter >= 12.
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
