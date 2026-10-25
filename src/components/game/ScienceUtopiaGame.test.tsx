import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScienceUtopiaGame } from "./ScienceUtopiaGame";

// テストでは VITE_SUPABASE_* を設定しない＝本番で Supabase env が未設定のときと同じ状態
describe("ゲスト通しプレイ（Supabase env 未設定・LLM を呼ばない）", () => {
  it("タイトル → Year1〜5 → エンディング → JSON ダウンロード", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("offline"); });
    vi.stubGlobal("fetch", fetchMock);
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return "blob:x"; }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<ScienceUtopiaGame />);
    expect(screen.getByText("あなたの考える良い科学を育ててください")).toBeInTheDocument();
    expect(screen.getByText("ゲスト")).toBeInTheDocument();
    expect(screen.getByText("ログインすると LLM が住民・ニュース・講評を生成します")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ログイン" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "はじめる" }));
    await screen.findByText("あなたの財団に集まった 24 人");
    expect(screen.getByText(/同梱テンプレート/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Year 1 の制度を決める" }));

    for (let y = 1; y <= 5; y++) {
      await screen.findByText("今年決める 3 つの制度");
      if (y === 1) {
        // 自由記述（不通時は b に写る）
        const free = screen.getAllByLabelText(/自由に書く/)[0] as HTMLInputElement;
        fireEvent.click(free);
        const box = await screen.findByPlaceholderText("例: 若手にも少しずつ配りたい");
        fireEvent.change(box, { target: { value: "みんなで確かめ合う" } });
      }
      fireEvent.click(screen.getByRole("button", { name: "この制度で 1 年を進める" }));
      await screen.findByText(`Year ${y} の結果`);
      if (y === 1) expect(screen.getByText(/LLM を使えなかったため b/)).toBeInTheDocument();
      await waitFor(() => expect(screen.getAllByText(/同梱テンプレート/).length).toBeGreaterThan(0));
      fireEvent.click(screen.getByRole("button", { name: y < 5 ? `Year ${y + 1} の制度を決める` : "5 年後の社会を見る" }));
    }

    await screen.findByText("ENDING");
    await screen.findByText("講評");
    await waitFor(() => expect(screen.getAllByText(/同梱テンプレート/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByLabelText(/まあ良い/));
    fireEvent.click(screen.getByRole("button", { name: "記録を JSON でダウンロード" }));
    expect(click).toHaveBeenCalled();
    const text = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsText(blobs[0]); });
    const rec = JSON.parse(text);
    expect(rec.schema).toBe("science-utopia/run-v1");
    expect(rec.theta_series).toHaveLength(5);
    expect(rec.metrics).toHaveLength(5);
    expect(rec.theta_series[0].choices.some((c: { option: string; mapped_option?: string }) => c.option === "free" && c.mapped_option === "b")).toBe(true);
    expect(["utopia", "monoculture", "cartel", "depletion"]).toContain(rec.ending.type);
    expect(rec.ending.review).toHaveLength(5);
    expect(rec.survey.rating).toBe(4);
    // ゲストは /api/su-llm を一度も呼ばない
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  }, 30000);
});
