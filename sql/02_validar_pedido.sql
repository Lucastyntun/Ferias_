-- PASSO 2: regras dos pedidos de férias (corre tudo de uma vez no SQL Editor)

-- 1) Conta dias úteis (segunda a sexta) entre duas datas, inclusive
CREATE OR REPLACE FUNCTION dias_uteis(inicio date, fim date)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT count(*)::integer
  FROM generate_series(inicio::timestamp, fim::timestamp, interval '1 day') AS dia
  WHERE extract(isodow FROM dia) < 6;
$$;

-- 2) Valida um pedido ANTES de ele ser guardado
CREATE OR REPLACE FUNCTION validar_pedido_ferias()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hoje date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  dep integer;
  saldo integer;
  dia date;
BEGIN
  IF NEW.data_fim < NEW.data_inicio THEN
    RAISE EXCEPTION 'A data de fim não pode ser antes da data de início.';
  END IF;

  IF NEW.data_inicio < hoje THEN
    RAISE EXCEPTION 'Não podes pedir férias em datas que já passaram.';
  END IF;

  IF dias_uteis(NEW.data_inicio, NEW.data_fim) = 0 THEN
    RAISE EXCEPTION 'O período escolhido não tem dias úteis.';
  END IF;

  -- sobreposição com outros pedidos do próprio utilizador
  IF EXISTS (
    SELECT 1 FROM pedidos_ferias p
    WHERE p.utilizador_id = NEW.utilizador_id
      AND p.estado IN ('Pendente','Aceite')
      AND p.data_inicio <= NEW.data_fim AND p.data_fim >= NEW.data_inicio
  ) THEN
    RAISE EXCEPTION 'Já tens um pedido (pendente ou aceite) que se sobrepõe a estas datas.';
  END IF;

  -- saldo
  SELECT u.departamento_id, u.dias_disponiveis INTO dep, saldo
  FROM utilizadores u WHERE u.id = NEW.utilizador_id;

  IF dias_uteis(NEW.data_inicio, NEW.data_fim) > COALESCE(saldo, 0) THEN
    RAISE EXCEPTION 'Não tens dias suficientes (disponíveis: %).', COALESCE(saldo, 0);
  END IF;

  -- limite de 3 pessoas por dia, só no mesmo departamento
  IF dep IS NOT NULL THEN
    FOR dia IN
      SELECT d::date FROM generate_series(NEW.data_inicio::timestamp, NEW.data_fim::timestamp, interval '1 day') d
      WHERE extract(isodow FROM d) < 6
    LOOP
      IF (SELECT count(DISTINCT p.utilizador_id)
          FROM pedidos_ferias p
          JOIN utilizadores u ON u.id = p.utilizador_id
          WHERE u.departamento_id = dep
            AND p.estado = 'Aceite'
            AND p.utilizador_id <> NEW.utilizador_id
            AND p.data_inicio <= dia AND p.data_fim >= dia) >= 3 THEN
        RAISE EXCEPTION 'No dia % já há 3 pessoas do teu departamento de férias.', to_char(dia, 'DD/MM/YYYY');
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_pedido_ferias ON pedidos_ferias;
CREATE TRIGGER trg_validar_pedido_ferias
  BEFORE INSERT ON pedidos_ferias
  FOR EACH ROW EXECUTE FUNCTION validar_pedido_ferias();
