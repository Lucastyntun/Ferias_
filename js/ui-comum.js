/* ════════════════════════════════════════════════════════════════════════════
   INTERFACE — PARTE COMUM  (estudo sugerido: Lucas + Felipe)
   ════════════════════════════════════════════════════════════════════════════
   Aqui está o que é partilhado pelos 3 cargos:
     • o objeto global  UI  e as ajudas (UI.h) que as outras partes usam
     • avisos (toast), tema claro/escuro, separadores, perfil
     • notificações (o sino) e o calendário
     • a função  executar()  que corre uma ação do app.js e mostra o resultado

   Esta parte NÃO fala com o Supabase. Quem busca e guarda dados é o app.js,
   que chama as funções  UI.render...  e define as  UI.acoes.*

   Ordem dos <script> no index.html (importa!):
     ui-comum.js → ui-colaborador.js → ui-chefe.js → ui-admin.js → app.js → demo.js
   ════════════════════════════════════════════════════════════════════════════ */

const UI = {};
window.UI = UI;

// Tem de ser IGUAL ao limite que está no trigger da base de dados (sql/02).
UI.config = { limiteDiario: 3 };
UI.perfil = null;     // a linha de "utilizadores" de quem está a ser mostrado

/* ---------- Pequenas ajudas (usadas por todas as partes) ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Protege contra XSS: transforma < > & " ' em texto inofensivo antes de pôr dados em innerHTML.
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]); }
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function pad(n) { return String(n).padStart(2, '0'); }
function iso(ano, mes0, dia) { return ano + '-' + pad(mes0 + 1) + '-' + pad(dia); }   // mes0: 0 a 11
function hojeISO() { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); }
function fmt(s) { if (!s) return '—'; const p = String(s).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function fmtHora(ts) { if (!ts) return ''; const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }); }
function parte(s) { return [+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)]; }
function primeiroNome(n) { return String(n || '').trim().split(' ')[0]; }

// Etiqueta colorida do estado (Pendente, Aceite...)
function badge(estado) {
  const cls = String(estado || '').toLowerCase().replace(/[^a-z]/g, '');
  return '<span class="badge e-' + cls + '">' + esc(estado) + '</span>';
}
// Mostra a tabela ou a frase "não há nada" conforme haja linhas
function mostrarVazio(idTabela, idVazio, n) { $(idVazio).hidden = n > 0; $(idTabela).closest('table').hidden = n === 0; }
function mostrarErro(id, texto) { const e = $(id); e.textContent = texto || ''; e.hidden = !texto; }
// Gera <option>...</option> a partir de uma lista
function opcoes(lista, valor, texto, vazio) {
  const h = vazio ? '<option value="">' + esc(vazio) + '</option>' : '';
  return h + lista.map((x) => '<option value="' + esc(x[valor]) + '">' + esc(typeof texto === 'function' ? texto(x) : x[texto]) + '</option>').join('');
}

// Dias úteis (segunda a sexta) entre duas datas 'AAAA-MM-DD', inclusive.
// Só serve para PRÉ-VISUALIZAR: quem decide de verdade é a base de dados.
UI.diasUteis = function (a, b) {
  if (!a || !b || b < a) return 0;
  const p = parte(a), q = parte(b);
  const d = new Date(p[0], p[1], p[2]), fim = new Date(q[0], q[1], q[2]);
  let n = 0, guarda = 0;
  while (d <= fim && guarda++ < 800) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; d.setDate(d.getDate() + 1); }
  return n;
};

UI.toast = function (texto, tipo) {
  const t = document.createElement('div');
  t.className = 'toast' + (tipo === 'erro' ? ' erro' : '');
  t.textContent = texto;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), tipo === 'erro' ? 7000 : 3500);
};

/* ---------- Ações: o app.js define o que cada uma faz ---------- */
const NOMES_ACOES = ['criarPedido', 'cancelarPedido', 'decidirPedido', 'criarPedidoMaisDias', 'decidirMaisDias',
  'criarDepartamento', 'definirChefe', 'apagarDepartamento', 'criarUtilizador', 'atualizarUtilizador',
  'apagarUtilizador', 'verComo', 'sairVerComo', 'marcarNotificacaoLida', 'marcarTodasLidas'];
UI.acoes = {};
NOMES_ACOES.forEach((n) => {
  UI.acoes[n] = () => { console.warn('[UI] Ainda não ligado: UI.acoes.' + n); return Promise.resolve({ erro: 'Ainda não ligado: ' + n }); };
});
UI.acoes.mudouMes = () => {};            // opcional
UI.acoes.mudouDepartamento = () => {};   // opcional
UI.acoes.recarregar = () => Promise.resolve();

