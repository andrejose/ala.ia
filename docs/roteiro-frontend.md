# Roteiro de implementação do frontend

Documento vivo do frontend do Ala.ia. O frontend não é o objetivo da disciplina:
é um complemento para usar a API no dia a dia.

## Decisões

| Tema | Decisão |
| :--- | :--- |
| Stack | React + Vite + TypeScript, Tailwind CSS, TanStack Query (dados), React Router (rotas), Recharts (gráficos), Lucide (ícones) |
| Local | Pasta `frontend/`, ao lado de `backend/` |
| Dispositivo | Celular primeiro, funcionando bem no computador |
| Idioma e formatos | Português do Brasil; valores em R$ (`1.234,56`); datas `dd/mm/aaaa` |
| Visual | Humano e acolhedor; tema claro e escuro (segue o sistema, com alternância manual) |
| Sessão | `access_token` em memória; `refresh_token` no `localStorage`; renovação automática ao expirar |
| Comunicação com a API | Proxy do Vite em desenvolvimento (`/api` → `http://localhost:3001`), sem CORS. Para publicar, adicionar CORS no backend |
| Testes | Ficam para depois (Vitest + Testing Library nos componentes principais) |
| Publicação | Apenas local, por enquanto |

## Identidade visual

**Personalidade:** um caderno de finanças da casa, não um app de banco. Tons quentes de papel,
verde-sálvia como cor principal (crescimento, calma), argila para despesas e ocre para pendências.
Linguagem próxima ("Olá, Maria", "você gastou"), sem jargão financeiro.

| Papel | Claro | Escuro |
| :--- | :--- | :--- |
| Fundo | `#FAF6F0` creme | `#161412` |
| Superfície | `#FFFFFF` | `#201D1A` |
| Texto | `#2B2622` | `#F2EDE6` |
| Principal (sálvia) | `#2F6B5E` | `#86C3B2` |
| Receita | `#2F7D5B` | `#73C99D` |
| Despesa (argila) | `#B4513A` | `#EC9077` |
| Pendente (ocre) | `#9A7420` | `#E2B95B` |

Receita e despesa nunca dependem só da cor: sempre têm sinal (`+`/`−`) e ícone.

**Tipografia:** Fraunces (títulos e valores em destaque, serifa suave) e Nunito Sans (texto e
interface, com algarismos tabulares nos valores).

**Logo:** "ala" em minúsculas, com uma asa estilizada em duas curvas — liberdade e leveza.

## Telas (MVP)

| # | Tela | Conteúdo | Status |
| :--- | :--- | :--- | :--- |
| 1 | Entrada | Login e cadastro | ✅ |
| 2 | Painel | Saldo total, resumo do mês, gastos por categoria, últimos lançamentos, troca de household e sair | ✅ |
| 3 | Lançamentos | Lista por mês e por dia, com filtros (tipo, situação, conta); formulário de receita, despesa e transferência no botão +; marcar como pago; editar e excluir | ✅ |
| 4 | Contas | Lista com saldo; criar, editar, arquivar, reativar e excluir (com aviso quando há lançamentos) | ✅ |
| 5 | Categorias | Receitas e despesas, com cor e ícone; criar também de dentro do formulário de lançamento | ✅ |
| 6 | Household | Membros e papéis, convites enviados (convidar, cancelar) e recebidos (aceitar, recusar, também como aviso no painel), sair, renomear, excluir e criar household | ✅ |
| 7 | Perfil | Editar nome, tema e sair (página Perfil, também no menu do avatar) | ✅ |

Legenda: 🎨 protótipo com dados fictícios · ✅ integrado à API · ⏳ pendente

## Fases

1. **Fundação e proposta visual** — projeto, tokens de design, temas, logo, protótipo do login e do painel. ✅ Aprovado.
2. **Autenticação** — cliente da API, sessão com renovação automática, rotas protegidas, login e cadastro reais. ✅
3. **Painel e lançamentos** — ✅ painel com dados reais; tela de lançamentos, formulário no botão + e filtros.
4. **Contas e categorias.** ✅
5. **Households, membros, convites e perfil.** ✅
6. **Acabamento** — estados vazios, carregamento e erro; acessibilidade; README.

## Navegação

- **Celular:** barra inferior com Painel, Lançamentos, botão central "+" (novo lançamento), Contas e Mais (categorias, household, perfil).
- **Computador:** barra lateral com as mesmas seções.

## Como a sessão funciona

- `src/lib/api.ts` faz todas as chamadas para `/api` e anexa o `access_token`.
- Se a API responder 401, o cliente renova a sessão com o `refresh_token` uma única vez e repete a chamada. Chamadas simultâneas compartilham a mesma renovação, porque o Supabase só aceita cada `refresh_token` uma vez.
- Ao recarregar a página, `AuthProvider` retoma a sessão pelo `refresh_token` salvo.
- Ao sair, chama `POST /auth/logout`, apaga o token salvo e limpa o cache de dados.

## Notas de design

A skill frontend-design apontou que fundo creme + serifa nos títulos + acento argila/damasco é hoje um visual comum em interfaces geradas. Em 06/11/2026 foi testada uma variação "caderneta" (papel frio, tinta de caneta azul, saldo com marca-texto, margem vermelha, pendentes "a lápis", Schibsted Grotesk). A variação foi recusada e descartada: **o visual atual é o oficial**, e as telas novas seguem os tokens de `src/index.css`.
