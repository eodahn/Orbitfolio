import { applyLookDelta, MOUSE_SENSITIVITY } from "./flight-look.js";
export { MOUSE_SENSITIVITY, MAX_PITCH } from "./flight-look.js";
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
    this.lockPending = null;
    this.unlockPending = false;
    this.disposed = false;
    this.keys = new Set();
    this.listeners = [];
    this.fallback = !canvas.requestPointerLock;
    this.fallbackNavigation = false;
    this.sensitivity = MOUSE_SENSITIVITY;
    this.listen(canvas, "click", event => {
      if (!canNavigate() || doc.querySelector?.('dialog[open],[role="dialog"]')) return;
      if (!onCanvasClick(event)) this.capture();
    });
    this.listen(doc, "pointerlockchange", () => this.syncPointerLock());
    this.listen(doc, "pointerlockerror", () => this.pointerLockError());
    this.listen(doc, "mousemove", (event) => {
      if (doc.pointerLockElement !== canvas || !this.navigation || this.blocked()) return;
      applyLookDelta(this, event.movementX, event.movementY, this.sensitivity);
    });
    this.listen(host, "keydown", (event) => {
      if (event.key === "Escape" || event.key === "Esc" || event.code === "Escape") {
        this.release();
        return;
      }
      if (!canNavigate() || this.blocked() || isTyping(event.target)) return;
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
  syncPointerLock() {
    const cancelled = this.lockPending?.cancelled;
    this.lockPending = null;
    this.unlockPending = false;
    this.fallbackNavigation = false;
    this.setNavigation(this.doc.pointerLockElement === this.canvas && this.canNavigate() && !this.disposed);
    if (this.doc.pointerLockElement === this.canvas &&
        (cancelled || this.disposed || !this.canNavigate() || this.doc.querySelector?.('dialog[open],[role="dialog"]')))
      this.release();
  }
  pointerLockError() {
    // A rejected request is temporary; only a missing API enables the fallback.
    this.syncPointerLock();
  }
  capture() {
    if (
      this.disposed || this.lockPending || this.unlockPending || this.doc.pointerLockElement ||
      !this.canNavigate() ||
      this.doc.querySelector?.('dialog[open],[role="dialog"]')
    )
      return;
    this.canvas.focus();
    if (this.fallback) {
      this.fallbackNavigation = true;
      return;
    }
    const attempt = { cancelled: false };
    this.lockPending = attempt;
    try {
      const request = this.canvas.requestPointerLock();
      request?.then?.(
        () => { if (this.lockPending === attempt) this.syncPointerLock(); },
        () => { if (this.lockPending === attempt) this.pointerLockError(); },
      );
    } catch {
      if (this.lockPending === attempt) this.pointerLockError();
    }
  }
  release() {
    if (this.lockPending) this.lockPending.cancelled = true;
    this.fallbackNavigation = false;
    this.keys.clear();
    if (this.doc.pointerLockElement === this.canvas) {
      if (this.unlockPending) return;
      this.unlockPending = true;
      try {
        this.doc.exitPointerLock?.();
      } catch {
        this.unlockPending = false;
      }
      // Do not announce an unlock while the browser still owns the pointer.
      if (this.doc.pointerLockElement === this.canvas) return;
    }
    this.unlockPending = false;
    this.setNavigation(false);
  }
  dispose() {
    this.disposed = true;
    this.release();
    this.lockPending = null;
    this.unlockPending = false;
    for (const remove of this.listeners) remove();
    this.listeners = [];
  }
}
