-- Science Utopia: /api/su-llm の IP 別・日別の利用回数（乱用防止）。
-- IP は塩付きハッシュ（api/_lib/suAuth.ts の ipKey）だけを保存する。service role のみ。

CREATE TABLE IF NOT EXISTS public.su_llm_ip_usage (
  ip_key     text    NOT NULL,
  day        date    NOT NULL,
  calls      integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_key, day)
);

ALTER TABLE public.su_llm_ip_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.su_llm_ip_usage FROM anon, authenticated;
GRANT ALL ON public.su_llm_ip_usage TO service_role;
-- ポリシーは作らない（一般ユーザーは読み書きできない）。

-- 上限未満なら calls を 1 増やして新しい値を返す。上限なら -1。
CREATE OR REPLACE FUNCTION public.su_llm_consume_ip(p_ip_key text, p_day date, p_limit integer)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_calls integer;
BEGIN
  INSERT INTO public.su_llm_ip_usage (ip_key, day, calls)
  VALUES (p_ip_key, p_day, 0)
  ON CONFLICT (ip_key, day) DO NOTHING;

  UPDATE public.su_llm_ip_usage
     SET calls = calls + 1, updated_at = now()
   WHERE ip_key = p_ip_key AND day = p_day AND calls < p_limit
  RETURNING calls INTO v_calls;

  RETURN COALESCE(v_calls, -1);
END;
$$;

REVOKE ALL ON FUNCTION public.su_llm_consume_ip(text, date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.su_llm_consume_ip(text, date, integer) TO service_role;
