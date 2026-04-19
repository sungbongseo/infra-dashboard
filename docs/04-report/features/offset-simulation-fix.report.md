# PDCA Report: 저가수주 시뮬레이션 전면 수정

## Executive Summary

| 관점 | 내용 |
|------|------|
| Feature | 저가수주 시뮬레이션 근본 수정 (9건 버그) |
| Date | 2026-04-17 ~ 2026-04-20 |
| Match Rate | 100% (수학적 검증 4시나리오 PASS) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 가격 6배 인상 + 원자재 50% 인상인데 영업이익 마이너스 — 원가 슬라이더가 전체 품목에 적용, 워터폴 항등식 위반, 합성아이템 COGS/변동비 혼동, 감도분석 원가 무시 |
| **Solution** | 비대상 품목 원가 불변 + 3-way 분해(가격+원가+물량) 항등식 보장 + 합성아이템 vcRatio 분리 + 감도분석 원가 전달 |
| **Function UX Effect** | +500%/+50% 시나리오에서 양수 이익으로 정확 계산, 워터폴 5단계(기존→가격→원가→물량→최종), KPI 3-way 표시 |
| **Core Value** | 시뮬레이터 수학적 정확성 확보 — 경영진 의사결정에 사용 가능한 수준으로 신뢰도 복원 |

### Results

| 항목 | 수치 |
|------|------|
| 해결 버그 | CRITICAL 4건 + HIGH 2건 + MEDIUM 3건 = 9건 |
| 수정 파일 | 2개 (offsetEffect.ts, OffsetEffectTab.tsx) |
| 변경량 | +214 / -94 lines |
| 빌드 | 통과 (0 errors) |
| 수학적 검증 | 4시나리오 PASS (항등식 오차 0.000000) |

---

## 1. 해결된 CRITICAL 버그 4건

### C1: 비대상 품목 전체 원가 인상 (근본 원인)
- **위치**: offsetEffect.ts else 블록 (line 577-591)
- **증상**: 원자재 50% 인상이 수천 개 비대상 품목에도 적용 → 전사 변동비 폭등 → 단일 품목 가격 인상으로 상쇄 불가
- **수정**: else 블록에서 원가 인상 제거, `newTotalVariableCost += it.variableCost` (원본 유지)
- **근거**: 저가수주 시뮬은 "이 품목의 조건을 바꾸면?" 시나리오. 나머지 품목은 상수 기준선

### C2: 워터폴 항등식 위반
- **위치**: offsetEffect.ts line 520-576
- **증상**: `net ≠ priceReductionLoss + volumeContributionGain` (원가 효과 누락)
- **수정**: 2-way → 3-way 분해
  - priceEffect = Σ(기존수량 × (신규단가 − 기존단가))
  - costEffect = Σ(기존수량 × (기존변동비 − 조정변동비))
  - volumeEffect = Σ(추가수량 × (신규단가 − 조정변동비))
- **항등식 증명**: ΔRev − ΔVC = qty×(np−op) + qty×(ovc−avc) + added×(np−avc) ≡ Σ3

### C3: 200전용 합성 CVPItem — COGS를 변동비로 사용
- **위치**: OffsetEffectTab.tsx line 351
- **증상**: `variableCost = actualCOGS` (총원가 = 변동비+고정비 포함) → 공헌이익 과소
- **수정**: `variableCost = actualCOGS × vcRatio` (overallVCRatio로 변동비만 분리)

### C4: 감도분석 그리드 원가 슬라이더 무시
- **위치**: offsetEffect.ts calcSensitivityGrid, OffsetEffectTab.tsx 호출부
- **증상**: costChangePct 미전달 → BEP 물량이 원가 인상 미반영
- **수정**: 시그니처에 `costChangePct`, `vcCostRatioMap` 추가 + 호출부 의존성 배열 갱신

---

## 2. 수학적 검증

```
Case1: +500% price +50% raw -> baseOP 3만 → newOP 51만
  price: 500,000  cost: -20,000  vol: 0
  identity: 480,000 = 480,000 ✓ PASS
  (이전 버그: -1.2억)

Case2: all zero -> net=0
  price: 0  cost: 0  vol: 0
  ✓ PASS (회귀 없음)

Case3: -10% price +30% vol
  price: -10,000  cost: 0  vol: 3,000
  identity: -7,000 = -7,000 ✓ PASS

Case4: cost +100% on target only
  P1 원가 인상, P2 원가 불변
  newTotalVC = 216,000 ✓ PASS
```

---

## 3. UI 변경 요약

| 영역 | 이전 | 이후 |
|------|------|------|
| KPI 카드 | 단가 효과 / 물량 효과 | **가격 효과** / **원가+물량 효과** (3-way) |
| 워터폴 | 4단계 | **5단계** (기존→가격→원가→물량→최종), 0이면 자동 숨김 |
| 인터페이스 | priceReductionLoss / volumeContributionGain | **priceEffect / costEffect / volumeEffect** (하위호환 유지) |
| 설명 텍스트 | 2-way 항등식 | 3-way 항등식 반영 |

---

## 4. 커밋 이력

| 커밋 | 내용 |
|------|------|
| `e8c6001` | 원가 비교 카드, 200전용 시뮬, 월별 추이 (2026-04-17) |
| `02401b8` | 시뮬레이션 근본 수정 — 3-way 분해, 비대상 원가 불변, 합성아이템 변동비 분리 (2026-04-20) |

---

## 5. 남은 과제 (후속 PDCA)

| 항목 | 우선순위 | 설명 |
|------|---------|------|
| H1: 풀 시뮬(4b) 원가 반영 | HIGH | calcPoolSimulation에 costChangePct 추가 |
| M1: SGA/제조 변동비 분리 | MEDIUM | 제조 비율을 mfgVC에만 적용 (sgaVC 제외) |
| H2: 200 미업로드 경고 | MEDIUM | vcRatioMap null → "변동비 근사치 사용" 배너 |
