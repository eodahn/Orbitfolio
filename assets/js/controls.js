const inputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  up: false,
  down: false,
};

function handleKeyDown(event) {
  if (event.key === "w") inputState.forward = true;
  if (event.key === "s") inputState.backward = true;
  if (event.key === "a") inputState.left = true;
  if (event.key === "d") inputState.right = true;
  if (event.code === "Space") {
    inputState.up = true;
    event.preventDefault();
  }
  if (event.code === "ShiftLeft") inputState.down = true;
}

function handleKeyUp(event) {
  if (event.key === "w") inputState.forward = false;
  if (event.key === "s") inputState.backward = false;
  if (event.key === "a") inputState.left = false;
  if (event.key === "d") inputState.right = false;
  if (event.code === "Space") inputState.up = false;
  if (event.code === "ShiftLeft") inputState.down = false;
}

export function createControls() {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
}

export function getInputState() {
  return inputState;
}
