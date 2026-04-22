/**
 * Sales 카테고리 glossary 엔트리 — Phase 2.
 *
 * 우선순위 높은 탭: RfmTab (0 KpiCard · 초보자 혼란 최다).
 * Phase 4에서 ChannelTab/TypeTab/CustomerTab/MarginTab 등 확장.
 */

import type { MetricEntry } from "./glossary";

export const salesMetrics = {
  // ─────────────────────────────────────────────────────────────
  // RFM 분석 (RfmTab)
  // ─────────────────────────────────────────────────────────────
  rfm_recency: {
    id: "rfm_recency",
    name: "Recency (R) — 최근성",
    category: "sales",
    unit: "days",
    formula:
      "R일수 = 오늘 − 해당 거래처의 마지막 구매일\n" +
      "R점수 = 전체 거래처의 R일수 분포에서 5분위로 점수화\n" +
      "  (일수가 짧을수록 높은 점수: 5=최근 20%, 1=오래된 20%)",
    beginner:
      "⏰ 이 거래처가 마지막으로 구매한 지 얼마나 됐는지.\n" +
      "최근에 산 단골일수록 높은 점수.",
    intermediate:
      "거래처의 '얼마나 최근에 거래했는지'를 점수화한 값(1~5).\n" +
      "R=5는 전체 거래처 중 가장 최근 20%에 속함, R=1은 가장 오래된 20%.\n" +
      "이탈 위험 신호로 가장 빠르게 반응하는 지표.",
    expert:
      "분위수 기반(quintile)이므로 절대 일수가 아닌 '상대 순위'. 신규 거래처가 많이 추가되면 기존 거래처의 R이 낮아지는 상대성 주의. 분석 기준일은 데이터 최신 거래일을 사용.",
    benchmark: "R=5: VIP 관리 · R=4: 유지 집중 · R=3: 재활성화 시도 · R=1~2: 이탈 대응 시급",
    commonMistakes: [
      "R 점수를 '거래 빈도'와 혼동 금지 — R은 오직 '마지막 거래 시점'만 봄.",
      "작은 표본(거래처 <50)에서는 5분위가 균등 분할되지 않아 해석 변질. RfmTab은 이 경우 경고 배너 표시.",
    ],
    relatedIds: ["rfm_frequency", "rfm_monetary", "rfm_segment"],
    source: ["100", "computed"],
  },

  rfm_frequency: {
    id: "rfm_frequency",
    name: "Frequency (F) — 빈도",
    category: "sales",
    unit: "number",
    formula:
      "F수 = 해당 거래처의 기간 내 구매 발생 '건수' 또는 '월수'\n" +
      "F점수 = 전체 분포의 5분위 (건수 많을수록 높은 점수)",
    beginner:
      "🔁 얼마나 자주 사는 단골인지.\n" +
      "매달 오는 단골은 F=5, 가끔 오는 손님은 F=1.",
    intermediate:
      "거래 빈도를 점수화(1~5). F=5는 전체 중 가장 자주 거래한 상위 20%.\n" +
      "단골 충성도를 측정하는 핵심 지표.",
    expert:
      "구현: calcRfmAnalysis()가 salesList의 고유 거래일(또는 월) 개수를 집계. 한 번에 대량 구매하는 거래처는 F는 낮지만 M은 높을 수 있음 — F·M 조합으로 해석 필요.",
    benchmark: "F=5+M=5: 충성 VIP · F=5+M=1: 소액 다빈도 · F=1+M=5: 대형 단발성",
    relatedIds: ["rfm_recency", "rfm_monetary", "rfm_segment"],
    source: ["100", "computed"],
  },

  rfm_monetary: {
    id: "rfm_monetary",
    name: "Monetary (M) — 금액",
    category: "sales",
    unit: "currency",
    formula:
      "M금액 = 해당 거래처의 기간 내 총 매출액\n" +
      "M점수 = 전체 분포의 5분위 (금액 클수록 높은 점수)",
    beginner:
      "💰 얼마나 많이 사는 큰 고객인지.\n" +
      "총 구매 금액으로 매긴 점수.",
    intermediate:
      "거래 금액 기준 점수(1~5). M=5는 매출 상위 20% 거래처.\n" +
      "실제 매출 기여도를 나타내는 가장 직관적인 축.",
    expert:
      "매출액(판매 단가 × 수량) 기준. 할인·반품 반영 여부는 원 데이터 집계 로직에 따름. 마진이 아닌 '매출'이라 저마진 대형 고객이 M=5가 될 수 있어 수익성과 구별 필요.",
    benchmark: "M=5 고객에 매출 80% 집중 → '파레토 법칙' 성립",
    commonMistakes: [
      "M이 높다고 '이익 기여도'가 높은 건 아님. 마진 분석은 별도(거래처×품목 손익) 병행 권장.",
    ],
    relatedIds: ["rfm_recency", "rfm_frequency", "rfm_segment"],
    source: ["100", "computed"],
  },

  rfm_segment: {
    id: "rfm_segment",
    name: "RFM 세그먼트",
    category: "sales",
    unit: "ratio",
    formula:
      "6개 세그먼트 분류 규칙:\n" +
      "  VIP: R≥4 AND F≥4 AND M≥4\n" +
      "  Loyal: F≥4 AND M≥3 (단골)\n" +
      "  Potential: R≥4 AND F≤3 (신규·성장)\n" +
      "  At-risk: R≤2 AND F≥3 (이탈 조짐 단골)\n" +
      "  Dormant: R≤2 AND F≤2\n" +
      "  Lost: R=1 AND F=1 AND M=1",
    beginner:
      "🏷️ 거래처를 6가지 성격으로 나눠 놓은 라벨.\n" +
      "VIP, 단골, 잠재, 이탈위험, 휴면, 놓친고객.",
    intermediate:
      "R/F/M 세 점수를 조합해 거래처를 6가지 전략 세그먼트로 분류합니다.\n" +
      "각 세그먼트마다 다른 액션 플랜이 있음(RFM_SEGMENT_ACTIONS 참조).\n" +
      "예: VIP는 유지 혜택, Lost는 재활성 캠페인.",
    expert:
      "임계값(R≥4 등)은 5분위 기준이므로 표본이 작으면 균등 분할 안 됨. RfmTab은 샘플 <50개일 때 경고 배너로 신뢰도 저하 알림. RFM_SEGMENT_ACTIONS가 각 세그먼트의 우선순위(high/medium/low)와 권장 액션을 매핑.",
    benchmark: "VIP 5% · Loyal 15% · Potential 20% · At-risk 10% · Dormant 30% · Lost 20% (업종별 차이)",
    commonMistakes: [
      "Potential 세그먼트가 '유망한 고객'으로만 보이지만, 실제로는 '최근 거래했지만 자주 안 사는' 고객이라 대형 계약 전환이 필요함.",
      "At-risk와 Dormant 모두 R이 낮지만, At-risk는 '원래 단골이 이탈 중'이라 우선 대응 대상.",
    ],
    relatedIds: ["rfm_recency", "rfm_frequency", "rfm_monetary"],
    source: ["100", "computed"],
  },
} as const satisfies Record<string, MetricEntry>;
