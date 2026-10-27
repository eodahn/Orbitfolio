import { escapeHtml as e } from "../utils/html.js";
export async function editAvatar(file, initial = {}) {
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
  )
    throw Error("Escolha PNG, JPG, WebP ou GIF.");
  if (file.size > 5 * 1024 * 1024)
    throw Error("A foto deve ter no máximo 5 MB.");
  document.exitPointerLock?.();
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file),
      dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog avatar-editor";
    dialog.setAttribute("aria-label", "Enquadrar foto");
    dialog.innerHTML = `<button class="button dialog-close" type="button" data-cancel aria-label="Cancelar foto">×</button><h2>Enquadrar foto</h2><p>Arraste a imagem ou ajuste os controles. GIFs mantêm a animação.</p><div class="avatar-crop" data-crop><img src="${e(url)}" alt="Prévia da foto" draggable="false"></div><label>Zoom<input data-zoom type="range" min="1" max="3" step="0.01"></label><label>Posição horizontal<input data-x type="range" min="0" max="100" step="1"></label><label>Posição vertical<input data-y type="range" min="0" max="100" step="1"></label><div class="actions"><button class="button" data-reset>Resetar enquadramento</button><button class="button" data-cancel>Cancelar</button><button class="button button-primary" data-confirm>Confirmar foto</button></div>`;
    const zoom = dialog.querySelector("[data-zoom]"),
      x = dialog.querySelector("[data-x]"),
      y = dialog.querySelector("[data-y]"),
      crop = dialog.querySelector("[data-crop]"),
      img = crop.querySelector("img");
    zoom.value = initial.zoom || 1;
    x.value = initial.offsetX ?? 50;
    y.value = initial.offsetY ?? 50;
    const update = () => {
      img.style.objectPosition = `${x.value}% ${y.value}%`;
      img.style.transform = `scale(${zoom.value})`;
      img.style.transformOrigin = `${x.value}% ${y.value}%`;
    };
    for (const input of [zoom, x, y]) input.oninput = update;
    let drag,
      result = null;
    crop.onpointerdown = (event) => {
      crop.setPointerCapture(event.pointerId);
      drag = {
        x: event.clientX,
        y: event.clientY,
        offsetX: +x.value,
        offsetY: +y.value,
      };
    };
    crop.onpointermove = (event) => {
      if (!drag) return;
      x.value = Math.max(
        0,
        Math.min(100, drag.offsetX - (event.clientX - drag.x) / 2),
      );
      y.value = Math.max(
        0,
        Math.min(100, drag.offsetY - (event.clientY - drag.y) / 2),
      );
      update();
    };
    crop.onpointerup = crop.onpointercancel = () => {
      drag = null;
    };
    dialog.querySelector("[data-reset]").onclick = () => {
      zoom.value = 1;
      x.value = y.value = 50;
      update();
    };
    for (const button of dialog.querySelectorAll("[data-cancel]"))
      button.onclick = () => dialog.close();
    dialog.querySelector("[data-confirm]").onclick = () => {
      result = {
        file,
        zoom: +zoom.value,
        offsetX: +x.value,
        offsetY: +y.value,
      };
      dialog.close();
    };
    img.onerror = () => {
      dialog.querySelector("[data-confirm]").disabled = true;
      img.alt = "Não foi possível abrir essa imagem.";
    };
    dialog.addEventListener(
      "close",
      () => {
        URL.revokeObjectURL(url);
        dialog.remove();
        resolve(result);
      },
      { once: true },
    );
    document.body.append(dialog);
    update();
    dialog.showModal();
  });
}
export function avatarFormData(draft) {
  const data = new FormData();
  data.append("avatar", draft.file);
  for (const key of ["zoom", "offsetX", "offsetY"])
    data.append(key, String(draft[key]));
  return data;
}
