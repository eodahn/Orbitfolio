import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WORLD } from '../shared/world-config.js';
import { containFlight, containCamera, insideWorld } from '../src/three/boundaries.js';
import { SpaceChunks } from '../src/three/space-chunks.js';
import { ASTEROIDS, asteroidContact } from '../src/three/asteroid-impact.js';
import { PlanetSystem, ringEligible } from '../src/three/planet-system.js';
import { parseProjectLanguages } from '../src/three/project-languages.js';
import { technologyVisual, classifyTechnologies, languageColor } from '../shared/technology-visuals.js';
import { findSafeApproach } from '../src/three/approach.js';
import { updateFlightVelocity } from '../src/three/flight-motion.js';
import { readFile } from 'node:fs/promises';
const shipAt=(x=0)=>{const ship=new THREE.Group();ship.position.x=x;ship.userData={radius:3,velocity:new THREE.Vector3()};return ship;};
const classify=languages=>classifyTechnologies(parseProjectLanguages({languages}).languages);

test('normal and warp flight respect all six global boundaries, including shifted origin and camera',()=>{
  for(const axis of ['x','y','z'])for(const sign of [-1,1])for(const speed of [30,90]) {
    const origin=new THREE.Vector3(150,-90,210),ship=shipAt();
    ship.position.copy(origin).negate();ship.position[axis]+=sign*(WORLD.max-120);
    let slowed=false;
    for(let i=0;i<2400;i++) {
      ship.userData.velocity[axis]+= (sign*speed-ship.userData.velocity[axis])*(1-Math.exp(-5/120));
      containFlight(ship,origin,1/120);
      if(Math.abs(ship.position[axis]+origin[axis])>WORLD.max-60 && Math.abs(ship.userData.velocity[axis])<speed*.7)slowed=true;
      ship.position.addScaledVector(ship.userData.velocity,1/120);containFlight(ship,origin,0);
      assert.ok(insideWorld(ship.position.clone().add(origin),WORLD.shipRadius+WORLD.cameraMargin));
    }
    assert.ok(slowed);
    const camera=new THREE.PerspectiveCamera();camera.position.copy(ship.position).addScalar(sign*40);containCamera(camera,origin);
    assert.ok(insideWorld(camera.position.clone().add(origin),1));
    // Holding a direction inward can immediately leave the border.
    ship.userData.velocity[axis]=-sign*30;const previous=ship.userData.velocity[axis];containFlight(ship,origin,.1);assert.equal(ship.userData.velocity[axis],previous);
  }
});
test('boundary hard safety survives long warp steps; idle and mouse-only motion remain zero',()=>{
  const ship=shipAt(WORLD.max-20);ship.userData.velocity.x=90;
  ship.position.addScaledVector(ship.userData.velocity,.25);containFlight(ship,new THREE.Vector3(),0);
  assert.ok(insideWorld(ship.position,19));assert.equal(ship.userData.velocity.x,0);
  updateFlightVelocity(ship.userData.velocity,new THREE.Quaternion(),new Set(['ShiftLeft']),true,.25);
  assert.equal(ship.userData.velocity.length(),0);
});
test('star background surrounds the camera on every face; asteroid spheres remain inside the cube',()=>{
  const scene=new THREE.Scene(),space=new SpaceChunks(scene,{activeRadius:1}),camera=new THREE.PerspectiveCamera();
  for(const axis of ['x','y','z'])for(const sign of [-1,1]) {
    camera.position.set(0,0,0);camera.position[axis]=sign*(WORLD.max-1);
    space.update(camera.position);space.animate(0,camera,new THREE.Vector3());
    assert.equal(space.background.material.fog,false);assert.ok(space.background.position.equals(camera.position));
    const points=space.background.geometry.attributes.position;let beyond=0;
    for(let i=0;i<points.count;i++){const point=new THREE.Vector3().fromBufferAttribute(points,i).add(camera.position);if(point[axis]*sign>WORLD.max)beyond++;}
    assert.ok(beyond>900);
    for(const chunk of space.chunks.values())for(const rock of chunk.colliders)assert.ok(insideWorld(rock.globalPosition,rock.radius));
    assert.equal(space.chunks.size,27);
  }
  space.dispose();assert.equal(scene.children.length,0);
});
test('asteroid collision normal, stationary Shift and glancing hits survive; real high-speed impact breaks',()=>{
  for(const speed of [0,10,30,54,55,90]) {
    const ship=shipAt(-4.9);ship.userData.velocity.x=speed;
    const impact=asteroidContact(ship,new THREE.Vector3(),2);
    assert.equal(impact.destroy,speed>=ASTEROIDS.breakSpeed);
    if(!impact.destroy){assert.ok(ship.position.x<=-5);assert.ok(ship.userData.velocity.length()<=speed);}
  }
  const ship=shipAt(-4.9);ship.userData.velocity.set(1,89,0);
  assert.equal(asteroidContact(ship,new THREE.Vector3(),2).destroy,false);
});
test('destroyed instance loses collision immediately, remains destroyed on reload and pooled fragments fully expire after 500 bursts',()=>{
  const scene=new THREE.Scene(),space=new SpaceChunks(scene,{activeRadius:1});space.update(new THREE.Vector3());
  const chunk=[...space.chunks.values()].find(c=>c.colliders.length),rock=chunk.colliders[0],key=[...space.chunks].find(([,c])=>c===chunk)[0];
  const ship=shipAt();ship.position.copy(rock.globalPosition).add(new THREE.Vector3(-rock.radius-2.9,0,0));ship.userData.velocity.x=90;
  space.collide(ship,new THREE.Vector3());assert.equal(rock.active,false);assert.ok(space.destroyedAsteroidIds.has(rock.id));
  assert.equal(space.fragments.slots.size,1);space.collide(ship,new THREE.Vector3());assert.equal(space.fragments.slots.size,1);
  const matrix=new THREE.Matrix4();chunk.rocks.getMatrixAt(rock.index,matrix);assert.equal(matrix.determinant(),0);
  space.update(new THREE.Vector3(900,900,900));space.update(new THREE.Vector3());assert.ok(!space.chunks.get(key).colliders.some(r=>r.id===rock.id));
  for(let i=0;i<500;i++)space.fragments.burst('impact-'+i,new THREE.Vector3(),2);
  assert.equal(space.fragments.slots.size,ASTEROIDS.maxBursts);
  space.fragments.update(1.1,new THREE.Vector3());assert.equal(space.fragments.slots.size,0);assert.equal(space.fragments.mesh.visible,false);
  assert.equal(space.fragments.mesh.count,288);space.dispose();assert.equal(scene.children.length,0);
});
test('technology categories select frontend base, backend moons, config rings and database/markup biomes',()=>{
  let v=classify({HTML:40,CSS:30,JavaScript:30});assert.equal(v.base.name,'HTML');assert.equal(v.moons.length,0);assert.equal(v.surface.length,2);
  v=classify({JavaScript:10,Python:90});assert.equal(v.base.name,'JavaScript');assert.equal(v.moons[0].name,'Python');
  v=classify({TypeScript:40,Python:40,Dockerfile:20});assert.equal(v.base.name,'TypeScript');assert.equal(v.rings[0].name,'Dockerfile');assert.equal(v.moons.length,1);
  v=classify({JavaScript:50,PostgreSQL:30,JSON:20});assert.equal(v.moons.length,0);assert.deepEqual(v.surface.map(t=>t.category),['DATABASE','MARKUP']);
  v=classify({Python:60,Go:30,Dockerfile:10});assert.equal(v.base.name,'Python');assert.equal(v.moons.length,2);assert.equal(v.rings.length,1);
  v=classify({HTML:20,Python:20,Java:15,Go:15,Rust:10,Ruby:10,C:10});assert.equal(v.moons.length,4);assert.equal(v.moons[3].name,'Outros Backend');assert.equal(v.moons[3].members.length,3);assert.ok(Math.abs(v.moons[3].percentage-30)<1e-10);
  assert.equal(ringEligible({languages:{JavaScript:100},views:9999}),false);
});
test('one palette feeds UI and materials; aliases and organic shader weights agree',()=>{
  for(const [name,color] of Object.entries({JavaScript:'#f1e05a',TypeScript:'#3178c6',Python:'#3572A5',Dockerfile:'#384d54',PostgreSQL:'#e38c00'}))assert.equal(languageColor(name),color);
  for(const [alias,name] of Object.entries({js:'JavaScript',ts:'TypeScript',cpp:'C++',csharp:'C#',bash:'Shell',postgres:'PostgreSQL',mysql:'MySQL',scss:'SCSS',sass:'SASS',latex:'TeX'}))assert.equal(technologyVisual(alias),technologyVisual(name));
  const make=css=>new PlanetSystem({id:'same',languages:{JavaScript:100-css,CSS:css}});
  const a=make(30),b=make(2);
  const shader=planet=>{const s={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};planet.userData.surface.material.onBeforeCompile(s);return s;};
  assert.ok(shader(a).uniforms.biomeEdges.value[0] < shader(b).uniforms.biomeEdges.value[0]);
  assert.match(shader(a).fragmentShader,/smoothstep/);assert.equal(a.userData.surface.material.color.getHexString(),'f1e05a');
  a.dispose();b.dispose();
});
test('safe approach works at six faces/corners, avoids full system and camera remains inside',()=>{
  const planet=new PlanetSystem({id:'near-edge',sizeBytes:1e10,languages:{Python:40,Go:20,Java:20,Dockerfile:20}});
  for(const position of [[845,0,0],[-845,0,0],[0,845,0],[0,-845,0],[0,0,845],[0,0,-845],[845,845,845],[-845,-845,-845]]) {
    planet.userData.globalPosition=new THREE.Vector3(...position);
    const arrival=findSafeApproach(planet,[planet]);assert.ok(arrival);
    assert.ok(insideWorld(arrival.position,19));assert.ok(insideWorld(arrival.camera,1));
    assert.ok(arrival.position.distanceTo(planet.userData.globalPosition)>planet.userData.visualRadius+3);
    const forward=new THREE.Vector3(0,0,-1).applyEuler(arrival.rotation),toward=planet.userData.globalPosition.clone().sub(arrival.position).normalize();assert.ok(forward.dot(toward)>.999);
  }
  planet.dispose();
});
test('teleport action belongs to shared details, not search; Home arrival does not reopen details',async()=>{
  const search=await readFile(new URL('../src/pages/search.js',import.meta.url),'utf8');const details=await readFile(new URL('../src/pages/project.js',import.meta.url),'utf8');
  const home=await readFile(new URL('../src/pages/home.js',import.meta.url),'utf8');
  assert.doesNotMatch(search,/\?planet=|Ir para o planeta|IR ATÉ O PLANETA/);assert.match(details,/data-approach/);
  const arrival=home.slice(home.indexOf('async function requestedPlanet'),home.indexOf('async function startHome'));
  assert.match(arrival,/closeHomeProject\(true\)/);assert.doesNotMatch(arrival,/openHomeProject\(/);
});
