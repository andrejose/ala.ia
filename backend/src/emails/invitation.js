// E-mail que avisa a pessoa convidada. O convite em si fica no Ala.ia: o
// e-mail só conta quem convidou e leva para a tela de entrar ou criar conta.

const roleLabel = { owner: "dono", member: "membro" };

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Nomes vêm dos usuários: no assunto, uma linha só
const oneLine = (value) => String(value).replace(/\s+/g, " ").trim();

const formatDate = (iso) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

export function invitationEmail({ to, householdName, inviterName, role, expiresAt, appUrl }) {
  const inviter = oneLine(inviterName || "Alguém");
  const household = oneLine(householdName);
  const link = `${appUrl}/entrar`;
  const until = formatDate(expiresAt);
  const papel = roleLabel[role] ?? "membro";

  const subject = `${inviter} convidou você para o espaço "${household}" no Ala.ia`;

  const text = [
    "Olá!",
    "",
    `${inviter} convidou você para participar do espaço "${household}" no Ala.ia, como ${papel}.`,
    "Lá vocês acompanham juntos contas, lançamentos e orçamento.",
    "",
    `Para aceitar, entre no Ala.ia com este e-mail (${to}). Se ainda não tem conta, crie uma com ele:`,
    link,
    "",
    `O convite vale até ${until}. Se não esperava por ele, é só ignorar este e-mail.`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#faf6f0;font-family:Arial,Helvetica,sans-serif;color:#2b2622">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
    <p style="margin:0 0 16px;font-size:20px;font-weight:bold">Você recebeu um convite para o Ala.ia</p>
    <p style="margin:0 0 12px;line-height:1.5"><strong>${escapeHtml(inviter)}</strong> convidou você para participar do espaço <strong>${escapeHtml(household)}</strong>, como ${papel}. Lá vocês acompanham juntos contas, lançamentos e orçamento.</p>
    <p style="margin:0 0 20px;line-height:1.5">Para aceitar, entre no Ala.ia com este e-mail (${escapeHtml(to)}). Se ainda não tem conta, crie uma com ele.</p>
    <p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#6f4a32;color:#faf6f0;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">Abrir o Ala.ia</a></p>
    <p style="margin:0;font-size:13px;color:#6e655c;line-height:1.5">O convite vale até ${until}. Se não esperava por ele, é só ignorar este e-mail.</p>
  </div>
</body>
</html>`;

  return { to, subject, text, html };
}
