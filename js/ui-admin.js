/* ════════════════════════════════════════════════════════════════════════════
   INTERFACE — PARTE DO ADMIN  (estudo: Miguel)
   ════════════════════════════════════════════════════════════════════════════
   Painéis só do Admin (ids no index.html):
     • painel-aprovar-dias   aceitar / recusar os pedidos de mais dias dos chefes
     • painel-departamentos  criar departamentos, escolher o chefe, apagar
     • painel-utilizadores   criar utilizadores, mudar departamento / dias por ano, apagar
     • "Ver como"            (no menu) o Admin vê a aplicação como outra pessoa

   Funções que o app.js chama:   UI.renderMaisDiasAdmin   UI.renderDepartamentos
                                 UI.renderUtilizadores    UI.preencherSelectDepartamentos
                                 UI.preencherSelectVerComo
   Ações que o app.js define:    decidirMaisDias, criarDepartamento, definirChefe,
                                 apagarDepartamento, criarUtilizador, atualizarUtilizador,
                                 apagarUtilizador, verComo, sairVerComo
   ════════════════════════════════════════════════════════════════════════════ */
const UI = window.UI;
const { $, esc, fmtHora, badge, mostrarVazio, mostrarErro, opcoes, executar } = UI.h;

/* ---------- Pedidos de mais dias ---------- */
// lista = [{ id, nome_chefe, nome_colaborador, dias_ajuste, justificacao, estado, data_pedido }]
UI.renderMaisDiasAdmin = function (lista) {
  $('#tab-mais-dias-admin').innerHTML = lista.map((p) => {
    const dec = p.estado === 'Pendente'
      ? '<button class="btn btn-pequeno btn-ok" type="button" data-acao="decidir-mais-dias" data-estado="Aceite" data-id="' + esc(p.id) + '">Aceitar</button>' +
        '<button class="btn btn-pequeno btn-perigo" type="button" data-acao="decidir-mais-dias" data-estado="Recusado" data-id="' + esc(p.id) + '">Recusar</button>' : '';
    return '<tr><td>' + esc(p.nome_chefe) + '</td><td>' + esc(p.nome_colaborador) + '</td><td>' + (p.dias_ajuste > 0 ? '+' : '') + esc(p.dias_ajuste) + '</td><td>' + esc(p.justificacao) +
      '</td><td>' + fmtHora(p.data_pedido) + '</td><td>' + badge(p.estado) + '</td><td>' + dec + '</td></tr>';
  }).join('');
  mostrarVazio('#tab-mais-dias-admin', '#vazio-mais-dias-admin', lista.length);
};

/* ---------- Departamentos ---------- */
// deps = [{ id, nome, chefe_id }]   utilizadores = [{ id, nome, departamento_id, ... }]
UI.renderDepartamentos = function (deps, utilizadores) {
  $('#tab-departamentos').innerHTML = deps.map((d) => {
    const membros = utilizadores.filter((u) => u.departamento_id === d.id);
    const sel = '<select data-acao="mudar-chefe" data-id="' + esc(d.id) + '" aria-label="Chefe de ' + esc(d.nome) + '">' +
      '<option value="">— sem chefe —</option>' +
      membros.map((u) => '<option value="' + esc(u.id) + '"' + (u.id === d.chefe_id ? ' selected' : '') + '>' + esc(u.nome) + '</option>').join('') + '</select>';
    return '<tr><td>' + esc(d.nome) + '</td><td>' + sel + '</td><td>' + membros.length +
      '</td><td><button class="btn btn-pequeno btn-perigo" type="button" data-acao="apagar-departamento" data-id="' + esc(d.id) + '">Apagar</button></td></tr>';
  }).join('');
  mostrarVazio('#tab-departamentos', '#vazio-departamentos', deps.length);
};

$('#form-departamento').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const nome = $('#dep-nome').value.trim();
  if (!nome) return UI.toast('Escreve o nome do departamento.', 'erro');
  executar('criarDepartamento', nome).then((r) => { if (!(r && r.erro)) $('#form-departamento').reset(); });
});

// Preenche os selects de departamento (calendário do Admin e formulário "Criar utilizador")
UI.preencherSelectDepartamentos = function (lista) {
  const atual = $('#cal-departamento').value;      // guarda a escolha para não "saltar" ao recarregar
  $('#cal-departamento').innerHTML = opcoes(lista, 'id', 'nome');
  if (atual) $('#cal-departamento').value = atual;
  $('#ut-departamento').innerHTML = opcoes(lista, 'id', 'nome', '— sem departamento —');
};

