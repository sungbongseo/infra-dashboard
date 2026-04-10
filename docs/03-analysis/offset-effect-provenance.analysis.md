# Gap Analysis: offset-effect-provenance

## Analysis Overview

- **Feature**: 저가수주 상계효과 탭 — 데이터 출처·계산 로직 인라인 문서화 (3-Layer)
- **Plan Document**: `docs/01-plan/features/offset-effect-provenance.plan.md`
- **Implementation Files**:
  - `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx`
  - `src/lib/analysis/offsetEffect.ts`
- **Commit**: `860b81e feat: 저가수주 상계효과 — 데이터 출처·계산 로직 인라인 문서화 (3-Layer)`
- **Analysis Date**: 2026-04-10

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Layer 1: 전역 방법론 패널 | 100% | ✅ |
| Layer 2: Step별 인라인 토글 (6) | 100% | ✅ |
| Layer 3: KpiCard formula 보강 | 91% (10/11) | ✅ |
| 분석 함수 docstring (5) | 100% | ✅ |
| 문서↔코드 컬럼명 일치 | 100% | ✅ |
| 빌드 / 테스트 | 100% | ✅ |
| **Overall Match Rate** | **97.7%** | ✅ |

## Acceptance Criteria Verification

### AC1: 전역 방법론 패널 — ✅ 100%

위치: `OffsetEffectTab.tsx:352-447`

| 요구 항목 | 구현 | 위치 |
|-----------|:----:|------|
| `<details>` 1개 (📘 아이콘) | ✅ | L352-356 |
| 100 원본 파일 카드 (컬럼 5개) | ✅ | L364-376 |
| 200 원본 파일 카드 (컬럼 6개) | ✅ | L377-390 |
| 5개 핵심 가정 리스트 | ✅ | L394-406 |
| 듀얼 뷰 설명 (4a vs 4b) | ✅ | L408-430 |
| 코드 레퍼런스 6개 | ✅ | L432-445 |

### AC2: Step별 인라인 토글 (6개) — ✅ 100%

| Step | 토글 존재 | 테이블/내용 |
|------|:--------:|-------------|
| Step 1 현재 진단 | ✅ | 5행 테이블 (총매출/총변동비/총고정비/영업이익/출혈) |
| Step 2 CVP | ✅ | BEP 계산식 (매출선/총원가선/고정비선) |
| Step 3 4사분면 | ✅ | X/Y축 컬럼 + 사분면 분할 기준 |
| Step 4a 총액 | ✅ | 단가 손실/물량 공헌/최종 이익 분해식 + 항등식 |
| Step 4b 배분 | ✅ | 7행 테이블 (풀 필터/수량매출/고정비/변동비/배분고정비/weight/장부상마진) |
| Step 5 무결성 | ✅ | 4a/4b 각 관점 내부 항등식 검증 방법 |

### AC3: KpiCard formula 컬럼명 수준 보강 — ✅ 91% (10/11)

Plan 요구: Step 1의 4개 + Step 4a의 4개 + Step 4b의 3개 = **11개**

| Section | KpiCard | `[파일.컬럼]` 적용 | 라인 |
|---------|---------|:------------------:|------|
| Step 1 | 총매출 | ✅ `[100.매출액·실적]` | L481 |
| Step 1 | 총원가 | ✅ `[100.*] + [200.*]` | L489 |
| Step 1 | 영업이익 | ✅ `[100.*] − [200.*]` | L497 |
| Step 1 | 평균 단위당 원가 | ✅ `[200.*] + [100.*] / [100.매출수량·실적]` | L505 |
| Step 4a | 기존 영업이익 | ✅ | L845 |
| Step 4a | 단가 인하 손실 | ✅ | L852 |
| Step 4a | 물량 증가 공헌 | ✅ | L859 |
| Step 4a | 최종 영업이익 | ⚠️ 파생 수식 (G1) | L868 |
| Step 4b | ① 대상 품목 | ✅ `[200.*]` | L1154 |
| Step 4b | ② 다른 품목 (덤) | ✅ `[200.제조고정비]` | L1161 |
| Step 4b | ③ 제품군 전체 | ✅ `[200.제조고정비]` | L1168 |

