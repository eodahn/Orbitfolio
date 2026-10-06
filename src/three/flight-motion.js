import { Vector3 } from 'three';
import { NORMAL_SPEED, WARP_SPEED_MULTIPLIER } from './warp.js';
export const FLIGHT = Object.freeze({acceleration:5,drag:9,warpDrag:6,idleEpsilon:.025});
// Damp toward a normalized target velocity. Mouse changes orientation only.
export function updateFlightVelocity(velocity,quaternion,keys,warp,delta,axes) {
  const horizontal=new Vector3(axes ? axes.x : Number(keys.has('KeyD'))-Number(keys.has('KeyA')),0,axes ? axes.z : Number(keys.has('KeyS'))-Number(keys.has('KeyW'))).applyQuaternion(quaternion);
  horizontal.y+=Number(keys.has('Space'))-Number(keys.has('ControlLeft')||keys.has('ControlRight'));
  const moving=horizontal.lengthSq()>0;
  const maxSpeed=NORMAL_SPEED*(warp?WARP_SPEED_MULTIPLIER:1);
  // Preserve keyboard normalization exactly; touch retains submaximal magnitude.
  const intensity=axes ? Math.min(1,horizontal.length()) : 1;
  const target=horizontal.normalize().multiplyScalar(maxSpeed*intensity);
  const damping=moving?FLIGHT.acceleration:(warp?FLIGHT.warpDrag:FLIGHT.drag);
  velocity.lerp(target,1-Math.exp(-damping*delta));
  const speed = velocity.length();
  if (speed > maxSpeed) velocity.multiplyScalar(maxSpeed * (1 - 2 * Number.EPSILON) / speed);
  if(!moving&&velocity.lengthSq()<FLIGHT.idleEpsilon**2)velocity.set(0,0,0);
  return moving;
}
