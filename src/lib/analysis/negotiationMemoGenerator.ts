/**
 * 협상 압박 근거 + 멘트 자동 생성 (NLG) — Phase v3 Bulk 협상 카드 핵심 자산.
 *
 * @model
 *   입력: CustomerCompositeRisk (점수 + signals + metrics)
 *   출력: NegotiationMemo (압박 근거 3-5개 + 협상 멘트 + 액션 우선순위)
 *
 *   Rule-based NLG 패턴:
 *     1. 압박 근거 (pressurePoints): signals 기반 자연어 변환 + 강조
 *     2. 협상 멘트 (scriptedSentence): 카테고리·signals 조합으로 1-2 문장 생성
 *     3. 권장 액션 (recommendedActions): 카테고리 + 주요 신호 → 1·2·3순위 자동
 *
 * @design
 *   - insightGenerator.ts의 Rule engine 패턴 차용 (전사 KPI → 거래처×품목 특화로 변형)
 *   - 모든 멘트는 회의실에서 그대로 발화 가능한 자연어 (영업담당 표현체 반영)
 *   - "압박 근거 ≠ 적대적" — 데이터 기반 사실 진술 + 정상화 제안 형태
 *
 * @output
 *   {
 *     pressurePoints: ["13M 중 12M 적자, 누적 -1.05억", ...],
 *     scriptedSentence: "13개월 중 12개월 적자, 누적 -1.05억 + 장기연체 1.82억(40%) 상태입니다. 회사 차원 거래 지속 재검토 단계입니다. 장기연체 회수 + 단가 +10~20% 인상이 정상화 최소 조건입니다.",
 *     recommendedActions: [
 *       { rank: 1, action: "장기연체 1.82억 회수 일정 합의", rationale: "8M+ 미수 비율 40%로 채권 회수 위험 ↑" },
 *       { rank: 2, action: "단가 +20% 인상 협상", rationale: "흑자 전환 임계점 (마진 -14.6% → +5.4%)" },
 *       ...
 *     ]
 *   }
 */

import type { CustomerCompositeRisk } from "./customerCompositeRisk";

// ─── Types ───────────────────────────────────────────────

export interface NegotiationAction {
  rank: 1 | 2 | 3;
  action: string;          // 액션 명령형
  rationale: string;       // 데이터 근거
}

export interface NegotiationMemo {
  거래처: string;
  거래처코드: string;
  riskScore: number;
  category: CustomerCompositeRisk["category"];

  // 1. 압박 근거 (3-5개, severity 순)
  pressurePoints: string[];

  // 2. 협상 멘트 (회의실 활용 가능)
  scriptedSentence: string;

  // 3. 권장 액션 1·2·3순위
  recommendedActions: NegotiationAction[];

  // 4. 위험 요약 라벨 (1줄)
  oneLineSummary: string;
}

// ─── 통화 포맷 ───────────────────────────────────────────

function fmtMoney(v: number): string {
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
  if (Math.abs(v) >= 1e7) return `${(v / 1e7 * 10).toFixed(0)}백만`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
  return `${v.toLocaleString()}원`;
}

function fmtPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

// ─── 압박 근거 (Pressure Points) — signals → 자연어 ───

