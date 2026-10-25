import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TitleScreen } from "./TitleScreen";

describe("TitleScreen のアカウント表示", () => {
  it("Supabase が設定されていればゲストにログインボタンを出す", () => {
    const onLogin = vi.fn();
    render(<TitleScreen onStart={() => {}} user={null} authAvailable onLogin={onLogin} onSignOut={() => {}} />);
    expect(screen.getByText("ゲスト")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));
    expect(onLogin).toHaveBeenCalled();
  });
  it("ログイン中はメールと残り回数、ログアウトを出す", () => {
    render(
      <TitleScreen onStart={() => {}} user={{ id: "u", email: "a@example.invalid" }} authAvailable onLogin={() => {}} onSignOut={() => {}} remaining={28} />,
    );
    expect(screen.getByText("a@example.invalid")).toBeInTheDocument();
    expect(screen.getByText(/今日の LLM 残り 28 回/)).toBeInTheDocument();
    expect(screen.queryByText("ゲスト")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ログアウト" })).toBeInTheDocument();
  });
});
