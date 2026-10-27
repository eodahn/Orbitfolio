import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { MobileFlightControls, joystickAxes } from '../src/three/mobile-flight-controls.js';
import { isTouchMode, watchTouchMode } from '../src/input/touch-mode.js';
import { updateFlightVelocity } from '../src/three/flight-motion.js';
import { Warp } from '../src/three/warp.js';

function event(target, type, props = {}) {
  const event = new Event(type,{cancelable:true});
  Object.assign(event,{pointerId:1,button:0,clientX:60,clientY:60},props);
  target.dispatchEvent(event); return event;
}
class Node extends EventTarget {
  constructor() {
    super(); this.dataset={}; this.style={}; this.attrs={}; this.captured=new Set();
    const classes = new Set();
    this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name)};
  }
  setAttribute(name,value) {this.attrs[name]=value;}
  setPointerCapture(id) {this.captured.add(id);}
  hasPointerCapture(id) {return this.captured.has(id);}
  releasePointerCapture(id) {this.captured.delete(id);}
  getBoundingClientRect() {return {left:0,top:0,width:120,height:120};}
  remove() {this.removed=true;}
}
function harness() {
  const doc = new EventTarget(), host = new EventTarget(), canvas = new Node();
  const root = new Node(), stick = new Node(), knob = new Node();
  const buttons = ['Space','ControlLeft','ShiftLeft'].map(key=>{const b=new Node();b.dataset.flightKey=key;return b;});
  root.querySelector=s=>s==='.touch-stick'?stick:knob;
  root.querySelectorAll=()=>buttons;
  doc.createElement=()=>root;
  let modal=false, allowed=true, taps=0, locks=0;
  doc.querySelector=()=>modal;
  canvas.parentElement={append:()=>{}};
  canvas.requestPointerLock=()=>locks++;
  const controls = new MobileFlightControls(canvas,{document:doc,host,canNavigate:()=>allowed,onCanvasClick:()=>taps++});
  return {doc,host,canvas,root,stick,buttons,controls,counts:()=>({taps,locks}),modal:value=>modal=value,allowed:value=>allowed=value};
}

test('mobile detection requires coarse primary pointer, no hover, touch and Pointer Events; watcher cleans up',()=>{
  const query = new EventTarget(); query.matches=false;
  const host={PointerEvent:class{},matchMedia:()=>query}, nav={maxTouchPoints:5};
  assert.equal(isTouchMode(host,nav),false,'A narrow mouse desktop stays desktop');
  query.matches=true; assert.equal(isTouchMode(host,nav),true);
  assert.equal(isTouchMode(host,{maxTouchPoints:0}),false);
  assert.equal(isTouchMode({...host,PointerEvent:undefined},nav),false);
  const modes=[], stop=watchTouchMode(mode=>modes.push(mode),host,nav);
  query.matches=false; event(query,'change');stop();query.matches=true;event(query,'change');
  assert.deepEqual(modes,[true,false]);
});

test('joystick is continuous, deadzoned and diagonal-normalized in every direction',()=>{
  assert.deepEqual(joystickAxes(0,0,60),{x:0,z:0});
  assert.deepEqual(joystickAxes(2,2,60),{x:0,z:0});
  assert.deepEqual(joystickAxes(60,0,60),{x:1,z:0});
  assert.deepEqual(joystickAxes(-60,0,60),{x:-1,z:0});
  assert.deepEqual(joystickAxes(0,60,60),{x:0,z:1});
  assert.deepEqual(joystickAxes(0,-60,60),{x:0,z:-1});
  const half=joystickAxes(30,0,60), diagonal=joystickAxes(100,-100,60);
  assert.ok(half.x>0 && half.x<.5);
  assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z)-1)<1e-12);
  assert.ok(diagonal.x>0 && diagonal.z<0);
});

test('same flight integrator preserves proportional speed and keyboard-equivalent altitude/warp',()=>{
  for(const warp of [false,true]) for(const key of ['KeyW','KeyS','KeyA','KeyD','Space','ControlLeft']) {
    const keys=new Set([key]), mobileKeys=new Set(['Space','ControlLeft'].includes(key)?[key]:[]);
    const axes={x:key==='KeyA'?-1:key==='KeyD'?1:0,z:key==='KeyW'?-1:key==='KeyS'?1:0};
    const desktop=new Vector3(), mobile=new Vector3(), rotation=new Quaternion();
    for(let i=0;i<120;i++) {
      updateFlightVelocity(desktop,rotation,keys,warp,1/120);
      updateFlightVelocity(mobile,rotation,mobileKeys,warp,1/120,axes);
    }
    assert.ok(desktop.distanceTo(mobile)<1e-10);
  }
  const full=new Vector3(), partial=new Vector3(), q=new Quaternion();
  updateFlightVelocity(full,q,new Set(),false,1,{x:1,z:0});
  updateFlightVelocity(partial,q,new Set(),false,1,{x:.25,z:0});
  assert.ok(Math.abs(partial.length()/full.length()-.25)<1e-12);
});

