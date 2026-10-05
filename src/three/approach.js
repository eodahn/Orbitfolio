import { Vector3, Quaternion, Euler } from 'three';
import { WORLD } from '../../shared/world-config.js';
import { insideWorld } from './boundaries.js';
export function findSafeApproach(planet, planets, space) {
  const center=planet.userData.globalPosition;
  const clearance=planet.userData.visualRadius+WORLD.shipRadius+WORLD.safeApproachMargin;
  const directions=[new Vector3(0,0,1),new Vector3(0,0,-1),new Vector3(1,0,0),new Vector3(-1,0,0)];
  for(let i=0;i<96;i++) {
    const y=.95*(1-2*i/95),angle=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-y*y);
    directions.push(new Vector3(Math.cos(angle)*r,y,Math.sin(angle)*r));
  }
  const safe=(point,radius)=>insideWorld(point,radius) && !space?.overlaps?.(point,radius) && planets.every(p=>point.distanceTo(p.userData.globalPosition)>p.userData.visualRadius+radius+2);
  for(const extra of [0,12,24,48,96])for(const direction of directions) {
    const position=center.clone().addScaledVector(direction,clearance+extra);
    if(!insideWorld(position,WORLD.shipRadius+WORLD.cameraMargin))continue;
    const forward=direction.clone().negate();
    const rotation=new Euler(Math.asin(forward.y),Math.atan2(-forward.x,-forward.z),0,'YXZ');
    const quaternion=new Quaternion().setFromEuler(rotation);
    const camera=position.clone().add(new Vector3(0,4.3,12).applyQuaternion(quaternion));
    if(safe(position,WORLD.shipRadius)&&safe(camera,1))return{position,camera,rotation};
  }
  return null;
}
