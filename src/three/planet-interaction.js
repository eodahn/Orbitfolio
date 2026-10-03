import { Vector2 } from "three";
import { PLANET_INTERACTION_DISTANCE } from "./flight-controls.js";
const center = new Vector2(0, 0);
export function aimedPlanet(camera, planets, shipPosition, raycaster) {
  const candidates = planets.filter(
    (p) =>
      p.position.distanceTo(shipPosition) - p.userData.radius <=
      PLANET_INTERACTION_DISTANCE,
  );
  camera.updateMatrixWorld();
  for (const p of candidates) p.updateMatrixWorld(true);
  raycaster.setFromCamera(center, camera);
  const hit = raycaster.intersectObjects(
    candidates.map((p) => p.userData.surface),
    false,
  )[0];
  return hit ? candidates.find((p) => p.userData.surface === hit.object) : null;
}
