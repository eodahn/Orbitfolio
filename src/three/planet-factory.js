import * as THREE from "three";
import { hash, random } from "../utils/seed.js";

// One global palette makes a language immediately recognisable on every planet.
const languageColors = { JavaScript: "#f1c40f", TypeScript: "#3178c6", HTML: "#e34c26", CSS: "#56b7e9", Python: "#3776ab", Java: "#e76f51", "C#": "#9b59b6", "C++": "#3478c6", Shell: "#657b83", Three: "#5cd1ff", React: "#61dafb", Vue: "#42b883" };
const colorFor = (name) => new THREE.Color(languageColors[name] || "#6a5cff");

export function planetIdentity(project) {
  const entries = Object.entries(project.languages || { Unknown: 100 }).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, amount]) => sum + Number(amount || 0), 0) || 1;
  const [dominantLanguage, dominantAmount] = entries[0];
  // The dominant language owns the base surface. Other languages are represented
  // by deterministic surface patches rather than washing the identity away.
  return { seed: hash(project.id), color: colorFor(dominantLanguage), dominant: { name: dominantLanguage, amount: Number(dominantAmount) / total }, patches: entries.slice(1).map(([name, amount]) => ({ name, color: colorFor(name), amount: Number(amount) / total })) };
}

function addSurfacePatch(group, radius, patch, rng) {
  // A slightly raised, tangent disc reads as a biome painted into the surface,
  // unlike a free-standing satellite. Percentages map to a restrained visual area.
  const normal = new THREE.Vector3();
  const theta = rng() * Math.PI * 2, phi = .32 + rng() * 2.5;
  normal.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).normalize();
  const patchRadius = radius * (.12 + Math.sqrt(Math.min(patch.amount, .45)) * .56);
  const geometry = new THREE.CircleGeometry(patchRadius, 18);
  geometry.scale(.72 + rng() * .38, .56 + rng() * .36, 1);
  const material = new THREE.MeshStandardMaterial({ color: patch.color, roughness: .88, metalness: .03, emissive: patch.color.clone().multiplyScalar(.025), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const biome = new THREE.Mesh(geometry, material);
  biome.position.copy(normal).multiplyScalar(radius * 1.004);
  biome.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  biome.userData.surfacePatch = true;
  group.add(biome);
}

export function createPlanet(project, detail = 32) {
  const identity = planetIdentity(project); const rng = random(identity.seed);
  const radius = 1.45 + rng() * 0.75;
  const group = new THREE.Group();
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, detail, detail), new THREE.MeshStandardMaterial({ color: identity.color, roughness: .72, metalness: .08, emissive: identity.color.clone().multiplyScalar(.08) }));
  group.add(surface);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.055, detail, detail), new THREE.MeshBasicMaterial({ color: identity.color, transparent: true, opacity: .12, side: THREE.BackSide, blending: THREE.AdditiveBlending }));
  group.add(atmosphere);
  identity.patches.slice(0, 4).forEach((patch) => addSurfacePatch(group, radius, patch, rng));
  group.userData = { project, radius, surface, atmosphere, spin: .002 + rng() * .004 };
  return group;
}

export function projectPosition(project) { const rng = random(hash(project.id)); const angle = rng() * Math.PI * 2; const distance = 45 + rng() * 150; return new THREE.Vector3(Math.cos(angle) * distance, (rng() - .5) * 44, Math.sin(angle) * distance - 50); }
