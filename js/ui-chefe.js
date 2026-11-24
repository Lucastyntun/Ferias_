/* ════════════════════════════════════════════════════════════════════════════
   INTERFACE — PARTE DO CHEFE  (estudo: Tomás)
   ════════════════════════════════════════════════════════════════════════════
   Dois painéis (ids no index.html):
     • painel-equipa     "Pedidos de férias da equipa": aceitar / recusar
                         (o Admin também usa este painel, mas vê todos os departamentos)
     • painel-mais-dias  "Pedir mais dias": o chefe pede mais (ou menos) dias para um colaborador

   Funções que o app.js chama:   UI.renderPedidosEquipa   UI.renderMaisDiasChefe
                                 UI.preencherSelectColaboradores
   Ações que o app.js define:    UI.acoes.decidirPedido   UI.acoes.criarPedidoMaisDias
   ════════════════════════════════════════════════════════════════════════════ */
const UI = window.UI;
const { $, esc, fmt, fmtHora, badge, mostrarVazio, mostrarErro, opcoes, executar } = UI.h;

/* ---------- Pedidos da equipa ---------- */
let ultimaEquipa = [];

// lista = [{ id, utilizador_id, nome, data_inicio, data_fim, estado, justificacao, data_submissao }]
UI.renderPedidosEquipa = function (lista) {
  if (lista) ultimaEquipa = lista;
  const f = $('#filtro-estado').value;       // o filtro "Pendente / Aceite..." é feito aqui, sem ir à base de dados
  const vis = ultimaEquipa.filter((p) => !f || p.estado === f);
  $('#tab-equipa').innerHTML = vis.map((p) => {
    const decisao = p.estado === 'Pendente'
      ? '<button class="btn btn-pequeno btn-ok" type="button" data-acao="decidir-pedido" data-estado="Aceite" data-id="' + esc(p.id) + '">Aceitar</button>' +
        '<button class="btn btn-pequeno btn-perigo" type="button" data-acao="decidir-pedido" data-estado="Recusado" data-id="' + esc(p.id) + '">Recusar</button>'
      : '';
    const just = p.estado === 'Pendente'
      ? '<input type="text" id="just-' + esc(p.id) + '" placeholder="Justificação (obrigatória)" maxlength="300" aria-label="Justificação">'
      : esc(p.justificacao || '—');
    return '<tr><td>' + esc(p.nome) + '</td><td>' + fmt(p.data_inicio) + '</td><td>' + fmt(p.data_fim) + '</td><td>' + UI.diasUteis(p.data_inicio, p.data_fim) + '</td>' +
      '<td>' + badge(p.estado) + '</td><td>' + just + '</td><td>' + decisao + '</td></tr>';
  }).join('');
  mostrarVazio('#tab-equipa', '#vazio-equipa', vis.length);
};
$('#filtro-estado').addEventListener('change', () => UI.renderPedidosEquipa());

// Aceitar / Recusar: a justificação é obrigatória (está assim no ER)
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-acao="decidir-pedido"]');
  if (!b) return;
  const id = Number(b.dataset.id);
  const campo = $('#just-' + id), just = campo ? campo.value.trim() : '';
  if (!just) { UI.toast('Escreve a justificação antes de decidir.', 'erro'); if (campo) campo.focus(); return; }
  executar('decidirPedido', id, b.dataset.estado, just);
});

/* ---------- Pedir mais dias ---------- */
// lista = [{ id, nome, ... }]  → os colaboradores do departamento do chefe
UI.preencherSelectColaboradores = function (lista) { $('#pad-colaborador').innerHTML = opcoes(lista, 'id', 'nome'); };

// lista = [{ id, nome_colaborador, dias_ajuste, justificacao, estado, data_pedido }]
UI.renderMaisDiasChefe = function (lista) {
  $('#tab-mais-dias-chefe').innerHTML = lista.map((p) =>
    '<tr><td>' + esc(p.nome_colaborador) + '</td><td>' + (p.dias_ajuste > 0 ? '+' : '') + esc(p.dias_ajuste) + '</td><td>' + esc(p.justificacao) +
    '</td><td>' + fmtHora(p.data_pedido) + '</td><td>' + badge(p.estado) + '</td></tr>'
  ).join('');
  mostrarVazio('#tab-mais-dias-chefe', '#vazio-mais-dias-chefe', lista.length);
};

$('#form-mais-dias').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const col = Number($('#pad-colaborador').value), dias = parseInt($('#pad-dias').value, 10), just = $('#pad-justificacao').value.trim();
  if (!col) return mostrarErro('#pad-erro', 'Escolhe um colaborador.');
  if (!dias) return mostrarErro('#pad-erro', 'Indica um número de dias diferente de zero.');
  if (!just) return mostrarErro('#pad-erro', 'A justificação é obrigatória.');
  mostrarErro('#pad-erro', '');
  executar('criarPedidoMaisDias', { colaborador_id: col, dias_ajuste: dias, justificacao: just }).then((r) => {
    if (r && r.erro) mostrarErro('#pad-erro', r.erro); else $('#form-mais-dias').reset();
  });
});

UI.aoLimpar.push(() => {
  ultimaEquipa = [];
  ['#tab-equipa', '#tab-mais-dias-chefe'].forEach((s) => { $(s).innerHTML = ''; });
});
