import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Warp, NORMAL_SPEED, WARP_SPEED_MULTIPLIER } from '../src/three/warp.js';
import { shipModel, SPECIAL_SHIP_USERS, prepareShipModel, disposeShipModel } from '../src/three/ship.js';
import { Universe } from '../src/three/universe.js';
import { Group, Vector3 } from 'three';
test('warp depletion, recovery while held, release, bounds and frame independence',()=>{
 for(const fps of [30,60,144]){
  const w=new Warp();assert.equal(w.energy,100);
  for(let i=0;i<fps*5+1;i++)w.update(true,1/fps);
  assert.equal(w.active,false);assert.ok(w.energy<1);
  for(let i=0;i<fps*2;i++)w.update(false,1/fps);
  assert.ok(w.energy>=20);assert.equal(w.update(true,1/fps),true);
  assert.equal(w.update(false,1/fps),false);
  for(let i=0;i<fps*20;i++)w.update(false,1/fps);
  assert.equal(w.energy,100);
 }
});
test('ship selection normalizes only authenticated usernames',()=>{
 for(const name of SPECIAL_SHIP_USERS)assert.equal(shipModel(' '+name.toUpperCase()+' '),'navedamulher');
 assert.equal(shipModel('ordinary'),'nave_orbt');assert.equal(shipModel(null),'nave_orbt');
});
test('movement combinations, Ctrl descent, Shift speed and depleted normal speed',()=>{
 function world(keys){const ship=new Group();ship.userData.velocity=new Vector3();return {ship,keys:new Set(keys),controls:{blocked:()=>false,navigation:true,pitch:0,yaw:0},warp:new Warp(),updateWarpHud(){}};}
 for(const [key,axis,sign] of [['KeyW','z',-1],['KeyS','z',1],['KeyA','x',-1],['KeyD','x',1],['Space','y',1],['ControlLeft','y',-1],['ControlRight','y',-1]]){
  const u=world([key]);Universe.prototype.updateFlight.call(u,.1);assert.ok(u.ship.userData.velocity[axis]*sign>0);
 }
 const normal=world(['KeyW']),warp=world(['KeyW','ShiftLeft','Space']);
 Universe.prototype.updateFlight.call(normal,.1);Universe.prototype.updateFlight.call(warp,.1);
 assert.ok(warp.ship.userData.velocity.z<normal.ship.userData.velocity.z);assert.ok(warp.ship.userData.velocity.y>0);
 warp.warp.energy=0;warp.warp.exhausted=true;warp.ship.userData.velocity.set(0,0,-90);Universe.prototype.updateFlight.call(warp,.1);
 assert.ok(warp.ship.userData.velocity.length()<=NORMAL_SPEED);assert.equal(warp.warp.active,false);
 assert.equal(NORMAL_SPEED*WARP_SPEED_MULTIPLIER,90);
});
test('real GLBs parse, normalize scale and isolate rear materials',async()=>{
 for(const name of ['nave_orbt','navedamulher']){
  const bytes=await readFile(new URL(`../public/models/${name}.glb`,import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const {model,thrusters}=prepareShipModel(gltf.scene,name==='navedamulher');
  assert.equal(thrusters.length,name==='navedamulher'?5:3);
  const hull=[];model.traverse(m=>{if(m.isMesh&&!thrusters.includes(m.material))hull.push(m.material)});
  for(const material of thrusters){assert.ok(!hull.includes(material));material.color.set('#00ffff');}
  assert.ok(hull.every(m=>m.color.getHex()!==0x00ffff));
  disposeShipModel(model);
 }
});
