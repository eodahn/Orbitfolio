import { getUsers, getProjects } from "./api.js";
import { openProjectPanel } from "./ui.js";

const usersList = document.getElementById("social-users-list");
const profileView = document.getElementById("social-profile");
const myProfileButton = document.getElementById("social-my-profile");

const currentUserId = "u1";
const followedIds = new Set();

export async function setupSocialPage() {
  const users = await getUsers();

  usersList.innerHTML = "";
  users.forEach((user) => {
    const item = document.createElement("div");
    item.className = "social-user-item";
    item.innerHTML = `
      <img src="${user.avatar}" />
      <div>
        <h4>${user.name}</h4>
        <p>${user.bio}</p>
      </div>
    `;
    item.addEventListener("click", () => showProfile(user));
    usersList.appendChild(item);
  });

  myProfileButton.addEventListener("click", () => {
    const me = users.find((user) => user.id === currentUserId);
    showProfile(me);
  });

  if (users.length > 0) showProfile(users[0]);
}

async function showProfile(user) {
  const allProjects = await getProjects();
  const userProjects = allProjects.filter((project) => project.authorId === user.id);
  const isFollowing = followedIds.has(user.id);
  const isMe = user.id === currentUserId;

  profileView.innerHTML = `
    <img class="profile-avatar" src="${user.avatar}" />
    <h2>${user.name}</h2>
    <p class="profile-bio">${user.bio}</p>
    ${isMe ? "" : `<button id="follow-button">${isFollowing ? "Deixar de seguir" : "Seguir"}</button>`}
    <h3>Projetos publicados</h3>
    <div class="profile-projects">
      ${userProjects
        .map((project) => `<span class="profile-project-tag" data-id="${project.id}">${project.name}</span>`)
        .join("")}
    </div>
  `;

  if (!isMe) {
    document.getElementById("follow-button").addEventListener("click", () => {
      toggleFollow(user);
    });
  }

  profileView.querySelectorAll(".profile-project-tag").forEach((tag) => {
    tag.addEventListener("click", () => {
      const project = userProjects.find((p) => p.id === tag.dataset.id);
      openProjectPanel(project);
    });
  });
}

function toggleFollow(user) {
  if (followedIds.has(user.id)) {
    followedIds.delete(user.id);
  } else {
    followedIds.add(user.id);
  }
  showProfile(user);
}
