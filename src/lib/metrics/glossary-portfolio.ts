/**
 * Portfolio Matrix (BCG 4-way SQA) glossary 엔트리.
 *
 * 25 entries:
 * - 4 사분면 (Star / Cash Cow / Problem Child / Dog)
 * - 2 마진 (가중 / 산술 평균 — outlier 영향)
 * - 2 옵션 (Pareto 80/20 / Dynamic 화살표)
 * - 4 임계 모드 (Median / P75 / 가중평균 / 0%)
 * - 1 개념 (4-way segment)
 * - 12 v3 추가 (KPI 합계 2 / 차트 축 2 / 임계선 2 / 데이터 품질 4 / 원가 경고 2)
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

  // ─────────────────────────────────────────────────────────────
  // v3: KPI 합계 (총 매출액 / 총 영업이익)
  // ─────────────────────────────────────────────────────────────
  bcg_total_sales: {
    id: "bcg_total_sales",
    name: "총 매출액 (제품+상품)",
    category: "profitability",
    unit: "currency",
    formula: "Σ 4 segment 매출 = (내수×제품 + 내수×상품 + 해외×제품 + 해외×상품)",
    beginner:
      "💰 분석 대상 4 segment 매출의 단순 합.\n" +
      "0원 매출, 반품, 음수원가 품목은 빠진 후의 합.",
    intermediate:
      "각 segment 매트릭스에 표시되는 entries만의 합. 사전 필터링 결과:\n" +
      "(1) 매출 ≤ 0 제외, (2) 반품매출 제외, (3) 음수 원가 자동 제외 (v2 reconciliation).\n" +
      "전사 매출과 다를 수 있음 — 원자재·부재료 등 비제품/비상품은 제외.",
    expert:
      "출처: 100 보고서 매출액.실적 (계정구분 ∈ {제품, 상품}만). " +
      "Phase B-0 fill-down 적용 후 매출유형 빈값 78.5% → 0% 해결. " +
      "재무 보고의 '제품매출+상품매출' 라인과 일치해야 정상.",
    benchmark: "전사 매출 대비 80%+ 권장 (제품+상품 비중)",
    relatedIds: ["bcg_total_op_profit", "bcg_segment_4way", "bcg_excluded_zero_sales"],
    source: ["100", "computed"],
  },
  bcg_total_op_profit: {
    id: "bcg_total_op_profit",
    name: "총 영업이익 (제품+상품)",
    category: "profitability",
    unit: "currency",
    formula: "Σ 4 segment 영업이익 = Σ (매출 − 매출원가 − 판관비)",
    beginner:
      "💵 4 segment 영업이익의 합.\n" +
      "양수면 흑자, 음수면 적자.",
    intermediate:
      "총 매출액과 동일 필터링 적용 후의 영업이익 합.\n" +
      "가중 영업이익율 = 이 값 / 총 매출액 × 100 (KPI 카드 우측에 표시).",
    expert:
      "출처: 100 보고서 영업이익.실적 (= 매출총이익 − 판매관리비). " +
      "음수 원가 품목 (cost<0) 제외로 인해 비현실적 215% 영업이익율 케이스 자동 제거.",
    benchmark: "건자재 B2B 영업이익 3~5% 수준 권장",
    relatedIds: ["bcg_total_sales", "bcg_weighted_margin"],
    source: ["100", "computed"],
  },

  // ─────────────────────────────────────────────────────────────
  // v3: 차트 축 (X / Y)
  // ─────────────────────────────────────────────────────────────
  bcg_x_axis_sales: {
    id: "bcg_x_axis_sales",
    name: "X축: 매출액",
    category: "profitability",
    unit: "currency",
    formula: "품목별 매출액 = Σ 월별 매출.실적 (12개월 통합, 필터 적용 후)",
    beginner:
      "📊 가로축 — 오른쪽일수록 매출 큰 품목.\n" +
      "Star/Cash Cow는 오른쪽에, Problem Child/Dog는 왼쪽에.",
    intermediate:
      "선택된 기간 (예: 12개월)의 품목별 매출 합계. segment마다 별도 매트릭스이므로 X축 스케일이 다를 수 있음.\n" +
      "내수×제품: 최대 ~22억, 해외×상품: 최대 ~10억 — segment 비교 시 절대값 대신 비중 활용 권장.",
    expert:
      "출처: 100 보고서 매출액.실적, key=(영업조직팀, 매출거래처, 품목) 단위 집계. " +
      "음수 매출(반품)은 0매출 필터에서 제외됨. 정상 매출만 합산.",
    benchmark: "각 segment의 median을 임계 기본값으로 사용 (Star/Dog 균형)",
    relatedIds: ["bcg_y_axis_margin", "bcg_ref_line_sales", "bcg_total_sales"],
    source: ["100", "computed"],
  },
  bcg_y_axis_margin: {
    id: "bcg_y_axis_margin",
    name: "Y축: 영업이익율 ([-50%, 100%] 클램핑)",
    category: "profitability",
    unit: "percent",
    formula: "영업이익율 = 영업이익 ÷ 매출 × 100\n차트 표시: max(-50, min(100, 실제값))",
    beginner:
      "📊 세로축 — 위로 갈수록 마진 좋은 품목.\n" +
      "0% 위는 흑자, 0% 아래는 적자.",
    intermediate:
      "차트 가시 범위는 [-50%, 100%]로 고정. 이 범위를 넘는 outlier는 경계선에 클램핑되고 검은 outline 표시.\n" +
      "실제 값(예: -2946%, 215%)은 hover 시 툴팁에서 확인.\n" +
      "클램핑 이유: outlier 1건이 차트 전체 스케일을 망가뜨려 정상 품목 분포가 안 보이는 것을 방지.",
    expert:
      "Y_MIN=-50, Y_MAX=100 (productPortfolioMatrix.ts). " +
      "outlier 정의: |marginRate| > 100% (OUTLIER_MARGIN_THRESHOLD). " +
      "클램핑은 시각화만 — 산술 평균(outlier 제외) 계산은 알고리즘 단계에서 처리.",
    benchmark: "건자재 B2B 정상 마진 -5%~+15% 범위 (대부분 클램핑 미발동)",
    commonMistakes: ["경계선의 점이 실제 100%인 줄 오해 — outline 있으면 outlier (실제값 > 100%)"],
    relatedIds: ["bcg_x_axis_sales", "bcg_ref_line_margin", "bcg_outlier_clamping"],
    source: ["100", "computed"],
  },

  // ─────────────────────────────────────────────────────────────
  // v3: 차트 임계선 (X / Y dashed)
  // ─────────────────────────────────────────────────────────────
  bcg_ref_line_sales: {
    id: "bcg_ref_line_sales",
    name: "X 임계선 (매출 기준)",
    category: "profitability",
    unit: "currency",
    formula:
      "현재 모드에 따라:\n" +
      "  Median  → segment 매출의 중앙값\n" +
      "  P75     → 75 percentile (상위 25%만 Star)\n" +
      "  가중평균 → totalSales / 품목 수 (단순 평균, 참고용)",
    beginner:
      "📍 세로 점선 — 이 선보다 오른쪽은 '대매출', 왼쪽은 '소매출'.\n" +
      "선의 위치는 화면 상단 매출 임계 선택에 따라 바뀜.",
    intermediate:
      "각 segment 별도 산출 — 내수×제품과 해외×상품의 임계가 다름.\n" +
      "Median (기본값): 4분면 균등 분포. P75: Star 사분면이 ~6.25%로 작아짐 (엘리트 식별). " +
      "임계 모드 변경 시 모든 점의 사분면 분류가 재계산됨.",
    expert:
      "computeSalesThreshold() in productPortfolioMatrix.ts. " +
      "임계는 segment 데이터셋에 의존하므로 다른 시점/필터와 절대 비교 어려움. " +
      "외부 보고용 절대 비교가 필요하면 custom number 임계 (예: 10억) 직접 지정 권장.",
    benchmark: "Median = 가장 균형 / P75 = 자원 한정 시 / 평균 = 참고용",
    relatedIds: ["bcg_threshold_median", "bcg_threshold_p75", "bcg_threshold_weighted", "bcg_x_axis_sales"],
    source: ["100", "computed"],
  },
  bcg_ref_line_margin: {
    id: "bcg_ref_line_margin",
    name: "Y 임계선 (영업이익율 기준)",
    category: "profitability",
    unit: "percent",
    formula:
      "현재 모드에 따라:\n" +
      "  Median   → segment 마진의 중앙값\n" +
      "  가중평균 → 전사 가중 마진 (totalProfit / totalSales)\n" +
      "  0%       → 적자/흑자 단순 분리",
    beginner:
      "📍 가로 점선 — 이 선보다 위는 '고마진', 아래는 '저마진'.\n" +
      "선의 위치는 화면 상단 영업이익율 임계 선택에 따라 바뀜.",
    intermediate:
      "각 segment 별도 산출. Median (기본): 균형 / 가중평균: 전사 평균 대비 / 0%: 흑자/적자 분리.\n" +
      "0% 모드는 적자 정리 캠페인용 — Cash Cow가 모두 적자, Star가 모두 흑자로 단순 이분.",
    expert:
      "computeMarginThreshold() in productPortfolioMatrix.ts. " +
      "산술 평균 모드는 의도적으로 제거됨 (outlier 영향 큼). " +
      "외부 보고 시 가중평균 권장 — '전사 평균 대비 X%p 우위' 명확.",
    benchmark: "Median = 균형 / 가중평균 = 외부보고 / 0% = 적자 정리",
    relatedIds: ["bcg_threshold_median", "bcg_threshold_weighted", "bcg_threshold_zero", "bcg_y_axis_margin"],
    source: ["100", "computed"],
  },

  // ─────────────────────────────────────────────────────────────
  // v3: 데이터 품질 (4종 — 0매출/반품/거래월부족/outlier)
  // ─────────────────────────────────────────────────────────────
  bcg_excluded_zero_sales: {
    id: "bcg_excluded_zero_sales",
    name: "0 매출 제외 건수",
    category: "profitability",
    unit: "number",
    formula: "매출액.실적 ≤ 0 → 분석 대상 제외",
    beginner:
      "🚫 매출이 0원이거나 음수인 행은 차트에 안 그림.\n" +
      "분석 의미 없음 (마진율 계산 불가).",
    intermediate:
      "0 매출 = 거래 안 일어났거나 보고 시점 매출 미집계. 음수 매출 = 반품 (별도 카운트로 분리).\n" +
      "100 보고서는 월별 시트로 concat되므로 일부 월에 0 매출인 행이 다수 발생. 이는 정상 — 12M 합산 시 의미 있는 행만 남음.",
    expert:
      "productPortfolioMatrix.ts:225-228. excludedZeroSales 카운터로 통계 노출. " +
      "수천 건 발생 가능 (정상). 의심 케이스: 특정 organization의 모든 품목이 0 매출 → 데이터 누락 가능성.",
    benchmark: "총 행 수의 30~70% 정상 (월별 concat 결과)",
    relatedIds: ["bcg_excluded_returns", "bcg_insufficient_data"],
    source: ["100", "computed"],
  },
  bcg_excluded_returns: {
    id: "bcg_excluded_returns",
    name: "반품매출 제외 건수",
    category: "profitability",
    unit: "number",
    formula: "매출유형 ∋ '반품' → segment 분류에서 제외",
    beginner:
      "🔄 반품 거래는 별도 카운트로만 표시.\n" +
      "정상 매출과 섞으면 마진 왜곡.",
    intermediate:
      "매출유형 = '반품매출'인 행은 음수 매출이므로 차트 분석 대상 아님.\n" +
      "0 매출 필터에 잡히기도 하지만 분류 단계에서 별도 카운트 — '반품 발생 N건' 신호로 활용.",
    expert:
      "classifySegmentType() in productPortfolioMatrix.ts:147-153. '반품' 포함 → 'segment 제외'. " +
      "회계 분개 누적과 별개 — 반품매출 자체는 정상 분개. " +
      "건수 급증 시 (예: 평월 5건 → 50건) 품질 이슈 신호.",
    benchmark: "월 평균 1~10건 정상 (수십 건 이상 시 점검)",
    relatedIds: ["bcg_excluded_zero_sales", "bcg_negative_cost"],
    source: ["100", "computed"],
  },
  bcg_insufficient_data: {
    id: "bcg_insufficient_data",
    name: "거래월 부족 (Dynamic 미적용)",
    category: "profitability",
    unit: "number",
    formula: "monthCount < 6 → Dynamic 화살표 미표시 (6M+6M 분할 불가)",
    beginner:
      "📅 거래 월 수가 6개월 미만이면 추세 화살표 안 보임.\n" +
      "신규 품목 또는 단발성 거래.",
    intermediate:
      "Dynamic BCG는 12M 데이터를 6M(이전) + 6M(최근)으로 분할해 매출/마진 변화 비교.\n" +
      "거래월 6개 미만 = 분할 불가 → trendDirection='insufficient_data' (또는 'new' if 0개).\n" +
      "차트에는 표시되지만 ↗→↘ 화살표는 안 그려짐.",
    expert:
      "DEFAULT_DYNAMIC_MIN_MONTHS=6 (productPortfolioMatrix.ts:134). " +
      "monthCount는 _unknown 키 (매출연월 없는 행) 제외 후 산정. " +
      "감소 트렌드: 거래 단절 → 다음 분석 시 'new' 처리될 가능성.",
    benchmark: "전체 품목 중 30%+ insufficient_data 시 데이터 기간 부족 (6M 이상 기간 권장)",
    relatedIds: ["bcg_dynamic_arrow"],
    source: ["100", "computed"],
  },
  bcg_outlier_clamping: {
    id: "bcg_outlier_clamping",
    name: "Outlier 클램핑 (|마진|>100%)",
    category: "profitability",
    unit: "number",
    formula:
      "outlier = |영업이익율| > 100%\n" +
      "차트: Y축 [-50, 100] 경계로 clamp + 검은 outline\n" +
      "산술 평균: 제외 (arithmeticMarginExOutlier)",
    beginner:
      "⚠ 마진율이 +100% 넘거나 -50% 아래인 비정상 품목.\n" +
      "차트에서는 경계에 표시 (outline). 실제 값은 hover로 확인.",
    intermediate:
      "원인: (1) 매출 매우 작은 품목의 비례 왜곡 (5만원 매출에 -100만원 적자 → -2000%), " +
      "(2) 회계 분개 누적 (음수 원가는 별도 자동 제외). " +
      "차트 시각화만 클램핑 — 산술 평균 'outlier 제외' 버전을 KPI에 노출해 왜곡 방지.",
    expert:
      "OUTLIER_MARGIN_THRESHOLD=100 (productPortfolioMatrix.ts:116). " +
      "Y_MIN=-50, Y_MAX=100 클램핑. arithmeticMarginExOutlier로 별도 평균 노출. " +
      "outlier 비중 5%+ 시 데이터 품질 점검 신호 (작은 매출 품목 정리 또는 임계 조정).",
    benchmark: "outlier 비중 ≤ 3% 정상 / 3~10% 점검 / 10%+ 데이터 이슈",
    commonMistakes: ["경계선 점이 진짜 100%인 줄 오해 — outline 표시되면 outlier"],
    contextBranches: [
      {
        when: (n: number) => n >= 10,
        message: "📍 outlier 10건 이상 — 임계/필터 점검 권장",
        tone: "warning" as const,
      },
    ],
    relatedIds: ["bcg_y_axis_margin", "bcg_arithmetic_margin"],
    source: ["100", "computed"],
  },

  // ─────────────────────────────────────────────────────────────
  // v3: 원가 경고 (미계상 / 음수)
  // ─────────────────────────────────────────────────────────────
  bcg_missing_cost: {
    id: "bcg_missing_cost",
    name: "🚨 원가 미계상 의심",
    category: "profitability",
    unit: "number",
    formula: "매출 > 0 AND 매출원가.실적 = 0 AND 영업이익율 ≥ 90% → hasMissingCost=true",
    beginner:
      "💡 매출은 있는데 원가가 0원으로 잡힌 품목.\n" +
      "회계 시스템에서 원가 계산이 안 된 상태 — 진짜 마진 90%인 게 아님.",
    intermediate:
      "마진율 90%+ 이면서 원가=0 = 회계 ERP 매출원가 미계상 의심. 회계팀 확인 필요.\n" +
      "실측 4건 발견: HD-40 (HDO/수출) 98.8%, B-C(0.3%) GS(D) 97.3%, Sleeper(PoJ) 94.3%, 빈품목명 94.2%.",
    expert:
      "productPortfolioMatrix.ts:338. hasMissingCost = (totalCost === 0 && sales > 0 && marginRate >= 90). " +
      "100 보고서 매출원가 컬럼이 비어있거나 0인 케이스 — SAP 원가 계산 미실행 또는 BOM 누락 가능성. " +
      "회계팀에서 원가 계산 후 재집계 필요.",
    benchmark: "0건이 정상 (1건 이상 발견 시 즉시 회계팀 확인)",
    contextBranches: [
      {
        when: (n: number) => n >= 1,
        message: "🚨 회계팀 알림 필요 — 미계상 원가 분개 검토",
        tone: "danger" as const,
      },
    ],
    relatedIds: ["bcg_negative_cost"],
    source: ["100", "computed"],
  },
  bcg_negative_cost: {
    id: "bcg_negative_cost",
    name: "🚨 음수 원가 (분석 자동 제외)",
    category: "profitability",
    unit: "number",
    formula:
      "매출원가.실적 < 0 → hasNegativeCost=true → entries 진입 차단\n" +
      "산식: 매출 − (−원가) = 매출 + |원가| → 매출총이익 > 매출 (비현실적)",
    beginner:
      "🚨 매출원가가 마이너스인 비정상 데이터.\n" +
      "수학상 a − (−b) = a + b는 정확하나, 매출보다 이익이 크게 나오는 비현실적 결과 → 차트에서 자동 제외.",
    intermediate:
      "환입·조정 분개가 출고 원가를 초과해 net 음수가 된 케이스. 매출총이익율 215% 같은 비현실적 결과 발생.\n" +
      "차트에서는 자동 제외 (entries 진입 차단)하고 통계 카운터로만 표시 — 평균/임계가 anomaly에 왜곡되는 것 방지.\n" +
      "실측 케이스: 루비캡(흑녹색) 3.0mm*10m, 매출 531만 / 원가 -612만 / 매출총이익 1,143만 (215.24%).",
    expert:
      "productPortfolioMatrix.ts:340-347. excludedNegativeCostItems 카운터로 통계 보존. " +
      "negativeCostCount는 entries 기반이므로 0 (중복 카운트 방지). " +
      "v2 reconciliation: 수학(정확) ≠ 비즈니스(비현실적) → Defensive Analytics 원칙 적용.",
    benchmark: "0건이 정상 (1건 이상 = 회계 분개 누적 점검 필요)",
    commonMistakes: [
      "수학적으로는 정확하지만 비즈니스 의미 없음 (매출 < 영업이익)",
      "negativeCostCount=0이라고 음수 원가 없는 게 아님 — excludedNegativeCostItems 봐야 함",
    ],
    contextBranches: [
      {
        when: (n: number) => n >= 1,
        message: "🚨 회계팀 알림 필요 — 환입·조정 분개 검토",
        tone: "danger" as const,
      },
    ],
    relatedIds: ["bcg_missing_cost", "bcg_anomaly_export"],
    source: ["100", "computed"],
  },

  // ─────────────────────────────────────────────────────────────
  // v4 P1-1: 회계팀 검증용 anomaly CSV export
  // ─────────────────────────────────────────────────────────────
  bcg_anomaly_export: {
    id: "bcg_anomaly_export",
    name: "📥 회계팀 검증용 anomaly CSV",
    category: "profitability",
    unit: "number",
    formula:
      "anomaly = 음수 원가 (cost<0) ∪ 원가 미계상 의심 (sales>0 ∧ cost=0 ∧ margin≥90%)\n" +
      "CSV 컬럼: Segment, 품목코드/명, 제품군, 매출/원가/매출총이익, 매출총이익율, 영업이익율, 거래월수, 이상유형, 사유",
    beginner:
      "📥 회계팀에 보낼 검증 자료를 한 번에 다운로드.\n" +
      "이상한 데이터를 표로 정리해 회계팀이 분개 확인 가능.",
    intermediate:
      "회계팀 actionable signal 강화 — UI 경고만 보면 어느 품목인지 추적 어려움. CSV로 거래처/품목/금액/사유 일괄 제공해 분개 검토 즉시 가능.\n" +
      "필터링: 원가 미계상만 / 음수 원가만 / 통합 (전체) 3가지 다운로드 옵션.",
    expert:
      "출처: productPortfolioMatrix.ts:340-373 anomalies 배열. 음수 원가는 entries 진입 차단되지만 anomalies에는 보존되어 export 가능. " +
      "exportToCSV() utility (src/lib/export.ts:6) 활용 — UTF-8 BOM 포함 한글 Excel 호환. " +
      "파일명: BCG_anomaly_{유형}_{YYYY-MM-DD}.csv",
    benchmark: "0건 export = 정상 / 1건+ = 회계팀 검토 트리거",
    contextBranches: [
      {
        when: (n: number) => n >= 1,
        message: "📥 export 후 회계팀 전달 → 분개 검토 결과 받아 다음 cycle 적용",
        tone: "info" as const,
      },
    ],
    relatedIds: ["bcg_missing_cost", "bcg_negative_cost"],
    source: ["100", "computed"],
  },
} as const satisfies Record<string, MetricEntry>;
