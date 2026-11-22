import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://tbdwpvavrrhlhmxjksug.supabase.co';
const supabaseKey = 'sb_publishable_-i974_YY15b2XEfLqYcJOw_hb6TSTAt';
const supabase = createClient(supabaseUrl, supabaseKey);

// ─────────────────────────────────────────────────────────────────────────────
// 1) ELEMENTOS DO HTML (ids do index.html)
// ─────────────────────────────────────────────────────────────────────────────
const loginScreen = document.getElementById('login-screen');
const blackScreen = document.getElementById('black-screen');   // contentor de toda a aplicação
const emailInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const errorText = document.getElementById('error');

// O objeto UI é criado pelo <script> da interface (no index.html).
const UI = window.UI;
if (!UI) throw new Error('UI não encontrado: o <script> da interface tem de vir ANTES do app.js no index.html.');

const COLUNAS_PERFIL = 'id, nome, email, cargo, departamento_id, dias_totais_ano, dias_disponiveis';

// ─────────────────────────────────────────────────────────────────────────────
// 2) ESTADO
// ─────────────────────────────────────────────────────────────────────────────
let perfilReal = null;    // a pessoa que fez login (linha de "utilizadores")
let perfilAtual = null;   // quem a interface está a mostrar (igual ao perfilReal, ou outra pessoa no "Ver como")
let aVerComo = false;     // true quando o Admin está a ver como outra pessoa

// ─────────────────────────────────────────────────────────────────────────────
// 3) AJUDAS
// ─────────────────────────────────────────────────────────────────────────────
function alternarEcras(estaAutenticado) {
  if (estaAutenticado) {
    loginScreen.style.display = 'none';
    blackScreen.style.display = 'block';
    errorText.textContent = '';
  } else {
    blackScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
  }
}

// Traduz os erros mais comuns do Postgres. Os erros das nossas regras (triggers)
// já vêm em português em error.message e passam tal e qual.
function textoErro(error) {
  if (!error) return '';
  if (error.code === '23505') return 'Esse valor já está em uso (por exemplo, esse utilizador já é chefe de outro departamento).';
  if (error.code === '23503') return 'Não é possível: existem dados ligados a este registo (por exemplo, pessoas no departamento).';
  if (error.code === '42501') return 'Não tens permissão para fazer isto.';
  return error.message;
}

// Resultado de uma ação para o UI: { ok: true } ou { erro: 'texto' }
const resultado = (error) => (error ? { erro: textoErro(error) } : { ok: true });

// Lê o resultado de uma consulta; se falhar mostra o erro e devolve lista vazia.
function lista(res) {
  if (res.error) {
    UI.toast(textoErro(res.error), 'erro');
    return [];
  }
  return res.data ?? [];
}

// UPDATE que confirma que alguma linha foi mesmo alterada.
// (Se o RLS não deixar, o Supabase não dá erro: simplesmente altera 0 linhas.)
async function atualizar(tabela, valores, coluna, valor) {
  const { data, error } = await supabase.from(tabela).update(valores).eq(coluna, valor).select('id');
  if (error) return { erro: textoErro(error) };
  if (!data || data.length === 0) return { erro: 'Nada foi alterado (sem permissão ou o registo já não existe).' };
  return { ok: true };
}

// Chama a Edge Function "criar-utilizador" (cria/apaga contas de login — precisa da chave secreta, que só existe no servidor)
async function chamarFuncao(corpo) {
  const { data, error } = await supabase.functions.invoke('criar-utilizador', { body: corpo });
  if (error) {
    let msg = error.message;
    try {
      const resposta = await error.context.json();   // quando a função responde 4xx a mensagem vem aqui
      if (resposta?.erro) msg = resposta.erro;
    } catch { /* fica a mensagem genérica */ }
    return { erro: msg };
  }
  if (data?.erro) return { erro: data.erro };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) LER DADOS DA BASE DE DADOS  →  desenhar na interface
// ─────────────────────────────────────────────────────────────────────────────

// As minhas férias + saldo   (tabela pedidos_ferias; saldo vem de utilizadores)
async function carregarMinhasFerias() {
  const eu = perfilAtual;
  const meus = lista(await supabase
    .from('pedidos_ferias')
    .select('id, data_inicio, data_fim, estado, justificacao, data_submissao')
    .eq('utilizador_id', eu.id)
    .order('data_submissao', { ascending: false }));

  UI.renderMeusPedidos(meus);

  // "Pendentes" = dias úteis dos meus pedidos ainda por decidir (calculado aqui, não está guardado)
  const pendentes = meus
    .filter((p) => p.estado === 'Pendente')
    .reduce((soma, p) => soma + UI.diasUteis(p.data_inicio, p.data_fim), 0);

  UI.renderSaldo({
    dias_totais_ano: eu.dias_totais_ano,
    dias_disponiveis: eu.dias_disponiveis,
    dias_pendentes: pendentes,
  });
}