function buildPressurePoints(risk: CustomerCompositeRisk): string[] {
  const points: string[] = [];
  const m = risk.metrics;

  // 1. 적자 (가장 강력한 압박 — 회사 차원 손실)
  if (m.deficitMonthCount >= 10 && m.monthCount >= 12) {
    const allOrMost = m.deficitMonthCount >= m.monthCount
      ? `${m.monthCount}개월 모두`
      : `${m.monthCount}개월 중 ${m.deficitMonthCount}개월`;
    points.push(`${allOrMost} 적자, 누적 영업적자 ${fmtMoney(m.totalProfit13M)} (평균 마진 ${m.avgMarginRate.toFixed(1)}%)`);
  } else if (m.deficitMonthCount >= 6) {
    points.push(`${m.monthCount}개월 중 ${m.deficitMonthCount}개월 적자, 최장 연속 ${m.consecutiveDeficitMonths}개월 (마진 ${m.avgMarginRate.toFixed(1)}%)`);
  } else if (m.totalProfit13M < -50_000_000) {
    points.push(`누적 영업적자 ${fmtMoney(m.totalProfit13M)} (마진 ${m.avgMarginRate.toFixed(1)}%)`);
  }

  // 2. 장기연체 (회수 압박)
  if (m.longOverdueRatio >= 0.3) {
    points.push(`장기연체(8M+) ${fmtMoney(m.longOverdueAmount)} (${fmtPct(m.longOverdueRatio)} of 미수) — 회수 위험 증가`);
  } else if (m.longOverdueAmount >= 50_000_000) {
    points.push(`장기연체 ${fmtMoney(m.longOverdueAmount)} 발생`);
  }

  // 3. 한도 임박/초과 (추가 거래 차단 압박)
  if (m.creditUsageRate >= 1.0) {
    points.push(`여신한도 ${fmtPct(m.creditUsageRate)} 초과 (미수 ${fmtMoney(m.totalReceivable)} / 한도 ${fmtMoney(m.creditLimit)}) — 추가 출고 불가`);
  } else if (m.creditUsageRate >= 0.9) {
    points.push(`여신한도 ${fmtPct(m.creditUsageRate)} 임박 — 추가 거래 어려운 상황`);
  } else if (m.creditUsageRate >= 0.8) {
    points.push(`여신한도 ${fmtPct(m.creditUsageRate)} 사용 — 한도 정상화 협조 필요`);
  }

  // 4. 매출 급감 (관계 위축 신호)
  if (m.salesQoQ <= -0.5) {
    const profitImpact = m.profitQoQ < -1 ? ` + 영업이익 ${fmtPct(m.profitQoQ, 0)} 추락` : "";
    points.push(`매출 ${fmtPct(m.salesQoQ, 1)} QoQ 급감${profitImpact} — 거래 축소 신호`);
  } else if (m.salesQoQ <= -0.3) {
    points.push(`매출 ${fmtPct(m.salesQoQ, 1)} QoQ 위축`);
  }

  // 5. 단일 품목 의존 (집중 거래 위험)
  if (m.itemHHI >= 0.7 && m.topItemShare >= 0.7) {
    const itemDisp = m.topItemName.length > 25 ? m.topItemName.slice(0, 25) + "…" : m.topItemName;
    points.push(`단일 품목 "${itemDisp}" ${fmtPct(m.topItemShare, 0)} 의존 — 거래 집중 위험`);
  }

  // 6. 미수 절대값 (대형 거래처일수록 강조)
  if (m.totalReceivable >= 500_000_000) {
    points.push(`미수 ${fmtMoney(m.totalReceivable)} (한도 ${fmtMoney(m.creditLimit)})`);
  }

  // 사무소 분산 (관리 사각지대)
  if (risk.offices.length >= 2) {
    points.push(`${risk.offices.length}개 사무소 분산 거래 (${risk.offices.join(", ")}) — 통합 관리 필요`);
  }

  return points.slice(0, 5);  // Top 5
}

// ─── 협상 멘트 (Scripted Sentence) — 카테고리별 템플릿 ─

const CATEGORY_OPENING: Record<CustomerCompositeRisk["category"], string> = {
  거래중단: "회사 차원에서 거래 지속 여부를 재검토하는 단계입니다.",
  "회수+단가": "현재 한도 임박과 적자 누적으로 정상화 협의가 필요한 상황입니다.",
  단가조정: "거래 마진 개선을 위한 단가 재협의가 필요합니다.",
  정상: "정상 거래 유지 중이나 일부 지표 모니터링 필요합니다.",
};

const CATEGORY_CLOSING: Record<CustomerCompositeRisk["category"], string> = {
  거래중단: "장기연체 회수와 단가 +15~20% 인상이 거래 지속의 최소 조건입니다. 합의 어려우면 거래 중단 검토 불가피합니다.",
  "회수+단가": "미수 회수 일정 합의 + 적자 품목 단가 조정이 정상화 최소 조건입니다.",
  단가조정: "주력 품목 단가 +5~10% 인상으로 마진 정상화 가능합니다.",
  정상: "현재 흐름 유지하되 주요 지표 분기별 점검 권장합니다.",
};

function buildScriptedSentence(risk: CustomerCompositeRisk, points: string[]): string {
  const top2 = points.slice(0, 2).join(" + ");
  const opening = CATEGORY_OPENING[risk.category];
  const closing = CATEGORY_CLOSING[risk.category];
  return `${top2} 상태입니다. ${opening} ${closing}`;
}

// ─── 권장 액션 (Recommended Actions) — 신호 기반 우선순위 ─

