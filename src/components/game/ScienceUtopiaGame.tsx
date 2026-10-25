import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_FIELDS, applyChoice, buildCard, drawFields, FIELD_DEFS, labelOf, OPTION_KEYS, type OptionKey } from "@/lib/society/cards";
import { callLlm, isStringArray } from "@/lib/llm";
import { classifyEnding, FIELDS, initSociety, stepYear, THETA_STATUS_QUO } from "@/lib/society/model";
import { FALLBACK_PERSONAS, sanitizePersonas } from "@/lib/society/personas";
import { downloadJson, type Choice, type RunRecord, type Source, type Survey, type TurnRecord } from "@/lib/society/record";
import { ENDING_LABEL, endingTemplate, yearNewsTemplate, type YearText } from "@/lib/society/templates";
import type { EndingType, Persona, SocietyState, Theta, ThetaKey, YearEvents, YearMetrics } from "@/lib/society/types";
import { EndingScreen } from "./EndingScreen";
import { PersonaScreen } from "./PersonaScreen";
import { TitleScreen } from "./TitleScreen";
import { TurnScreen, type DraftChoice } from "./TurnScreen";
import { YearResult } from "./YearResult";

type Phase = "title" | "personas" | "turn" | "result" | "ending";

function readParams() {
  const q = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const seed = Number(q.get("seed"));
  return { seed: Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : 0, offline: q.get("offline") === "1" };
}

const validYearText = (personas: Persona[]) => (raw: unknown): YearText | null => {
  const r = raw as { news?: unknown; voices?: unknown };
  if (!isStringArray(r?.news, 3) || !Array.isArray(r?.voices) || r.voices.length < 2) return null;
  const voices = (r.voices as { name?: unknown; text?: unknown }[]).slice(0, 2).map((v) => ({ name: String(v?.name ?? ""), text: String(v?.text ?? "") }));
  if (voices.some((v) => !v.name || !v.text)) return null;
  const names = new Set(personas.map((p) => p.name));
  if (voices.some((v) => !names.has(v.name))) return null;
  return { news: r.news.slice(0, 3).map((s) => s.slice(0, 120)), voices: voices.map((v) => ({ ...v, text: v.text.slice(0, 160) })) };
};

/** LLM に渡す指標は丸める（生の浮動小数を文章に書かせない） */
const roundMetrics = (m: YearMetrics) => ({
  year: m.year, papers: m.papers, accepted: m.accepted, citations: m.citations, hit: m.hit,
  Gini: m.Gini.toFixed(2), H_bits: m.H.toFixed(2), fraud_rate: `${Math.round(m.fraud_rate * 100)}%`, pluralism: m.pluralism.toFixed(2),
});
const thetaLabels = (th: Theta) => Object.fromEntries(ALL_FIELDS.map((k) => [FIELD_DEFS[k].title, labelOf(k, th[k])]));