// Pedidos da equipa (Chefe: só o seu departamento, sem os dele; Admin: todos)
// junta com utilizadores para ter o nome
async function carregarPedidosEquipa() {
  const eu = perfilAtual;
  let consulta = supabase
    .from('pedidos_ferias')
    .select('id, utilizador_id, data_inicio, data_fim, estado, justificacao, data_submissao, utilizadores!inner(nome, departamento_id)')
    .order('data_submissao', { ascending: false });

  if (eu.cargo === 'Chefe') {
    if (!eu.departamento_id) { UI.renderPedidosEquipa([]); return; }
    consulta = consulta.eq('utilizadores.departamento_id', eu.departamento_id).neq('utilizador_id', eu.id);
  }
  const pedidos = lista(await consulta).map((p) => ({ ...p, nome: p.utilizadores.nome }));
  UI.renderPedidosEquipa(pedidos);
}

// Calendário: pedidos Aceites e Pendentes do departamento (o Admin escolhe o departamento)
async function carregarCalendario() {
  const eu = perfilAtual;
  const dep = eu.cargo === 'Admin'
    ? (Number(document.getElementById('cal-departamento').value) || null)
    : eu.departamento_id;

  if (!dep) { UI.renderCalendario([]); return; }

  const pedidos = lista(await supabase
    .from('pedidos_ferias')
    .select('id, utilizador_id, data_inicio, data_fim, estado, utilizadores!inner(nome, departamento_id)')
    .eq('utilizadores.departamento_id', dep)
    .in('estado', ['Aceite', 'Pendente']))
    .map((p) => ({ ...p, nome: p.utilizadores.nome }));

  UI.renderCalendario(pedidos);
}

// Notificações da pessoa que fez login (tabela notificacoes)
async function carregarNotificacoes() {
  const nots = lista(await supabase
    .from('notificacoes')
    .select('id, mensagem, lida, data_criacao')
    .eq('utilizador_id', perfilReal.id)
    .order('data_criacao', { ascending: false }));
  UI.renderNotificacoes(nots);
}

// Chefe: colaboradores do departamento + os pedidos de mais dias que ele fez
async function carregarMaisDiasChefe() {
  const eu = perfilAtual;
  if (!eu.departamento_id) {
    UI.preencherSelectColaboradores([]);
    UI.renderMaisDiasChefe([]);
    return;
  }

  const colaboradores = lista(await supabase
    .from('utilizadores')
    .select('id, nome')
    .eq('departamento_id', eu.departamento_id)
    .eq('cargo', 'Colaborador')
    .order('nome'));
  UI.preencherSelectColaboradores(colaboradores);

  // "colaborador:utilizadores!colaborador_id(nome)" = junta o nome do colaborador (a tabela tem 2 ligações a utilizadores)
  const pedidos = lista(await supabase
    .from('pedidos_alteracao_limite')
    .select('id, colaborador_id, dias_ajuste, justificacao, estado, data_pedido, colaborador:utilizadores!colaborador_id(nome)')
    .eq('chefe_id', eu.id)
    .order('data_pedido', { ascending: false }))
    .map((p) => ({ ...p, nome_colaborador: p.colaborador?.nome }));
  UI.renderMaisDiasChefe(pedidos);
}

// Admin: departamentos, utilizadores, pedidos de mais dias, "ver como"
async function carregarAdmin() {
  const [deps, utilizadores, mais] = await Promise.all([
    supabase.from('departamentos').select('id, nome, chefe_id').order('nome'),
    supabase.from('utilizadores').select(COLUNAS_PERFIL).order('nome'),
    supabase
      .from('pedidos_alteracao_limite')
      .select('id, dias_ajuste, justificacao, estado, data_pedido, chefe:utilizadores!chefe_id(nome), colaborador:utilizadores!colaborador_id(nome)')
      .order('data_pedido', { ascending: false }),
  ]);
  const departamentos = lista(deps);
  const todos = lista(utilizadores);

  UI.preencherSelectDepartamentos(departamentos);       // calendário e formulário de criar utilizador
  UI.renderDepartamentos(departamentos, todos);
  UI.renderUtilizadores(todos, departamentos);
  UI.preencherSelectVerComo(todos.filter((u) => u.cargo !== 'Admin'));
  UI.renderMaisDiasAdmin(lista(mais).map((p) => ({
    ...p, nome_chefe: p.chefe?.nome, nome_colaborador: p.colaborador?.nome,
  })));
}