function buildRecommendedActions(risk: CustomerCompositeRisk): NegotiationAction[] {
  const actions: NegotiationAction[] = [];
  const m = risk.metrics;
  const c = risk.components;

  // Priority 1: 가장 시급한 신호 — 장기연체 또는 한도 초과
  if (m.longOverdueRatio >= 0.3 && m.longOverdueAmount >= 100_000_000) {
    actions.push({
      rank: 1,
      action: `장기연체 ${fmtMoney(m.longOverdueAmount)} 회수 일정 합의`,
      rationale: `8M+ 미수 비율 ${fmtPct(m.longOverdueRatio)}로 채권 회수 위험 증가`,
    });
  } else if (m.creditUsageRate >= 0.95) {
    actions.push({
      rank: 1,
      action: `미수 ${fmtMoney(m.totalReceivable)} 회수 일정 합의 (한도 정상화)`,
      rationale: `여신 사용률 ${fmtPct(m.creditUsageRate)}로 추가 출고 불가 상태`,
    });
  } else if (m.deficitMonthCount >= 10) {
    // 흑자 전환 임계 단가 인상률 자동 계산
    const targetMargin = 5;
    const hike = m.avgMarginRate < 0
      ? Math.max(5, Math.ceil((targetMargin - m.avgMarginRate) / Math.max(0.5, 1 + m.avgMarginRate / 100)))
      : 5;
    actions.push({
      rank: 1,
      action: `주력 품목 단가 +${hike}% 인상 협상 (마진 ${m.avgMarginRate.toFixed(1)}% → +${targetMargin}% 전환 임계)`,
      rationale: `${m.deficitMonthCount}개월 적자, 누적 ${fmtMoney(m.totalProfit13M)} 손실`,
    });
  } else if (m.totalReceivable >= 100_000_000) {
    actions.push({
      rank: 1,
      action: `미수 ${fmtMoney(m.totalReceivable)} 회수 일정 합의`,
      rationale: `미수 1억+ 거래처 — 채권 정상화 우선`,
    });
  }

  // Priority 2: 단가 인상 (적자 시) 또는 한도 조정
  if (c.deficitScore >= 12 && actions.length < 2) {
    // 흑자 전환 임계 단가 인상률 추정 (마진 음수 → 양수 5% 목표)
    const targetMargin = 5;
    const requiredHike = Math.max(5, Math.ceil((targetMargin - m.avgMarginRate) / (1 + m.avgMarginRate / 100)));
    actions.push({
      rank: 2,
      action: `단가 +${requiredHike}% 인상 협상 (흑자 전환 임계점)`,
      rationale: `현 마진 ${m.avgMarginRate.toFixed(1)}% → 목표 +${targetMargin}% 전환에 필요`,
    });
  } else if (m.creditUsageRate >= 0.8 && actions.length < 2) {
    actions.push({
      rank: 2,
      action: `여신한도 상향 검토 (회수 진행 후)`,
      rationale: `한도 ${fmtPct(m.creditUsageRate)} 도달, 거래 정상화에 한도 여유 필요`,
    });
  } else if (m.itemHHI >= 0.7 && actions.length < 2) {
    actions.push({
      rank: 2,
      action: `거래 품목 다각화 협상 (현재 단일 품목 ${fmtPct(m.topItemShare, 0)} 의존)`,
      rationale: `집중 거래 리스크 분산 + 신규 품목 마진 개선 기회`,
    });
  }

  // Priority 3: 거래 중단 검토 또는 분기별 모니터링
  if (risk.category === "거래중단" && actions.length < 3) {
    actions.push({
      rank: 3,
      action: `합의 거절 시 거래 중단 검토 (LTV vs 적자 회피 분석)`,
      rationale: `누적 적자 + 장기연체 큰 거래처는 중단이 회사 손실 회피`,
    });
  } else if (risk.category === "회수+단가" && actions.length < 3) {
    actions.push({
      rank: 3,
      action: `정상가 자동 복귀 조항 명문화 (협상 후 6M 정상화)`,
      rationale: `단가 양보 시 강제 발주 반품 위험 차단`,
    });
  } else if (actions.length < 3) {
    actions.push({
      rank: 3,
      action: `분기별 마진/미수 점검 미팅 (담당 ${risk.담당자})`,
      rationale: `현재 정상이나 주요 지표 모니터링 권장`,
    });
  }

  return actions;
}

// ─── 1줄 요약 (oneLineSummary) ───────────────────────

function buildOneLineSummary(risk: CustomerCompositeRisk): string {
  const m = risk.metrics;

  // 카테고리별 emoji + 핵심 1줄
  const emoji: Record<CustomerCompositeRisk["category"], string> = {
    거래중단: "🚨🚨",
    "회수+단가": "🚨",
    단가조정: "⚠",
    정상: "✅",
  };

  const parts: string[] = [];
  if (m.totalReceivable >= 100_000_000) parts.push(`미수 ${fmtMoney(m.totalReceivable)}`);
  if (m.creditUsageRate >= 0.8) parts.push(`한도 ${fmtPct(m.creditUsageRate)}`);
  if (m.deficitMonthCount >= 6) parts.push(`적자 ${m.deficitMonthCount}M`);
  if (m.longOverdueRatio >= 0.3) parts.push(`장기연체 ${fmtPct(m.longOverdueRatio)}`);

  const tag = parts.length > 0 ? parts.join(" · ") : "안정";
  return `${emoji[risk.category]} 점수 ${risk.riskScore} · ${risk.category} · ${tag}`;
}

// ─── 메인 함수 ──────────────────────────────────────

export function generateNegotiationMemo(risk: CustomerCompositeRisk): NegotiationMemo {
  const pressurePoints = buildPressurePoints(risk);
  const scriptedSentence = buildScriptedSentence(risk, pressurePoints);
  const recommendedActions = buildRecommendedActions(risk);
  const oneLineSummary = buildOneLineSummary(risk);

  return {
    거래처: risk.거래처명,
    거래처코드: risk.거래처코드,
    riskScore: risk.riskScore,
    category: risk.category,
    pressurePoints,
    scriptedSentence,
    recommendedActions,
    oneLineSummary,
  };
}

/** Bulk 생성 (Top N 거래처 일괄 멘트 생성) */
export function generateBulkMemos(risks: CustomerCompositeRisk[]): NegotiationMemo[] {
  return risks.map(generateNegotiationMemo);
}
