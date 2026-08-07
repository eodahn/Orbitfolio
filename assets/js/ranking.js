import { getProjects, getUserById } from "./api.js";
import { openProjectPanel } from "./ui.js";
import { colorToCss } from "./utils.js";

const grid = document.getElementById("ranking-grid");

export async function renderRanking() {
  const projects = await getProjects();
  grid.innerHTML = "";

  for (const project of projects) {
    const author = await getUserById(project.authorId);
    const card = createRankingCard(project, author);
    grid.appendChild(card);
  }
}

function createRankingCard(project, author) {
  const card = document.createElement("div");
  card.className = "ranking-card";

  card.innerHTML = `
    <div class="ranking-planet" style="background:${colorToCss(project.color)}"></div>
    <h3>${project.name}</h3>
    <div class="ranking-author">
      <img src="${author.avatar}" />
      <span>${author.name}</span>
    </div>
    <div class="ranking-stats">
      <span>⭐ ${project.rating}</span>
      <span>❤ ${project.likes}</span>
    </div>
    <p>${project.description}</p>
  `;

  card.addEventListener("click", () => openProjectPanel(project));
  return card;
}
