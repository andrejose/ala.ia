// Aplica o tema salvo antes de desenhar a página, para não piscar.
// Fica num arquivo (e não inline no index.html) para a política de segurança
// do servidor (CSP) poder bloquear qualquer script inline.
try {
  var t = localStorage.getItem("ala.theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) {}
