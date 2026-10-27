import { bindCharacterCounts } from "./character-count.js";
import { escapeHtml as e } from "../utils/html.js";
import { TECHNOLOGY_VISUALS, languageColor, normalizeLanguage } from '../../shared/technology-visuals.js';
export const LANGUAGES=Object.freeze([...Object.keys(TECHNOLOGY_VISUALS),'MATLAB','Objective-C','Groovy','Visual Basic','COBOL','Prolog','Lisp']);
export function chooseLanguage(existing = []) {
  return new Promise((resolve) => {
    const used = new Set(existing.map((name) => normalizeLanguage(name))),
      dialog = document.createElement("dialog");
    dialog.className = "language-picker confirm-dialog";
    dialog.setAttribute("aria-labelledby", "language-picker-title");
    dialog.innerHTML = `<button type="button" class="button dialog-close" data-dismiss aria-label="Fechar seleção de linguagem">×</button><h2 id="language-picker-title">Adicionar linguagem</h2><label>Pesquisar linguagem<input type="search" data-query autocomplete="off" placeholder="Digite para filtrar" autofocus></label><div class="language-options" aria-label="Linguagens disponíveis"></div><form data-custom hidden><label>Nome da linguagem<input name="language" maxlength="50" required autocomplete="off"></label><button class="button button-primary">Adicionar</button></form><p role="alert" data-error></p>`;
    let selected = null;
    const options = dialog.querySelector(".language-options"),
      custom = dialog.querySelector("[data-custom]");
    const accept = (name) => {
      name = name.trim();
      if (!name || name.length > 50 || name.toLowerCase() === "outra") {
        dialog.querySelector("[data-error]").textContent =
          "Informe o nome da linguagem, por exemplo Lua.";
        return;
      }
      if (used.has(normalizeLanguage(name))) {
        dialog.querySelector("[data-error]").textContent =
          "Essa linguagem já foi adicionada.";
        return;
      }
      selected = name;
      dialog.close();
    };
    const render = () => {
      const query = dialog
        .querySelector("[data-query]")
        .value.toLowerCase()
        .trim();
      options.innerHTML = [
        "Outra",
        ...LANGUAGES.filter((name) => name.toLowerCase().includes(query)),
      ]
        .map(
          (name) =>
            `<button type="button" style="border-left:4px solid ${languageColor(name)}" class="language-option ${used.has(normalizeLanguage(name)) ? "is-selected" : ""}" ${used.has(normalizeLanguage(name)) ? "disabled" : ""} data-language="${e(name)}">${e(name)}${used.has(normalizeLanguage(name)) ? " · adicionada" : ""}</button>`,
        )
        .join("");
    };
    options.onclick = (event) => {
      const button = event.target.closest("[data-language]");
      if (!button) return;
      if (button.dataset.language === "Outra") {
        custom.hidden = false;
        custom.querySelector("input").focus();
      } else accept(button.dataset.language);
    };
    options.onkeydown = (event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const buttons = [...options.querySelectorAll("button:not(:disabled)")],
        index = buttons.indexOf(document.activeElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length;
      event.preventDefault();
      buttons[next]?.focus();
    };
    dialog.querySelector("[data-query]").oninput = render;
    custom.onsubmit = (event) => {
      event.preventDefault();
      accept(custom.elements.language.value);
    };
    dialog.querySelector("[data-dismiss]").onclick = () => {
      dialog.close();
    };
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        resolve(selected);
      },
      { once: true },
    );
    document.body.append(dialog);
    render();
    document.exitPointerLock?.();
    bindCharacterCounts(dialog);
    dialog.showModal();
  });
}
