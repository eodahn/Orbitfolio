import * as THREE from 'three';
import { hash } from '../utils/seed.js';
import { parseProjectLanguages } from './project-languages.js';
import { PlanetSystem } from './planet-system.js';
export { PlanetSystem } from './planet-system.js';
export function planetIdentity(project) {
  const parsed = parseProjectLanguages(project);
  return { seed: hash(String(project.id)), color: new THREE.Color(parsed.dominant.color), dominant: { name: parsed.dominant.name, amount: parsed.dominant.percentage / 100 }, patches: parsed.secondary.map(item => ({name:item.name,color:new THREE.Color(item.color),amount:item.percentage/100})) };
}
export function createPlanet(project, detail = 32) { return new PlanetSystem(project, detail); }
export function disposePlanet(planet) { planet.dispose(); }
