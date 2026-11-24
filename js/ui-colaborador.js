/* ════════════════════════════════════════════════════════════════════════════
   INTERFACE — PARTE DO COLABORADOR  (estudo: Rodrigo)
   ════════════════════════════════════════════════════════════════════════════
   O painel "As minhas férias" (id painel-ferias no index.html):
     • o saldo de dias
     • o formulário "Novo pedido de férias"
     • a lista "Os meus pedidos" com o botão Cancelar
   O Chefe também usa este painel (também tem as suas férias).

   Funções que o app.js chama:   UI.renderSaldo(...)   UI.renderMeusPedidos(...)
   Ações que o app.js define:    UI.acoes.criarPedido   UI.acoes.cancelarPedido
   ════════════════════════════════════════════════════════════════════════════ */
const UI = window.UI;
const { $, esc, fmt, hojeISO, badge, mostrarVazio, mostrarErro, executar } = UI.h;

/* ---------- Saldo ---------- */
// s = { dias_totais_ano, dias_disponiveis, dias_pendentes }
UI.renderSaldo = function (s) {
  $('#saldo-totais').textContent = s.dias_totais_ano != null ? s.dias_totais_ano : '–';
  $('#saldo-disponiveis').textContent = s.dias_disponiveis != null ? s.dias_disponiveis : '–';
  $('#saldo-pendentes').textContent = s.dias_pendentes != null ? s.dias_pendentes : '–';
  if (UI.perfil) { UI.perfil.dias_totais_ano = s.dias_totais_ano; UI.perfil.dias_disponiveis = s.dias_disponiveis; }
  atualizarPrevisao();
};

/* ---------- Lista "Os meus pedidos" ---------- */
// lista = [{ id, data_inicio, data_fim, estado, justificacao, data_submissao }]
UI.renderMeusPedidos = function (lista) {
  $('#tab-meus-pedidos').innerHTML = lista.map((p) =>
    '<tr><td>' + fmt(p.data_inicio) + '</td><td>' + fmt(p.data_fim) + '</td><td>' + UI.diasUteis(p.data_inicio, p.data_fim) + '</td>' +
    '<td>' + badge(p.estado) + '</td><td>' + esc(p.justificacao || '—') + '</td>' +
    '<td>' + (p.estado === 'Pendente' ? '<button class="btn btn-pequeno btn-perigo" type="button" data-acao="cancelar-pedido" data-id="' + esc(p.id) + '">Cancelar</button>' : '') + '</td></tr>'
  ).join('');
  mostrarVazio('#tab-meus-pedidos', '#vazio-meus-pedidos', lista.length);
};

/* ---------- Formulário de novo pedido ---------- */
// Mostra "5 dia(s) útil(eis)..." enquanto a pessoa escolhe as datas
function atualizarPrevisao() {
  const a = $('#pedido-inicio').value, b = $('#pedido-fim').value, el = $('#pedido-previsao');
  if (!a || !b) { el.textContent = ''; return; }
  if (b < a) { el.textContent = 'A data de fim tem de ser igual ou depois da data de início.'; return; }
  let t = UI.diasUteis(a, b) + ' dia(s) útil(eis) neste pedido.';
  if (UI.perfil && UI.perfil.dias_disponiveis != null) t += ' Tens ' + UI.perfil.dias_disponiveis + ' disponíveis.';
  el.textContent = t;
}
$('#pedido-inicio').addEventListener('input', atualizarPrevisao);
$('#pedido-fim').addEventListener('input', atualizarPrevisao);
$('#pedido-inicio').min = hojeISO();   // o calendário do browser não deixa escolher o passado
$('#pedido-fim').min = hojeISO();

$('#form-pedido').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const a = $('#pedido-inicio').value, b = $('#pedido-fim').value;
  // Estas verificações só ajudam. A base de dados repete-as (é ela que manda).
  if (!a || !b) return mostrarErro('#pedido-erro', 'Escolhe a data de início e a de fim.');
  if (b < a) return mostrarErro('#pedido-erro', 'A data de fim tem de ser igual ou depois da data de início.');
  if (a < hojeISO()) return mostrarErro('#pedido-erro', 'Não podes pedir férias em datas que já passaram.');
  if (UI.diasUteis(a, b) === 0) return mostrarErro('#pedido-erro', 'O período escolhido não tem dias úteis.');
  mostrarErro('#pedido-erro', '');
  executar('criarPedido', { data_inicio: a, data_fim: b }).then((r) => {
    if (r && r.erro) mostrarErro('#pedido-erro', r.erro);
    else { $('#form-pedido').reset(); $('#pedido-previsao').textContent = ''; }
  });
});

/* ---------- Botão Cancelar (um só "ouvinte" para a tabela toda) ---------- */
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-acao="cancelar-pedido"]');
  if (b && confirm('Cancelar este pedido de férias?')) executar('cancelarPedido', Number(b.dataset.id));
});

UI.aoLimpar.push(() => { $('#tab-meus-pedidos').innerHTML = ''; });
