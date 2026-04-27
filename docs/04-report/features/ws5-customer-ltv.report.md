# WS5 Customer LTV — 완료 보고서

**Workstream**: v2 Phase B · WS5 (Phase B 완성 마지막 WS)
**완료일**: 2026-04-27
**Match Rate**: **100%** (12/12)

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 값 |
|---|---|
| Feature | ws5-customer-ltv |
| PDCA 단계 | Plan → Do → Check → Report |
| 변경 파일 | 2 신규(customerLTV.ts + test) + 1 확장(OffsetEffectTab) + 1 Plan |
| LOC | +345 (Plan 추정 +370, -7%) |

### 1.2 결과 요약

| 지표 | 값 |
|---|---|
| Match Rate | **100%** (12/12) |
| 신규 테스트 | **15개 전원 통과** (312→327) |
| Build | ✅ profitability 번들 443kB (변화 없음) |
| McKinsey A축 | 30% → **80%** (+50%p) |
| McKinsey 전체 | ~54% → **~62%** |

### 1.3 Value Delivered (4-perspective, 메트릭 포함)

| 관점 | 변경 전 (Phase A+WS4) | 변경 후 (WS5 완료) | 측정 효과 |
|---|---|---|---|
| **Problem** | "현재 거래의 이익 증감"만 평가. 1,584개 거래처 LTV 데이터, `clv.ts`/`churnPrediction.ts` 모듈 미연동. 거래처 평생 가치 의사결정 누락 | 저가수주 수용/거절 시 LTV 영향 양방향 표시. 1,584개 거래처 즉시 join | 의사결정 차원 4개 → **5개** (단독/풀/포트폴리오/거래처LTV/MC) |
| **Solution** | 단기 손익 단일 차원 | 신규 `customerLTV.ts` (160 LOC) — `calcClv()`+`predictChurn()` 결과 키 join, churn 감소율 50% 클램핑, 신뢰도 3단계 전파 | 기존 모듈 80% 재사용 (clv 231 + churn 180 LOC 활용) |
| **Function UX Effect** | 거래처 가치는 별도 페이지(/sales)에서만 확인 가능 | 판단기 카드 내에 보라/마젠타 그라데이션 4번째 카드 자동 표시. 거래처 LTV + 이탈위험 + 수용/거절 양방향 영향 즉시 비교 | 페이지 이동 0회로 평생 가치 검토 |
| **Core Value** | McKinsey A축 30%로 가장 약한 축 중 하나 | A축 30→**80%** (+50%p, 단일 최대 도약). Phase B 완료로 McKinsey ~62% | A·B 두 축 모두 60%+ 진입. McKinsey 75% 진입까지 Phase C만 남음 |

## 2. 구현 핵심

### 신규 자산
- [`customerLTV.ts`](src/lib/analysis/customerLTV.ts) — 160 LOC
  - `calcCustomerLTVImpact()` — 메인 함수, 수용/거절 mirror 영향
  - `buildLTVMap()` / `buildChurnMap()` — useMemo용 키-값 매핑
  - `ltvConfidenceLabel()` / `riskLevelLabel()` — UI 한국어 헬퍼
  - `MAX_CHURN_REDUCTION_PCT = 0.50` 상수 — 인하 폭 50% 클램핑
- [`customerLTV.test.ts`](src/lib/analysis/customerLTV.test.ts) — 15 테스트 (mirror image, 클램핑, 신뢰도 전파, Map 빌더 모두 커버)

### 확장 자산
- [`OffsetEffectTab.tsx`](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx)
  - dataStore에서 `salesList` + `orgProfit` 연결 (이전 직접 사용 X)
  - `ltvMap`, `churnMap`, `ltvImpact` 3개 useMemo
  - 판단기 카드 안에 보라/마젠타 4번째 카드 + 3-그리드 통계 + 안내 문구
  - 가드: `priceChangePct < 0` (저가수주 시나리오)일 때만 표시

### 핵심 설계 결정

1. **수용/거절 mirror image** — 절댓값 동일·부호 반대. 의사결정자에게 "잃는 가치 = 얻는 가치"의 대칭성 직관 전달
2. **churn 감소율 50% 클램핑** — 인하 폭 100%여도 churn 감소는 최대 50%로 제한 (현실적 상한)
3. **3단계 신뢰도 전파** — clv.confidence + churn 데이터 가용성 결합. insufficient/low/normal로 UX 투명화
4. **`priceChangePct < 0` 가드** — 인상 시 카드 미노출 (저가수주 가설 자체 무관)
5. **-0 회피** — `rejectImpact === 0 ? 0 : -acceptImpact` 패턴으로 `Object.is` 비교 안전성

## 3. 미구현 0건

Plan v2.1 명세 모든 항목 구현. Match Rate 100%.

## 4. McKinsey 달성도 변화

| 축 | WS4 후 | WS5 후 |
|---|---|---|
| **A. 전략적 거래처 가치** | 30% | **80%** ✅ |
| B. 동적 가격 탄력성 | 60% | 60% |
| C. 경쟁사 반응 | 15% | 15% (Phase C) |
| D. 확률론 (WS1) | 75% | 75% |
| E. 포트폴리오 (WS3) | 50% | 50% |
| F. 공학적 제약 (WS2) | 48% | 48% |
| **전체 평균** | ~54% | **~62%** |

## 5. Lessons Learned

### Keep
- 기존 모듈 재활용 80% (clv + churn) — 신규 코드 최소화로 유지보수 부담 최소
- mirror image 모델로 의사결정 프레임 단순화 (수용 vs 거절 직접 비교)
- 신뢰도 전파 패턴 (insufficient/low/normal)으로 데이터 한계 투명 노출

### Problem → Try
- dataStore 필드명 실측 안 하고 `s.sales` 추정 → 빌드 실패 후 `s.salesList`로 교정 (Phase B에서 두 번째 동일 패턴)
- 다음 사이클부터 **모듈 import 시 dataStore.ts grep 선행** 표준화
- `-0 === 0`은 true지만 `Object.is(-0, 0)`은 false — vitest `.toBe()` 사용 시 주의 (테스트 한 번 실패 후 발견)

### Try Next
- Phase C 진입 시 WS6(경쟁사 반응)이 PED 재사용 + WS5 churn 패턴 재사용 가능
- LTV 5년 단순 합산 → NPV 할인율 적용은 Phase C 고급 옵션

## 6. Next Steps

**Phase B 완성** → Phase C 착수 또는 종합 QA·데모로 분기.

- 권장: WS6 경쟁사 반응 게임이론 (+300 LOC, 2주). C축 15→55% 예상
- 또는 Phase A+B 통합 경영진 데모 + 사용자 검증 후 Phase C

## 7. 코드 레퍼런스

| 위치 | 역할 |
|---|---|
| [customerLTV.ts:74-119](src/lib/analysis/customerLTV.ts#L74-L119) | `calcCustomerLTVImpact` 메인 함수 |
| [customerLTV.ts:127-130](src/lib/analysis/customerLTV.ts#L127-L130) | `buildLTVMap` |
| [customerLTV.ts:135-138](src/lib/analysis/customerLTV.ts#L135-L138) | `buildChurnMap` |
| [OffsetEffectTab.tsx:809-826](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L809-L826) | dataStore + LTV/Churn useMemo |
| [OffsetEffectTab.tsx:1080-1130](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx) | 4번째 카드 JSX |