/* ---------- Utilizadores ---------- */
// lista = [{ id, nome, email, cargo, departamento_id, dias_totais_ano, dias_disponiveis }]
UI.renderUtilizadores = function (lista, deps) {
  $('#tab-utilizadores').innerHTML = lista.map((u) => {
    const sel = '<select data-acao="mudar-dept-utilizador" data-id="' + esc(u.id) + '" aria-label="Departamento de ' + esc(u.nome) + '">' +
      '<option value="">— sem departamento —</option>' +
      deps.map((d) => '<option value="' + esc(d.id) + '"' + (d.id === u.departamento_id ? ' selected' : '') + '>' + esc(d.nome) + '</option>').join('') + '</select>';
    const dias = '<input type="number" id="dias-' + esc(u.id) + '" value="' + esc(u.dias_totais_ano) + '" min="0" max="60" style="width:80px" aria-label="Dias por ano de ' + esc(u.nome) + '"> ' +
      '<button class="btn btn-pequeno" type="button" data-acao="guardar-dias" data-id="' + esc(u.id) + '">Guardar</button>';
    return '<tr><td>' + esc(u.nome) + '</td><td>' + esc(u.email) + '</td><td>' + esc(u.cargo) + '</td><td>' + sel + '</td><td>' + dias + '</td><td>' + esc(u.dias_disponiveis) +
      '</td><td><button class="btn btn-pequeno btn-perigo" type="button" data-acao="apagar-utilizador" data-id="' + esc(u.id) + '">Apagar</button></td></tr>';
  }).join('');
  mostrarVazio('#tab-utilizadores', '#vazio-utilizadores', lista.length);
};

$('#form-utilizador').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const d = {
    nome: $('#ut-nome').value.trim(), email: $('#ut-email').value.trim(), password: $('#ut-password').value,
    cargo: $('#ut-cargo').value, departamento_id: Number($('#ut-departamento').value) || null,
    dias_totais_ano: parseInt($('#ut-dias').value, 10),
  };
  if (!d.nome || !d.email) return mostrarErro('#ut-erro', 'Preenche o nome e o email.');
  if (d.password.length < 6) return mostrarErro('#ut-erro', 'A palavra-passe precisa de pelo menos 6 caracteres.');
  if (isNaN(d.dias_totais_ano) || d.dias_totais_ano < 0) return mostrarErro('#ut-erro', 'Dias por ano inválidos.');
  mostrarErro('#ut-erro', '');
  executar('criarUtilizador', d).then((r) => {
    if (r && r.erro) mostrarErro('#ut-erro', r.erro); else $('#form-utilizador').reset();
  });
});

/* ---------- "Ver como" ---------- */
// lista = [{ id, nome, cargo }]
UI.preencherSelectVerComo = function (lista) {
  $('#ver-como-select').innerHTML = opcoes(lista, 'id', (u) => u.nome + ' (' + u.cargo + ')');
};
$('#btn-ver-como').addEventListener('click', () => {
  const id = Number($('#ver-como-select').value);
  if (id) executar('verComo', id);
});
$('#btn-sair-ver-como').addEventListener('click', () => executar('sairVerComo'));

/* ---------- Cliques e mudanças nas tabelas do Admin ---------- */
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-acao]');
  if (!b) return;
  const acao = b.dataset.acao, id = Number(b.dataset.id);
  if (acao === 'decidir-mais-dias') executar('decidirMaisDias', id, b.dataset.estado);
  else if (acao === 'apagar-departamento') { if (confirm('Apagar este departamento?')) executar('apagarDepartamento', id); }
  else if (acao === 'apagar-utilizador') { if (confirm('Apagar este utilizador e os seus pedidos?')) executar('apagarUtilizador', id); }
  else if (acao === 'guardar-dias') {
    const v = parseInt($('#dias-' + id).value, 10);
    if (isNaN(v) || v < 0) return UI.toast('Dias por ano inválidos.', 'erro');
    executar('atualizarUtilizador', id, { dias_totais_ano: v });
  }
});
document.addEventListener('change', (ev) => {
  const s = ev.target.closest('select[data-acao]');
  if (!s) return;
  const id = Number(s.dataset.id), v = s.value ? Number(s.value) : null;
  if (s.dataset.acao === 'mudar-chefe') executar('definirChefe', id, v);
  else if (s.dataset.acao === 'mudar-dept-utilizador') executar('atualizarUtilizador', id, { departamento_id: v });
});

UI.aoLimpar.push(() => {
  ['#tab-mais-dias-admin', '#tab-departamentos', '#tab-utilizadores'].forEach((s) => { $(s).innerHTML = ''; });
});
