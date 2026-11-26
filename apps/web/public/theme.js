// Aplica o tema salvo antes de pintar a página, para não piscar claro/escuro.
try {
  const t = localStorage.getItem("miu-theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch {}
