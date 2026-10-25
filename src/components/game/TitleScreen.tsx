import { Button } from "@/components/ui/button";

export function TitleScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col items-center justify-center gap-12 px-6 text-center">
      <h1 className="text-2xl font-semibold leading-relaxed md:text-3xl">あなたの考える良い科学を育ててください</h1>
      <Button onClick={onStart} className="px-10">
        はじめる
      </Button>
    </main>
  );
}