// Corre uma ação do app.js, mostra o aviso e, se correu bem, recarrega os dados.
function executar(nome, ...args) {
  return Promise.resolve()
    .then(() => UI.acoes[nome](...args))
    .then((r) => {
      if (r && r.erro) { UI.toast(r.erro, 'erro'); return r; }
      UI.toast('Feito.', 'ok');
      return Promise.resolve(UI.acoes.recarregar()).then(() => r || { ok: true });
    })
    .catch((e) => { UI.toast(e && e.message ? e.message : 'Erro inesperado.', 'erro'); return { erro: String(e) }; });
}

// As outras partes (colaborador, chefe, admin) vão buscar as ajudas aqui.
UI.h = { esc, $, $$, pad, iso, hojeISO, fmt, fmtHora, parte, primeiroNome, badge, mostrarVazio, mostrarErro, opcoes, executar };

// Cada parte regista aqui o que deve limpar no logout
UI.aoLimpar = [];

/* ---------- Tema claro / escuro (só a aplicação; o login é sempre escuro) ---------- */
function aplicarTema(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('ferias-tema', t); } catch (e) {}
  $('#btn-tema').textContent = t === 'dark' ? '☀️' : '🌙';
}
function alternarTema() { aplicarTema(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
$('#btn-tema').addEventListener('click', alternarTema);
aplicarTema(document.documentElement.getAttribute('data-theme'));

/* ---------- Login: Enter faz clique em ENTRAR ---------- */
['#username', '#password'].forEach((s) => {
  $(s).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#btn-login').click(); } });
});

/* ---------- Separadores ---------- */
function mostrarPainel(id) {
  $$('.painel').forEach((p) => p.classList.toggle('ativo', p.id === id));
  $$('#menu .tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.painel === id)));
  if (id === 'painel-calendario') desenharCalendario();
}
UI.mostrarPainel = mostrarPainel;
$$('#menu .tab').forEach((b) => b.addEventListener('click', () => mostrarPainel(b.dataset.painel)));

/* ---------- Perfil: mostra só o que o cargo pode ver ---------- */
// perfil = { id, nome, email, cargo, departamento_id, dias_totais_ano, dias_disponiveis }
UI.configurarPerfil = function (perfil, opcoesPerfil) {
  const o = opcoesPerfil || {};
  UI.perfil = perfil;
  const cargo = perfil.cargo;
  $('#user-nome').textContent = perfil.nome || perfil.email || '';
  $('#user-cargo').textContent = cargo || '';
  // data-roles="Admin Chefe" = só esses cargos veem o elemento
  $$('[data-roles]').forEach((e) => { e.hidden = e.dataset.roles.split(' ').indexOf(cargo) === -1; });
  $('#banner-ver-como').hidden = !o.verComo;
  if (o.verComo) { $('#ver-como-nome').textContent = (perfil.nome || '') + ' (' + cargo + ')'; $('.ver-como').hidden = true; }
  mostrarPainel(cargo === 'Colaborador' ? 'painel-ferias' : 'painel-equipa');
  if (['Admin', 'Chefe', 'Colaborador'].indexOf(cargo) === -1) {
    UI.toast('Cargo inválido na base de dados: "' + cargo + '". Tem de ser Admin, Chefe ou Colaborador.', 'erro');
  }
};

UI.limpar = function () {
  UI.perfil = null;
  $('#user-nome').textContent = ''; $('#user-cargo').textContent = '';
  $$('.painel').forEach((p) => p.classList.remove('ativo'));
  $('#banner-ver-como').hidden = true; $('#notif-caixa').hidden = true;
  ['#notif-lista', '#cal-grelha'].forEach((s) => { $(s).innerHTML = ''; });
  cal.pedidos = [];
  $('#sino-contador').hidden = true;
  UI.aoLimpar.forEach((f) => f());
};

/* ---------- Notificações (o sino) ---------- */
// lista = [{ id, mensagem, lida, data_criacao }]
UI.renderNotificacoes = function (lista) {
  const nao = lista.filter((n) => !n.lida).length;
  const c = $('#sino-contador'); c.textContent = nao > 9 ? '9+' : nao; c.hidden = nao === 0;
  $('#notif-lista').innerHTML = lista.length ? lista.map((n) =>
    '<div class="notif-item' + (n.lida ? '' : ' nao-lida') + '">' + esc(n.mensagem) + '<time>' + fmtHora(n.data_criacao) + '</time>' +
    (n.lida ? '' : '<button class="btn btn-pequeno" type="button" data-acao="marcar-lida" data-id="' + esc(n.id) + '" style="margin-top:6px">Marcar como lida</button>') + '</div>'
  ).join('') : '<div class="notif-vazio">Sem notificações.</div>';
};
$('#btn-sino').addEventListener('click', function (ev) {
  ev.stopPropagation();
  const caixa = $('#notif-caixa'); caixa.hidden = !caixa.hidden; this.setAttribute('aria-expanded', String(!caixa.hidden));
});
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('.sino')) $('#notif-caixa').hidden = true;
  const b = ev.target.closest('button[data-acao="marcar-lida"]');
  if (b) executar('marcarNotificacaoLida', Number(b.dataset.id));
});
$('#btn-todas-lidas').addEventListener('click', () => executar('marcarTodasLidas'));

