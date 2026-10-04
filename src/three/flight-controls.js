export const MOUSE_SENSITIVITY = 0.0022;
export const MAX_PITCH = Math.PI * 0.44;
export const PLANET_INTERACTION_DISTANCE = 65;
const movementKeys = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
]);
export function isTyping(target) {
  return !!target?.closest?.(
    'input,textarea,select,[contenteditable]:not([contenteditable="false"])',
  );
}
export class FlightControls {
  constructor(
    canvas,
    {
      canNavigate = () => true,
      onMode = () => {},
      onInteract = () => {},
      onMove = () => {},
      onCanvasClick = () => false,
      document: doc = globalThis.document,
      host = globalThis.window,
    } = {},
  ) {
    Object.assign(this, {
      canvas,
      doc,
      host,
      canNavigate,
      onMode,
      onInteract,
      onMove,
      yaw: 0,
      pitch: 0,
      navigation: false,
    });
    this.keys = new Set();
    this.listeners = [];
    this.fallback = !canvas.requestPointerLock;
    this.fallbackNavigation = false;
    this.sensitivity = MOUSE_SENSITIVITY;
    this.listen(canvas, "click", event => {
      if (!canNavigate() || doc.querySelector?.('dialog[open],[role="dialog"]')) return;
      if (!onCanvasClick(event)) this.capture();
    });
    this.listen(doc, "pointerlockchange", () =>
      this.setNavigation(doc.pointerLockElement === canvas && canNavigate()),
    );
    this.listen(doc, "pointerlockerror", () => {
      this.fallback = true;
      this.release();
    });
    this.listen(doc, "mousemove", (event) => {
      if (!this.navigation || this.blocked()) return;
      this.yaw -= event.movementX * this.sensitivity;
      this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
      this.pitch = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, this.pitch - event.movementY * this.sensitivity),
      );
    });
    this.listen(host, "keydown", (event) => {
      if (!canNavigate() || this.blocked() || isTyping(event.target)) return;
      if (event.code === "Escape") {
        this.release();
        return;
      }
      if (event.code === "KeyE" && this.navigation && !event.repeat) {
        event.preventDefault();
        this.onInteract();
        return;
      }
      if (!this.navigation && !this.fallbackNavigation) return;
      if (movementKeys.has(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
        this.onMove();
      }
    });
    this.listen(host, "keyup", (event) => this.keys.delete(event.code));
    this.listen(host, "blur", () => this.release());
    this.listen(doc, "focusin", () => {
      if (this.blocked()) this.release();
    });
    this.listen(doc, "orbitfolio:ui", () => this.release());
  }
  listen(target, type, listener) {
    target.addEventListener(type, listener);
    this.listeners.push(() => target.removeEventListener(type, listener));
  }
  blocked() {
    return (
      isTyping(this.doc.activeElement) ||
      !!this.doc.querySelector?.('dialog[open],[role="dialog"]') ||
      !!this.doc.activeElement?.closest?.("button,a")
    );
  }
  setNavigation(active) {
    this.navigation = active;
    this.keys.clear();
    this.onMode(active);
  }
  capture() {
    if (
      !this.canNavigate() ||
      this.doc.querySelector?.('dialog[open],[role="dialog"]')
    )
      return;
    this.canvas.focus();
    if (this.fallback) {
      this.fallbackNavigation = true;
      return;
    }
    try {
      const request = this.canvas.requestPointerLock();
      request?.catch?.(() => {
        this.fallback = true;
        this.release();
      });
    } catch {
      this.fallback = true;
      this.release();
    }
  }
  release() {
    this.fallbackNavigation = false;
    this.setNavigation(false);
    if (this.doc.pointerLockElement === this.canvas)
      this.doc.exitPointerLock?.();
  }
  dispose() {
    this.release();
    for (const remove of this.listeners) remove();
    this.listeners = [];
  }
}