test('multitouch joystick/altitude/hold-warp reset on up, cancel, capture loss, UI, resize and visibility',()=>{
  const h=harness(), c=h.controls;
  const press=()=>{
    event(h.stick,'pointerdown',{pointerId:1,clientX:120});
    event(h.buttons[0],'pointerdown',{pointerId:2});
    event(h.buttons[2],'pointerdown',{pointerId:3});
    assert.equal(c.axes.x,1);assert.ok(c.keys.has('Space'));assert.ok(c.keys.has('ShiftLeft'));
  };
  for(const type of ['pointerup','pointercancel','lostpointercapture']) {
    press();event(h.stick,type,{pointerId:1});event(h.buttons[0],type,{pointerId:2});event(h.buttons[2],type,{pointerId:3});
    assert.deepEqual(c.axes,{x:0,z:0});assert.equal(c.keys.size,0);
  }
  for(const [target,type] of [[h.doc,'orbitfolio:ui'],[h.doc,'visibilitychange'],[h.host,'resize'],[h.host,'orientationchange'],[h.host,'blur']]) {
    press();event(target,type);assert.deepEqual(c.axes,{x:0,z:0});assert.equal(c.keys.size,0);assert.equal(c.pointers.size,0);
  }
  press();h.modal(true);c.refresh();assert.equal(h.root.hidden,true);assert.equal(c.keys.size,0);
  h.modal(false);c.refresh();assert.equal(h.root.hidden,false);assert.equal(c.keys.size,0);
  assert.deepEqual(h.counts(),{taps:0,locks:0});
  c.dispose();assert.equal(c.listeners.length,0);assert.equal(h.root.removed,true);
  event(h.stick,'pointerdown',{clientX:120});assert.equal(c.axes.x,0);
});

test('touch taps use the existing callback; drag, empty click and controls never request Pointer Lock',()=>{
  const h=harness();
  event(h.canvas,'pointerdown');event(h.canvas,'pointerup');assert.equal(h.counts().taps,1);
  event(h.canvas,'pointerdown');event(h.canvas,'pointermove',{clientX:90});event(h.canvas,'pointerup');
  assert.equal(h.counts().taps,1);
  event(h.canvas,'pointerdown');event(h.canvas,'pointercancel');event(h.canvas,'pointerup');assert.equal(h.counts().taps,1);
  event(h.canvas,'click');assert.equal(h.counts().locks,0);
  assert.deepEqual(h.controls.axes,{x:0,z:0});assert.equal(h.controls.navigation,false);
  const yaw=h.controls.yaw;event(h.doc,'mousemove',{movementX:100,movementY:100});assert.equal(h.controls.yaw,yaw);
  h.controls.dispose();event(h.canvas,'pointerdown');event(h.canvas,'pointerup');assert.equal(h.counts().taps,1);
});

test('touch hold feeds the same Warp depletion, exhaustion and recharge as Shift',()=>{
  const h=harness(), mobile=new Warp(), desktop=new Warp();
  event(h.buttons[2],'pointerdown');
  for(let i=0;i<1000;i++) {
    mobile.update(h.controls.keys.has('ShiftLeft'),.01);desktop.update(true,.01);
    assert.deepEqual(mobile,desktop);
  }
  event(h.buttons[2],'pointercancel');
  mobile.update(h.controls.keys.has('ShiftLeft'),.01);desktop.update(false,.01);
  assert.equal(mobile.active,false);assert.deepEqual(mobile,desktop);
  h.controls.dispose();
});

test('mobile remount removes old tap listeners and three-finger gestures are not taps',()=>{
  const h=harness();
  for(const pointerId of [1,2,3]) event(h.canvas,'pointerdown',{pointerId});
  for(const pointerId of [1,2,3]) event(h.canvas,'pointerup',{pointerId});
  assert.equal(h.counts().taps,0);
  h.controls.dispose();
  let taps=0;
  const next=new MobileFlightControls(h.canvas,{document:h.doc,host:h.host,onCanvasClick:()=>taps++});
  event(h.canvas,'pointerdown');event(h.canvas,'pointerup');
  assert.equal(taps,1);assert.equal(h.counts().taps,0);
  next.dispose();event(h.canvas,'pointerdown');event(h.canvas,'pointerup');assert.equal(taps,1);
});

