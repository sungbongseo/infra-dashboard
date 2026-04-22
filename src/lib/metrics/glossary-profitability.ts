/**
 * Profitability 카테고리 glossary 엔트리.
 *
 * 포함 범위 (Phase 1):
 * - Step 4a 슬라이더 3개 (물량/단가/원가)
 * - Step 4a 프리셋 4개 (시나리오 버튼)
 * - Step 4a 워터폴 5단계 (기존 → 가격 → 원가 → 물량 → 최종)
 * - PricingSim 핵심 지표 4개
 *
 * Phase 2+에서 다른 탭(CostTab, BreakevenTab, VarianceTab 등) 엔트리를 확장.
 */

import type { MetricEntry } from "./glossary";

export const profitabilityMetrics = {
  // ─────────────────────────────────────────────────────────────
  // Step 4a 슬라이더 3개
  // ─────────────────────────────────────────────────────────────
  volume_slider_4a: {
    id: "volume_slider_4a",
    name: "물량 증감 슬라이더 (Step 4a)",
    category: "profitability",
    unit: "percent",
    formula:
      "비율 모드: 신규수량 = 기존수량 × (1 + 물량증감%/100)\n" +
      "절대 모드: 추가수량 직접 입력 → 거래처별 수량 비중으로 배분\n" +
      "영향: volumeEffect = 추가수량 × (신규단가 − 조정변동비)",
    beginner:
      "🍞 빵을 얼마나 더 팔지 정하는 슬라이더.\n" +
      "100개 팔던 걸 150개 팔면 +50%, 50개만 팔면 −50%.",
    intermediate:
      "대상 품목의 판매 수량을 퍼센트(-50%~+100%) 또는 절대 개수로 조정합니다.\n" +
      "증가한 수량은 '단위 공헌이익'만큼 이익에 기여합니다(변동비 차감 후).\n" +
      "공장 캐파(고정비 변동 없음) 가정이라 물량 증가는 이익에 긍정적이지만, 단가 인하와 함께 쓰면 손익분기점까지 충분한 물량이 필요합니다.",
    expert:
      "출처: 100 보고서(거래처×품목 실적) 수량. 가정: (1) 물량 증가분의 변동비는 '조정 후 변동비'와 동일, (2) 고정비 총액 불변(캐파 내), (3) 수요 탄력성 0. 다거래처 절대수량 모드는 중복 방지를 위해 수량 비중 배분.",
    benchmark: "-10% 이하: 거래 위축 신호 | ±10%: 일반 협상 | +30% 이상: 캐파 재점검 필요",
    commonMistakes: [
      "물량 100%=200개가 아니라 '기존의 2배'. 수량 절대값과 혼동 금지.",
      "고정비가 완전히 변동하지 않는다는 가정. 생산량이 공장 캐파를 넘으면 잔업/설비 증설로 고정비 증가.",
      "절대 수량 모드에서 거래처 미선택 시 품목 총 수량 비중으로 자동 배분됨.",
    ],
    relatedIds: ["price_slider_4a", "cost_slider_4a", "volume_effect_4a"],
    source: ["100"],
    sourceNote: "100 보고서의 매출수량을 기준으로 볼륨 시뮬레이션",
  },

  price_slider_4a: {
    id: "price_slider_4a",
    name: "단가 조정 슬라이더 (Step 4a)",
    category: "profitability",
    unit: "percent",
    formula:
      "신규단가 = 기존단가 × (1 + 단가변동%/100)\n" +
      "영향: priceEffect = 기존수량 × (신규단가 − 기존단가)",
    beginner:
      "☕ 커피 가격을 몇 % 올리거나 내릴지 정하는 슬라이더.\n" +
      "5,000원을 5,500원으로 올리면 +10%, 4,500원으로 내리면 −10%.",
    intermediate:
      "대상 품목의 판매 단가를 퍼센트로 조정합니다(-30%~+30%).\n" +
      "인하하면 기존 수량에 대한 매출이 줄어 즉각 이익 감소, 인상하면 반대.\n" +
      "단가 인하 + 물량 증가 조합(박리다매)을 시뮬레이션할 때 주로 사용합니다.",
    expert:
      "출처: 100 보고서 단가. 가정: 모든 거래처에 동일 단가 적용(거래처별 차등 단가 미반영). 대상 거래처 선택 시 해당 거래처에만 적용, 비대상 거래처는 기존 단가 유지.",
    benchmark: "-10%: 공격적 인하 | ±5%: 일반 협상 | +10% 이상: 원가 전가 모드",
    commonMistakes: [
      "단가 5% 인하 = 매출 5% 감소가 아님 (수량 동시 증가 시 매출 증가 가능).",
      "단가 인상분을 원가 상승률과 동일하게 설정하면 마진율이 하락함 (÷(1-마진율)로 계산).",
      "대상 품목만 반영됨. 같은 거래처의 다른 품목 단가는 기준선 유지.",
    ],
    relatedIds: ["volume_slider_4a", "price_effect_4a", "price_increase_required"],
    source: ["100"],
  },

  cost_slider_4a: {
    id: "cost_slider_4a",
    name: "원가 변동 슬라이더 (Step 4a)",
    category: "profitability",
    unit: "percent",
    formula:
      "원자재/노무/외주 3개 슬라이더 → 품목별 원가 비율(vcCostRatioMap)로 가중 적용\n" +
      "조정변동비 = 기존변동비 × (1 + Σ(비중 × 상승률))\n" +
      "영향: costEffect = 기존수량 × (기존변동비 − 조정변동비)",
    beginner:
      "🥚 재료비·인건비·외주비가 몇 % 오르고 내릴지 정하는 슬라이더 3개.\n" +
      "원재료값이 10% 올랐을 때 이익이 얼마나 줄어드는지 바로 보입니다.",
    intermediate:
      "대상 품목의 변동비를 3개 버킷(원자재/노무/외주)별로 개별 조정합니다.\n" +
      "품목마다 3개 버킷의 비중이 다르므로, 같은 슬라이더 값이라도 품목별 영향이 다릅니다.\n" +
      "costEffect의 부호: 음수 = 원가 상승 = 이익 감소, 양수 = 원가 절감 = 이익 증가.",
    expert:
      "출처: 제조원가명세서(extractManufacturingFixedCost). 가정: (1) 변동비 비율 선형 적용, (2) 고정비 총액 불변, (3) 비대상 품목 원가 불변. 슬라이더는 `<details>` 접힘 상태이므로 사용자가 펼쳐야 보임 — 원가 변동 분석이 필요한 시나리오에서만 열 것.",
    benchmark: "±5%: 일반 시장 변동 | +10% 이상: 원자재 위기 | +20% 이상: 구조적 재검토 필요",
    commonMistakes: [
      "원가 상승률을 그대로 판가에 더하면 안 됨. 마진율을 보존하려면 필요 단가 인상률(price_increase_required) 참조.",
      "노무비 슬라이더는 '변동 노무비'만 반영. 월급제 고정 노무비는 고정비에 포함되어 별도 계산.",
      "외주비 슬라이더가 0이어도 외주 의존도가 높은 품목은 원재료 상승의 간접 영향 있음.",
    ],
    relatedIds: ["volume_slider_4a", "price_slider_4a", "cost_effect_4a", "price_increase_required"],
    source: ["501", "200"],
    sourceNote: "501 보고서 7-버킷 중 재료/노무/외주 3개만 슬라이더 노출",
  },

  // ─────────────────────────────────────────────────────────────
  // Step 4a 프리셋 4개
  // ─────────────────────────────────────────────────────────────
  preset_active: {
    id: "preset_active",
    name: "프리셋: 적극적 (+30%/-10%)",
    category: "profitability",
    unit: "ratio",
    formula: "물량 +30% + 단가 −10% (원가 불변)",
    beginner:
      "🎯 가격을 살짝 내려 수량을 크게 늘리는 균형 잡힌 시나리오.\n" +
      "단골 할인으로 판매량을 30% 끌어올리는 전략.",
    intermediate:
      "중간 강도의 박리다매 시나리오. 단가 10% 인하, 수량 30% 증가를 동시 적용합니다.\n" +
      "수요 탄력성이 양호한(가격에 민감하지만 절대 이탈은 없는) 시장에서 효과적.",
    expert:
      "volumeIncreasePct=30, priceChangePct=-10. 가격탄력성 약 -3 가정. Step 4a 항등식 유지. 단위 공헌이익이 판가의 20% 이상인 품목에서 유리.",
    relatedIds: ["volume_slider_4a", "price_slider_4a", "preset_aggressive", "preset_defensive"],
    source: ["computed"],
  },

  preset_aggressive: {
    id: "preset_aggressive",
    name: "프리셋: 공격적 (+50%/-15%)",
    category: "profitability",
    unit: "ratio",
    formula: "물량 +50% + 단가 −15% (원가 불변)",
    beginner:
      "⚡ 가격을 크게 내려 시장 점유율을 빠르게 뺏는 공세 시나리오.\n" +
      "대규모 세일로 경쟁사 고객을 끌어오는 전략.",
    intermediate:
      "가장 공격적인 박리다매. 단가 15% 인하로 수량 50% 증가를 노리는 시나리오.\n" +
      "공장 캐파 여유가 있고 단위 공헌이익이 매우 높은 품목에서만 이익 개선 가능.",
    expert:
      "volumeIncreasePct=50, priceChangePct=-15. 매출 증가는 +27.5%(=1.5×0.85−1). 공장 캐파 초과 가능성·고정비 증설 위험 병행 확인 필요. 단위 공헌이익이 판가의 30% 미만이면 이익 악화 가능.",
    relatedIds: ["volume_slider_4a", "price_slider_4a", "preset_active", "preset_price_up"],
    source: ["computed"],
  },

  preset_defensive: {
    id: "preset_defensive",
    name: "프리셋: 방어적 (+20%/-5%)",
    category: "profitability",
    unit: "ratio",
    formula: "물량 +20% + 단가 −5% (원가 불변)",
    beginner:
      "🛡️ 가격을 아주 조금 내려 안전하게 수량을 늘리는 보수적 시나리오.\n" +
      "소폭 할인으로 이탈 방지와 점유율 유지를 동시에.",
    intermediate:
      "소폭 할인(5%)으로 수량 20% 증가를 목표. 마진 손실이 작아 안전한 실험 시나리오로 활용.\n" +
      "경기 불확실 구간에서 점진 확장 시 적합.",
    expert:
      "volumeIncreasePct=20, priceChangePct=-5. 매출은 +14%(=1.2×0.95−1). 단위 공헌이익이 양호하면 대부분 이익 개선. 초기 테스트용 보수 프리셋.",
    relatedIds: ["volume_slider_4a", "price_slider_4a", "preset_active"],
    source: ["computed"],
  },

  preset_price_up: {
    id: "preset_price_up",
    name: "프리셋: 단가 인상 (-10%/+10%)",
    category: "profitability",
    unit: "ratio",
    formula: "물량 −10% + 단가 +10% (원가 불변)",
    beginner:
      "📈 가격을 올리고 일부 고객 이탈을 감수하는 마진 우선 시나리오.\n" +
      "원가가 올랐을 때 수익성 방어 전략.",
    intermediate:
      "10% 단가 인상에 10% 물량 감소(가격탄력성 -1)를 가정. 매출은 소폭 감소(−1%)지만 마진은 개선.\n" +
      "독점·차별화된 품목이거나 원가 상승기에 적합.",
    expert:
      "volumeIncreasePct=-10, priceChangePct=+10. 매출 변동 ≈ -1%(=0.9×1.1−1). 실제 가격탄력성은 품목별로 크게 다르므로 별도 수요 조사 권장. 필요 단가 인상률(price_increase_required)과 함께 판단.",
    relatedIds: ["price_slider_4a", "price_increase_required", "preset_aggressive"],
    source: ["computed"],
  },

  // ─────────────────────────────────────────────────────────────
  // Step 4a 워터폴 5단계
  // ─────────────────────────────────────────────────────────────
  base_operating_profit_4a: {
    id: "base_operating_profit_4a",
    name: "기존 영업이익 (Step 4a 기준선)",
    category: "profitability",
    unit: "currency",
    formula: "baseOperatingProfit = Σ매출액 − Σ변동비 − 총고정비",
    beginner:
      "📌 시뮬레이션을 시작하기 전의 영업이익. 모든 시나리오의 출발점.\n" +
      "지금 이대로 아무것도 안 바꿨을 때 버는 돈.",
    intermediate:
      "전체 대상(조직/기간/거래처/품목 필터 적용 후)의 현재 영업이익 스냅샷입니다.\n" +
      "음수면 원래 적자 사업 → 단가 인하 시나리오는 특히 위험합니다.",
    expert:
      "출처: 100 보고서 매출·매출원가(변동비 근사) + extractManufacturingFixedCost(고정비). 가정: 100 보고서의 '매출원가'를 전부 변동비로 간주(간단화). 실제 일부는 고정비일 수 있으므로 200 보고서 기반 Step 4b와 차이 발생.",
    relatedIds: ["final_operating_profit_4a", "price_effect_4a", "cost_effect_4a", "volume_effect_4a"],
    source: ["100", "500"],
  },

  price_effect_4a: {
    id: "price_effect_4a",
    name: "가격 효과 (Step 4a 워터폴 ②)",
    category: "profitability",
    unit: "currency",
    formula: "priceEffect = Σ(기존수량 × (신규단가 − 기존단가))",
    beginner:
      "💱 가격만 바꿨을 때 이익이 얼마나 변하나.\n" +
      "수량은 그대로, 가격만 움직였을 때의 효과.",
    intermediate:
      "단가 변동이 전체 영업이익에 미치는 영향만 분리한 값.\n" +
      "대상 품목의 기존 판매 수량에 (신규단가 − 기존단가)를 곱해 계산합니다.\n" +
      "양수(+) = 단가 인상 이익, 음수(−) = 단가 인하 손실.",
    expert:
      "항등식: netOffsetEffect = priceEffect + costEffect + volumeEffect. 대상 품목만 반영되며, 비대상 품목은 기준선 그대로(0 기여). 단가·물량 상관관계를 고려하지 않은 순수 가격 효과라 실제 시장 반응과는 다를 수 있음.",
    benchmark: "총 이익의 10% 이상 감소면 재협상 필요, 30% 이상이면 거래 단절 검토",
    commonMistakes: [
      "가격 효과만 보고 단가 인하를 거부하면, 동반되는 물량 증가 효과(volume_effect_4a)를 놓침.",
      "대상 거래처 미선택 시 '대상 품목 전체 거래처'에 적용되는 점 유의.",
    ],
    contextBranches: [
      { when: (v) => v < 0, message: "현재 가격 인하 모드 — 물량 효과가 이를 상쇄해야 전체 이익이 유지됩니다.", tone: "warning" },
      { when: (v) => v > 0, message: "가격 인상 모드 — 수요 이탈 가능성을 물량 효과와 함께 확인하세요.", tone: "info" },
    ],
    relatedIds: ["volume_effect_4a", "cost_effect_4a", "final_operating_profit_4a"],
    source: ["100"],
  },

  cost_effect_4a: {
    id: "cost_effect_4a",
    name: "원가 효과 (Step 4a 워터폴 ③)",
    category: "profitability",
    unit: "currency",
    formula: "costEffect = Σ(기존수량 × (기존변동비 − 조정변동비))",
    beginner:
      "🧾 원재료·인건비·외주비가 바뀌면 이익이 얼마나 변하나.\n" +
      "원가가 내려가면 +, 오르면 −.",
    intermediate:
      "변동비 변동이 영업이익에 미치는 영향만 분리한 값.\n" +
      "원가 슬라이더 3개(원자재/노무/외주)가 0%면 costEffect = 0.\n" +
      "부호 주의: 음수 = 원가 상승 = 이익 감소, 양수 = 원가 절감 = 이익 증가.",
    expert:
      "품목별 3-버킷 비중(vcCostRatioMap)으로 가중. 대상 품목만 반영. 고정비 변동은 별도(Step 4a는 고정비 총액 불변 가정). 200 보고서 없으면 품목 원가 구조를 추정할 수 없어 Step 4b(풀 덤 효과)와의 괴리 발생.",
    commonMistakes: [
      "슬라이더 +10%가 '원가 10% 증가'가 아니라 '해당 버킷 내 10% 증가'. 전체 변동비는 버킷 비중에 따라 다름.",
      "원가 슬라이더는 기본 접힘 상태(`<details>`)이므로 사용자가 펼치지 않으면 항상 0.",
    ],
    contextBranches: [
      { when: (v) => v < 0, message: "원가 상승 중 — 단가 인상 또는 원가 절감이 필요합니다.", tone: "danger" },
      { when: (v) => v > 0, message: "원가 절감 효과 발생 — 지속 가능성(구매 조건 등)을 확인하세요.", tone: "success" },
    ],
    relatedIds: ["cost_slider_4a", "price_increase_required", "final_operating_profit_4a"],
    source: ["500", "501"],
  },

  volume_effect_4a: {
    id: "volume_effect_4a",
    name: "물량 효과 (Step 4a 워터폴 ④)",
    category: "profitability",
    unit: "currency",
    formula: "volumeEffect = 추가수량 × (신규단가 − 조정변동비)",
    beginner:
      "📈 더 판 만큼(또는 덜 판 만큼) 이익이 얼마나 바뀌나.\n" +
      "한 개 더 팔 때 내 주머니에 얼마가 남는지.",
    intermediate:
      "추가/감소한 수량에 '신규 단위 공헌이익'을 곱한 값.\n" +
      "단위 공헌이익 = 신규단가 − 조정변동비.\n" +
      "원가가 판가보다 높으면 물량 증가가 오히려 이익 감소로 작용하니 주의.",
    expert:
      "항등식의 마지막 항. 고정비 불변 가정이 핵심 — 실제로는 캐파 한계 초과 시 고정비도 증가할 수 있음. 수량 증가가 매출 증가로 이어지지만, 마진율이 낮으면 영업이익 개선 폭은 제한적.",
    commonMistakes: [
      "물량 증가 = 이익 증가라고 단정 금지. 단위 공헌이익이 음수면 많이 팔수록 손해.",
      "절대 수량 모드에서 다거래처 중복 방지 로직이 적용되므로 UI 상 표시 수량과 실제 반영 수량이 다를 수 있음(수량 비중 배분).",
    ],
    relatedIds: ["volume_slider_4a", "final_operating_profit_4a", "break_even_quantity"],
    source: ["100"],
  },

  final_operating_profit_4a: {
    id: "final_operating_profit_4a",
    name: "최종 영업이익 (Step 4a 워터폴 ⑤)",
    category: "profitability",
    unit: "currency",
    formula: "newOperatingProfit = baseOperatingProfit + priceEffect + costEffect + volumeEffect",
    beginner:
      "🏁 시나리오 적용 후 실제 영업이익. 이게 기존보다 크면 '가설 성립'.\n" +
      "슬라이더 조작 끝의 결과 한 줄.",
    intermediate:
      "Step 4a의 핵심 출력값. 기존 영업이익에 3-way 분해 효과를 더한 합입니다.\n" +
      "기존보다 크면 시나리오 채택 고려, 작으면 재설계 필요.",
    expert:
      "100 보고서 기반 총액 관점(매출·원가 모두 실제 집계). 200 보고서 기반 Step 4b와는 고정비 배분 방식이 달라 정확한 숫자 합산은 불가(방향성 비교만). 저가수주 판단기의 'singleItemEffect' = (newOperatingProfit − baseOperatingProfit).",
    relatedIds: ["base_operating_profit_4a", "price_effect_4a", "cost_effect_4a", "volume_effect_4a"],
    source: ["100", "500"],
  },

  // ─────────────────────────────────────────────────────────────
  // PricingSim 핵심 지표 4개
  // ─────────────────────────────────────────────────────────────
  price_increase_required: {
    id: "price_increase_required",
    name: "필요 단가 인상률",
    category: "profitability",
    unit: "percent",
    formula:
      "① 신규원가 = 기존원가 + Σ(버킷원가 × 상승률)\n" +
      "② 필요매출 = 신규원가 ÷ (1 − 현재마진율)\n" +
      "③ 인상률 = (필요매출 − 현재매출) ÷ 현재매출 × 100\n" +
      "④ 가중평균 = Σ(품목별 인상률 × 매출비중)",
    beginner:
      "🧮 원가가 올랐을 때 지금 마진을 지키려면 판매가를 몇 % 올려야 하는지.\n" +
      "커피 원두값이 10% 오르면 한 잔 가격을 얼마 올려야 할까?",
    intermediate:
      "현재 마진율을 유지하는 '최소' 인상률입니다.\n" +
      "원가 버킷별 상승률(재료비/인건비/외주 등)을 조합해 품목별로 계산하고, 매출 가중평균으로 전사 수치를 냅니다.\n" +
      "5% 이하면 흡수 가능, 10% 초과면 구조적 위험.",
    expert:
      "출처: 501 보고서(품목별 매출원가 상세)의 7-버킷 원가 구조. 가정: (1) 수요 가격탄력성 = 0(볼륨 불변), (2) 버킷별 상승률 품목 내 선형 적용, (3) 고정비 총액 불변. 현재 마진율이 음수인 품목은 분모가 음수가 되어 인상률이 폭발적으로 커지므로 별도 정책 필요.",
    benchmark: "≤5%: 시장 흡수 가능 | 5~10%: 거래처 개별 협상 | >10%: 원가 구조 재설계/제품 단종 검토",
    commonMistakes: [
      "인상률 5%는 '매출 5% 증가'가 아니라 '단가 5% 상승'. 볼륨 영향은 별도 계산.",
      "원가 인상분을 그대로 판가에 더하면 안 됨(마진율 희석). 반드시 ÷(1−마진율).",
      "미인상 시 이익 감소액(profit_loss_if_unchanged)과 혼동 금지 — 한쪽은 %, 한쪽은 금액.",
    ],
    contextBranches: [
      { when: (v) => v > 10, message: "현재 수치 >10%. 단가 협상만으로 어려움. 원가 절감 병행 필수.", tone: "danger" },
      { when: (v) => v > 5 && v <= 10, message: "거래처 개별 협상 구간. 거래처별 영향 탭 참조.", tone: "warning" },
      { when: (v) => v <= 5 && v > 0, message: "일반적 인상 범위. 단계적 적용 가능.", tone: "success" },
    ],
    relatedIds: ["profit_loss_if_unchanged", "high_impact_items", "material_share"],
    source: ["501"],
    sourceNote: "501 보고서 7-버킷(재료비/상품매입비/인건비/설비비/외주비/물류비/일반경비)",
  },

  profit_loss_if_unchanged: {
    id: "profit_loss_if_unchanged",
    name: "미인상 시 이익 감소액",
    category: "profitability",
    unit: "currency",
    formula: "이익감소액 = −Σ(품목별 원가 증가액)\n= −Σ(기존원가 × 슬라이더 가중 상승률 × 수량)",
    beginner:
      "💸 가격을 그대로 두면 원가 상승분이 그대로 이익에서 빠져나가는 금액.\n" +
      "아무것도 안 하면 잃을 돈.",
    intermediate:
      "단가를 인상하지 않고 원가 상승만 흡수할 경우 줄어드는 영업이익의 '금액'입니다(필요 인상률은 %).\n" +
      "현재 영업이익 대비 이 수치가 30% 이상이면 즉각 가격 대응이 시급합니다.",
    expert:
      "Sign convention: 음수가 기본(이익 감소). 501 보고서의 품목별 원가 금액 × 슬라이더 상승률을 합산. 필요 단가 인상률과 같은 입력에서 나오지만 해석 단위가 다름(% vs 원) — 보고 시 둘 다 제시 권장.",
    benchmark: "영업이익의 <10%: 흡수 가능 | 10~30%: 협상 준비 | >30%: 긴급 대응",
    commonMistakes: [
      "금액 음수를 보고 '원가 절감'이라 오해 금지. 현 UI는 '미인상 시 손실' 맥락이라 음수 = 이익 감소.",
      "고정비 증가(인건비 호봉 인상 등)는 품목별 변동비 버킷에 포함되지 않으므로 별도 추정 필요.",
    ],
    relatedIds: ["price_increase_required", "high_impact_items"],
    source: ["501"],
  },

  high_impact_items: {
    id: "high_impact_items",
    name: "고위험 품목 수",
    category: "profitability",
    unit: "number",
    formula: "count(품목별 필요인상률 > 10%)",
    beginner:
      "⚠️ 가격을 10% 넘게 올려야 겨우 본전인 '위험 품목' 개수.\n" +
      "이 품목들은 거래처가 인상에 저항할 가능성 높음.",
    intermediate:
      "필요 단가 인상률이 10%를 초과하는 품목의 수.\n" +
      "전체 품목 수의 20% 이상이면 원가 구조 자체를 재검토할 시점입니다.",
    expert:
      "10% 임계는 일반 유통·제조업 가격 협상의 경험적 저항선. 품목별 탄력성이 다르므로 절대 기준은 아님. 이 카운트는 '얼마나 구조적 위험이 누적됐는지' 지표로 유효.",
    benchmark: "<전체 5%: 건강 | 5~20%: 주의 | >20%: 원가 구조 재설계 시급",
    commonMistakes: [
      "'고위험'이라는 이름 때문에 당장 손해 보는 품목으로 오해 금지. 현재 마진율이 건실해도 원가 상승 시나리오에서 인상 폭이 큰 품목을 가리킴.",
    ],
    relatedIds: ["price_increase_required", "profit_loss_if_unchanged"],
    source: ["501", "computed"],
  },

  material_share: {
    id: "material_share",
    name: "재료비 비중",
    category: "profitability",
    unit: "percent",
    formula: "(재료비 + 부재료비 + 상품매입비) ÷ 총 매출원가 × 100",
    beginner:
      "🥬 전체 원가 중 재료값이 차지하는 비율.\n" +
      "이게 높으면 원자재 값 오를 때 직격탄.",
    intermediate:
      "매출원가 중 재료성 비용의 비중. 높을수록 원자재 시세 변동에 민감합니다.\n" +
      "50% 이상이면 장기 계약·대체재·구매 헤지 전략이 필수, 30% 미만이면 가공·인건비 중심 사업 구조.",
    expert:
      "501 보고서 기준. 가공업(고부가)은 낮고 단순 유통은 높음. 버킷 합산 시 '상품매입비'를 재료비 성격으로 포함할지 여부는 업종 정의에 따라 다름 — 현 구현은 포함.",
    benchmark: "<30%: 가공비 중심 | 30~50%: 균형 | >50%: 원자재 노출 큼",
    relatedIds: ["price_increase_required", "high_impact_items"],
    source: ["501"],
  },
} as const satisfies Record<string, MetricEntry>;