export function ScienceUtopiaGame() {
  const params = useMemo(readParams, []);
  const [phase, setPhase] = useState<Phase>("title");
  const [seed, setSeed] = useState(1);
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [personasSource, setPersonasSource] = useState<Source>("fallback");
  const [society, setSociety] = useState<SocietyState | null>(null);
  const [theta, setTheta] = useState<Theta>(THETA_STATUS_QUO);
  const [prevTheta, setPrevTheta] = useState<Theta | undefined>(undefined);
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [events, setEvents] = useState<YearEvents | null>(null);
  const [yearText, setYearText] = useState<Record<number, { value: YearText; source: Source }>>({});
  const [ending, setEnding] = useState<{ type: EndingType; review: { lines: string[]; source: Source } | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);

  const llm = useCallback<typeof callLlm>(
    (task, input, validate, timeoutMs) => (params.offline ? Promise.resolve(null) : callLlm(task, input, validate, timeoutMs)),
    [params.offline],
  );

  const start = async () => {
    const id = ++runId.current;
    const s = params.seed || (Date.now() % 1_000_000_000) + 1;
    setSeed(s);
    setPersonas(null);
    setTurns([]);
    setYearText({});
    setEnding(null);
    setTheta(THETA_STATUS_QUO);
    setPrevTheta(undefined);
    setPhase("personas");
    const got = await llm("personas", { seed: s, n: 24 }, (raw) => sanitizePersonas((raw as { personas?: unknown })?.personas), 45000);
    if (id !== runId.current) return;
    const ps = got ?? FALLBACK_PERSONAS;
    setPersonas(ps);
    setPersonasSource(got ? "llm" : "fallback");
    setSociety(initSociety(ps, s));
  };

  const year = (society?.year ?? 0) + 1;
  const cards = useMemo(() => {
    if (!society) return [];
    const last = society.history[society.history.length - 1];
    return drawFields(seed, year).map((f) => buildCard(f, theta, last, prevTheta));
  }, [society, seed, year, theta, prevTheta]);

  const submitTurn = async (draft: Record<ThetaKey, DraftChoice>) => {
    if (!society || !personas) return;
    setBusy(true);
    const choices: Choice[] = await Promise.all(
      cards.map(async (card): Promise<Choice> => {
        const d = draft[card.field];
        if (d.option !== "free") return { field: card.field, option: d.option };
        const text = d.freeText.trim().slice(0, 200);
        const mapped = await llm(
          "map_free",
          { card: FIELD_DEFS[card.field].title, options: Object.fromEntries(card.options.map((o) => [o.key, `${o.label}: ${o.text}`])), text },
          (raw) => {
            const r = raw as { choice?: unknown; reason?: unknown };
            return OPTION_KEYS.includes(r?.choice as OptionKey) ? { choice: r.choice as OptionKey, reason: String(r.reason ?? "").slice(0, 60) } : null;
          },
          20000,
        );
        return mapped
          ? { field: card.field, option: "free", free_text: text, mapped_option: mapped.choice, mapped_by: "llm", mapped_reason: mapped.reason }
          : { field: card.field, option: "free", free_text: text, mapped_option: "b", mapped_by: "fallback" };
      }),
    );
    let next = theta;
    for (const c of choices) next = applyChoice(next, c.field, c.option === "free" ? c.mapped_option! : c.option);
    const { state, metrics, events: ev } = stepYear(society, next);
    setPrevTheta(theta);
    setTheta(next);
    setSociety(state);
    setEvents(ev);
    setTurns((t) => [...t, { year: metrics.year, theta: next, choices }]);
    setBusy(false);
    setPhase("result");
    window.scrollTo?.(0, 0);

    const prev = state.history[state.history.length - 2];
    const fallback = yearNewsTemplate(metrics, prev, next, personas, ev);
    const id = runId.current;
    const got = await llm(
      "year_news",
      {
        year: metrics.year,
        theta: thetaLabels(next),
        changed: choices.map((c) => FIELD_DEFS[c.field].title),
        metrics: roundMetrics(metrics),
        previous: prev ? roundMetrics(prev) : null,
        caught: ev.caught,
        switched: ev.switched,
        researchers: personas.map((p) => ({
          name: p.name, field: FIELDS[state.researchers[p.id].field], career: p.career, temperament: p.temperament,
          citations: state.researchers[p.id].citationsCum, active: state.researchers[p.id].active,
        })),
      },
      validYearText(personas),
    );
    if (id !== runId.current) return;
    setYearText((y) => ({ ...y, [metrics.year]: got ? { value: got, source: "llm" } : { value: fallback, source: "fallback" } }));
  };

  const toNext = async () => {
    if (!society) return;
    window.scrollTo?.(0, 0);
    if (society.year < 5) {
      setPhase("turn");
      return;
    }
    const type = classifyEnding(society);
    setEnding({ type, review: null });
    setPhase("ending");
    const id = runId.current;
    const thetas = turns.map((t) => t.theta);
    const got = await llm(
      "ending",
      { label: ENDING_LABEL[type], metrics: society.history.map(roundMetrics), theta_series: thetas.map(thetaLabels), left: society.researchers.filter((r) => !r.active).length },
      (raw) => {
        const r = (raw as { review?: unknown })?.review;
        return isStringArray(r, 5) ? r.slice(0, 5).map((s) => s.slice(0, 140)) : null;
      },
    );
    if (id !== runId.current) return;
    setEnding({ type, review: got ? { lines: got, source: "llm" } : { lines: endingTemplate(type, society.history, thetas), source: "fallback" } });
  };

  const download = (survey: Survey) => {
    if (!society || !personas || !ending) return;
    const record: RunRecord = {
      schema: "science-utopia/run-v1",
      created_at: new Date().toISOString(),
      seed,
      personas_source: personasSource,
      personas,
      theta_initial: THETA_STATUS_QUO,
      theta_series: turns,
      metrics: society.history,
      ending: {
        type: ending.type,
        label: ENDING_LABEL[ending.type],
        review: ending.review?.lines ?? endingTemplate(ending.type, society.history, turns.map((t) => t.theta)),
        review_source: ending.review?.source ?? "fallback",
      },
      survey: { question: "この社会は良い科学でしたか？", rating: survey.rating, comment: survey.comment.slice(0, 200) },
    };
    downloadJson(record);
  };

  useEffect(() => {
    document.title = phase === "title" ? "Science Utopia — 良い科学を育てる" : `Science Utopia — Year ${Math.min(5, year)}`;
  }, [phase, year]);

  if (phase === "title") return <TitleScreen onStart={start} />;
  if (phase === "personas") return <PersonaScreen personas={personas} source={personasSource} onNext={() => setPhase("turn")} />;
  if (!society || !personas) return null;
  if (phase === "turn") return <TurnScreen key={year} year={year} theta={theta} cards={cards} busy={busy} onSubmit={submitTurn} />;
  if (phase === "result" && events) {
    const last = turns[turns.length - 1];
    return <YearResult state={society} personas={personas} theta={theta} choices={last.choices} text={yearText[society.year] ?? null} onNext={toNext} />;
  }
  if (phase === "ending" && ending) {
    return <EndingScreen type={ending.type} review={ending.review} turns={turns} onDownload={download} onRestart={start} />;
  }
  return null;
}
