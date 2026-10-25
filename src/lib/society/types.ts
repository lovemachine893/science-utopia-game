/** 制度 θ。論文 §5 でスイープする 6 次元と同じ名前。 */
export type Incentive = "citations" | "replication" | "novelty";
export type Verify = "none" | "spot" | "all";
export type YouthShare = "elders" | "neutral" | "youth";
export type Islands = "mono" | "two" | "multi";

export interface Theta {
  funding_frac: 0.05 | 0.3 | 1.0;
  acceptance: 0.1 | 0.3 | 0.6;
  incentive: Incentive;
  verify: Verify;
  youth_share: YouthShare;
  islands: Islands;
}

export type ThetaKey = keyof Theta;

export type Career = "若手" | "中堅" | "大御所";

export interface Persona {
  id: number;
  name: string;
  /** 研究分野のインデックス（0..FIELDS.length-1） */
  field: number;
  temperament: [string, string, string];
  career: Career;
  /** 初期評判 0..1 */
  reputation: number;
}

/** 年次指標。SUTO と同じ名前。 */
export interface YearMetrics {
  year: number;
  papers: number;
  accepted: number;
  citations: number;
  Gini: number;
  H: number;
  hit: number;
  fraud_rate: number;
  pluralism: number;
}

export interface ResearcherState {
  id: number;
  field: number;
  career: Career;
  reputation: number;
  integrity: number;
  citationsCum: number;
  acceptedCum: number;
  funding: number;
  caughtCum: number;
  active: boolean;
}

export interface Paper {
  id: number;
  author: number;
  year: number;
  field: number;
  novelty: number;
  isTrue: boolean;
  citations: number;
}

export interface SocietyState {
  seed: number;
  year: number;
  researchers: ResearcherState[];
  papers: Paper[];
  /** 研究者 i → j への累積引用数（キー `${i}-${j}`） */
  edges: Record<string, number>;
  history: YearMetrics[];
}

export interface YearEvents {
  /** 査読で見抜かれた不正の件数 */
  caught: number;
  /** 引用の多い上位研究者 id（降順 3 名） */
  topCited: number[];
  /** 分野を移った研究者の数 */
  switched: number;
  /** 資金を受け取った研究者の数 */
  funded: number;
}

export type EndingType = "utopia" | "monoculture" | "cartel" | "depletion";
