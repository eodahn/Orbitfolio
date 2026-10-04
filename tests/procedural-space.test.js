import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SPACE, SpaceChunks, FloatingOrigin, chunkCoordinates, generateChunk, densityNoise } from '../src/three/space-chunks.js';
import { parseProjectLanguages, languageColor, normalizeLanguage, LANGUAGE_COLORS } from '../src/three/project-languages.js';
import { PlanetSystem, ringEligible } from '../src/three/planet-system.js';
import { updateFlightVelocity } from '../src/three/flight-motion.js';
import { stepPhysics } from '../src/three/physics.js';
import { projectRadius } from '../src/three/world.js';
import { pickPlanetSystem } from '../src/three/planet-interaction.js';
import { Universe } from '../src/three/universe.js';
const close=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);
const project={id:'real-api-project',sizeBytes:1234567,orbit:[40,20,-100],languages:{HTML:50,JavaScript:25,CSS:25}};

test('language bytes win over percentages; aliases merge, missing/invalid/extreme values stay finite',()=>{
  const parsed=parseProjectLanguages({languages:{HTML:100},languageBytes:{JS:300,javascript:100,CSS:100}});
  assert.equal(parsed.dominant.name,'JavaScript');close(parsed.dominant.percentage,80);
  assert.equal(normalizeLanguage(' CSharp '),'C#');assert.equal(normalizeLanguage('Bash'),'Shell');
  assert.equal(languageColor('css'),LANGUAGE_COLORS.CSS);
  assert.equal(languageColor('EXOTIC'),languageColor('exotic'));
  assert.match(languageColor('constructor'),/^hsl/);
  assert.equal(parseProjectLanguages({}).dominant.name,'Unknown');
  assert.equal(parseProjectLanguages({languages:['JS']}).dominant.percentage,100);
  assert.equal(parseProjectLanguages({languages:['JS','CSS']}).dominant.estimated,true);
  const bad=parseProjectLanguages({languages:[{name:'JS',percentage:66.6},{name:'CSS',percentage:33.3},{name:'Bad',percentage:-1},{name:'None',percentage:Infinity}]});
  close(bad.languages.reduce((n,l)=>n+l.percentage,0),100);assert.equal(bad.languages.length,2);
  const huge=parseProjectLanguages({languages:{JS:1e308,javascript:1e308,CSS:1e308}});
  close(huge.dominant.percentage,200/3);
  const many=parseProjectLanguages({languages:{HTML:40,JS:20,CSS:15,Python:10,Rust:8,Go:5,SQL:2}});
  assert.equal(many.secondary.length,4);assert.equal(many.secondary[3].name,'Outros');close(many.others.percentage,15);
  close(many.dominant.percentage+many.secondary.reduce((n,l)=>n+l.percentage,0),100);
});
test('3D chunks use floor, deterministic seeds and smooth density noise',()=>{
  assert.deepEqual(chunkCoordinates(new THREE.Vector3(-1,256,-257)),[-1,1,-2]);
  const a=generateChunk(-2,3,5);assert.deepEqual(a,generateChunk(-2,3,5));assert.notDeepEqual(a,generateChunk(-2,3,6));
  assert.notDeepEqual(a,generateChunk(-2,3,5,{...SPACE,seed:'different'}));
  close(densityNoise(1-1e-6,2,3),densityNoise(1+1e-6,2,3),1e-5);
});
test('long travel keeps chunk budget bounded, disposes exclusive resources and reconstructs stars exactly',()=>{
  const scene=new THREE.Scene(),space=new SpaceChunks(scene,{activeRadius:1});
  const origin=new THREE.Vector3();space.update(origin);
  const original=Array.from(space.chunks.get('0,0,0').geometry.attributes.position.array);
  let disposed=0,sharedDisposed=0;
  space.chunks.get('0,0,0').geometry.addEventListener('dispose',()=>disposed++);
  space.rockGeometry.addEventListener('dispose',()=>sharedDisposed++);
  for(let i=1;i<=40;i++){space.update(new THREE.Vector3(i*1024,-i*256,i*512),new THREE.Vector3(i*1024,-i*256,i*512));assert.equal(space.chunks.size,27);assert.equal(scene.children.length,27);for(const chunk of space.chunks.values())assert.ok(chunk.group.position.length()<1000);}
  assert.equal(disposed,1);assert.equal(sharedDisposed,0);
  space.update(origin);assert.deepEqual(Array.from(space.chunks.get('0,0,0').geometry.attributes.position.array),original);
  space.dispose();assert.equal(scene.children.length,0);assert.equal(sharedDisposed,1);
});
test('floating origin preserves world/camera relationships, velocities and aliased focus targets',()=>{
  const origin=new FloatingOrigin(100),ship=new THREE.Group(),camera=new THREE.PerspectiveCamera(),planet=new THREE.Group();
  ship.position.set(10001,-55,20);camera.position.copy(ship.position).add(new THREE.Vector3(0,4,12));planet.position.set(10010,0,-30);
  const before=planet.position.clone().sub(camera.position),global=origin.localToGlobal(ship.position);
  const saved=camera.position.clone(),focus={savedPosition:saved,target:saved,start:saved.clone()};
  origin.rebase(ship,[camera,planet,ship],focus);
  assert.deepEqual(ship.position.toArray(),[0,0,0]);assert.deepEqual(origin.localToGlobal(ship.position).toArray(),global.toArray());
  assert.deepEqual(planet.position.clone().sub(camera.position).toArray(),before.toArray());assert.deepEqual(saved.toArray(),[0,4,12]);
});
test('PlanetSystem keeps project sizes, exact palette, deterministic non-overlapping moon orbits and LOD',()=>{
  const a=new PlanetSystem(project),b=new PlanetSystem(project);
  assert.equal(a.userData.radius,projectRadius(project.sizeBytes));assert.equal(a.userData.surface.material.color.getHexString(),'e34c26');assert.equal(a.moons.length,2);
  assert.deepEqual(a.orbits.map(o=>[o.radius,o.speed,o.phase,o.group.rotation.toArray()]),b.orbits.map(o=>[o.radius,o.speed,o.phase,o.group.rotation.toArray()]));
  let edge=a.userData.radius*1.55;
  for(const orbit of a.orbits){assert.ok(orbit.radius-orbit.moon.userData.radius>edge);edge=orbit.radius+orbit.moon.userData.radius;}
  a.update(10);for(let i=0;i<100;i++)b.update(.1);
  a.moons.forEach((moon,i)=>close(moon.position.distanceTo(b.moons[i].position),0,1e-8));
  a.update(0,new THREE.Vector3(10000,0,0));assert.equal(a.orbits[0].group.visible,false);assert.equal(a.userData.atmosphere.visible,false);
  a.update(0,new THREE.Vector3());assert.equal(a.orbits[0].group.visible,true);
  let released=0;a.userData.surface.geometry.addEventListener('dispose',()=>released++);
  a.dispose();assert.equal(released,0);b.dispose();assert.equal(released,1);
  assert.equal(ringEligible(project),false);assert.equal(ringEligible({...project,frameworksOrTools:['Docker']}),true);assert.equal(ringEligible({...project,views:1500}),true);
});
test('raycast distinguishes moon metadata, surface and hidden/distant systems',()=>{
  const planet=new PlanetSystem(project),camera=new THREE.PerspectiveCamera(58,1,.1,1000),ray=new THREE.Raycaster();
  planet.position.set(0,0,-40);planet.updateMatrixWorld(true);
  const moon=planet.moons[0],pos=moon.getWorldPosition(new THREE.Vector3());camera.position.copy(pos).add(new THREE.Vector3(0,0,5));camera.lookAt(pos);
  const hit=pickPlanetSystem(camera,[planet],camera.position,ray);
  assert.equal(hit.type,'languageMoon');assert.equal(hit.object.userData.percentage,25);
  moon.parent.visible=false;assert.notEqual(pickPlanetSystem(camera,[planet],camera.position,ray)?.object,moon);
  planet.visible=false;assert.equal(pickPlanetSystem(camera,[planet],camera.position,ray),null);planet.dispose();
});
test('arcade damping stops idle exactly, preserves directional controls and is frame independent',()=>{
  const rotation=new THREE.Quaternion();
  const run=fps=>{const velocity=new THREE.Vector3(),position=new THREE.Vector3();for(let frame=0;frame<fps*3;frame++){const steps=Math.ceil(120/fps),dt=1/fps/steps;for(let i=0;i<steps;i++){updateFlightVelocity(velocity,rotation,new Set(frame<fps?['KeyW']:[]),false,dt);position.addScaledVector(velocity,dt);}}return{velocity,position};};
  const base=run(120);for(const fps of [4,30,60,120]){const state=run(fps);close(state.position.z,base.position.z,1e-8);assert.equal(state.velocity.length(),0);}
  const idle=new THREE.Vector3();updateFlightVelocity(idle,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),1),new Set(),false,1);assert.equal(idle.length(),0);
  const diagonal=new THREE.Vector3();updateFlightVelocity(diagonal,rotation,new Set(['KeyW','KeyD','Space']),true,10);close(diagonal.length(),90);
  updateFlightVelocity(diagonal,rotation,new Set(),true,2);assert.equal(diagonal.length(),0);
});
test('unbounded flight crosses the old world edge without reflection',()=>{
  const body={position:new THREE.Vector3(319,0,0),userData:{radius:3,mass:10,velocity:new THREE.Vector3(30,0,0)}};
  stepPhysics([body],.2,{bounded:false});assert.ok(body.position.x>320);assert.equal(body.userData.velocity.x,30);
});
test('real project teleport works from remote origin and clears velocity without moving persisted orbits',()=>{
  const planet=new PlanetSystem(project);planet.userData.globalPosition=new THREE.Vector3(...project.orbit);
  const world={planets:[planet],ship:new THREE.Group(),camera:new THREE.PerspectiveCamera(),origin:new FloatingOrigin(),globalPosition:new THREE.Vector3(),scene:new THREE.Scene(),space:{update(){}},keys:new Set(['KeyW']),controls:{},restoreFocus(){},onFirstMovement(){},canvas:{focus(){}}};
  world.ship.userData.velocity=new THREE.Vector3(0,0,90);world.origin.offset.set(1e7,0,0);world.syncWorld=()=>Universe.prototype.syncWorld.call(world);
  assert.equal(Universe.prototype.teleportToPlanet.call(world,project.id),true);
  assert.equal(world.ship.userData.velocity.length(),0);assert.equal(world.ship.position.length(),0);assert.equal(world.keys.size,0);
  assert.deepEqual(planet.userData.globalPosition.toArray(),project.orbit);assert.ok(planet.position.length()<200);assert.equal(planet.visible,true);
  assert.equal(pickPlanetSystem(world.camera,[planet],world.ship.position,new THREE.Raycaster())?.planet,planet);
  planet.dispose();
});
