export const NORMAL_SPEED = 30;
export const WARP_SPEED_MULTIPLIER = 3;
export const WARP_DRAIN_RATE = 20;
export const WARP_RECHARGE_RATE = 12;
export const WARP_MIN_ENERGY = 20;
export class Warp {
  energy = 100;
  active = false;
  exhausted = false;
  update(held, delta) {
    if (this.exhausted && this.energy >= WARP_MIN_ENERGY) this.exhausted = false;
    this.active = held && !this.exhausted && this.energy > 0;
    this.energy = Math.max(0, Math.min(100, this.energy +
      (this.active ? -WARP_DRAIN_RATE : WARP_RECHARGE_RATE) * delta));
    if (this.energy === 0) { this.active = false; this.exhausted = true; }
    return this.active;
  }
}
