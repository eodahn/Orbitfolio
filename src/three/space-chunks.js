import * as THREE from 'three';
import { insideWorld } from './boundaries.js';
import { asteroidContact, RockFragments } from './asteroid-impact.js';
import { hash, random } from '../utils/seed.js';
export const SPACE = Object.freeze({seed:'orbitfolio-space-v1',chunkSize:256,activeRadius:2,rebaseThreshold:2048,starsPerChunk:48,asteroidsPerChunk:7});
const smooth=t=>t*t*(3-2*t), mix=(a,b,t)=>a+(b-a)*t;
// Smooth lattice value noise: deterministic equivalent to Perlin for density fields.
export function densityNoise(x,y,z,seed=SPACE.seed) {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const fx=smooth(x-ix),fy=smooth(y-iy),fz=smooth(z-iz);
  const n=(a,b,c)=>hash(`${seed}:${ix+a},${iy+b},${iz+c}`)/4294967295;
  return mix(mix(mix(n(0,0,0),n(1,0,0),fx),mix(n(0,1,0),n(1,1,0),fx),fy),mix(mix(n(0,0,1),n(1,0,1),fx),mix(n(0,1,1),n(1,1,1),fx),fy),fz);
}
export function chunkCoordinates(position,size=SPACE.chunkSize) {
  return [position.x,position.y,position.z].map(value=>Math.floor(value/size));
}
export function generateChunk(x,y,z,config=SPACE) {
  const rng=random(hash(`${config.seed}:${x},${y},${z}`));
  const density=densityNoise(x*.23,y*.23,z*.23,config.seed);
  const stars=[],asteroids=[];
  for(let i=0,n=Math.floor(config.starsPerChunk*(.35+density));i<n;i++)
    stars.push([rng()*config.chunkSize,rng()*config.chunkSize,rng()*config.chunkSize]);
  for(let i=0,n=Math.floor(config.asteroidsPerChunk*Math.max(0,density-.35)*2);i<n;i++)
    asteroids.push({position:[rng()*config.chunkSize,rng()*config.chunkSize,rng()*config.chunkSize],rotation:[rng()*Math.PI,rng()*Math.PI,rng()*Math.PI],scale:.8+rng()*3.2});
  return {stars,asteroids};
}
export class FloatingOrigin {
  constructor(threshold=SPACE.rebaseThreshold) {this.offset=new THREE.Vector3();this.threshold=threshold;}
  globalToLocal(position,out=new THREE.Vector3()) {return out.copy(position).sub(this.offset);}
  localToGlobal(position,out=new THREE.Vector3()) {return out.copy(position).add(this.offset);}
  rebase(ship,objects=[],focus=null) {
    if(Math.max(Math.abs(ship.position.x),Math.abs(ship.position.y),Math.abs(ship.position.z))<this.threshold)return null;
    const shift=ship.position.clone();this.offset.add(shift);
    const unique=new Set([ship,...objects]);
    for(const object of unique)object.position.sub(shift);
    if(focus)for(const vector of new Set(['savedPosition','start','target'].map(key=>focus[key]).filter(Boolean)))vector.sub(shift);
    return shift;
  }
}
export class SpaceChunks {
  constructor(scene,options={}) {
    this.config={...SPACE,...options};this.scene=scene;this.chunks=new Map();
    this.destroyedAsteroidIds=new Set();
    this.rockGeometry=new THREE.IcosahedronGeometry(1,0);
    this.rockMaterial=new THREE.MeshStandardMaterial({color:'#77727e',roughness:.96,flatShading:true});
    this.starMaterial=new THREE.PointsMaterial({color:'#d9deef',size:.85,sizeAttenuation:true,transparent:true,opacity:.8});
    this.fragments = new RockFragments(scene,this.rockGeometry,this.rockMaterial);
    const rng = random(hash(`${this.config.seed}:distant-stars`)),positions=[];
    for(let i=0;i<2400;i++) {
      const y=rng()*2-1,angle=rng()*Math.PI*2,radius=850+rng()*300,ring=Math.sqrt(1-y*y);
      positions.push(Math.cos(angle)*ring*radius,y*radius,Math.sin(angle)*ring*radius);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    this.background=new THREE.Points(geometry,new THREE.PointsMaterial({color:'#b5c0dd',size:1.2,sizeAttenuation:false,fog:false,depthWrite:false}));
    this.background.frustumCulled=false;scene.add(this.background);

  }
  update(globalPosition,origin=new THREE.Vector3()) {
    const center=chunkCoordinates(globalPosition,this.config.chunkSize),r=this.config.activeRadius,needed=new Set();
    const stamp = `${center}:${origin.x},${origin.y},${origin.z}`;
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    for(let x=center[0]-r;x<=center[0]+r;x++)for(let y=center[1]-r;y<=center[1]+r;y++)for(let z=center[2]-r;z<=center[2]+r;z++)needed.add(`${x},${y},${z}`);
    // Unload first: the collection never temporarily grows beyond its active budget.
    for(const [key,chunk] of this.chunks)if(!needed.has(key)){this.unload(chunk);this.chunks.delete(key);}
    for(const key of needed){
      let chunk=this.chunks.get(key);
      if(!chunk){const coords=key.split(',').map(Number);chunk=this.load(coords);this.chunks.set(key,chunk);}
      chunk.group.position.copy(chunk.globalPosition).sub(origin);
    }
  }
  load(coords) {
    const data=generateChunk(...coords,this.config),group=new THREE.Group();
    const globalPosition=new THREE.Vector3(...coords).multiplyScalar(this.config.chunkSize);
    const colliders=[];
    data.asteroids=data.asteroids.map((item,index)=>({...item,id:`${coords.join(',')}:${index}`,globalPosition:new THREE.Vector3(...item.position).add(globalPosition)}))
      .filter(item=>insideWorld(item.globalPosition,item.scale) && !this.destroyedAsteroidIds.has(item.id));
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.stars.flat(),3));
    group.add(new THREE.Points(geometry,this.starMaterial));
    let rocks;
    if(data.asteroids.length){
      rocks=new THREE.InstancedMesh(this.rockGeometry,this.rockMaterial,data.asteroids.length);
      const transform=new THREE.Object3D();
      data.asteroids.forEach((item,i)=>{transform.position.set(...item.position);transform.rotation.set(...item.rotation);transform.scale.setScalar(item.scale);transform.updateMatrix();rocks.setMatrixAt(i,transform.matrix);colliders.push({...item,index:i,radius:item.scale,active:true});});
      rocks.instanceMatrix.needsUpdate=true;rocks.computeBoundingSphere();group.add(rocks);
    }
    this.scene.add(group);
    return {group,geometry,rocks,colliders,globalPosition};
  }
  animate(delta,camera,origin) {
    this.background.position.copy(camera.position);
    this.fragments.update(delta,origin);
  }
  collide(ship,origin) {
    const global=ship.position.clone().add(origin),center=chunkCoordinates(global,this.config.chunkSize);
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++) {
      const chunk=this.chunks.get(`${center[0]+x},${center[1]+y},${center[2]+z}`);
      if(!chunk)continue;
      for(const rock of chunk.colliders) {
        if(!rock.active)continue;
        const impact=asteroidContact(ship,rock.globalPosition.clone().sub(origin),rock.radius);
        if(impact?.destroy) {
          rock.active=false;this.destroyedAsteroidIds.add(rock.id);
          chunk.rocks.setMatrixAt(rock.index,new THREE.Matrix4().makeScale(0,0,0));
          chunk.rocks.instanceMatrix.needsUpdate=true;
          this.fragments.burst(rock.id,rock.globalPosition,rock.radius);
        }
      }
    }
  }
  overlaps(global,radius) {
    // Used for safe teleports. Generate only the destination neighborhood, without allocating GPU objects.
    const center=chunkCoordinates(global,this.config.chunkSize);
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++) {
      const coords=[center[0]+x,center[1]+y,center[2]+z],offset=new THREE.Vector3(...coords).multiplyScalar(this.config.chunkSize);
      const data=generateChunk(...coords,this.config);
      if(data.asteroids.some((rock,index)=> {
        const point=new THREE.Vector3(...rock.position).add(offset);
        return !this.destroyedAsteroidIds.has(`${coords.join(',')}:${index}`) && insideWorld(point,rock.scale) && point.distanceTo(global)<rock.scale+radius;
      }))return true;
    }
    return false;
  }
  unload(chunk) {this.scene.remove(chunk.group);chunk.geometry.dispose();chunk.rocks?.dispose();chunk.group.clear();}
  dispose() {this.fragments.dispose();this.scene.remove(this.background);this.background.geometry.dispose();this.background.material.dispose();this.destroyedAsteroidIds.clear();for(const chunk of this.chunks.values())this.unload(chunk);this.chunks.clear();this.rockGeometry.dispose();this.rockMaterial.dispose();this.starMaterial.dispose();}
}
