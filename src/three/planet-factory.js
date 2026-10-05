import * as THREE from 'three';
import { classifyTechnologies } from '../../shared/technology-visuals.js';
import { hash } from '../utils/seed.js';
import { parseProjectLanguages } from './project-languages.js';
import { PlanetSystem } from './planet-system.js';
export { PlanetSystem } from './planet-system.js';
export function planetIdentity(project) {
  const parsed = parseProjectLanguages(project);
  const visuals=classifyTechnologies(parsed.languages);
  return { seed: hash(String(project.id)), color: new THREE.Color(visuals.base.color), dominant: { name: visuals.base.name, amount: visuals.base.percentage / 100 }, patches: parsed.secondary.map(item => ({name:item.name,color:new THREE.Color(item.color),amount:item.percentage/100})) };
}
export function createPlanet(project, detail = 32) { return new PlanetSystem(project, detail); }
export function disposePlanet(planet) { planet.dispose(); }
