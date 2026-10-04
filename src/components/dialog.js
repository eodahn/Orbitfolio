import { goHome } from "../router/router.js";
import { escapeHtml as e } from "../utils/html.js";
export function confirmDelete(name) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog";
    dialog.innerHTML = `<form method="dialog"><button class="dialog-close button" value="cancel" aria-label="Fechar confirmação">×</button><p class="eyebrow">GERENCIAR PLANETA</p><h2>Excluir projeto?</h2><p>Tem certeza de que deseja excluir <strong>${e(name)}</strong>? Esta ação removerá o projeto e seu planeta do Orbitfolio.</p><div class="actions"><button class="button" value="cancel" autofocus>Cancelar</button><button class="button button-danger" value="delete">Excluir projeto</button></div></form>`;
    document.body.append(dialog);
    dialog.addEventListener(
      "close",
      () => {
        const accepted = dialog.returnValue === "delete";
        dialog.remove();
        resolve(accepted);
      },
      { once: true },
    );
    dialog.querySelector(".dialog-close").onclick = (event) => {
      event.preventDefault();
      dialog.close("cancel");
      goHome();
    };
    document.dispatchEvent(new Event("orbitfolio:ui"));
    document.exitPointerLock?.();
    dialog.showModal();
  });
}
