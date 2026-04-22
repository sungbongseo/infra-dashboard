/**
 * Orders 카테고리 glossary 엔트리 — Phase 2.
 *
 * 포함: O2C(Order-to-Cash) 전환율 / O2C 플로우 / 재고 분석 핵심 지표.
 */

import type { MetricEntry } from "./glossary";

export const ordersMetrics = {
  // ─────────────────────────────────────────────────────────────
  // O2C (Order-to-Cash) 파이프라인
  // ─────────────────────────────────────────────────────────────
  o2c_order_to_sales_rate: {
    id: "o2c_order_to_sales_rate",
    name: "수주 → 매출 전환율",
    category: "orders",
    unit: "percent",
    formula:
      "전환율 = 매출 실적 ÷ 수주 실적 × 100\n" +
      "집계 단위: 조직별 또는 품목별",
    beginner:
      "📦 수주받은 주문 중 실제로 납품되어 매출이 찍힌 비율.\n" +
      "100%면 수주한 만큼 다 팔렸다는 뜻.",
    intermediate:
      "수주 대비 매출 전환 효율을 %로 측정.\n" +
      "100% 초과면 과거 수주분이 이번 기간 매출로 잡혔다는 뜻(이월), 100% 미만이면 수주가 매출로 전환되기 전 단계.\n" +
      "80% 미만이면 납품 지연·취소 조사 필요.",
    expert:
      "출처: 수주(600) + 매출(100) 보고서 조합. 분자·분모의 기간 정렬이 중요 — 수주 후 납품까지의 리드타임(보통 30~60일)을 고려해 수주는 '전월', 매출은 '당월' 비교가 더 정확할 수 있음. 현 구현은 동일 기간 비교.",
    benchmark: "≥95%: 우수 · 85~95%: 정상 · <85%: 수주/납품 파이프라인 점검 필요",
    commonMistakes: [
      "전환율 200% 등 과도한 값은 이월 수주 또는 수주 취소분이 매출로 집계된 경우. 절대 금액도 함께 확인 필요.",
      "수주·매출의 기간을 동일 월로 단순 비교하면 리드타임 효과로 왜곡될 수 있음.",
    ],
    relatedIds: ["o2c_collection_rate"],
    source: ["600", "100"],
  },

  o2c_collection_rate: {
    id: "o2c_collection_rate",
    name: "매출 → 수금 전환율",
    category: "orders",
    unit: "percent",
    formula: "수금률 = 수금 실적 ÷ 매출 실적 × 100",
    beginner:
      "💵 매출 발생 중 실제 돈 받은 비율.\n" +
      "100%면 거래처에 물건 준 만큼 돈을 다 받았다는 뜻.",
    intermediate:
      "O2C 파이프라인 최종 단계의 전환 효율.\n" +
      "90% 미만이면 미수금 증가 신호. 미수금 aging 분석 병행 필요.",
    expert:
      "리드타임 주의: 신용 기간(보통 30~60일)만큼 수금이 매출 뒤에 발생하므로 동일 기간 비교 시 70~85% 수준이 일반적. DSO(매출채권회수일수)로 보조 판독 권장.",
    benchmark: "≥95%: 현금 흐름 양호 · 85~95%: 정상 · <85%: 미수금 위험",
    relatedIds: ["o2c_order_to_sales_rate"],
    source: ["700", "100"],
  },

  // ─────────────────────────────────────────────────────────────
  // 재고 분석
  // ─────────────────────────────────────────────────────────────
  inventory_turnover_days: {
    id: "inventory_turnover_days",
    name: "재고 소진 예상일",
    category: "orders",
    unit: "days",
    formula: "소진일 = 현재재고 ÷ (최근 3개월 평균 일판매량)",
    beginner:
      "📅 지금 재고가 며칠이면 다 팔릴지.\n" +
      "7일이면 일주일 뒤 품절, 100일이면 오래 쌓여 있음.",
    intermediate:
      "현재 재고를 이동평균 판매량으로 나눈 예상 소진 기간.\n" +
      "짧으면 품절 위험, 너무 길면 재고 과잉(자금 묶임).",
    expert:
      "이동평균 기간(3M)은 inventoryAnalysis.ts에서 조정 가능. 계절성 큰 품목은 단순 MA가 부정확 — 계절 조정 또는 작년 동기 비교 권장. 신제품은 판매 이력 부족으로 소진일 과장 가능.",
    benchmark: "<15일: 품절 위험 · 30~90일: 정상 · >180일: 재고 과잉",
    relatedIds: ["o2c_order_to_sales_rate"],
    source: ["external"],
    sourceNote: "재고수불 엑셀 (inventoryMovement)",
  },
} as const satisfies Record<string, MetricEntry>;
