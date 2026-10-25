-- Science Utopia: /api/su-llm のユーザー別・日別の利用回数。
-- 書込みは Vercel Function（service role）だけ。ログインユーザーは自分の行だけ読める。
-- day は日本時間の日付（api/_lib/suAuth.ts の jstDay と同じ）。

CREATE TABLE IF NOT EXISTS public.su_llm_usage (
  user_id    uuid    NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  day        date    NOT NULL,
  calls      integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  tokens_in  integer NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out integer NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.su_llm_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.su_llm_usage FROM anon, authenticated;
GRANT SELECT ON public.su_llm_usage TO authenticated;
GRANT ALL ON public.su_llm_usage TO service_role;

DROP POLICY IF EXISTS "su_llm_usage_select_own" ON public.su_llm_usage;
CREATE POLICY "su_llm_usage_select_own" ON public.su_llm_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- INSERT / UPDATE / DELETE のポリシーは作らない（service role は RLS を通らない）。

-- 1 回分を予約する。上限未満なら calls を 1 増やして新しい calls を返す。
-- 上限に達していれば何も変えずに -1 を返す。行ロックで同時呼出しでも上限を超えない。
CREATE OR REPLACE FUNCTION public.su_llm_consume(p_user_id uuid, p_day date, p_limit integer)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_calls integer;
BEGIN
  INSERT INTO public.su_llm_usage (user_id, day, calls)
  VALUES (p_user_id, p_day, 0)
  ON CONFLICT (user_id, day) DO NOTHING;

  UPDATE public.su_llm_usage
     SET calls = calls + 1, updated_at = now()
   WHERE user_id = p_user_id AND day = p_day AND calls < p_limit
  RETURNING calls INTO v_calls;

  RETURN COALESCE(v_calls, -1);
END;
$$;

-- LLM の応答後にトークン数を足す。
CREATE OR REPLACE FUNCTION public.su_llm_add_tokens(p_user_id uuid, p_day date, p_in integer, p_out integer)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.su_llm_usage
     SET tokens_in = tokens_in + GREATEST(p_in, 0),
         tokens_out = tokens_out + GREATEST(p_out, 0),
         updated_at = now()
   WHERE user_id = p_user_id AND day = p_day;
$$;

REVOKE ALL ON FUNCTION public.su_llm_consume(uuid, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.su_llm_add_tokens(uuid, date, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.su_llm_consume(uuid, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.su_llm_add_tokens(uuid, date, integer, integer) TO service_role;
