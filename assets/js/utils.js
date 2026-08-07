export function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function distanceBetween(positionA, positionB) {
  return positionA.distanceTo(positionB);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function colorToCss(hexNumber) {
  return "#" + hexNumber.toString(16).padStart(6, "0");
}

export function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR");
}
