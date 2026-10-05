import * as THREE from 'three';
import { projectRadius, planetMass } from './world.js';
import { hash, random } from '../utils/seed.js';
import { classifyTechnologies } from '../../shared/technology-visuals.js';
import { parseProjectLanguages } from './project-languages.js';

const geometries = new Map();
function acquireSphere(detail) {
  if (!geometries.has(detail)) geometries.set(detail, { geometry: new THREE.SphereGeometry(1, detail, detail), refs: 0 });
  const entry = geometries.get(detail);
  entry.refs++;
  return entry.geometry;
}
function releaseSphere(detail) {
  const entry = geometries.get(detail);
  if (entry && --entry.refs === 0) { entry.geometry.dispose(); geometries.delete(detail); }
}
const noiseGLSL = `
float planetHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float planetNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(mix(planetHash(i),planetHash(i+vec3(1,0,0)),f.x),mix(planetHash(i+vec3(0,1,0)),planetHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(planetHash(i+vec3(0,0,1)),planetHash(i+vec3(1,0,1)),f.x),mix(planetHash(i+vec3(0,1,1)),planetHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`;
function surfaceMaterial(color, seed, layers = []) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .04, emissive: color, emissiveIntensity: .06 });
  material.onBeforeCompile = shader => {
    shader.uniforms.planetSeed = { value: seed % 997 };
    const total=layers.reduce((sum,item)=>sum+item.percentage,0) || 1;
    // A CPU-generated shader per composition, shared GPU program for equal layer counts.
    shader.uniforms.biomeColors={value:layers.map(item=>new THREE.Color(item.color))};
    let accumulated=0;
    shader.uniforms.biomeEdges={value:layers.map(item=>(accumulated+=item.percentage/total))};
    shader.vertexShader = 'varying vec3 planetPosition;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nplanetPosition=position;');
    shader.fragmentShader = (layers.length ? `uniform vec3 biomeColors[${layers.length}];\nuniform float biomeEdges[${layers.length}];\n` : '') + 'varying vec3 planetPosition;\nuniform float planetSeed;\n' + noiseGLSL + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
vec3 terrain=normalize(planetPosition)*5.0+planetSeed;
float land=planetNoise(terrain)*.65+planetNoise(terrain*2.13)*.25+planetNoise(terrain*4.27)*.10;
${layers.length ? `float biome=clamp(land*1.9-.45,0.0,1.0);vec3 pigment=biomeColors[0];
${layers.slice(1).map((_,i)=>`pigment=mix(pigment,biomeColors[${i+1}],smoothstep(biomeEdges[${i}]-.035,biomeEdges[${i}]+.035,biome));`).join('\n')}
diffuseColor.rgb= pigment;` : ''}
diffuseColor.rgb*=.48+smoothstep(.25,.75,land)*.75;`);
  };
  material.customProgramCacheKey = () => `orbitfolio-terrain-v2-${layers.length}`;
  return material;
}
export function ringEligible(project) {
  return classifyTechnologies(parseProjectLanguages(project).languages).rings.length > 0;
}

/** A real project, one dominant planet and at most four language moons. */
export class PlanetSystem extends THREE.Group {
  constructor(project, detail = 32) {
    super();
    this.detail = detail;
    this.elapsed = 0;
    this.disposed = false;
    this.languages = parseProjectLanguages(project);
    this.visuals = classifyTechnologies(this.languages.languages);
    const radius = projectRadius(project.sizeBytes), seed = hash(String(project.id)), rng = random(seed);
    const color = new THREE.Color(this.visuals.base.color);
    const geometry = acquireSphere(detail);
    const surface = new THREE.Mesh(geometry, surfaceMaterial(color, seed, [this.visuals.base,...this.visuals.surface]));
    surface.scale.setScalar(radius);
    surface.userData = { type: 'projectPlanet', projectId: project.id };
    this.add(surface);
    const atmosphere = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), tint: { value: color }, seed: { value: seed % 997 } },
      fog: true,
      transparent: true, depthWrite: false,
      vertexShader: `#include <fog_pars_vertex>