/* ---------- Calendário ---------- */
const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const NOMES_DIA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const agora = new Date();
const cal = { ano: agora.getFullYear(), mes: agora.getMonth(), pedidos: [] };   // mes: 0 a 11

// pedidos = [{ id, utilizador_id, nome, data_inicio, data_fim, estado }]
UI.renderCalendario = function (pedidos) { if (pedidos) cal.pedidos = pedidos; desenharCalendario(); };

function desenharCalendario() {
  $('#cal-titulo').textContent = NOMES_MES[cal.mes] + ' ' + cal.ano;
  let h = NOMES_DIA.map((n) => '<div class="cal-cab">' + n + '</div>').join('');
  const offset = (new Date(cal.ano, cal.mes, 1).getDay() + 6) % 7;        // segunda = 0
  const total = new Date(cal.ano, cal.mes + 1, 0).getDate();
  const hoje = hojeISO(), meuId = UI.perfil ? UI.perfil.id : null;
  for (let i = 0; i < offset; i++) h += '<div class="dia vazio-mes"></div>';
  for (let d = 1; d <= total; d++) {
    const dia = iso(cal.ano, cal.mes, d), semana = (offset + d - 1) % 7;
    // pedidos Aceites ou Pendentes que cobrem este dia
    const doDia = cal.pedidos.filter((p) => p.data_inicio <= dia && dia <= p.data_fim && (p.estado === 'Aceite' || p.estado === 'Pendente'));
    // quantas pessoas DIFERENTES têm férias Aceites neste dia
    const pessoas = {};
    doDia.forEach((p) => { if (p.estado === 'Aceite') pessoas[p.utilizador_id] = true; });
    const n = Object.keys(pessoas).length, cheio = n >= UI.config.limiteDiario;
    let chips = doDia.slice(0, 2).map((p) =>
      '<span class="chip' + (p.estado === 'Pendente' ? ' pendente' : '') + (p.utilizador_id === meuId ? ' meu' : '') +
      '" title="' + esc(p.nome) + ' (' + esc(p.estado) + ')">' + esc(primeiroNome(p.nome)) + '</span>').join('');
    if (doDia.length > 2) chips += '<span class="chip-mais">+' + (doDia.length - 2) + '</span>';
    h += '<div class="dia' + (semana >= 5 ? ' fim-semana' : '') + (dia === hoje ? ' hoje' : '') + (cheio ? ' cheio' : '') + '">' +
      '<div class="dia-topo"><span>' + d + '</span><span class="dia-contador">' + (cheio ? '⛔ ' : '') + (n ? n + '/' + UI.config.limiteDiario : '') + '</span></div>' + chips + '</div>';
  }
  $('#cal-grelha').innerHTML = h;
}
function mudarMes(delta) {
  if (delta === 0) { const a = new Date(); cal.ano = a.getFullYear(); cal.mes = a.getMonth(); }
  else { cal.mes += delta; if (cal.mes < 0) { cal.mes = 11; cal.ano--; } if (cal.mes > 11) { cal.mes = 0; cal.ano++; } }
  desenharCalendario();
  UI.acoes.mudouMes(cal.ano, cal.mes + 1);
}
$('#cal-anterior').addEventListener('click', () => mudarMes(-1));
$('#cal-seguinte').addEventListener('click', () => mudarMes(1));
$('#cal-hoje').addEventListener('click', () => mudarMes(0));
$('#cal-departamento').addEventListener('change', function () { UI.acoes.mudouDepartamento(Number(this.value) || null); });
