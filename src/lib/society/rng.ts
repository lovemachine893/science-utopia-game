/** 小さな再現可能 PRNG（mulberry32）。 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

/** 文字列→32bit ハッシュ（FNV-1a）。 */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 近似正規乱数（一様乱数 4 個の和、平均 0・分散 1）。 */
export function gauss(rng: () => number): number {
  return (rng() + rng() + rng() + rng() - 2) * Math.sqrt(3);
}

/** Poisson 乱数（Knuth、λ は小さい前提）。 */
export function poisson(rng: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 100);
  return k - 1;
}

/** 重み付き抽選。weights の合計が 0 のときは -1。 */
export function weightedPick(rng: () => number, weights: number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return -1;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}