varying vec3 vPosition;varying vec3 vNormal;varying vec3 vView;
void main(){vPosition=position;vNormal=normalize(normalMatrix*normal);vec4 mvPosition=modelViewMatrix*vec4(position,1.0);vView=-mvPosition.xyz;gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
      fragmentShader: `#include <fog_pars_fragment>
uniform vec3 tint;uniform float seed;varying vec3 vPosition;varying vec3 vNormal;varying vec3 vView;${noiseGLSL}
void main(){float rim=pow(1.0-max(dot(normalize(vNormal),normalize(vView)),0.0),3.0);float cloud=smoothstep(.4,.8,planetNoise(vPosition*6.0+seed));gl_FragColor=vec4(mix(tint,vec3(.8,.86,1.),.35),.025+cloud*.10+rim*.24);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`,
    }));
    atmosphere.scale.setScalar(radius * 1.03);
    this.add(atmosphere);
    this.moons = [];
    this.orbits = [];
    let orbitEdge = radius * 1.65;
    if (this.visuals.moons.length) this.moonGeometry = acquireSphere(12);
    this.visuals.moons.forEach((language, index) => {
      const local = random(hash(`${project.id}:${language.name}:${index}`));
      const moonRadius = radius * THREE.MathUtils.clamp(.07 + language.percentage / 100 * .5, .09, .26);
      const orbitRadius = orbitEdge + moonRadius + radius * .2;
      orbitEdge = orbitRadius + moonRadius;
      const group = new THREE.Group();
      group.rotation.set((local() - .5) * .7, local() * Math.PI, (local() - .5) * .5);
      const moon = new THREE.Mesh(this.moonGeometry, surfaceMaterial(new THREE.Color(language.color), hash(language.name)));
      moon.scale.setScalar(moonRadius);
      moon.userData = { type: 'languageMoon', projectId: project.id, language: language.name, percentage: language.percentage, estimated: language.estimated || language.members?.some(item => item.estimated) || false, members: language.members, radius: moonRadius };
      group.add(moon); this.add(group); this.moons.push(moon);
      this.orbits.push({ group, moon, radius: orbitRadius, speed: (.07 + local() * .07) / (1 + index * .25), phase: local() * Math.PI * 2 });
    });
    this.rings = this.visuals.rings.map((technology,index,all) => {
      const inner=1.22+index*.33/all.length,outer=inner+.27/all.length;
      const ring=new THREE.Mesh(new THREE.RingGeometry(radius*inner,radius*outer,64),new THREE.MeshStandardMaterial({color:technology.color,transparent:true,opacity:.48,side:THREE.DoubleSide,depthWrite:false,roughness:.9}));
      ring.rotation.set(Math.PI/2+.18,.1,-.2);ring.userData.technology=technology.name;this.add(ring);return ring;
    });
    this.ring=this.rings[0];
    this.userData = { project, radius, visualRadius: this.moons.length ? orbitEdge : radius * (this.ring ? 1.55 : 1.03), mass: planetMass(radius), velocity: new THREE.Vector3(), surface, atmosphere, spin: .12 + rng() * .24 };
    this.update(0);
  }
  update(delta, cameraPosition) {
    this.elapsed += delta;
    const { radius, surface, atmosphere } = this.userData;
    surface.rotation.y += this.userData.spin * delta;
    atmosphere.rotation.y += .025 * delta;
    const distance = cameraPosition ? cameraPosition.distanceTo(this.position) : 0;
    atmosphere.visible = distance < radius * 40;
    for(const ring of this.rings) ring.visible = distance < radius * 35;
    for (const orbit of this.orbits) {
      orbit.group.visible = distance < radius * 35;
      const angle = orbit.phase + this.elapsed * orbit.speed;
      orbit.moon.position.set(Math.cos(angle) * orbit.radius, 0, Math.sin(angle) * orbit.radius);
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.traverse(node => node.material?.dispose());
    for(const ring of this.rings) ring.geometry.dispose();
    releaseSphere(this.detail);
    if (this.moonGeometry) releaseSphere(12);
    this.clear();
  }
}
