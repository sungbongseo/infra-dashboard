# WS5 — 거래처 LTV 효과 Plan

**Workstream**: v2 Phase B · WS5 (Phase B 완성 목표)
**작성일**: 2026-04-27
**목표 Match Rate**: 95%+
**참조**: `~/.claude/plans/reactive-leaping-backus.md` v2.1

## Executive Summary

| 축 | 내용 |
|---|---|
| **Problem** | 저가수주 판단기는 "현재 거래의 이익 증감"만 평가. "이 거래처를 놓치면 향후 N년 손실 = LTV 가치"가 의사결정에서 누락. 1,584개 거래처 데이터, `clv.ts`/`churnPrediction.ts` 모듈이 이미 존재하는데 박리다매 판정과 미연동. McKinsey "A. 전략적 거래처 가치" 축 30%로 약점. |
| **Solution** | `customerLTV.ts` 신규: 저가수주 수용/거절 시 LTV 영향 계산. 수용 시 churn 확률 감소 → LTV 보전, 거절 시 이탈 위험 → LTV 손실. 기존 `calcClv()` + `predictChurn()` 결과를 거래처 키로 join하여 즉시 활용. |
| **Function UX Effect** | 판단기 3카드(단독/풀/포트폴리오) 옆 4번째 카드 **"💎 거래처 LTV 효과"** 추가. 저가수주 수용 시 +LTV 보전, 거절 시 −LTV 손실 양방향 표시. 신뢰도(insufficient/low/normal) 배지로 데이터 한계 투명화. |
| **Core Value** | McKinsey A축 30→**80%** (+50%p). 단순 단기 이익 → "이 거래처를 평생 함께 갈 가치 vs 단기 손실" 의사결정 프레임 도입. Phase B 완료로 McKinsey 47.3→약 60%, Phase A→B 종합 +40%p 달성. |

## Context

**왜 지금?**
- WS4 PED 완료 → Phase B 50% 진행. WS5 LTV로 Phase B 완성하면 McKinsey 평균 ~60% 달성
- 1,584개 거래처 + 14개월 매출 이력 = LTV 통계적 신뢰도 충분 (v2.1 검증)
- `clv.ts` (231 LOC) + `churnPrediction.ts` (180 LOC) 이미 구현 완료, 미사용 자산
- 사용자 직전 질문 맥락: "거래처 관계" 정량화에 대한 함의가 더 큰 방향 = LTV가 답

**의도한 결과**:
판단기에서 "이 저가수주 거절하면 거래처 이탈 가능성과 평생 가치 손실은 얼마인가?"가 즉답되는 상태.

## 변경 파일

| 파일 | 변경 성격 | LOC |
|---|---|---|
| `src/lib/analysis/customerLTV.ts` | **신규** — LTV 영향 계산 + 거래처 키 join | +160 |
| `src/lib/analysis/customerLTV.test.ts` | **신규** — 18 테스트 | +130 |
| `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx` | 판단기에 4번째 카드 + useMemo | +60 |
| (옵션) `glossary-profitability.ts` | `customer_ltv_impact` 엔트리 추가 | +20 |

**총 추정**: +370 LOC (Plan v2.1 +200 추정 +85% — Phase A 평균 +17%, WS4 +1%보다 큼. 이유: clv·churn 두 모듈 join + 신뢰도 전파 + UI 카드 4번째 위치 통합)

## 재사용 자산 (Plan v2.1 명시 자산 100% 활용)

| 자산 | 경로 | WS5 활용 |
|---|---|---|
| `calcClv` | `clv.ts:130` | 거래처별 CLV 일괄 산출 → Map<customer, clv> |
| `predictChurn` | `churnPrediction.ts:40` | 거래처별 ChurnRiskCustomer → Map<customer, score> |
| `calcCustomerPortfolioOffset` | `offsetEffect.ts:1442` | 기존 포트폴리오 카드 옆에 LTV 카드 배치 |
| `useDataStore` (sales/orgProfit) | `stores/dataStore.ts` | 두 데이터 모두 이미 OffsetEffectTab 외부에서 접근 가능 |
| `MetricInfo` glossary | `lib/metrics/` | 4번째 카드 툴팁 (초/중/전문가 tier) |

## 핵심 알고리즘

### 1. LTV 영향 모델 (직관적)

```
저가수주 수용 시:
  거래처 만족도 ↑ → churn 확률 감소 → LTV 보전
  보전 효과 = baseLTV × max(0, -priceChangePct/100) × (currentChurnRisk / 100)

저가수주 거절 시:
  거래처 불만 → churn 확률 증가 → LTV 손실
  손실 효과 = baseLTV × max(0, -priceChangePct/100) × (currentChurnRisk / 100)

→ 두 효과는 절댓값이 같지만 부호가 반대 (의사결정 mirror image)
```

### 2. 신뢰도 전파 (3단계)

| 신뢰도 | 조건 | UX 표현 |
|---|---|---|
| `normal` | clv.confidence=normal & churn 데이터 ≥6M | 정상 표시 |
| `low` | clv.confidence=low 또는 churn ≥3M | "추정치" 배지 |
| `insufficient` | 데이터 부족 | LTV 카드 회색 + "데이터 부족" |

### 3. UI 카드 (4번째)

```
💎 거래처 LTV 효과
├─ 거래처 LTV: 12.3억원
├─ 이탈 위험: 65/100 (medium)
└─ 저가수주 영향:
     수용 → +LTV 보전 +800만원
     거절 → -LTV 손실 -800만원
```

## Verification

### 단위 테스트 (18개 예상)
1. baseLTV 0인 거래처 → ltvImpact 0
2. churn 데이터 없는 거래처 → insufficient 신뢰도
3. priceChangePct > 0 (인상) → ltvImpact 0 (수용 효과 없음)
4. priceChangePct = -10% × churn 80 → 8% 보전
5. priceChangePct < -50% 극단 → max 50% 클램핑
6. customer 키 매칭 (sales/clv/churn 3개 모두)
7. 신뢰도 전파 (normal/low/insufficient 각 케이스)
8. 데이터 부재 시 graceful fallback
9. 등 …

### 빌드/회귀
- `usePED` 패턴처럼 옵셔널 props로 회귀 방어
- 기존 `calcCustomerPortfolioOffset` 호출 무변경

## 성공 판정 기준

- [ ] 1,584개 거래처 중 70%+ (약 1,100개)가 normal/low 신뢰도 LTV 산출
- [ ] 18 테스트 전원 통과
- [ ] 4번째 카드 표시 + 양방향(수용/거절) 효과 시각화
- [ ] McKinsey A축 self-audit 80% 달성

## 범위 외

- **장기 NPV 할인** — 단순 5년 합산. 할인율은 Phase C 고급 옵션
- **거래처 세그먼트별 차등 PED** — Phase C 카니발라이제이션과 통합
- **계약 갱신 주기 입력 UI** — 외부 연동 필요, Phase C
