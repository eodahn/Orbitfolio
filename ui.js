import { getUserById } from "./api.js";
import { formatDate } from "./utils.js";

const indicator = document.getElementById("interaction-indicator");
const panel = document.getElementById("planet-panel");
const panelClose = document.getElementById("panel-close");

const panelCategory = document.getElementById("panel-category");
const panelTitle = document.getElementById("panel-title");
const panelAuthorAvatar = document.getElementById("panel-author-avatar");
const panelAuthorName = document.getElementById("panel-author-name");
const panelLikes = document.getElementById("panel-likes");
const panelRating = document.getElementById("panel-rating");
const panelViews = document.getElementById("panel-views");
const panelDate = document.getElementById("panel-date");
const panelDescription = document.getElementById("panel-description");
const panelTech = document.getElementById("panel-tech");
const panelImages = document.getElementById("panel-images");
const panelGithub = document.getElementById("panel-github");
const panelDemo = document.getElementById("panel-demo");

export function setupUI() {
  panelClose.addEventListener("click", hidePlanetPanel);
}

export function showInteractionIndicator() {
  indicator.classList.remove("hidden");
}

export function hideInteractionIndicator() {
  indicator.classList.add("hidden");
}

export async function openProjectPanel(project) {
  const author = await getUserById(project.authorId);
  showPlanetPanel(project, author);
}

function showPlanetPanel(project, author) {
  panelCategory.textContent = project.category;
  panelTitle.textContent = project.name;

  panelAuthorAvatar.src = author.avatar;
  panelAuthorName.textContent = author.name;

  panelLikes.textContent = `❤ ${project.likes}`;
  panelRating.textContent = `⭐ ${project.rating}`;
  panelViews.textContent = `👁 ${project.views}`;
  panelDate.textContent = formatDate(project.publishedAt);

  panelDescription.textContent = project.description;

  panelTech.innerHTML = "";
  project.technologies.forEach((tech) => {
    const tag = document.createElement("span");
    tag.textContent = tech;
    panelTech.appendChild(tag);
  });

  panelImages.innerHTML = "";
  project.images.forEach((src) => {
    const img = document.createElement("img");
    img.src = src;
    panelImages.appendChild(img);
  });

  panelGithub.href = project.github;
  panelDemo.href = project.demo;

  panel.classList.remove("hidden");
}

export function hidePlanetPanel() {
  panel.classList.add("hidden");
}
