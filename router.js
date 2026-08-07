const pages = document.querySelectorAll(".page");
const navButtons = document.querySelectorAll("[data-page]");

export function setupRouter() {
  navButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      goToPage(button.dataset.page);
    });
  });
}

export function goToPage(pageId) {
  pages.forEach((page) => {
    page.classList.toggle("active", page.id === `page-${pageId}`);
  });
}
