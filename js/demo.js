/* ════════════════════════════════════════════════════════════════════════════
   MODO DEMONSTRAÇÃO — ficheiro só para experimentar a interface sem login.
   Abre  index.html?demo=Colaborador  (ou Chefe, ou Admin).  Dados inventados, nada é guardado.
   Para o apagar: apaga este ficheiro e a linha <script ... demo.js> no index.html,
   e a linha "modo-demo" no <head> do index.html.
   ════════════════════════════════════════════════════════════════════════════ */
const UI = window.UI;
const m = location.search.match(/[?&]demo=([A-Za-z]+)/);

if (m) {
  const { iso } = UI.h;
  const agora = new Date();
  const cargo = { colaborador: 'Colaborador', chefe: 'Chefe', admin: 'Admin' }[m[1].toLowerCase()] || 'Colaborador';
  const y = agora.getFullYear(), mo = agora.getMonth();
  const d = (n) => iso(y, mo, n);
  const dep = [{ id: 1, nome: 'Vendas', chefe_id: 2 }, { id: 2, nome: 'Recursos Humanos', chefe_id: null }];
  const ut = [
    { id: 1, nome: 'Administrador', email: 'admin@demo.pt', cargo: 'Admin', departamento_id: null, dias_totais_ano: 22, dias_disponiveis: 22 },
    { id: 2, nome: 'Rui Lopes', email: 'rui@demo.pt', cargo: 'Chefe', departamento_id: 1, dias_totais_ano: 22, dias_disponiveis: 18 },
    { id: 3, nome: 'Ana Costa', email: 'ana@demo.pt', cargo: 'Colaborador', departamento_id: 1, dias_totais_ano: 22, dias_disponiveis: 17 },
    { id: 4, nome: 'Beatriz Silva', email: 'bea@demo.pt', cargo: 'Colaborador', departamento_id: 1, dias_totais_ano: 22, dias_disponiveis: 20 },
    { id: 5, nome: 'Carlos Nunes', email: 'carlos@demo.pt', cargo: 'Colaborador', departamento_id: 2, dias_totais_ano: 22, dias_disponiveis: 22 },
  ];
  const ped = [
    { id: 1, utilizador_id: 2, nome: 'Rui Lopes', data_inicio: d(9), data_fim: d(11), estado: 'Aceite', justificacao: 'Aprovado pelo Admin.', data_submissao: d(1) },
    { id: 2, utilizador_id: 3, nome: 'Ana Costa', data_inicio: d(10), data_fim: d(12), estado: 'Aceite', justificacao: 'Boas férias!', data_submissao: d(2) },
    { id: 3, utilizador_id: 4, nome: 'Beatriz Silva', data_inicio: d(10), data_fim: d(10), estado: 'Aceite', justificacao: 'Ok.', data_submissao: d(3) },
    { id: 4, utilizador_id: 3, nome: 'Ana Costa', data_inicio: d(24), data_fim: d(28), estado: 'Pendente', justificacao: '', data_submissao: d(5) },
    { id: 5, utilizador_id: 4, nome: 'Beatriz Silva', data_inicio: d(17), data_fim: d(19), estado: 'Pendente', justificacao: '', data_submissao: d(6) },
    { id: 6, utilizador_id: 3, nome: 'Ana Costa', data_inicio: d(2), data_fim: d(3), estado: 'Recusado', justificacao: 'Equipa reduzida nessa semana.', data_submissao: d(1) },
  ];
  const mais = [
    { id: 1, nome_chefe: 'Rui Lopes', nome_colaborador: 'Ana Costa', dias_ajuste: 2, justificacao: 'Projeto extra fora de horas.', estado: 'Pendente', data_pedido: new Date().toISOString() },
    { id: 2, nome_chefe: 'Rui Lopes', nome_colaborador: 'Beatriz Silva', dias_ajuste: -1, justificacao: 'Dia de formação a descontar.', estado: 'Aceite', data_pedido: new Date().toISOString() },
  ];
  const nots = [
    { id: 1, mensagem: 'Novo pedido de férias de Ana Costa.', lida: false, data_criacao: new Date().toISOString() },
    { id: 2, mensagem: 'O teu pedido foi aceite.', lida: true, data_criacao: new Date().toISOString() },
  ];
  const eu = ut.filter((u) => u.cargo === cargo)[0];

  // No modo demonstração nenhuma ação guarda nada, e o logout/limpeza do app.js não apaga os dados falsos.
  Object.keys(UI.acoes).forEach((k) => {
    if (k === 'mudouMes' || k === 'mudouDepartamento' || k === 'recarregar') return;
    UI.acoes[k] = () => Promise.resolve({ erro: 'Modo demonstração: nada é guardado.' });
  });
  UI.limpar = () => {};

  UI.configurarPerfil(eu);
  UI.renderSaldo({ dias_totais_ano: eu.dias_totais_ano, dias_disponiveis: eu.dias_disponiveis, dias_pendentes: 5 });
  UI.renderMeusPedidos(ped.filter((p) => p.utilizador_id === eu.id));
  UI.renderPedidosEquipa(ped);
  UI.renderMaisDiasChefe(mais);
  UI.renderMaisDiasAdmin(mais);
  UI.renderDepartamentos(dep, ut);
  UI.renderUtilizadores(ut, dep);
  UI.renderNotificacoes(nots);
  UI.preencherSelectColaboradores(ut.filter((u) => u.departamento_id === 1 && u.cargo === 'Colaborador'));
  UI.preencherSelectDepartamentos(dep);
  UI.preencherSelectVerComo(ut.filter((u) => u.cargo !== 'Admin'));
  UI.renderCalendario(ped);
}