test('canvas horizontal, vertical and diagonal drags control flight look, never raycast or thrust',()=>{
  for(const [dx,dy] of [[30,0],[0,30],[30,30]]) {
    const h=harness();
    event(h.canvas,'pointerdown');event(h.canvas,'pointermove',{clientX:60+dx,clientY:60+dy});
    assert.equal(h.controls.yaw!==0,dx!==0);assert.equal(h.controls.pitch!==0,dy!==0);
    event(h.canvas,'pointerup',{clientX:60+dx,clientY:60+dy});
    assert.equal(h.counts().taps,0);assert.equal(h.counts().locks,0);
    assert.deepEqual(h.controls.axes,{x:0,z:0});assert.equal(h.controls.keys.size,0);
    h.controls.dispose();
  }
});

test('touch pitch clamp equals desktop; taps tolerate small motion but drags returning to origin do not select',async()=>{
  const {MAX_PITCH}=await import('../src/three/flight-look.js');
  const h=harness();
  event(h.canvas,'pointerdown');event(h.canvas,'pointermove',{clientY:-100000});assert.equal(h.controls.pitch,MAX_PITCH);
  event(h.canvas,'pointermove',{clientY:100000});assert.equal(h.controls.pitch,-MAX_PITCH);
  event(h.canvas,'pointermove');event(h.canvas,'pointerup');assert.equal(h.counts().taps,0);
  const yaw=h.controls.yaw, pitch=h.controls.pitch;
  event(h.canvas,'pointerdown');event(h.canvas,'pointermove',{clientX:63});event(h.canvas,'pointerup',{clientX:63});
  assert.equal(h.counts().taps,1);assert.equal(h.controls.yaw,yaw);assert.equal(h.controls.pitch,pitch);
  h.controls.dispose();
});

test('independent camera, joystick and button pointers; cancelling look never releases other fingers',()=>{
  const h=harness();
  event(h.stick,'pointerdown',{pointerId:1,clientY:0});
  for(const [i,key] of [[0,'Space'],[1,'ControlLeft'],[2,'ShiftLeft']]) {
    event(h.buttons[i],'pointerdown',{pointerId:3});
    event(h.canvas,'pointerdown',{pointerId:2});event(h.canvas,'pointermove',{pointerId:2,clientX:100});
    assert.equal(h.controls.axes.z,-1);assert.ok(h.controls.keys.has(key));assert.notEqual(h.controls.yaw,0);
    event(h.canvas,'pointercancel',{pointerId:2});
    const yaw=h.controls.yaw;event(h.canvas,'pointermove',{pointerId:2,clientX:200});assert.equal(h.controls.yaw,yaw);
    assert.equal(h.controls.axes.z,-1);assert.ok(h.controls.keys.has(key));
    event(h.buttons[i],'pointerup',{pointerId:3});
  }
  const yaw=h.controls.yaw;
  event(h.stick,'pointermove',{pointerId:1,clientX:120});event(h.root,'pointermove',{clientX:300});
  assert.equal(h.controls.yaw,yaw);
  event(h.stick,'pointerup',{pointerId:1});h.controls.dispose();
});

test('UI, capture loss, visibility and unmount clear camera capture without phantom taps',()=>{
  for(const type of ['lostpointercapture','orbitfolio:ui','visibilitychange','dispose']) {
    const h=harness();event(h.canvas,'pointerdown');event(h.canvas,'pointermove',{clientX:100});
    if(type==='dispose')h.controls.dispose();
    else event(type==='lostpointercapture'?h.canvas:h.doc,type);
    assert.equal(h.controls.taps.size,0);assert.equal(h.canvas.captured.size,0);
    const yaw=h.controls.yaw;event(h.canvas,'pointermove',{clientX:200});event(h.canvas,'pointerup');
    assert.equal(h.controls.yaw,yaw);assert.equal(h.counts().taps,0);
    h.modal(true);event(h.canvas,'pointerdown');event(h.canvas,'pointermove',{clientX:200});assert.equal(h.controls.yaw,yaw);
    h.controls.dispose();
  }
});

test('shared mouse look calculation is numerically identical to the original desktop math',async()=>{
  const {applyLookDelta,MAX_PITCH,MOUSE_SENSITIVITY}=await import('../src/three/flight-look.js');
  assert.equal(MOUSE_SENSITIVITY,.0022);
  const actual={yaw:0,pitch:0}, expected={yaw:0,pitch:0};
  for(const [dx,dy] of [[100,40],[-500,100000],[10000,-100000],[-32,18]]) {
    expected.yaw-=dx*.0022;expected.yaw=Math.atan2(Math.sin(expected.yaw),Math.cos(expected.yaw));
    expected.pitch=Math.max(-MAX_PITCH,Math.min(MAX_PITCH,expected.pitch-dy*.0022));
    applyLookDelta(actual,dx,dy,MOUSE_SENSITIVITY);assert.deepEqual(actual,expected);
  }
});
