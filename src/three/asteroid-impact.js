import * as THREE from 'three';
import { hash, random } from '../utils/seed.js';
export const ASTEROIDS = Object.freeze({breakSpeed:55,restitution:.15,fragmentLifetime:1,maxBursts:24,fragmentsPerBurst:12});
/** Returns impact speed along the contact normal, not the Shift key state. */
export function asteroidContact(ship, center, radius) {
  const normal = ship.position.clone().sub(center), distance = normal.length();
  const contactRadius = ship.userData.radius + radius;
  if (distance >= contactRadius) return null;
  if (distance < 1e-8) normal.copy(ship.userData.velocity).negate().normalize();
  else normal.divideScalar(distance);
  if (!normal.lengthSq()) normal.set(1,0,0);
  const impactSpeed = Math.max(0,-ship.userData.velocity.dot(normal));
  if (impactSpeed < ASTEROIDS.breakSpeed) {
    ship.position.copy(center).addScaledVector(normal,contactRadius+.01);
    ship.userData.velocity.addScaledVector(normal,impactSpeed*(1+ASTEROIDS.restitution));
    ship.userData.velocity.multiplyScalar(.85);
  }
  return {impactSpeed,destroy:impactSpeed>=ASTEROIDS.breakSpeed};
}
/** One fixed GPU allocation, finite burst slots; expired particles leave the update loop. */
export class RockFragments {
  constructor(scene, geometry, material) {
    this.mesh = new THREE.InstancedMesh(geometry,material,ASTEROIDS.maxBursts*ASTEROIDS.fragmentsPerBurst);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.slots = new Map(); this.next = 0; this.transform = new THREE.Object3D();
    this.transform.scale.setScalar(0);this.transform.updateMatrix();
    for(let i=0;i<this.mesh.count;i++)this.mesh.setMatrixAt(i,this.transform.matrix);
    scene.add(this.mesh);this.scene=scene;
  }
  burst(id,position,radius) {
    const rng=random(hash(id)),slot=this.next++ % ASTEROIDS.maxBursts;
    this.slots.set(slot,{age:0,particles:Array.from({length:ASTEROIDS.fragmentsPerBurst},()=>({position:position.clone(),velocity:new THREE.Vector3(rng()-.5,rng()-.5,rng()-.5).normalize().multiplyScalar(8+rng()*12),size:radius*(.12+rng()*.15)}))});
    this.mesh.visible=true;
  }
  update(delta,origin) {
    if (!this.slots.size) return;
    for(const [slot,burst] of this.slots) {
      burst.age+=delta;
      const life=Math.max(0,1-burst.age/ASTEROIDS.fragmentLifetime);
      burst.particles.forEach((p,i)=>{
        const drag=Math.exp(-4*delta);
        p.position.addScaledVector(p.velocity,(1-drag)/4);p.velocity.multiplyScalar(drag);
        this.transform.position.copy(p.position).sub(origin);this.transform.scale.setScalar(p.size*life);
        this.transform.updateMatrix();this.mesh.setMatrixAt(slot*ASTEROIDS.fragmentsPerBurst+i,this.transform.matrix);
      });
      if (!life) this.slots.delete(slot);
    }
    this.mesh.instanceMatrix.needsUpdate=true;this.mesh.visible=!!this.slots.size;
  }
  dispose(){this.scene.remove(this.mesh);this.mesh.dispose();this.slots.clear();}
}
