const TOUCH_QUERY = '(pointer: coarse) and (hover: none)';
export function isTouchMode(host = globalThis.window, nav = globalThis.navigator) {
  return !!(host?.PointerEvent && nav?.maxTouchPoints > 0 && host.matchMedia?.(TOUCH_QUERY).matches);
}
export function watchTouchMode(callback, host = globalThis.window, nav = globalThis.navigator) {
  const query = host.matchMedia(TOUCH_QUERY);
  const update = () => callback(isTouchMode(host, nav));
  query.addEventListener('change', update);
  update();
  return () => query.removeEventListener('change', update);
}