**Bonus**: Step 2/3 ChartCard 및 Step 1 보조 KPI에도 `[파일.컬럼]` 패턴 적용 → 총 14개 formula.

### AC4: 문서↔코드 컬럼명 일치 — ✅ 100% (spot check 4/4)

| 스팟 체크 | UI 표기 | 코드 실체 | 일치 |
|-----------|---------|-----------|:----:|
| 고정비 구성 | `제조고정노무비 + 감가상각비 + 기타경비` | `extractManufacturingFixedCost` | ✅ |
| 100 변동비 | `매출액·실적 − 매출총이익·실적` | `calcCustomerItemCVP` | ✅ |
| 200 풀 필터 | `대분류, 중분류, 품목계정그룹` | `calcItemPool` | ✅ |
| 품목 코드 정규화 | `[P001] 명 → P001` | `calcItemPool` | ✅ |

### AC5~6: 빌드 / 테스트 — ✅

- `npm run build`: 0 errors
- `npx vitest run offsetEffect.test.ts`: 24/24 passed

### 분석 함수 docstring 검증 — ✅ 100% (5/5)

| 함수 | `@source` | `@fields` | `@formula` | `@assumption` |
|------|:---------:|:---------:|:----------:|:-------------:|
| `extractManufacturingFixedCost` | ✅ | ✅ | ✅ | ✅ |
| `calcCustomerItemCVP` | ✅ | ✅ | ✅ | ✅ |
| `calcTotalViewSimulation` | ✅ | — | ✅ | ✅ |
| `calcItemPool` | ✅ | ✅ | ✅ | ✅ |
| `calcPoolSimulation` | ✅ | — | ✅ | ✅ |

## Gap List

### 🔵 경미한 차이 (1건)

| # | 항목 | Plan | 구현 | 영향 |
|---|------|------|------|:----:|
| G1 | Step 4a "최종 영업이익" KpiCard formula | `[파일.컬럼]` 표기 | `기존 영업이익 + 단가 인하 손실(−) + 물량 증가 공헌(+) [고정비 총액 불변]` (파생 수식) | Low |

**G1 상세**: 11개 중 10개는 명시적 `[100.*]`/`[200.*]` 표기. "최종 영업이익"은 파생값이라 상위 3개 KPI 수식으로 표기됨. 사용자가 같은 섹션의 앞 3개 KPI를 통해 원 컬럼 추적 가능.

### 🟢 플러스 요소 (Plan 초과 이행)

- ChartCard formula 3개 추가 보강 (요구 외)
- Step 4b 토글 emerald 컬러 차별화 (시각적 풀 계층 구분)
- Step 4b 테이블 7행 확장 + 하단 항등식 명기
- 코드 레퍼런스 6개 완비

## Match Rate 계산

```
Layer 1 (20%) : 20.0 (4/4)
Layer 2 (25%) : 25.0 (6/6)
Layer 3 (25%) : 22.7 (10/11)
Docstring (15%) : 15.0 (5/5)
컬럼명 일치 (10%) : 10.0 (4/4)
빌드/테스트 (5%) : 5.0
─────────────────────────
Total        : 97.7%
```

## Recommended Actions

### 선택적 개선 (Low Priority)

1. **Step 4a "최종 영업이익" formula 보강** (5분)
   - 현재: `기존 영업이익 + 단가 인하 손실(−) + 물량 증가 공헌(+) [고정비 총액 불변]`
   - 제안: `Σ[100.매출액·실적] − Σ[100.변동비] − Σ[200.제조고정비] + Δ가격효과 + Δ물량공헌 [200.고정비 불변]`

## Conclusion

**Match Rate 97.7%** — Plan 기준(≥85%) 대비 **+12.7%p** 초과 달성. Layer 1/2 완벽, Layer 3는 11개 중 10개 엄격 일치, docstring/컬럼명 100% 일치. 분석 로직 무변경 원칙 준수, 기존 24개 단위 테스트 그대로 통과.

Plan Core Value("블랙박스 → 감사 가능한 분석 도구")가 충실히 구현됨. **Check 단계 통과**, `/pdca report` 진행 가능.
