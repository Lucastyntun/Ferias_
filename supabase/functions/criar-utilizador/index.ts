// Edge Function "criar-utilizador"
// Faz duas coisas, SÓ para o Admin: criar utilizadores e apagar utilizadores.
// Corre no servidor do Supabase, por isso pode usar a chave secreta (service_role).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Cliente com poderes totais (a chave só existe aqui no servidor)
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Quem está a chamar?
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
  if (erroQuem || !quem.user?.email) return responder({ erro: "Sessão inválida." }, 401);

  // 2) É Admin?
  const { data: eu } = await admin
    .from("utilizadores").select("cargo").eq("email", quem.user.email).maybeSingle();
  if (eu?.cargo !== "Admin") return responder({ erro: "Só o Admin pode fazer isto." }, 403);

  const corpo = await req.json();

  // ───────────── APAGAR UTILIZADOR ─────────────
  if (corpo.acao === "apagar") {
    const id = Number(corpo.id);
    const { data: alvo } = await admin
      .from("utilizadores").select("id, email").eq("id", id).maybeSingle();
    if (!alvo) return responder({ erro: "Utilizador não encontrado." }, 404);
    if (alvo.email === quem.user.email) {
      return responder({ erro: "Não podes apagar a tua própria conta." }, 400);
    }

    // apagar primeiro tudo o que está ligado a esta pessoa (por causa das chaves estrangeiras)
    await admin.from("notificacoes").delete().eq("utilizador_id", id);
    await admin.from("pedidos_alteracao_limite").delete().or(`chefe_id.eq.${id},colaborador_id.eq.${id}`);
    await admin.from("pedidos_ferias").delete().eq("utilizador_id", id);
    await admin.from("departamentos").update({ chefe_id: null }).eq("chefe_id", id);

    const { error: erroApagar } = await admin.from("utilizadores").delete().eq("id", id);
    if (erroApagar) return responder({ erro: erroApagar.message }, 400);

    // por fim, a conta de login
    const { data: contas } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const conta = contas?.users.find((u) => u.email?.toLowerCase() === alvo.email.toLowerCase());
    if (conta) await admin.auth.admin.deleteUser(conta.id);

    return responder({ ok: true });
  }

  // ───────────── CRIAR UTILIZADOR ─────────────
  const { nome, email, password, cargo, departamento_id, dias_totais_ano } = corpo;
  if (!nome || !email || !password || password.length < 6) {
    return responder({ erro: "Nome, email e palavra-passe (mín. 6 caracteres) são obrigatórios." }, 400);
  }
  if (!["Admin", "Chefe", "Colaborador"].includes(cargo)) {
    return responder({ erro: "Cargo inválido." }, 400);
  }
  const dias = Number.isInteger(dias_totais_ano) && dias_totais_ano >= 0 ? dias_totais_ano : 22;

  // conta de login (Supabase Auth)
  const { data: conta, error: erroConta } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (erroConta) return responder({ erro: erroConta.message }, 400);

  // linha na tabela utilizadores (o email liga as duas coisas)
  const { data: linha, error: erroLinha } = await admin.from("utilizadores").insert({
    nome, email, cargo,
    departamento_id: departamento_id ?? null,
    dias_totais_ano: dias,
    dias_disponiveis: dias,
    password_hash: "gerida-pelo-supabase-auth",
  }).select().single();

  if (erroLinha) {
    await admin.auth.admin.deleteUser(conta.user.id); // desfaz a conta
    return responder({ erro: erroLinha.message }, 400);
  }
  return responder({ ok: true, utilizador: linha });
});
