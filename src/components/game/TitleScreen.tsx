import { Button } from "@/components/ui/button";
import type { AuthUser } from "@/lib/auth";

type Props = {
  onStart: () => void;
  user: AuthUser | null;
  authAvailable: boolean;
  onLogin: () => void;
  onSignOut: () => void;
  remaining?: number | null;
};

export function TitleScreen({ onStart, user, authAvailable, onLogin, onSignOut, remaining }: Props) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col items-center justify-center gap-12 px-6 text-center">
      <h1 className="text-2xl font-semibold leading-relaxed md:text-3xl">あなたの考える良い科学を育ててください</h1>
      <Button onClick={onStart} className="px-10">
        はじめる
      </Button>
      <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground" data-testid="account">
        {user ? (
          <>
            <p>
              ログイン中: <span className="font-bold text-foreground">{user.email ?? "ユーザー"}</span>
              {typeof remaining === "number" && <>（今日の LLM 残り {remaining} 回）</>}
            </p>
            <button className="underline" onClick={onSignOut}>
              ログアウト
            </button>
          </>
        ) : (
          <>
            <p>
              <span className="mr-1 rounded border px-1.5 py-0.5 font-bold text-foreground">ゲスト</span>
              ログインすると LLM が住民・ニュース・講評を生成します
            </p>
            {authAvailable ? (
              <Button variant="ghost" onClick={onLogin}>
                ログイン
              </Button>
            ) : (
              <p>（ログインは準備中です。ゲストは同梱テンプレートで遊べます）</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
