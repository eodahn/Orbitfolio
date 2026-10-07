import { applyLookDelta } from './flight-look.js';
import { isTyping } from './flight-controls.js';
export const TOUCH_LOOK_SENSITIVITY = .004; // radians per CSS pixel, independent of desktop
export const TOUCH_DRAG_THRESHOLD = 10;

export function joystickAxes(dx, dy, radius, deadzone = .12) {
  const distance = Math.hypot(dx, dy), amount = Math.min(1, distance / Math.max(1, radius));
  if (amount <= deadzone) return { x: 0, z: 0 };
  const strength = (amount - deadzone) / (1 - deadzone);
  return { x: dx / distance * strength, z: dy / distance * strength };
}

/** Touch input adapter only. Physics, camera follow and Warp remain in Universe. */
export class MobileFlightControls {
  constructor(canvas, { canNavigate = () => true, onCanvasClick = () => false, onMove = () => {},
    document: doc = globalThis.document, host = globalThis.window } = {}) {
    Object.assign(this, { canvas, doc, host, canNavigate, onCanvasClick, onMove });
    this.keys = new Set();
    this.axes = { x: 0, z: 0 };
    this.navigation = false;
    this.yaw = this.pitch = 0;
    this.listeners = [];
    this.pointers = new Map();
    this.taps = new Map();
    this.canvasPointers = new Set();
    this.disposed = false;
    this.root = doc.createElement('section');
    this.root.className = 'touch-controls';
    this.root.setAttribute('aria-label', 'Controles de voo touch');
    this.root.innerHTML = `<div class="touch-buttons"><button type="button" data-flight-key="Space" aria-label="Subir" aria-pressed="false">↑ Subir</button><button type="button" data-flight-key="ControlLeft" aria-label="Descer" aria-pressed="false">↓ Descer</button><button type="button" data-flight-key="ShiftLeft" aria-label="Segurar Dobra Espacial" aria-pressed="false">⚡ Dobra<small>Segure</small></button></div><div class="touch-stick" role="group" aria-label="Analógico de movimento: arraste para mover a nave"><span class="touch-stick-knob"></span></div>`;
    canvas.parentElement.append(this.root);
    this.stick = this.root.querySelector('.touch-stick');
    this.knob = this.root.querySelector('.touch-stick-knob');
    // Controls are siblings of the canvas. No pointer or compatibility click bubbles out.
    for (const type of ['pointerdown','pointermove','pointerup','pointercancel','click','contextmenu'])
      this.listen(this.root, type, event => { event.preventDefault(); event.stopPropagation(); });
    this.bindControl(this.stick);
    for (const button of this.root.querySelectorAll('[data-flight-key]')) this.bindControl(button, button.dataset.flightKey);
    this.listen(canvas, 'pointerdown', event => {
      if (this.blocked() || event.button !== 0) return;
      this.canvasPointers.add(event.pointerId);
      // One camera finger; additional canvas fingers suppress taps, never zoom.
      if (this.canvasPointers.size > 1) {
        for (const gesture of this.taps.values()) gesture.tapEligible = false;
        return;
      }
      this.taps.set(event.pointerId, { x:event.clientX, y:event.clientY,
        lastX:event.clientX, lastY:event.clientY, time:event.timeStamp, dragging:false, tapEligible:true });
      canvas.setPointerCapture(event.pointerId);
    });
    this.listen(canvas, 'pointermove', event => {
      const gesture = this.taps.get(event.pointerId);
      if (!gesture) return;
      if (this.blocked()) { this.endCameraPointer(event.pointerId); return; }
      if (!gesture.dragging && Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>TOUCH_DRAG_THRESHOLD)
        gesture.dragging = true;
      if (gesture.dragging) {
        applyLookDelta(this, event.clientX-gesture.lastX, event.clientY-gesture.lastY, TOUCH_LOOK_SENSITIVITY);
        event.preventDefault();
      }
      gesture.lastX=event.clientX; gesture.lastY=event.clientY;
    });
    this.listen(canvas, 'pointerup', event => {
      const gesture = this.taps.get(event.pointerId);
      this.endCameraPointer(event.pointerId);
      if (gesture && gesture.tapEligible && !gesture.dragging && !this.blocked() &&
          event.timeStamp-gesture.time<=450 && Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<=TOUCH_DRAG_THRESHOLD)
        this.onCanvasClick(event);
    });
    for (const type of ['pointercancel','lostpointercapture'])
      this.listen(canvas, type, event => this.endCameraPointer(event.pointerId));
    this.listen(canvas, 'pointerleave', event => {
      if (!canvas.hasPointerCapture(event.pointerId)) this.endCameraPointer(event.pointerId);
    });
    this.listen(doc, 'orbitfolio:ui', () => this.release());
    this.listen(doc, 'visibilitychange', () => this.release());
    for (const type of ['blur','resize','orientationchange']) this.listen(host, type, () => this.release());
    this.listen(doc, 'focusin', () => { if (this.blocked()) this.release(); });
    this.refresh();
  }
  listen(target, type, handler) {
    target.addEventListener(type, handler);
    this.listeners.push(() => target.removeEventListener(type, handler));
  }
  blocked() {
    return this.disposed || !this.canNavigate() || this.doc.hidden || isTyping(this.doc.activeElement) ||
      !!this.doc.querySelector('dialog[open],[role="dialog"]');
  }
  refresh() {
    const blocked = !!this.blocked();
    this.root.hidden = blocked;
    if (blocked) this.release();
  }
  bindControl(element, key) {
    this.listen(element, 'pointerdown', event => {
      if (this.blocked() || event.button !== 0 || [...this.pointers.values()].some(p => p.element === element)) return;
      this.pointers.set(event.pointerId, {element,key});
      element.setPointerCapture(event.pointerId);
      element.classList.add('is-pressed');
      if (key) { this.keys.add(key); element.setAttribute('aria-pressed','true'); this.onMove(); }
      else this.moveStick(event);
    });
    this.listen(element, 'pointermove', event => {
      if (!key && this.pointers.get(event.pointerId)?.element === element) this.moveStick(event);
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture'])
      this.listen(element, type, event => this.endPointer(event.pointerId));
  }
  moveStick(event) {
    const rect = this.stick.getBoundingClientRect(), radius = Math.min(rect.width,rect.height)/2;
    Object.assign(this.axes, joystickAxes(event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2,radius));
    this.knob.style.transform = `translate(${this.axes.x*radius*.6}px, ${this.axes.z*radius*.6}px)`;
    if (this.axes.x || this.axes.z) this.onMove();
  }
  endPointer(id) {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    this.pointers.delete(id);
    const {element,key} = pointer;
    if (key) { this.keys.delete(key); element.setAttribute('aria-pressed','false'); }
    else { this.axes.x=this.axes.z=0; this.knob.style.transform='translate(0px, 0px)'; }
    element.classList.remove('is-pressed');
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
  }
  endCameraPointer(id) {
    this.taps.delete(id);
    this.canvasPointers.delete(id);
    if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }
  release() {
    for (const id of [...this.pointers.keys()]) this.endPointer(id);
    this.axes.x=this.axes.z=0;
    this.keys.clear();
    for (const id of [...this.canvasPointers]) this.endCameraPointer(id);
  }
  dispose() {
    this.disposed = true;
    this.release();
    for (const remove of this.listeners) remove();
    this.listeners=[];
    this.root.remove();
  }
}
