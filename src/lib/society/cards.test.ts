import { describe, expect, it } from "vitest";
import { applyChoice, buildCard, drawFields, optionKeyOf } from "./cards";
import { THETA_STATUS_QUO } from "./model";

describe("カード", () => {
  it("毎年 3 分野・重複なし・決定論", () => {
    for (let y = 1; y <= 5; y++) {
      const f = drawFields(42, y);
      expect(f).toHaveLength(3);
      expect(new Set(f).size).toBe(3);
      expect(drawFields(42, y)).toEqual(f);
    }
  });
  it("初期値は現状維持の選択肢", () => {
    const card = buildCard("verify", THETA_STATUS_QUO);
    expect(card.options.filter((o) => o.isCurrent).map((o) => o.key)).toEqual([optionKeyOf("verify", "none")]);
  });
  it("前年の選択が次の選択肢文に出る", () => {
    const prev = THETA_STATUS_QUO;
    const now = applyChoice(prev, "funding_frac", "c");
    const card = buildCard("funding_frac", now, undefined, prev);
    expect(card.options[2].text).toContain("昨年あなたが選んだ");
    expect(card.options[1].text).toContain("昨年までの制度に戻す");
  });
});
