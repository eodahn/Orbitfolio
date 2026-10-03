import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Warp, NORMAL_SPEED, WARP_SPEED_MULTIPLIER, WARP_RECHARGE_RATE } from '../src/three/warp.js';
import { shipModel, SPECIAL_SHIP_USERS, prepareShipModel, disposeShipModel } from '../src/three/ship.js';
import { Universe } from '../src/three/universe.js';
import { Group, Vector3 } from 'three';
test('warp depletion, recovery while held, release, bounds and frame independence',()=>{
 for(const fps of [4,10,30,60,144]){
  const w=new Warp();assert.equal(w.energy,100);
  for(let i=0;i<fps*5+1;i++)w.update(true,1/fps);
  assert.equal(w.active,false);assert.ok(w.energy<=WARP_RECHARGE_RATE/fps+1e-6);
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
test('loader failure identifies fallback explicitly and retry installs the real ship',async()=>{
 const { createShip } = await import('../src/three/ship.js');
 const info=console.info, warn=console.warn, error=console.error, logs=[];
 console.info=console.warn=console.error=(...args)=>logs.push(args.join(' '));
 let calls=0;
 const ship=createShip({loader:{async loadAsync(url){
  calls++;assert.equal(url,'/models/nave_orbt.glb');
  if(calls===1)throw new Error('404 missing asset');
  const bytes=await readFile(new URL('../public/models/nave_orbt.glb',import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 }}});
 try {
  await ship.userData.setUser(null);
  assert.equal(ship.userData.loadState,'error');assert.equal(ship.userData.modelName,'fallback');
  assert.ok(logs.some(log=>log.includes('fallback ativada')));
  await ship.userData.setUser(null);
  assert.equal(ship.userData.loadState,'ready');assert.equal(ship.userData.modelName,'nave_orbt');
  assert.equal(ship.children.length,1);
  await ship.userData.setUser({username:'ordinary'});assert.equal(calls,2);
  assert.ok(logs.some(log=>log.includes('adicionada à cena')));
 }finally {ship.userData.dispose();console.info=info;console.warn=warn;console.error=error;}
});
test('real ship warp OFF/ON/OFF restores every material, swaps models and disposes late loads', async()=>{
 const {createShip,SPECIAL_THRUSTERS}=await import('../src/three/ship.js');
 const info=console.info;console.info=()=>{};
 const calls=[];
 const loader={async loadAsync(url){
  calls.push(url);
  const bytes=await readFile(new URL('../public'+url,import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 }};
 const ship=createShip({loader});
 try {
  for(const user of [null,{username:' GeOvAnNaVnDs '}]){
   await ship.userData.setUser(user);
   const before=[];
   ship.traverse(m=>{if(m.isMesh)before.push({mesh:m,color:m.material.color.clone(),emissive:m.material.emissive.clone(),intensity:m.material.emissiveIntensity});});
   const expected=user?5:3;
   ship.userData.updateWarp(true,2);
   const changed=before.filter(({mesh,color})=>!mesh.material.color.equals(color));
   assert.equal(changed.length,expected);
   for(const {mesh} of changed){
    assert.ok(user?SPECIAL_THRUSTERS.has(mesh.name):mesh.name==='warp-thruster');
    assert.ok(mesh.material.emissive.g>.99&&mesh.material.emissive.b>.99);
   }
   ship.userData.updateWarp(false,2);
   for(const entry of before){
    assert.ok(entry.mesh.material.color.equals(entry.color));
    assert.ok(entry.mesh.material.emissive.equals(entry.emissive));
    assert.equal(entry.mesh.material.emissiveIntensity,entry.intensity);
   }
   assert.equal(ship.children.length,1);
  }
  assert.deepEqual(calls,['/models/nave_orbt.glb','/models/navedamulher.glb']);
  await ship.userData.setUser({username:'gi_sinmene'});
  assert.equal(calls.length,2);
 }finally{ship.userData.dispose();console.info=info;}
 let release;
 const gltf=await loader.loadAsync('/models/nave_orbt.glb');
 let disposals=0;gltf.scene.traverse(m=>{if(m.geometry)m.geometry.addEventListener('dispose',()=>disposals++);});
 const late=createShip({loader:{loadAsync:()=>new Promise(resolve=>{release=resolve;})}});
 const previousInfo=console.info;console.info=()=>{};
 try{
  const loading=late.userData.setUser(null);late.userData.dispose();release(gltf);await loading;
  assert.equal(late.children.length,0);assert.ok(disposals>0);
 }finally{console.info=previousInfo;}
});
