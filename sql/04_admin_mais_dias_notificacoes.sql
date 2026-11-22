-- PASSO 4: Admin (departamentos/utilizadores), pedidos de mais dias, notificações
-- (Corre depois do 03.)

-- 1) Admin gere departamentos (criar, mudar chefe, apagar)
CREATE POLICY dep_admin ON departamentos FOR ALL TO authenticated
USING (meu_cargo() = 'Admin') WITH CHECK (meu_cargo() = 'Admin');

-- 2) Admin altera utilizadores (departamento, dias por ano)
CREATE POLICY util_admin_atualizar ON utilizadores FOR UPDATE TO authenticated
USING (meu_cargo() = 'Admin') WITH CHECK (meu_cargo() = 'Admin');

-- Se o Admin muda os dias por ano, o saldo muda pela mesma diferença
CREATE OR REPLACE FUNCTION ajustar_saldo_ao_mudar_total() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.dias_totais_ano IS DISTINCT FROM OLD.dias_totais_ano
     AND NEW.dias_disponiveis IS NOT DISTINCT FROM OLD.dias_disponiveis THEN
    NEW.dias_disponiveis := OLD.dias_disponiveis + (NEW.dias_totais_ano - OLD.dias_totais_ano);
    IF NEW.dias_disponiveis < 0 THEN
      RAISE EXCEPTION 'Esse total é inferior aos dias que a pessoa já gastou ou tem aceites.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ajustar_saldo ON utilizadores;
CREATE TRIGGER trg_ajustar_saldo
  BEFORE UPDATE ON utilizadores
  FOR EACH ROW EXECUTE FUNCTION ajustar_saldo_ao_mudar_total();

-- 3) Pedidos de mais (ou menos) dias
CREATE POLICY alt_ver ON pedidos_alteracao_limite FOR SELECT TO authenticated
USING (meu_cargo() = 'Admin' OR chefe_id = meu_utilizador_id());

CREATE POLICY alt_criar ON pedidos_alteracao_limite FOR INSERT TO authenticated
WITH CHECK (
  meu_cargo() = 'Chefe' AND chefe_id = meu_utilizador_id()
  AND meu_departamento() IS NOT NULL
  AND departamento_de(colaborador_id) = meu_departamento()
);

CREATE POLICY alt_decidir ON pedidos_alteracao_limite FOR UPDATE TO authenticated
USING (meu_cargo() = 'Admin') WITH CHECK (meu_cargo() = 'Admin');

CREATE OR REPLACE FUNCTION validar_alteracao_limite() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dono utilizadores%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.dias_ajuste, 0) = 0 THEN
      RAISE EXCEPTION 'Indica um número de dias diferente de zero.';
    END IF;
    IF coalesce(trim(NEW.justificacao), '') = '' THEN
      RAISE EXCEPTION 'A justificação é obrigatória.';
    END IF;
    NEW.estado := 'Pendente';
    RETURN NEW;
  END IF;

  IF NEW.chefe_id <> OLD.chefe_id OR NEW.colaborador_id <> OLD.colaborador_id
     OR NEW.dias_ajuste <> OLD.dias_ajuste
     OR NEW.justificacao IS DISTINCT FROM OLD.justificacao THEN
    RAISE EXCEPTION 'Só o estado de um pedido pode ser alterado.';
  END IF;
  IF NEW.estado = OLD.estado THEN RETURN NEW; END IF;
  IF OLD.estado <> 'Pendente' THEN
    RAISE EXCEPTION 'Este pedido já foi decidido.';
  END IF;

  IF NEW.estado = 'Aceite' THEN
    SELECT * INTO dono FROM utilizadores WHERE id = OLD.colaborador_id;
    IF dono.dias_disponiveis + OLD.dias_ajuste < 0 OR dono.dias_totais_ano + OLD.dias_ajuste < 0 THEN
      RAISE EXCEPTION 'Aceitar deixaria o saldo do colaborador negativo.';
    END IF;
    UPDATE utilizadores
    SET dias_totais_ano = dias_totais_ano + OLD.dias_ajuste,
        dias_disponiveis = dias_disponiveis + OLD.dias_ajuste
    WHERE id = OLD.colaborador_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_alteracao_limite ON pedidos_alteracao_limite;
CREATE TRIGGER trg_validar_alteracao_limite
  BEFORE INSERT OR UPDATE ON pedidos_alteracao_limite
  FOR EACH ROW EXECUTE FUNCTION validar_alteracao_limite();

-- 4) Notificações: cada um só vê as suas e só pode marcar como lidas
CREATE POLICY notif_ver ON notificacoes FOR SELECT TO authenticated
USING (utilizador_id = meu_utilizador_id());