// Carrega tudo o que o cargo atual precisa
async function carregarDados() {
  if (!perfilAtual) return;

  // volta a ler o perfil (o saldo pode ter mudado depois de aceitarem um pedido)
  const { data: fresco } = await supabase
    .from('utilizadores').select(COLUNAS_PERFIL).eq('id', perfilAtual.id).maybeSingle();
  if (fresco) {
    perfilAtual = fresco;
    if (!aVerComo) perfilReal = fresco;
  }

  const cargo = perfilAtual.cargo;
  const tarefas = [carregarNotificacoes()];

  if (cargo === 'Colaborador' || cargo === 'Chefe') tarefas.push(carregarMinhasFerias());
  if (cargo === 'Chefe') {
    tarefas.push(carregarPedidosEquipa(), carregarMaisDiasChefe(), carregarCalendario());
  } else if (cargo === 'Colaborador') {
    tarefas.push(carregarCalendario());
  } else if (cargo === 'Admin') {
    // o calendário do Admin precisa da lista de departamentos já preenchida
    tarefas.push(carregarAdmin().then(() => Promise.all([carregarPedidosEquipa(), carregarCalendario()])));
  }
  await Promise.all(tarefas);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) AÇÕES (botões da interface)  →  guardar na base de dados
//    Cada uma devolve { ok: true } ou { erro: 'texto' }. A interface mostra o aviso
//    e, se correu bem, chama UI.acoes.recarregar() para voltar a ler tudo.
// ─────────────────────────────────────────────────────────────────────────────
UI.acoes.recarregar = carregarDados;
UI.acoes.mudouDepartamento = () => carregarCalendario();   // Admin escolheu outro departamento no calendário
// UI.acoes.mudouMes: não é preciso, o calendário já recebe todos os pedidos do departamento

// ── Pedidos de férias ─────────────────────────────────────────────────────────
// Novo pedido → INSERT em pedidos_ferias (utilizador_id, data_inicio, data_fim).
// estado='Pendente' e data_submissao=now() são valores por defeito da tabela.
// As regras (datas passadas, sobreposição, saldo, limite de 3) estão no trigger da BD.
UI.acoes.criarPedido = async ({ data_inicio, data_fim }) => {
  const { error } = await supabase
    .from('pedidos_ferias')
    .insert({ utilizador_id: perfilAtual.id, data_inicio, data_fim });
  return resultado(error);
};

// Cancelar → UPDATE pedidos_ferias SET estado='Cancelado'
UI.acoes.cancelarPedido = (id) => atualizar('pedidos_ferias', { estado: 'Cancelado' }, 'id', id);

// Chefe/Admin aceita ou recusa → UPDATE pedidos_ferias SET estado, justificacao
// Ao aceitar, o trigger da BD desconta os dias em utilizadores.dias_disponiveis.
UI.acoes.decidirPedido = (id, estado, justificacao) =>
  atualizar('pedidos_ferias', { estado, justificacao }, 'id', id);

// ── Pedidos de mais (ou menos) dias ──────────────────────────────────────────
// Chefe → INSERT em pedidos_alteracao_limite (chefe_id, colaborador_id, dias_ajuste, justificacao)
UI.acoes.criarPedidoMaisDias = async ({ colaborador_id, dias_ajuste, justificacao }) => {
  const { error } = await supabase
    .from('pedidos_alteracao_limite')
    .insert({ chefe_id: perfilAtual.id, colaborador_id, dias_ajuste, justificacao });
  return resultado(error);
};

// Admin → UPDATE pedidos_alteracao_limite SET estado. Ao aceitar, o trigger da BD
// soma dias_ajuste a utilizadores.dias_totais_ano e dias_disponiveis.
UI.acoes.decidirMaisDias = (id, estado) =>
  atualizar('pedidos_alteracao_limite', { estado }, 'id', id);

// ── Departamentos (Admin) ─────────────────────────────────────────────────────
// INSERT em departamentos (nome)
UI.acoes.criarDepartamento = async (nome) => {
  const { error } = await supabase.from('departamentos').insert({ nome });
  return resultado(error);
};

// UPDATE departamentos SET chefe_id. Quem fica chefe passa também a ter cargo 'Chefe'
// (as regras de acesso usam o cargo). chefe_id é único: uma pessoa só chefia 1 departamento.
UI.acoes.definirChefe = async (departamentoId, utilizadorId) => {
  const r = await atualizar('departamentos', { chefe_id: utilizadorId }, 'id', departamentoId);
  if (r.erro) return r;
  if (utilizadorId) {
    await supabase.from('utilizadores').update({ cargo: 'Chefe' }).eq('id', utilizadorId).eq('cargo', 'Colaborador');
  }
  return r;
};

