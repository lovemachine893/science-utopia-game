/**
 * ログイン（Supabase Auth のメール magic link）。koshimizu-futures の AuthModal を簡略化したもの。
 * メールアドレスを入れる → 届いたメールのリンクを開くとこのサイトに戻ってログイン済みになる。
 * メールに 6 桁のコードがあれば、ここに入れてもログインできる。
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

const CODE_LENGTH = 6;

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = window.setInterval(() => setCooldownSec((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [cooldownSec]);

  if (!open || !supabase) return null;
  const sb = supabase;

  const send = async () => {
    const addr = email.trim();
    if (!addr || loading || cooldownSec > 0) return;
    setLoading(true);
    setError("");
    const { error: e } = await sb.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (e) {
      const wait = e.message.match(/after\s+(\d+)\s+seconds/i);
      if (wait || e.message.includes("rate_limit")) {
        const sec = wait ? Number(wait[1]) : 60;
        setCooldownSec(sec);
        setError(`メール送信が混み合っています。${sec} 秒後にもう一度試してください。`);
      } else setError(e.message);
      return;
    }
    setSent(true);
    setCooldownSec(30);
  };

  const verify = async () => {
    const token = code.replace(/\D/g, "");
    if (token.length !== CODE_LENGTH || loading) return;
    setLoading(true);
    setError("");
    const { error: e } = await sb.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    setLoading(false);
    if (e) {
      setError("コードが違うか、期限切れです。");
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="ログイン"
        className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">ログイン</h2>
        {!sent ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">メールアドレスにログイン用のリンクを送ります。</p>
            <input
              type="email"
              autoComplete="email"
              aria-label="メールアドレス"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <Button onClick={send} disabled={!email.trim() || loading || cooldownSec > 0}>
              {loading ? "送信中…" : cooldownSec > 0 ? `${cooldownSec} 秒後に再送できます` : "ログインリンクを送る"}
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{email.trim()}</span> にメールを送りました。
              メールのリンクを開くとログインできます。6 桁のコードが書かれていれば、ここに入れてもログインできます。
            </p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="6桁のコード"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              className="rounded-lg border px-3 py-2 text-center font-mono text-lg tracking-widest"
            />
            <Button onClick={verify} disabled={code.length !== CODE_LENGTH || loading}>
              コードでログイン
            </Button>
            <Button variant="ghost" onClick={() => { setSent(false); setCode(""); setError(""); }}>
              メールアドレスを入れ直す
            </Button>
          </div>
        )}
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        <button className="mt-4 w-full text-xs text-muted-foreground underline" onClick={onClose}>
          閉じる（ゲストのまま遊ぶ）
        </button>
      </div>
    </div>
  );
}