CREATE POLICY notif_marcar ON notificacoes FOR UPDATE TO authenticated
USING (utilizador_id = meu_utilizador_id())
WITH CHECK (utilizador_id = meu_utilizador_id());

REVOKE UPDATE ON notificacoes FROM authenticated, anon;
GRANT  UPDATE (lida) ON notificacoes TO authenticated;

-- quem cria notificações são só os triggers (ninguém pode chamar isto pelo site)
CREATE OR REPLACE FUNCTION notificar(destino integer, texto text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ INSERT INTO notificacoes (utilizador_id, mensagem) VALUES (destino, texto) $$;
REVOKE EXECUTE ON FUNCTION notificar(integer, text) FROM PUBLIC, anon, authenticated;

-- novo pedido de férias -> avisa o chefe do departamento (ou os Admins se não houver chefe)
CREATE OR REPLACE FUNCTION notif_pedido_novo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE quem utilizadores%ROWTYPE; chefe integer; texto text; adm integer;
BEGIN
  SELECT * INTO quem FROM utilizadores WHERE id = NEW.utilizador_id;
  texto := format('Novo pedido de férias de %s: %s a %s.', quem.nome,
                  to_char(NEW.data_inicio, 'DD/MM/YYYY'), to_char(NEW.data_fim, 'DD/MM/YYYY'));
  SELECT chefe_id INTO chefe FROM departamentos WHERE id = quem.departamento_id;
  IF chefe IS NOT NULL AND chefe <> quem.id THEN
    PERFORM notificar(chefe, texto);
  ELSE
    FOR adm IN SELECT id FROM utilizadores WHERE cargo = 'Admin' AND id <> quem.id LOOP
      PERFORM notificar(adm, texto);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_pedido_novo ON pedidos_ferias;
CREATE TRIGGER trg_notif_pedido_novo
  AFTER INSERT ON pedidos_ferias
  FOR EACH ROW EXECUTE FUNCTION notif_pedido_novo();

-- pedido decidido -> avisa o dono; pedido cancelado -> avisa o chefe
CREATE OR REPLACE FUNCTION notif_pedido_estado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE quem utilizadores%ROWTYPE; chefe integer; periodo text;
BEGIN
  periodo := to_char(NEW.data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(NEW.data_fim, 'DD/MM/YYYY');
  IF NEW.estado IN ('Aceite', 'Recusado') THEN
    PERFORM notificar(NEW.utilizador_id,
      format('O teu pedido de férias (%s) foi %s. Justificação: %s', periodo, lower(NEW.estado), NEW.justificacao));
  ELSIF NEW.estado = 'Cancelado' THEN
    SELECT * INTO quem FROM utilizadores WHERE id = NEW.utilizador_id;
    SELECT chefe_id INTO chefe FROM departamentos WHERE id = quem.departamento_id;
    IF chefe IS NOT NULL AND chefe <> quem.id THEN
      PERFORM notificar(chefe, format('%s cancelou o pedido de férias (%s).', quem.nome, periodo));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_pedido_estado ON pedidos_ferias;
CREATE TRIGGER trg_notif_pedido_estado
  AFTER UPDATE ON pedidos_ferias
  FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION notif_pedido_estado();

-- pedido de mais dias -> avisa os Admins; decidido -> avisa o chefe
CREATE OR REPLACE FUNCTION notif_alteracao_limite() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE chefe_u utilizadores%ROWTYPE; colab utilizadores%ROWTYPE; adm integer;
BEGIN
  SELECT * INTO chefe_u FROM utilizadores WHERE id = NEW.chefe_id;
  SELECT * INTO colab   FROM utilizadores WHERE id = NEW.colaborador_id;
  IF TG_OP = 'INSERT' THEN
    FOR adm IN SELECT id FROM utilizadores WHERE cargo = 'Admin' LOOP
      PERFORM notificar(adm, format('%s pediu %s dia(s) para %s. Motivo: %s',
        chefe_u.nome, NEW.dias_ajuste, colab.nome, NEW.justificacao));
    END LOOP;
  ELSE
    PERFORM notificar(NEW.chefe_id, format('O teu pedido de %s dia(s) para %s foi %s.',
      NEW.dias_ajuste, colab.nome, lower(NEW.estado)));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_alt_novo ON pedidos_alteracao_limite;
CREATE TRIGGER trg_notif_alt_novo
  AFTER INSERT ON pedidos_alteracao_limite
  FOR EACH ROW EXECUTE FUNCTION notif_alteracao_limite();

DROP TRIGGER IF EXISTS trg_notif_alt_estado ON pedidos_alteracao_limite;
CREATE TRIGGER trg_notif_alt_estado
  AFTER UPDATE ON pedidos_alteracao_limite
  FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION notif_alteracao_limite();
