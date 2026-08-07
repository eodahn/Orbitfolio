import { users, projects, commitsByProject } from "./database.js";

export async function getProjects() {
  return projects;
}

export async function getProjectById(id) {
  return projects.find((project) => project.id === id);
}

export async function getUsers() {
  return users;
}

export async function getUserById(id) {
  return users.find((user) => user.id === id);
}

export async function getCommitsByProject(projectId) {
  return commitsByProject[projectId] || [];
}
