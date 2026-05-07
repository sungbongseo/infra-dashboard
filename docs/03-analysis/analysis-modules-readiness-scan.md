# Analysis Modules Readiness Scan — 8 원칙 적용 사전 자료

> **목적**: 운영 신호 발생 시 즉시 `/pdca plan {module}` 시작 가능하도록 사전 보존.
> **출처**: `docs/archive/2026-05/product-portfolio-matrix/_EVOLUTION.md` 8 원칙
> **작성**: 2026-05-07 (선제적, YAGNI 준수 — 트리거 없이 구현 ❌)

## 사용 시나리오

운영 트리거 발생 시:
1. 사용자 의문 (예: "이 마진율 왜 마이너스?", "이 사분면 분류 이상함")
2. anomaly 발견 (silent skip된 데이터 노출, 왜곡된 평균)
3. 분석 신뢰성 검토 요청

→ 본 문서 reference + `_EVOLUTION.md` 8 원칙 체크리스트로 `/pdca plan {module}` 작성

## 8 원칙 체크리스트 (plan 작성 시 사용)

### Defensive Analytics (algorithm)
- [ ] **1. Anomaly exclusion**: 비즈니스 의미 없는 데이터(음수 원가/0매출/반품) 사전 제외 + counter 노출
- [ ] **2. Math vs business**: 수학상 정확하나 비현실적 결과(마진 >100% 등) 명시적 flag/제외
- [ ] **3. Explicit visibility**: 제외 anomaly를 actionable count로 노출 (silent skip ❌)
- [ ] **4. Incremental tests**: edge case별 1 test 단위로 micro-iteration 안전성 확보

### Progressive Disclosure (UI)
- [ ] **5. 3-layer pedagogy**: MetricInfo + glossary 엔트리 (beginner/intermediate/expert)
- [ ] **6. Library 한계 우회**: Recharts axis/ReferenceLine을 chip row + MetricInfo로 보강
- [ ] **7. contextBranches**: 임계 트리거 시 자동 actionable warning ("≥10건 시 점검")
- [ ] **8. 시각적 노이즈 최소화**: cell-level 반복 ⓘ ❌, 컬럼 헤더 1번만

---

## 3 모듈 readiness (2026-05-07 시점)

| 모듈 | Defensive 1-4 | Progressive 5-8 | Tests | Glossary | 우선순위 |
|---|:---:|:---:|:---:|:---:|---|
| offsetEffect | 3/4 | 2/4 | 65 tests | 1 entry (`unit_contribution_margin`) | **High** (가장 성숙, math 검증 ✗) |
| profitRiskMatrix | 1/4 | 1/4 | **0** | **0** | **High** (전면 미흡) |
| customerItemMargin | 1/4 | **0/4** | **0** | **0** | **High** (silent skip 위험) |

---

## offsetEffect (1953 LOC, OffsetEffectTab 1675+ LOC)

### 위치
- 알고리즘: `src/lib/analysis/offsetEffect.ts`
- UI: `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx`
- 테스트: `src/lib/analysis/offsetEffect.test.ts` (65 tests)

### 강점 (이미 적용된 원칙)
- ✓ 원칙 1·3: `isLowPriceOrder`, `returnItemCount`, `bleedingCount`, `healthyCount` counter 노출
- ✓ 원칙 4: 65 tests로 단위 검증
- ✓ 원칙 5 (부분): `<MetricInfo>` 14 instances (slider, preset 등)

### Top gap (트리거 발생 시 즉시 적용)
1. **원칙 2 (math vs business)**: 마진율 >100% 케이스 검증 부재 — BCG v2와 동일 anomaly 가능성
   - 적용: `cm_ratio` 산출 시 `> 100%` 또는 `< -100%` 케이스 자동 제외 + `excludedAnomalousMargin` counter
2. **원칙 7 (contextBranches)**: 동적 threshold warning 부재
   - 적용: `unit_contribution_margin` glossary entry에 contextBranches 추가 — "cm_ratio <10% 시 volume 전략 위험"
3. **원칙 6 (Recharts 보강)**: CVP 차트 임계선·축 라벨에 chip row 패턴 미적용
   - 적용: BCG v3와 동일 chip row 컴포넌트 재사용

### 예상 LOC: ~150
- 알고리즘: ~30 (anomaly counter)
- glossary: ~50 (5 contextBranches 추가)
- UI: ~70 (chip row 4 ⓘ × 차트 N개)

