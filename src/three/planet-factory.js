import * as THREE from "three";
import { hash, random } from "../utils/seed.js";

const languageColors = { JavaScript: "#f1c40f", TypeScript: "#3178c6", HTML: "#e34c26", CSS: "#56b7e9", Python: "#3776ab", Java: "#e76f51", Shell: "#657b83", Three: "#5cd1ff", React: "#61dafb", Vue: "#42b883" };
const colorFor = (name) => new THREE.Color(languageColors[name] || "#6a5cff");

export function planetIdentity(project) {
  const entries = Object.entries(project.languages || { Unknown: 100 }).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0) || 1;
  const color = new THREE.Color(0, 0, 0);
  entries.forEach(([language, amount]) => color.addScaledVector(colorFor(language), amount / total));
  return { seed: hash(project.id), color, accents: entries.map(([name]) => colorFor(name)) };
}

export function createPlanet(project, detail = 32) {
  const identity = planetIdentity(project); const rng = random(identity.seed);
  const radius = 1.45 + rng() * 0.75;
  const group = new THREE.Group();
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, detail, detail), new THREE.MeshStandardMaterial({ color: identity.color, roughness: .72, metalness: .08, emissive: identity.color.clone().multiplyScalar(.08) }));
  group.add(surface);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.055, detail, detail), new THREE.MeshBasicMaterial({ color: identity.color, transparent: true, opacity: .12, side: THREE.BackSide, blending: THREE.AdditiveBlending }));
  group.add(atmosphere);
  // Deterministic biome satellites create material variation without external texture assets.
  identity.accents.slice(1, 4).forEach((color, index) => { const biome = new THREE.Mesh(new THREE.SphereGeometry(radius * (.16 + rng() * .12), 14, 14), new THREE.MeshStandardMaterial({ color, roughness: .85 })); const theta = rng() * Math.PI * 2, phi = .35 + rng() * 2.4; biome.position.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).multiplyScalar(radius * .92); biome.scale.z = .35; group.add(biome); });
  group.userData = { project, radius, surface, atmosphere, spin: .002 + rng() * .004 };
  return group;
}

export function projectPosition(project) { const rng = random(hash(project.id)); const angle = rng() * Math.PI * 2; const distance = 45 + rng() * 150; return new THREE.Vector3(Math.cos(angle) * distance, (rng() - .5) * 44, Math.sin(angle) * distance - 50); }
