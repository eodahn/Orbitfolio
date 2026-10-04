import { Vector2 } from 'three';
import { PLANET_INTERACTION_DISTANCE } from './flight-controls.js';
const center = new Vector2();
export function pickPlanetSystem(camera, planets, shipPosition, raycaster, pointer = center, nearby = true) {
  const candidates = planets.filter(p => p.visible && (!nearby || p.position.distanceTo(shipPosition) - (p.userData.visualRadius ?? p.userData.radius) <= PLANET_INTERACTION_DISTANCE));
  camera.updateMatrixWorld();
  const objects = [];
  for (const planet of candidates) {
    planet.updateMatrixWorld(true);
    objects.push(planet.userData.surface);
    for (const moon of planet.moons || []) if (moon.visible && moon.parent.visible) objects.push(moon);
  }
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(objects, false)[0];
  if (!hit) return null;
  const planet = candidates.find(p => p.userData.surface === hit.object || p.moons?.includes(hit.object));
  return { planet, object: hit.object, type: hit.object.userData.type || 'projectPlanet' };
}
export function aimedPlanet(camera, planets, shipPosition, raycaster) {
  const hit = pickPlanetSystem(camera, planets, shipPosition, raycaster);
  return hit?.type === 'projectPlanet' ? hit.planet : null;
}
