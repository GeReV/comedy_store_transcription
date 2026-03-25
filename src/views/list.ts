const welcomeEl = document.createElement("p");
welcomeEl.className = "welcome-message";
welcomeEl.textContent = "חפש בתמלילים או בחר פרק מהרשימה";

export function renderWelcome(container: HTMLElement): void {
  container.replaceChildren(welcomeEl);
}