// DELETE em departamentos (a BD recusa se ainda tiver pessoas)
UI.acoes.apagarDepartamento = async (id) => {
  const { data, error } = await supabase.from('departamentos').delete().eq('id', id).select('id');
  if (error) return { erro: textoErro(error) };
  if (!data?.length) return { erro: 'Nada foi apagado.' };
  return { ok: true };
};

// ── Utilizadores (Admin) ──────────────────────────────────────────────────────
// Criar conta de login + linha em utilizadores → Edge Function "criar-utilizador"
UI.acoes.criarUtilizador = (dados) => chamarFuncao(dados);

// UPDATE utilizadores (departamento_id e/ou dias_totais_ano).
// Se a pessoa muda de departamento deixa de ser chefe do antigo.
// Se mudam os dias por ano, o trigger da BD ajusta os dias disponíveis pela mesma diferença.
UI.acoes.atualizarUtilizador = async (id, campos) => {
  if ('departamento_id' in campos) {
    await supabase.from('departamentos').update({ chefe_id: null }).eq('chefe_id', id);
  }
  return atualizar('utilizadores', campos, 'id', id);
};

// Apagar conta de login + pedidos + linha → Edge Function "criar-utilizador" (acao: 'apagar')
UI.acoes.apagarUtilizador = (id) => chamarFuncao({ acao: 'apagar', id });

// ── "Ver como" (Admin) ────────────────────────────────────────────────────────
// Só muda o que é mostrado. As permissões continuam a ser as do Admin (RLS):
// por isso, ações que só aquela pessoa pode fazer (ex.: pedir férias em nome dela) são recusadas.
UI.acoes.verComo = async (id) => {
  const { data, error } = await supabase.from('utilizadores').select(COLUNAS_PERFIL).eq('id', id).single();
  if (error) return { erro: textoErro(error) };
  aVerComo = true;
  perfilAtual = data;
  UI.configurarPerfil(data, { verComo: true });
  return { ok: true };
};

UI.acoes.sairVerComo = async () => {
  aVerComo = false;
  perfilAtual = perfilReal;
  UI.configurarPerfil(perfilReal);
  return { ok: true };
};

// ── Notificações ──────────────────────────────────────────────────────────────
// UPDATE notificacoes SET lida=true (só a coluna "lida" pode ser alterada)
UI.acoes.marcarNotificacaoLida = (id) => atualizar('notificacoes', { lida: true }, 'id', id);

UI.acoes.marcarTodasLidas = async () => {
  const { error } = await supabase
    .from('notificacoes').update({ lida: true })
    .eq('utilizador_id', perfilReal.id).eq('lida', false);
  return resultado(error);
};

// ─────────────────────────────────────────────────────────────────────────────
// 6) LOGIN / LOGOUT
// ─────────────────────────────────────────────────────────────────────────────

// Busca o perfil da pessoa autenticada na tabela "utilizadores"
async function obterPerfilPorEmail(email) {
  const { data, error } = await supabase
    .from('utilizadores')
    .select(COLUNAS_PERFIL)
    .eq('email', email)
    .single();

  if (error || !data) {
    return { erro: error?.message || 'Perfil não encontrado na tabela utilizadores.' };
  }
  return { perfil: data };
}

// Chamado tanto no login como ao recarregar se já existir sessão
async function ativarSessao(session) {
  if (!session || !session.user?.email) {
    UI.limpar();
    alternarEcras(false);
    return;
  }

  const { perfil, erro } = await obterPerfilPorEmail(session.user.email);
  if (erro) {
    await supabase.auth.signOut();
    UI.limpar();
    alternarEcras(false);
    errorText.textContent = erro;
    return;
  }

  perfilReal = perfil;
  perfilAtual = perfil;
  aVerComo = false;

  alternarEcras(true);
  UI.configurarPerfil(perfil);   // mostra só os separadores do cargo
  await carregarDados();         // busca e desenha os dados
}

async function fazerLogin() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    errorText.textContent = error.message;
    return;
  }
  await ativarSessao(data.session);
}

async function fazerLogout() {
  await supabase.auth.signOut();
  emailInput.value = '';
  passwordInput.value = '';
  perfilReal = null;
  perfilAtual = null;
  aVerComo = false;
  UI.limpar();
  alternarEcras(false);
}

async function verificarSessaoInicial() {
  const { data } = await supabase.auth.getSession();
  await ativarSessao(data.session);
}

btnLogin.addEventListener('click', fazerLogin);
btnLogout.addEventListener('click', fazerLogout);

verificarSessaoInicial();
