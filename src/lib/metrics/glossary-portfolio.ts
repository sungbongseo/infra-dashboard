/**
 * Portfolio Matrix (BCG 4-way SQA) glossary 엔트리.
 *
 * 13 entries:
 * - 4 사분면 (Star / Cash Cow / Problem Child / Dog)
 * - 2 마진 (가중 / 산술 평균 — outlier 영향)
 * - 2 옵션 (Pareto 80/20 / Dynamic 화살표)
 * - 4 임계 모드 (Median / P75 / 가중평균 / 0%)
 * - 1 개념 (4-way segment)
 */

import type { MetricEntry } from "./glossary";

export const portfolioMetrics = {
  // ─────────────────────────────────────────────────────────────
  // 4 사분면 — BCG 분류
  // ─────────────────────────────────────────────────────────────
  bcg_star: {
    id: "bcg_star",
    name: "⭐ Star (스타)",
    category: "profitability",
    unit: "ratio",
    formula: "매출 ≥ 임계 + 마진율 ≥ 임계 → Star",
    beginner:
      "🌟 잘 팔리고 수익도 좋은 효자 품목.\n" +
      "회사 매출 큰 비중 + 마진도 평균 이상.",
    intermediate:
      "BCG 매트릭스의 우상단 사분면. 매출 임계와 마진 임계를 동시에 충족하는 핵심 품목.\n" +
      "투자 강화 대상 — 시장 점유 확대로 Cash Cow로 성장.",
    expert:
      "정통 BCG (시장점유율×성장률) 변형 — 우리는 매출×마진율로 분류. " +
      "임계는 사용자 설정 (median/p75/weighted_avg/zero/custom).",
    benchmark: "Star 비중 30%+ 권장 (영업이익의 50%+ 기여 시 건전)",
    relatedIds: ["bcg_cash_cow", "bcg_problem_child", "bcg_dog"],
    source: ["100", "computed"],
  },
  bcg_cash_cow: {
    id: "bcg_cash_cow",
    name: "🐄 Cash Cow (캐시카우)",
    category: "profitability",
    unit: "ratio",
    formula: "매출 ≥ 임계 + 마진율 < 임계 → Cash Cow",
    beginner:
      "💰 잘 팔리지만 마진은 평균 미만인 품목.\n" +
      "현금 흐름 만들어주는 안정적인 품목.",
    intermediate:
      "우하단 사분면. 시장 안정화로 마진은 줄었으나 여전히 매출 큰 비중.\n" +
      "현재 유지 또는 마진 개선 (단가 인상) 검토. Star보다 신규 투자 우선순위 ↓.",
    expert:
      "정통 BCG에서는 '저성장+고점유율'이지만 우리 변형은 '대매출+저마진'. " +
      "단가 인상 카드로 Star 전환 시도 가능.",
    benchmark: "캐시 흐름 핵심. 비중 20-40%가 일반적",
    relatedIds: ["bcg_star", "bcg_problem_child", "bcg_dog"],
    source: ["100", "computed"],
  },
  bcg_problem_child: {
    id: "bcg_problem_child",
    name: "❓ Problem Child (문제아동)",
    category: "profitability",
    unit: "ratio",
    formula: "매출 < 임계 + 마진율 ≥ 임계 → Problem Child",
    beginner:
      "🤔 마진은 좋은데 아직 잘 안 팔리는 품목.\n" +
      "투자하면 Star가 될 수 있는 잠재력.",
    intermediate:
      "좌상단 사분면. 마진율은 평균 이상이지만 매출 비중 작음.\n" +
      "선별 투자 대상 — 매출 확대 추진으로 Star 전환 시도.",
    expert:
      "정통 BCG의 'Question Mark'. 자원 한정 시 모든 Question Mark 투자 ❌, " +
      "선별적으로 Star 가능성 높은 품목만 집중 투자 권장.",
    benchmark: "비중 10-20%가 적정 (너무 많으면 자원 분산)",
    relatedIds: ["bcg_star", "bcg_cash_cow", "bcg_dog"],
    source: ["100", "computed"],
  },
  bcg_dog: {
    id: "bcg_dog",
    name: "🐕 Dog (낙오자)",
    category: "profitability",
    unit: "ratio",
    formula: "매출 < 임계 + 마진율 < 임계 → Dog",
    beginner:
      "🚧 잘 안 팔리고 마진도 안 좋은 품목.\n" +
      "단가 인상하거나 거래 정리 검토 대상.",
    intermediate:
      "좌하단 사분면. 매출과 마진 모두 평균 미만.\n" +
      "단가 인상 (가능하면) 또는 점진적 거래 정리 권장. 자원 회수 후 Star/Cash Cow에 재투자.",
    expert:
      "정통 BCG에서도 '저성장+저점유율'로 정리 후보. " +
      "다만 1) 다른 품목과 cross-sell 효과 / 2) 거래처 핵심 품목 / 3) 신규 진입 품목 (Dynamic 추세 ↗) 인 경우 유지 검토.",
    benchmark: "Dog 비중 30%+ 시 포트폴리오 재점검 필요",
    relatedIds: ["bcg_star", "bcg_cash_cow", "bcg_problem_child"],
    source: ["100", "computed"],
  },

  // ─────────────────────────────────────────────────────────────
  // 마진 (가중 / 산술 평균)
  // ─────────────────────────────────────────────────────────────
  bcg_weighted_margin: {
    id: "bcg_weighted_margin",
    name: "가중 마진율",
    category: "profitability",
    unit: "percent",
    formula: "Σ영업이익 / Σ매출액 × 100",
    beginner:
      "💯 진짜 회사 평균 마진율.\n" +
      "큰 매출 품목이 더 큰 영향. 작은 outlier에 휘둘리지 않음.",
    intermediate:
      "전체 영업이익을 전체 매출로 나눈 값. 매출 가중 평균.\n" +
      "산술 평균과 다름 — 산술은 모든 품목을 동일 비중으로 평균하므로 매출 작은 outlier에 왜곡.",
    expert:
      "출처: 100 보고서 매출액.실적 + 영업이익.실적. " +
      "재무회계의 '연결 영업이익률'과 동일한 산출 방식. " +
      "외부 보고용 / 의사결정용 모두 가중 마진 사용 권장.",
    benchmark: "건자재 B2B 평균 3-5% (산업 평균)",
    commonMistakes: ["산술 평균과 가중 평균 혼동 — 산술은 outlier 영향 큼"],
    relatedIds: ["bcg_arithmetic_margin"],
    source: ["100", "computed"],
  },
  bcg_arithmetic_margin: {
    id: "bcg_arithmetic_margin",
    name: "산술 평균 마진 (참고)",
    category: "profitability",
    unit: "percent",
    formula: "Σ(품목별 마진율) / 품목 수",
    beginner:
      "📊 모든 품목을 같은 비중으로 평균낸 마진.\n" +
      "매출 작은 품목도 똑같이 영향 — outlier 위험 ⚠.",
    intermediate:
      "각 품목 마진율을 단순 평균. 매출 5만원 품목이나 10억 품목이나 평균에 동일 기여.\n" +
      "outlier (매출 작은데 적자 큼) 1건이 평균을 크게 왜곡.",
    expert:
      "통계적으로 비편향 추정량이지만 의사결정 지표로는 부적합. " +
      "우리 dashboard는 'outlier 제외 산술' (|마진|≤100%)로 보정. " +
      "실측 outlier 1건 (마진 -2946%) 제외 시 -28.6%p 변동 가능.",
    benchmark: "가중 마진과 차이 5%p 이내가 건전",
    commonMistakes: ["산술 평균을 회사 진짜 마진율로 오해 — 가중 마진이 정답"],
    contextBranches: [
      {
        when: (_v: number) => true,
        message: "📍 outlier 영향 큼 — 가중 마진과 비교 필수",
        tone: "info" as const,
      },
    ],
    relatedIds: ["bcg_weighted_margin"],
    source: ["100", "computed"],
  },

  // ─────────────────────────────────────────────────────────────
  // 옵션 (Pareto, Dynamic)
  // ─────────────────────────────────────────────────────────────
  bcg_pareto_80: {
    id: "bcg_pareto_80",
    name: "Pareto 80/20",
    category: "profitability",
    unit: "ratio",
    formula: "매출 내림차순 누적 80% 이내 품목 마킹",
    beginner:
      "🎯 매출 80%를 차지하는 핵심 품목 (Top 20%).\n" +
      "이 품목들에 자원 집중하면 효과 ↑.",
    intermediate:
      "파레토 법칙 — 상위 20% 품목이 전체 매출 80% 차지하는 일반 패턴.\n" +
      "매트릭스에서 outline 강조 (검은색 테두리). 집중 관리 대상.",
    expert:
      "Vilfredo Pareto의 1906년 관찰 — 이탈리아 토지 80%를 인구 20%가 소유. " +
      "실측 검증 필수 — 8/2 분포가 무너지면 (예: 5/95) 매출 집중도 ↓ → 다양화 신호.",
    benchmark: "건자재 B2B는 일반적으로 70/30 ~ 90/10 사이",
    relatedIds: ["bcg_dynamic_arrow"],
    source: ["100", "computed"],
  },
  bcg_dynamic_arrow: {
    id: "bcg_dynamic_arrow",
    name: "Dynamic 추세 화살표",
    category: "profitability",
    unit: "ratio",
    formula:
      "12개월 데이터 → 6M(이전) + 6M(최근) 분할\n" +
      "매출 Δ + 마진 Δ → improving/stable/declining",
    beginner:
      "↗↘ 품목이 좋아지는지 나빠지는지 추세.\n" +
      "Star로 가는지 Dog으로 가는지 시각화.",
    intermediate:
      "이전 6개월 평균 vs 최근 6개월 평균 비교.\n" +
      "improving (↗): 매출+마진 동시 증가\n" +
      "declining (↘): 매출+마진 동시 감소\n" +
      "stable (→): 변화 미미 또는 방향 상반",
    expert:
      "거래월 6개 미만 품목은 'insufficient_data'로 화살표 미표시. " +
      "정통 BCG에 없는 보강 — 단일 시점이 아닌 추세 의사결정 가능. " +
      "맥킨지 'Dynamic BCG' 패턴.",
    benchmark: "improving 비중 30%+ 권장 (회사 성장 신호)",
    relatedIds: ["bcg_pareto_80"],
    source: ["100", "computed"],
  },

  // ─────────────────────────────────────────────────────────────
  // 임계 모드 (4가지)
  // ─────────────────────────────────────────────────────────────
  bcg_threshold_median: {
    id: "bcg_threshold_median",
    name: "임계: Median (중앙값)",
    category: "profitability",
    unit: "ratio",
    formula: "X축 = 매출 median, Y축 = 마진 median",
    beginner:
      "📊 중간 위치에 선을 그어 4분면 나눔.\n" +
      "절반은 위쪽 / 아래쪽으로 균등 분포.",
    intermediate:
      "통계적 표준 — outlier 영향 최소화.\n" +
      "4분면이 25%씩 균등 분포 (정확히는 ±2-3%).",
    expert:
      "Robust statistics — 평균 대비 outlier 저항성 ↑. " +
      "단점: 임계가 데이터셋에 의존 → 다른 시점/필터와 절대 비교 어려움.",
    benchmark: "기본 권장 (가장 균형)",
    relatedIds: ["bcg_threshold_p75", "bcg_threshold_weighted", "bcg_threshold_zero"],
  },
  bcg_threshold_p75: {
    id: "bcg_threshold_p75",
    name: "임계: P75 (75 percentile)",
    category: "profitability",
    unit: "ratio",
    formula: "X축 = 매출 p75, Y축 = 마진 p75",
    beginner:
      "🌟 상위 25%만 Star로 인정.\n" +
      "엘리트 품목 식별에 좋음.",
    intermediate:
      "Star 사분면이 ~6.25% (25% × 25%) 만 차지.\n" +
      "정말 우수한 품목만 Star — 자원 집중 전략에 적합.",
    expert: "엘리트 식별. Cash Cow 사분면도 작아짐 — 대부분 Question Mark/Dog.",
    benchmark: "전사 자원 한정 시 권장",
    relatedIds: ["bcg_threshold_median", "bcg_threshold_weighted", "bcg_threshold_zero"],
  },
  bcg_threshold_weighted: {
    id: "bcg_threshold_weighted",
    name: "임계: 전사 가중평균 마진",
    category: "profitability",
    unit: "ratio",
    formula: "Y축 = totalProfit / totalSales × 100",
    beginner:
      "💯 회사 진짜 평균 대비 위/아래.\n" +
      "전사 평균보다 마진 좋은가 나쁜가.",
    intermediate:
      "Y축만 가중 마진 사용 (X축은 median). 전사 평균 대비 아웃퍼폼/언더퍼폼 식별.\n" +
      "outlier 영향 ↓ — 매출 가중이라 작은 품목 영향 미미.",
    expert: "외부 보고 시 권장 — '전사 평균 대비 X% 우위' 같은 명확한 비교 가능.",
    benchmark: "전사 마진 절대값 비교 시 권장",
    relatedIds: ["bcg_threshold_median", "bcg_threshold_p75", "bcg_threshold_zero"],
  },
  bcg_threshold_zero: {
    id: "bcg_threshold_zero",
    name: "임계: 0% (적자/흑자)",
    category: "profitability",
    unit: "ratio",
    formula: "Y축 = 0% (마진 양수 → Star/?, 음수 → Cash Cow/Dog)",
    beginner:
      "⚖ 적자 품목 vs 흑자 품목 단순 분리.\n" +
      "Star/Question은 모두 흑자, Cash Cow/Dog는 모두 적자.",
    intermediate:
      "재무 의사결정 지향 — 적자 품목 정리 우선순위 결정.\n" +
      "Star가 사라지고 Cash Cow가 늘어남 (대매출+적자 = Cash Cow).",
    expert:
      "회계 관점 — '연결 손익 양수 vs 음수' 단순 분류. " +
      "장기 전략보다 단기 재무 정상화에 유용.",
    benchmark: "적자 품목 정리 캠페인 시 권장",
    relatedIds: ["bcg_threshold_median", "bcg_threshold_p75", "bcg_threshold_weighted"],
  },

  // ─────────────────────────────────────────────────────────────
  // 4-way segment 개념
  // ─────────────────────────────────────────────────────────────
  bcg_segment_4way: {
    id: "bcg_segment_4way",
    name: "4-way Segment 분류",
    category: "profitability",
    unit: "ratio",
    formula:
      "계정구분 (제품/상품) × 매출유형 (내수/해외) = 4 segment\n" +
      "각 segment 별도 BCG 매트릭스 작성",
    beginner:
      "🌍 제품/상품 + 내수/해외 = 4가지 조합.\n" +
      "각 조합별로 별도 매트릭스 (한 화면에 4개).",
    intermediate:
      "제품 vs 상품 (자체 생산 vs 외부 매입) + 내수 vs 해외 = 4 segment.\n" +
      "각 segment 특성이 다르므로 (제품 마진 5-7% vs 상품 <1%) 별도 분석 필수.",
    expert:
      "출처: 100 보고서 col 8 (계정구분) + col 12 (매출유형). " +
      "fill-down 처리됨 (parser.ts:902-908). " +
      "'기타' 매출유형 (자동/주유소/품목라인X) → 내수 통합. 반품매출 → 제외.",
    benchmark: "각 segment 최소 30 품목 이상 권장 (의미 있는 사분면 분포)",
    source: ["100", "computed"],
  },
} as const satisfies Record<string, MetricEntry>;
