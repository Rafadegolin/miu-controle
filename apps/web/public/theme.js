// Aplica tema e modo privacidade salvos antes de pintar a página (sem piscar).
try {
  const t = localStorage.getItem("miu-theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  if (localStorage.getItem("miu-privacy") === "on")
    document.documentElement.setAttribute("data-privacy", "on");
} catch {}
