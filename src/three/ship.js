import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createFallbackShip } from "./ship-fallback.js";
export const SPECIAL_SHIP_USERS = new Set([
  "douglasnascimento", "geovannavnds", "esposa_do_dev", "gi_sinmene",
]);
export function shipModel(username) {
  return SPECIAL_SHIP_USERS.has(String(username || "").trim().toLowerCase())
    ? "navedamulher" : "nave_orbt";
}
// These five named meshes form the existing narrow aft arc in the supplied GLB.
export const SPECIAL_THRUSTERS = new Set([
  "Mesh_0496", "Mesh_0549", "Mesh_0612", "Mesh_0761", "Mesh_0814",
]);
export function disposeShipModel(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of [].concat(object.material)) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
export function prepareShipModel(scene, special) {
  const model = new THREE.Group(), thrusters = [];
  // Exported camera/light transforms are unrelated to the ship's native axes.
  const meshes = [];
  const source = special ? scene : scene.getObjectByName("Cube");
  if (!source) throw new Error("GLB da nave padrão sem o grupo Cube esperado.");
  source.traverse(m => { if (m.isMesh) meshes.push(m); });
  const replacedMaterials = new Set();
  for (const mesh of meshes) {
    model.add(mesh);
    mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.setScalar(1);
    if (special) {
      for (const material of [].concat(mesh.material)) replacedMaterials.add(material);
      mesh.material = new THREE.MeshStandardMaterial({color: "#aeb6c2", metalness: .55, roughness: .48});
    }
    if (special && SPECIAL_THRUSTERS.has(mesh.name)) {
      thrusters.push(mesh.material);
    }
  }
  for (const material of replacedMaterials) material.dispose();
  if (!special) {
    // Native rear view: central trapezoid and two small rectangular cavities.
    const shapes = [ [[-.99,.18],[.99,.18],[.35,1.06],[-.35,1.06]],
      [[-2.65,.04],[-2.46,.04],[-2.46,.31],[-2.65,.31]],
      [[2.46,.04],[2.65,.04],[2.65,.31],[2.46,.31]] ];
    for (const points of shapes) {
      const shape = new THREE.Shape(points.map(([x,z]) => new THREE.Vector2(x,z)));
      const material = new THREE.MeshStandardMaterial({color: "#555966", metalness: .3, roughness: .6, side: THREE.DoubleSide});
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.14,bevelEnabled:false}), material);
      mesh.name = "warp-thruster"; mesh.rotation.x = Math.PI / 2; mesh.position.y = 2.69;
      model.add(mesh); thrusters.push(material);
    }
  }
  model.rotation.x = -Math.PI / 2;
  if (!special) model.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI));
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const scale = 4.6 / Math.max(...size.toArray());
  model.scale.setScalar(scale); model.position.copy(center).multiplyScalar(-scale);
  return {model, thrusters};
}
export function createShip({ loader = new GLTFLoader() } = {}) {
  const ship = new THREE.Group();
  ship.position.set(0,0,12); ship.userData.velocity = new THREE.Vector3();
  let current, requested, pending, generation = 0, disposed = false, effects = [], intensity = 0;
  const cyan = new THREE.Color("#00ffff");
  ship.userData.setUser = async user => {
    const name = shipModel(user?.username);
    if (requested === name) return pending;
    requested = name;
    const token = ++generation;
    const url = `/models/${name}.glb`;
    ship.userData.loadState = "loading";
    console.info(`Orbitfolio: carregando nave ${name} de ${url}.`);
    // Remove the previous account's model before beginning a different load.
    if (current) { ship.remove(current); disposeShipModel(current); current = null; effects = []; }
    pending = (async () => {
      try {
        const gltf = await loader.loadAsync(url);
        if (disposed || token !== generation) { disposeShipModel(gltf.scene); return; }
        let prepared;
        try { prepared = prepareShipModel(gltf.scene, name === "navedamulher"); }
        catch (error) { disposeShipModel(gltf.scene); throw error; }
        current = prepared.model;
        effects = prepared.thrusters.map(material => ({material, color: material.color.clone(), emissive: material.emissive.clone(), intensity: material.emissiveIntensity}));
        ship.add(current); ship.userData.modelName = name;
        ship.userData.loadState = "ready";
        console.info(`Orbitfolio: nave ${name} adicionada à cena; ${effects.length} materiais de propulsão.`);
      } catch (error) {
        if (disposed || token !== generation) return;
        console.error(`Orbitfolio: falha ao carregar /models/${name}.glb`, error);
        current = createFallbackShip(); current.position.set(0,0,0); ship.add(current);
        ship.userData.modelName = "fallback";
        ship.userData.loadState = "error";
        console.warn("Orbitfolio: nave antiga de fallback ativada. Verifique o GLB e o build servido.");
        requested = null;
      }
    })();
    return pending;
  };
  ship.userData.updateWarp = (active, delta) => {
    intensity += ((active ? 1 : 0) - intensity) * (1 - Math.exp(-12 * delta));
    if (intensity < .001) intensity = 0;
    for (const effect of effects) {
      effect.material.color.copy(effect.color).lerp(cyan, intensity);
      effect.material.emissive.copy(effect.emissive).lerp(cyan, intensity);
      effect.material.emissiveIntensity = THREE.MathUtils.lerp(effect.intensity, 3, intensity);
    }
  };
  ship.userData.dispose = () => { disposed = true; generation++; if(current) disposeShipModel(current); };
  return ship;
}
