export const MOUSE_SENSITIVITY = 0.0022;
export const MAX_PITCH = Math.PI * 0.44;

// Shared flight orientation math; input adapters supply deltas and sensitivity.
export function applyLookDelta(state, dx, dy, sensitivity) {
  state.yaw -= dx * sensitivity;
  state.yaw = Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw));
  state.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, state.pitch - dy * sensitivity));
}
