import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabaseUrl = 'https://tbdwpvavrrhlhmxjksug.supabase.co';
const supabaseKey = 'sb_publishable_-i974_YY15b2XEfLqYcJOw_hb6TSTAt';
const supabase = createClient(supabaseUrl, supabaseKey);

const loginScreen = document.getElementById('login-screen');
const blackScreen = document.getElementById('black-screen');
const emailInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const errorText = document.getElementById('error');

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

// Busca o perfil da pessoa autenticada na tabela "utilizadores"
async function obterPerfilPorEmail(email) {
  const { data, error } = await supabase
    .from('utilizadores')
    .select('id, nome, email, cargo, departamento_id, dias_totais_ano, dias_disponiveis')
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
    window.UI?.limpar?.();
    alternarEcras(false);
    return;
  }

  const { perfil, erro } = await obterPerfilPorEmail(session.user.email);
  if (erro) {
    await supabase.auth.signOut();
    window.UI?.limpar?.();
    alternarEcras(false);
    errorText.textContent = erro;
    return;
  }

  alternarEcras(true);
  window.UI?.configurarPerfil?.(perfil);

  // Aqui a seguir ligas o carregamento dos dados (UI.render...) e UI.acoes.*
}

async function fazerLogin() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

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
  window.UI?.limpar?.();
  alternarEcras(false);
}

async function verificarSessaoInicial() {
  const { data } = await supabase.auth.getSession();
  await ativarSessao(data.session);
}

btnLogin.addEventListener('click', fazerLogin);
btnLogout.addEventListener('click', fazerLogout);

verificarSessaoInicial();