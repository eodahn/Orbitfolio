import * as THREE from "three";
export function createShip() {
  const ship = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: "#c9d2e7", metalness: .88, roughness: .24 });
  const dark = new THREE.MeshStandardMaterial({ color: "#151a2b", metalness: .82, roughness: .3 });
  const glass = new THREE.MeshStandardMaterial({ color: "#57c9ff", emissive: "#1467c8", emissiveIntensity: .75, metalness: .6, roughness: .12, transparent: true, opacity: .9 });
  const glow = new THREE.MeshStandardMaterial({ color: "#8c65ff", emissive: "#6a5cff", emissiveIntensity: 2.1, roughness: .2 });
  const flame = new THREE.MeshBasicMaterial({ color: "#ff72c4", transparent: true, opacity: .82 });
  const add = (geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.rotation.set(...rotation); ship.add(mesh); return mesh; };
  // Nose points toward negative Z, matching the existing flight vector.
  add(new THREE.ConeGeometry(.58, 2.9, 8), hull, [0, 0, -1.15], [Math.PI / 2, 0, 0]);
  add(new THREE.CylinderGeometry(.68, .86, 1.9, 10), hull, [0, 0, .62], [Math.PI / 2, 0, 0]);
  add(new THREE.SphereGeometry(.53, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, [0, .26, -1.03], [-Math.PI / 2, 0, 0]);
  [[-1, 1], [1, 1]].forEach(([side]) => {
    add(new THREE.BoxGeometry(1.9, .11, .84), hull, [side * .98, -.04, .48], [0, side * -.18, 0]);
    add(new THREE.BoxGeometry(.78, .08, 1.1), dark, [side * 1.62, -.01, .76], [0, side * -.27, 0]);
    add(new THREE.BoxGeometry(.14, .11, .9), glow, [side * 1.68, .04, .82], [0, side * -.27, 0]);
    add(new THREE.CylinderGeometry(.21, .29, .42, 10), dark, [side * .42, 0, 1.7], [Math.PI / 2, 0, 0]);
    add(new THREE.ConeGeometry(.2, .82, 10), flame, [side * .42, 0, 2.28], [-Math.PI / 2, 0, 0]);
  });
  add(new THREE.BoxGeometry(.26, .3, 1.5), dark, [0, .43, .44]);
  const engine = new THREE.PointLight("#ff5ca8", 4, 14); engine.position.set(0, 0, 2.1); ship.add(engine);
  const core = add(new THREE.SphereGeometry(.2, 12, 12), glow, [0, 0, 1.72]);
  core.name = "engine-core"; ship.position.set(0, 0, 12); ship.userData.velocity = new THREE.Vector3(); return ship;
}
