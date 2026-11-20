const sidebar = document.querySelector("#sidebar");
const menu = document.querySelector("#menu");
const navigation = [...sidebar.querySelectorAll("nav a")];
const sections = navigation.map(link => document.querySelector(link.hash));
const dialog = document.querySelector("#search");
const query = document.querySelector("#query");
const results = document.querySelector("#results");

function toggleMenu(open) {
  sidebar.classList.toggle("open", open);
  menu.setAttribute("aria-expanded", String(open));
}
menu.addEventListener("click", () => toggleMenu(!sidebar.classList.contains("open")));
sidebar.addEventListener("click", event => {
  if (event.target.closest("a")) toggleMenu(false);
});
let frame;
function markSection() {
  frame = undefined;
  const active = sections.filter(section => section.getBoundingClientRect().top <= 110).at(-1) ?? sections[0];
  for (const link of navigation) {
    if (link.hash === "#" + active.id) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
}
window.addEventListener("scroll", () => { frame ??= requestAnimationFrame(markSection); }, { passive: true });
markSection();

function search() {
  const words = query.value.toLowerCase().trim().split(/\s+/);
  results.replaceChildren();
  for (const section of sections) {
    if (!words.every(word => section.textContent.toLowerCase().includes(word))) continue;
    const link = document.createElement("a");
    link.href = "#" + section.id;
    link.textContent = section.querySelector("h1, h2").textContent;
    link.addEventListener("click", () => {
      dialog.close();
      section.tabIndex = -1;
      section.focus();
    });
    const item = document.createElement("li");
    item.append(link);
    results.append(item);
  }
  if (!results.children.length) results.textContent = "No matching steps.";
}
function openSearch() {
  toggleMenu(false);
  query.value = "";
  search();
  dialog.showModal();
  query.focus();
}
document.querySelector("#search-open").addEventListener("click", openSearch);
query.addEventListener("input", search);
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (!dialog.open) openSearch();
  } else if (event.key === "Escape" && sidebar.classList.contains("open")) {
    toggleMenu(false);
    menu.focus();
  }
});

document.querySelector("#copy").addEventListener("click", async () => {
  const prompt = document.querySelector("#prompt");
  const status = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText(prompt.textContent);
    status.textContent = "Prompt copied.";
  } catch {
    prompt.closest("details").open = true;
    const range = document.createRange();
    range.selectNodeContents(prompt);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = "Prompt selected. Use your device’s copy command.";
  }
});
document.documentElement.classList.add("js");