---

## profitRiskMatrix (253 LOC, RiskTab.tsx)

### 위치
- 알고리즘: `src/lib/analysis/profitRiskMatrix.ts`
- UI: `src/app/dashboard/profitability/tabs/RiskTab.tsx`
- 테스트: **부재**

### 강점
- 부분적 ✓ 원칙 1: `매출액.실적 !== 0` 필터 (단, 음수 미수금 통과)
- 부분적 ✓ 원칙 6: Recharts `ReferenceLine` 사용 (단, hover 불가 → MetricInfo 보강 필요)

### Top gap
1. **원칙 1·3 (anomaly exclusion + visibility)**: 음수 미수금/적자 마진 그대로 risk score 계산
   - 적용: `excludedNegativeReceivables`, `excludedNegativeMargin` counter 추가
2. **원칙 4 (tests)**: 0 tests — 사분면 분류 edge case 전혀 미검증
   - 적용: 8-10 unit tests (fuzzyGet 매칭, 임계선 경계, 음수 케이스)
3. **원칙 5 (MetricInfo)**: `<MetricInfo>` 0 instance
   - 적용: 4 glossary entries (`profit_risk_dog/star/cow/question`) + RiskTab 통합 5+ 위치

### 예상 LOC: ~250
- 알고리즘: ~50 (anomaly counter + edge case 가드)
- 테스트: ~80 (8-10 tests)
- glossary: ~60 (5 entries)
- UI: ~60 (MetricInfo 5+ 위치 + ReferenceLine chip row)

---

## customerItemMargin (214 LOC, MarginTab.tsx)

### 위치
- 알고리즘: `src/lib/analysis/customerItemMargin.ts`
- UI: `src/app/dashboard/sales/tabs/MarginTab.tsx`
- 테스트: **부재**

### 강점
- 거의 없음 — 가장 vulnerable 모듈

### Top gap
1. **원칙 3 (silent skip ❌)**: `qty <= 0` 행 silent skip (line 89, 130) — counter 부재
   - 적용: `excludedRows: { negativeQty, zeroCost, negativeMargin }` 카운터 노출
2. **원칙 1·2 (anomaly + math 검증)**: 음수 마진 unchecked, `unitCost > unitPrice` 의도성 미검증
   - 적용: 마진 < -50% 자동 flag (반품/덤핑 의도성 회계팀 확인 필요)
3. **원칙 5 (MetricInfo)**: `<MetricInfo>` 0 instance, `getMarginLabel()` 하드코딩 (30%+/15-30%/...) glossary 미바인딩
   - 적용: 5 glossary entries (margin_breakpoint × 5 구간) + MetricInfo 통합

### 예상 LOC: ~200
- 알고리즘: ~40 (excludedRows 카운터)
- 테스트: ~70 (8 tests)
- glossary: ~50 (5 entries)
- UI: ~40 (MetricInfo 5+ 위치)

---

## 전체 예상 (3 모듈 통합 시)

| | LOC | Tests | Glossary entries |
|---|---|---|---|
| offsetEffect | ~150 | +0 (이미 65) | +4 (1 → 5) |
| profitRiskMatrix | ~250 | +10 (0 → 10) | +5 (0 → 5) |
| customerItemMargin | ~200 | +8 (0 → 8) | +5 (0 → 5) |
| **Total** | **~600** | **+18** | **+14** |

→ BCG `_EVOLUTION.md` 1개 폴더 reference로 약 **12 micro-iteration cycles 절감 예상** (3 모듈 × v2 4-cycle 패턴).

---

## 다음 트리거 발생 시 절차

1. 트리거 식별 (사용자 의문, anomaly 발견 등)
2. 본 문서에서 해당 모듈 섹션 reference
3. `/pdca plan {module-name}` 시작 — Plan 문서에 8 원칙 체크리스트 포함
4. plan 승인 후 Phase A (defensive) → Phase B (progressive) 순차 적용
5. 완료 시 `_EVOLUTION.md`에 "{module}-v1" entry 추가 → 누적 자산화

---

> **Status**: 대기 — 운영 트리거 발생 시 활용
> **선제 보존 이유**: 컨텍스트 손실 방지, 트리거 발생 시 즉시 plan 가능
> **YAGNI 준수**: 사전 구현 ❌, 분석 자료만 보존
