import { useEffect, useMemo, useRef } from "react";
import { mulberry32 } from "@/lib/society/rng";
import type { Persona, SocietyState } from "@/lib/society/types";

interface Node { id: number; x: number; y: number; vx: number; vy: number; r: number; active: boolean; cites: number }

/** 研究者間の引用グラフを力学モデルで配置する（決定論的） */
export function layoutGraph(state: SocietyState, iterations = 300) {
  const rng = mulberry32(state.seed ^ 0x9a9a);
  const n = state.researchers.length;
  const nodes: Node[] = state.researchers.map((r, i) => {
    const a = (2 * Math.PI * (r.field + (i % 4) / 4)) / 6;
    return { id: r.id, x: Math.cos(a) * 120 + rng() * 10, y: Math.sin(a) * 120 + rng() * 10, vx: 0, vy: 0, r: 4 + 1.6 * Math.sqrt(r.citationsCum), active: r.active, cites: r.citationsCum };
  });
  const links: { s: number; t: number; w: number }[] = [];
  const pair = new Map<string, number>();
  for (const [k, w] of Object.entries(state.edges)) {
    const [a, b] = k.split("-").map(Number);
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    pair.set(key, (pair.get(key) ?? 0) + w);
  }
  for (const [k, w] of pair) {
    const [s, t] = k.split("-").map(Number);
    links.push({ s, t, w });
  }
  const maxW = Math.max(1, ...links.map((l) => l.w));
  for (let it = 0; it < iterations; it++) {
    const cool = 1 - it / iterations;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = Math.max(25, dx * dx + dy * dy);
        const f = 900 / d2;
        const d = Math.sqrt(d2);
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
    }
    for (const l of links) {
      const a = nodes[l.s], b = nodes[l.t];
      const dx = b.x - a.x, dy = b.y - a.y;
      const k = 0.004 * (0.3 + l.w / maxW);
      a.vx += dx * k; a.vy += dy * k;
      b.vx -= dx * k; b.vy -= dy * k;
    }
    for (const p of nodes) {
      p.vx -= p.x * 0.01; p.vy -= p.y * 0.01;
      p.x += p.vx * cool; p.y += p.vy * cool;
      p.vx *= 0.6; p.vy *= 0.6;
    }
  }
  return { nodes, links, maxW };
}

export function CitationGraph({ state, personas }: { state: SocietyState; personas: Persona[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const graph = useMemo(() => layoutGraph(state), [state]);
  const top = useMemo(
    () => [...state.researchers].sort((a, b) => b.citationsCum - a.citationsCum).slice(0, 3).filter((r) => r.citationsCum > 0).map((r) => r.id),
    [state],
  );

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 320;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const inBounds = graph.nodes.filter((p) => p.active && p.cites > 0);
    const base = inBounds.length >= 3 ? inBounds : graph.nodes;
    const xs = base.map((p) => p.x), ys = base.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 36;
    const s = Math.min((w - 2 * pad) / Math.max(1, maxX - minX), (h - 2 * pad) / Math.max(1, maxY - minY));
    const X = (x: number) => pad + (x - minX) * s + (w - 2 * pad - (maxX - minX) * s) / 2;
    const Y = (y: number) => pad + (y - minY) * s + (h - 2 * pad - (maxY - minY) * s) / 2;
    const cx = (x: number) => Math.max(minX, Math.min(maxX, x));
    const cy = (y: number) => Math.max(minY, Math.min(maxY, y));
    for (const p of graph.nodes) { p.x = cx(p.x); p.y = cy(p.y); }
    for (const l of graph.links) {
      const a = graph.nodes[l.s], b = graph.nodes[l.t];
      ctx.strokeStyle = `rgba(26,43,107,${0.08 + 0.5 * (l.w / graph.maxW)})`;
      ctx.lineWidth = 0.5 + 2.5 * (l.w / graph.maxW);
      ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke();
    }
    for (const p of graph.nodes) {
      const isTop = top.includes(p.id);
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), Math.min(22, p.r), 0, Math.PI * 2);
      if (!p.active) {
        ctx.setLineDash([3, 3]); ctx.strokeStyle = "#8a8a8a"; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
      } else {
        ctx.fillStyle = isTop ? "#1A2B6B" : "#a3a3a3";
        ctx.fill();
      }
      if (isTop) {
        ctx.font = "bold 12px 'Noto Sans JP', sans-serif";
        ctx.lineWidth = 4; ctx.strokeStyle = "#ffffff";
        ctx.strokeText(personas[p.id]?.name ?? "", X(p.x) + Math.min(22, p.r) + 4, Y(p.y) + 4);
        ctx.fillStyle = "#171717";
        ctx.fillText(personas[p.id]?.name ?? "", X(p.x) + Math.min(22, p.r) + 4, Y(p.y) + 4);
      }
    }
  }, [graph, top, personas]);

  const left = state.researchers.filter((r) => !r.active).length;
  return (
    <figure>
      <canvas ref={ref} className="h-[320px] w-full rounded-xl border bg-white" role="img"
        aria-label={`研究者 24 人の引用グラフ。円の大きさは被引用数。引用が多い順に ${top.map((i) => personas[i]?.name).join("、")}。離脱 ${left} 人。`} />
      <figcaption className="mt-2 text-xs text-muted-foreground">
        円 = 研究者（大きさは累積被引用、濃い青は上位 3 人、点線は離脱した人）。線 = 研究者どうしの引用。
      </figcaption>
    </figure>
  );
}
