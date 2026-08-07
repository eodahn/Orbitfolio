import * as THREE from "three";
import { distanceBetween, lerp } from "./utils.js";

const PROXIMITY_DISTANCE = 12;

export function createPlanets(scene, planetsData) {
  return planetsData.map((data) => {
    const geometry = new THREE.SphereGeometry(data.size, 24, 24);
    const material = new THREE.MeshStandardMaterial({
      color: data.color,
      emissive: data.color,
      emissiveIntensity: 0.15,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(data.position.x, data.position.y, data.position.z);
    scene.add(mesh);

    return {
      mesh,
      data,
      baseScale: 1,
      isNear: false,
    };
  });
}

export function updatePlanets(planets, shipPosition) {
  let nearestPlanet = null;

  planets.forEach((planet) => {
    const distance = distanceBetween(shipPosition, planet.mesh.position);
    const isNear = distance < PROXIMITY_DISTANCE;

    const targetScale = isNear ? 1.25 : 1;
    const currentScale = planet.mesh.scale.x;
    const newScale = lerp(currentScale, targetScale, 0.08);
    planet.mesh.scale.setScalar(newScale);

    const targetEmissive = isNear ? 0.6 : 0.15;
    planet.mesh.material.emissiveIntensity = lerp(
      planet.mesh.material.emissiveIntensity,
      targetEmissive,
      0.08
    );

    planet.isNear = isNear;

    if (isNear) nearestPlanet = planet;
  });

  return nearestPlanet;
}
