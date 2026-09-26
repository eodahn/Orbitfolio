import * as THREE from "three";
import { projectRadius, planetMass } from "./world.js";
import { hash, random } from "../utils/seed.js";

// One global palette makes a language immediately recognisable on every planet.
const languageColors = {
  JavaScript: "#f1c40f",
  TypeScript: "#3178c6",
  HTML: "#e34c26",
  CSS: "#56b7e9",
  Python: "#3776ab",
  Java: "#e76f51",
  "C#": "#9b59b6",
  "C++": "#3478c6",
  Shell: "#657b83",
  Three: "#5cd1ff",
  React: "#61dafb",
  Vue: "#42b883",
};
const colorFor = (name) => new THREE.Color(languageColors[name] || "#6a5cff");

export function planetIdentity(project) {
  const entries = Object.entries(
    Object.keys(project.languages || {}).length
      ? project.languages
      : { Unknown: 100 },
  )
    .map(([name, value]) => [name, value == null ? 1 : Number(value)])
    .sort((a, b) => b[1] - a[1]);
  const total =
    entries.reduce((sum, [, amount]) => sum + Number(amount || 0), 0) || 1;
  const [dominantLanguage, dominantAmount] = entries[0];
  // The dominant language owns the base surface. Other languages are represented
  // by deterministic surface patches rather than washing the identity away.
  return {
    seed: hash(project.id),
    color: colorFor(dominantLanguage),
    dominant: {
      name: dominantLanguage,
      amount: Number(dominantAmount) / total,
    },
    patches: entries.slice(1).map(([name, amount]) => ({
      name,
      color: colorFor(name),
      amount: Number(amount) / total,
    })),
  };
}

function addSurfacePatch(group, radius, patch, rng) {
  // A slightly raised, tangent disc reads as a biome painted into the surface,
  // unlike a free-standing satellite. Percentages map to a restrained visual area.
  const normal = new THREE.Vector3();
  const theta = rng() * Math.PI * 2,
    phi = 0.32 + rng() * 2.5;
  normal
    .set(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    )
    .normalize();
  const patchRadius =
    radius * (0.12 + Math.sqrt(Math.min(patch.amount, 0.45)) * 0.56);
  const geometry = new THREE.RingGeometry(0, patchRadius, 32, 12);
  geometry.scale(0.72 + rng() * 0.38, 0.56 + rng() * 0.36, 1);
  const material = new THREE.MeshStandardMaterial({
    color: patch.color,
    roughness: 0.88,
    metalness: 0.03,
    emissive: patch.color.clone().multiplyScalar(0.025),
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const biome = new THREE.Mesh(geometry, material);
  // Conform every vertex to the sphere so biomes stay beneath the atmosphere.
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal,
    ),
  );
  geometry.translate(normal.x * radius, normal.y * radius, normal.z * radius);
  const vertices = geometry.getAttribute("position"),
    point = new THREE.Vector3();
  for (let i = 0; i < vertices.count; i++) {
    point
      .fromBufferAttribute(vertices, i)
      .normalize()
      .multiplyScalar(radius * 1.003);
    vertices.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  biome.userData.surfacePatch = true;
  group.add(biome);
}

export function createPlanet(project, detail = 32) {
  const identity = planetIdentity(project);
  const rng = random(identity.seed);
  const radius = projectRadius(project.sizeBytes);
  const group = new THREE.Group();
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, detail, detail),
    new THREE.MeshStandardMaterial({
      color: identity.color,
      roughness: 0.72,
      metalness: 0.08,
      emissive: identity.color.clone().multiplyScalar(0.08),
    }),
  );
  group.add(surface);
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.025, detail, detail),
    cloudMaterial,
  );
  group.add(atmosphere);
  identity.patches
    .slice(0, 4)
    .forEach((patch) => addSurfacePatch(group, radius, patch, rng));
  group.userData = {
    project,
    radius,
    mass: planetMass(radius),
    velocity: new THREE.Vector3(),
    surface,
    atmosphere,
    spin: 0.002 + rng() * 0.004,
  };
  return group;
}

// Shared 3D procedural gas: local sphere coordinates avoid UV seams and pole pinching.
const cloudMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  vertexShader: `varying vec3 vPosition; void main(){vPosition=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `varying vec3 vPosition;
 float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 void main(){vec3 p=vPosition*5.0;float n=noise(p)*0.6+noise(p*2.1)*0.3+noise(p*4.2)*0.1;float a=0.06+smoothstep(0.35,0.75,n)*0.48;gl_FragColor=vec4(0.78,0.84,1.0,a);}`,
});

export function disposePlanet(planet) {
  planet.traverse((node) => {
    node.geometry?.dispose();
    if (node.material && node.material !== cloudMaterial)
      node.material.dispose();
  });
}
