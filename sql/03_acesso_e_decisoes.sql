-- PASSO 3: quem pode ver/fazer o quê (RLS) + aceitar/recusar/cancelar pedidos de férias
-- (Corre depois do 02. Os dados de teste - departamento Vendas etc. - são feitos à parte.)

-- 1) Funções de ajuda: "quem sou eu?" (lêem o email do login)
CREATE OR REPLACE FUNCTION meu_utilizador_id() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT id FROM utilizadores WHERE email = (auth.jwt() ->> 'email') $$;

CREATE OR REPLACE FUNCTION meu_cargo() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT cargo FROM utilizadores WHERE email = (auth.jwt() ->> 'email') $$;

CREATE OR REPLACE FUNCTION meu_departamento() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT departamento_id FROM utilizadores WHERE email = (auth.jwt() ->> 'email') $$;

CREATE OR REPLACE FUNCTION departamento_de(uid integer) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT departamento_id FROM utilizadores WHERE id = uid $$;

REVOKE EXECUTE ON FUNCTION meu_utilizador_id(), meu_cargo(), meu_departamento(), departamento_de(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION meu_utilizador_id(), meu_cargo(), meu_departamento(), departamento_de(integer) TO authenticated;

-- 2) Políticas de pedidos_ferias
CREATE POLICY ped_ver ON pedidos_ferias FOR SELECT TO authenticated
USING (
  meu_cargo() = 'Admin'
  OR utilizador_id = meu_utilizador_id()
  OR (meu_departamento() IS NOT NULL AND departamento_de(utilizador_id) = meu_departamento())
);

CREATE POLICY ped_criar ON pedidos_ferias FOR INSERT TO authenticated
WITH CHECK (utilizador_id = meu_utilizador_id());

CREATE POLICY ped_atualizar ON pedidos_ferias FOR UPDATE TO authenticated
USING (
  utilizador_id = meu_utilizador_id()
  OR meu_cargo() = 'Admin'
  OR (meu_cargo() = 'Chefe' AND departamento_de(utilizador_id) = meu_departamento())
);

-- 3) Para o calendário mostrar nomes e os departamentos aparecerem
CREATE POLICY ler_colegas ON utilizadores FOR SELECT TO authenticated
USING (
  meu_cargo() = 'Admin'
  OR (meu_departamento() IS NOT NULL AND departamento_id = meu_departamento())
);

CREATE POLICY ler_departamentos ON departamentos FOR SELECT TO authenticated
USING (true);

-- 4) Trigger: aceitar / recusar / cancelar (e mexer no saldo)
CREATE OR REPLACE FUNCTION validar_alteracao_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  email_atual text := auth.jwt() ->> 'email';
  eu    utilizadores%ROWTYPE;
  dono  utilizadores%ROWTYPE;
  hoje  date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  dias  integer;
  dia   date;
BEGIN
  IF NEW.utilizador_id <> OLD.utilizador_id
     OR NEW.data_inicio <> OLD.data_inicio OR NEW.data_fim <> OLD.data_fim THEN
    RAISE EXCEPTION 'Não é permitido alterar as datas nem o dono de um pedido.';
  END IF;

  IF NEW.estado = OLD.estado THEN
    IF NEW.justificacao IS DISTINCT FROM OLD.justificacao THEN
      RAISE EXCEPTION 'A justificação só pode ser escrita ao aceitar ou recusar.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO dono FROM utilizadores WHERE id = OLD.utilizador_id;
  dias := dias_uteis(OLD.data_inicio, OLD.data_fim);

  IF email_atual IS NOT NULL THEN
    SELECT * INTO eu FROM utilizadores WHERE email = email_atual;
    IF eu.id IS NULL THEN RAISE EXCEPTION 'Utilizador não encontrado.'; END IF;

    IF NEW.estado = 'Cancelado' THEN
      IF NOT (eu.id = OLD.utilizador_id OR eu.cargo = 'Admin') THEN
        RAISE EXCEPTION 'Só o dono do pedido (ou o Admin) o pode cancelar.';
      END IF;
    ELSIF NEW.estado IN ('Aceite', 'Recusado') THEN
      IF eu.id = OLD.utilizador_id THEN
        RAISE EXCEPTION 'Não podes decidir os teus próprios pedidos.';
      END IF;
      IF NOT (eu.cargo = 'Admin'
              OR (eu.cargo = 'Chefe' AND eu.departamento_id IS NOT NULL
                  AND eu.departamento_id = dono.departamento_id)) THEN
        RAISE EXCEPTION 'Só o chefe do departamento ou o Admin podem decidir.';
      END IF;
    ELSE
      RAISE EXCEPTION 'Estado inválido: %.', NEW.estado;
    END IF;
  END IF;

  IF OLD.estado = 'Pendente' AND NEW.estado IN ('Aceite', 'Recusado', 'Cancelado') THEN
    NULL;
  ELSIF OLD.estado = 'Aceite' AND NEW.estado = 'Cancelado' THEN
    IF OLD.data_inicio <= hoje THEN
      RAISE EXCEPTION 'Férias que já começaram não se podem cancelar.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Não é possível passar de % para %.', OLD.estado, NEW.estado;
  END IF;

  IF NEW.estado IN ('Aceite', 'Recusado') AND coalesce(trim(NEW.justificacao), '') = '' THEN
    RAISE EXCEPTION 'A justificação é obrigatória ao aceitar ou recusar.';
  END IF;

  IF NEW.estado = 'Aceite' THEN
    IF OLD.data_inicio < hoje THEN
      RAISE EXCEPTION 'Não se pode aceitar férias de datas que já passaram.';
    END IF;
    IF dias > coalesce(dono.dias_disponiveis, 0) THEN
      RAISE EXCEPTION 'O colaborador não tem dias suficientes (disponíveis: %).', coalesce(dono.dias_disponiveis, 0);
    END IF;

    IF dono.departamento_id IS NOT NULL THEN
      FOR dia IN
        SELECT d::date FROM generate_series(OLD.data_inicio::timestamp, OLD.data_fim::timestamp, interval '1 day') d
        WHERE extract(isodow FROM d) < 6
      LOOP
        IF (SELECT count(DISTINCT p.utilizador_id)
            FROM pedidos_ferias p JOIN utilizadores u ON u.id = p.utilizador_id
            WHERE u.departamento_id = dono.departamento_id
              AND p.estado = 'Aceite'
              AND p.utilizador_id <> OLD.utilizador_id
              AND p.data_inicio <= dia AND p.data_fim >= dia) >= 3 THEN
          RAISE EXCEPTION 'No dia % já há 3 pessoas do departamento de férias.', to_char(dia, 'DD/MM/YYYY');
        END IF;
      END LOOP;
    END IF;

    UPDATE utilizadores SET dias_disponiveis = dias_disponiveis - dias WHERE id = dono.id;

  ELSIF OLD.estado = 'Aceite' AND NEW.estado = 'Cancelado' THEN
    UPDATE utilizadores SET dias_disponiveis = dias_disponiveis + dias WHERE id = dono.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_alteracao_pedido ON pedidos_ferias;
CREATE TRIGGER trg_validar_alteracao_pedido
  BEFORE UPDATE ON pedidos_ferias
  FOR EACH ROW EXECUTE FUNCTION validar_alteracao_pedido();
