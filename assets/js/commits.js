import { getProjects, getCommitsByProject } from "./api.js";

const projectSelect = document.getElementById("commits-project-select");
const timeline = document.getElementById("commits-timeline");
const commitPanel = document.getElementById("commit-panel");
const commitPanelClose = document.getElementById("commit-panel-close");

export async function setupCommitsPage() {
  const projects = await getProjects();

  projectSelect.innerHTML = "";
  projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    projectSelect.appendChild(option);
  });

  projectSelect.addEventListener("change", () => {
    loadCommits(projectSelect.value);
  });

  commitPanelClose.addEventListener("click", () => {
    commitPanel.classList.add("hidden");
  });

  if (projects.length > 0) loadCommits(projects[0].id);
}

async function loadCommits(projectId) {
  const commits = await getCommitsByProject(projectId);
  timeline.innerHTML = "";

  commits.forEach((commit) => {
    const node = document.createElement("div");
    node.className = "commit-node";
    node.innerHTML = `
      <span class="commit-dot"></span>
      <span class="commit-version">${commit.version}</span>
    `;
    node.addEventListener("click", () => showCommitDetails(commit));
    timeline.appendChild(node);
  });
}

function showCommitDetails(commit) {
  document.getElementById("commit-version").textContent = commit.version;
  document.getElementById("commit-date").textContent = commit.date;
  document.getElementById("commit-description").textContent = commit.description;
  document.getElementById("commit-tech").textContent = commit.technologies.join(", ");
  commitPanel.classList.remove("hidden");
}
