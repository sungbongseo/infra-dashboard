# BCG 포트폴리오 매트릭스 — Feature 진화 사례 (Phase B → v2 → v3)

> 통합 archive — 같은 feature의 3단계 진화를 단일 폴더에 보존.
> 가치: **정확성 → 신뢰성 → 교육성** 3차원 발전 사례.

## Timeline

| 단계 | 기간 | 핵심 가치 | Match Rate | LOC | Tests |
|---|---|---|---|---|---|
| **Phase B** (baseline) | 2026-04-30 (단일 세션, ~3h) | 알고리즘 정확성 (BCG 4-way SQA) | 100% | +1,080 | 29/29 → 505/505 |
| **v2** (운영 fix) | 2026-05-01~06 (4 micro-iterations) | 데이터 신뢰성 (Defensive Analytics) | 100% | +833 | 41/41 → 517/517 |
| **v3** (UI enrichment) | 2026-05-07 (Plan-mode 1 cycle) | 사용자 교육성 (Progressive Disclosure) | 100% | +378 | 41/41 → 517/517 |

총 진화: **+2,291 LOC, 6 commits, 105 tests**, Match Rate 100% 일관 유지

## 단계별 핵심 산출

### Phase B (`product-portfolio-matrix.plan.md`, `.report.md`)
- 4-way BCG 매트릭스 알고리즘 (제품/상품 × 내수/해외 = 4 segment)
- Strategic Quadrant Analysis (SQA): BCG + Dynamic + Pareto 80/20 + Weighted margin
- Phase B-0: parser fill-down 강화 (매출유형 78.5% → 0% 빈값 해결)
- 6 commits: b548882, 45c1e6a, 232d009, 193b994, ceeb813, f2edb80
- **상세**: `product-portfolio-matrix.report.md`

### v2 (`product-portfolio-matrix-v2.report.md`)
- 사용자 dev 검증 → 4 micro-iteration cycle (각 30분)
- ① Custom Tooltip + 원가 미계상 식별 (4건)
- ② 매출총이익 + 매출총이익율 명확화 + MetricInfo 통합
- ③ 음수 원가 식별 (215.24% 매출총이익율 케이스)
- ④ 음수 원가 자동 제외 + **수학/회계/비즈니스 3-way reconciliation**
- 4 commits: ceeb813, f2edb80, db7701d, 5b9704f
- **Defensive Analytics 원칙 4종 확립**:
  1. 비즈니스 의미 없는 데이터는 사전 제외
  2. 수학적 정확 ≠ 비즈니스 정확
  3. Anomaly는 숨기지 말고 명시적으로 제외
  4. 30분 incremental cycle (사용자 검증 driven)
- **상세**: `product-portfolio-matrix-v2.report.md`

### v3 (`bcg-tooltip-enrichment-v3.report.md`)
- 사용자 1회 피드백 → Plan-mode 1 cycle
- glossary-portfolio.ts: 13 → 25 entries (+12 신규)
- PortfolioMatrixTab.tsx: 5 → 17 MetricInfo 통합 위치
- 차트 위 chip row 패턴 (Recharts axis label 한계 우회)
- ChartCard action slot 활용 (segment_4way 개념 ⓘ)
- 3 contextBranches (outlier ≥10건, missing/negative cost ≥1건)
- 1 commit: 3a187ba (+ cef0af7 보고서)
- **Progressive Disclosure 원칙 4종 추가** (5~8):
  5. 3-layer pedagogy mandate (beginner/intermediate/expert)
  6. Recharts 한계는 컴포넌트 API로 우회
  7. contextBranches로 actionable signal 강화
  8. 시각적 노이즈 최소화 (사용자 결정 우선)
- **상세**: `bcg-tooltip-enrichment-v3.report.md`

## 진화 사례로서의 가치

### 1. **PDCA 사이클 다양성**
같은 feature가 3가지 다른 PDCA 패턴으로 발전:
- Phase B: **classic 1-cycle** (Plan → Design → Do → Check → Report)
- v2: **micro-iteration cycle** (사용자 검증 driven, 30분 단위, 4회 반복)
- v3: **Plan-mode cycle** (사용자 결정 driven, AskUserQuestion 3건)

### 2. **가치 직교성 (Orthogonality)**
- 정확성 (v2) 과 교육성 (v3) 은 직교 — 둘 다 필요
- 정확하지만 이해 불가하면 무의미, 이해 쉽지만 부정확하면 위험
- 분리해서 진행한 게 맞는 결정 (단일 cycle로 묶지 않음)

### 3. **누적 원칙 8종 (다른 모듈 적용 가능)**
| # | 원칙 | 출처 |
|---|---|---|
| 1 | 비즈니스 의미 없는 데이터는 사전 제외 | v2 |
| 2 | 수학적 정확 ≠ 비즈니스 정확 | v2 |
| 3 | Anomaly는 숨기지 말고 명시적으로 제외 | v2 |
| 4 | 30분 incremental cycle (사용자 검증 driven) | v2 |
| 5 | Progressive Disclosure 3-layer mandate | v3 |
| 6 | Recharts 한계는 컴포넌트 API로 우회 | v3 |
| 7 | contextBranches로 actionable signal 강화 | v3 |
| 8 | 시각적 노이즈 최소화 (사용자 결정 우선) | v3 |

다음 운영 사이클에서 **offsetEffect, profitRiskMatrix, customerItemMargin** 등 다른 분석 모듈에 적용 권장.

### 4. **monotonic 회귀 0**
- 505/505 → 517/517 → 517/517 (monotonic 증가, 회귀 0건)
- 6 commits 모두 빌드 0 errors, 테스트 통과
- 사용자 의문 4건 (v2) → 1건 (v3) → 0건 (목표) 감소

## Critical Files (post-archive)

활성 코드 (계속 유지):
- `src/lib/analysis/productPortfolioMatrix.ts` (536 LOC, v2 자동 제외 로직)
- `src/lib/analysis/productPortfolioMatrix.test.ts` (521 LOC, 41 tests)
- `src/lib/metrics/glossary-portfolio.ts` (595 LOC, 25 entries)
- `src/app/dashboard/profitability/tabs/PortfolioMatrixTab.tsx` (607 LOC, 17 MetricInfo 통합)

Archive (본 폴더):
- `product-portfolio-matrix.plan.md` — 베이스 plan (Phase B)
- `product-portfolio-matrix.report.md` — Phase B 완료 보고서
- `product-portfolio-matrix-v2.report.md` — v2 통합 보고서
- `bcg-tooltip-enrichment-v3.report.md` — v3 통합 보고서

## 향후 참조 시점

- 다른 분석 모듈에 Defensive Analytics + Progressive Disclosure 적용 시 → 본 archive 참조
- 신규 사용자 onboarding 자료로 활용 (PDCA 다양성 사례)
- 운영 1개월 후 hover 텔레메트리 분석 시 v3 baseline으로 비교

> Archived: 2026-05-07
> Status: completed (Match Rate 100% × 3단계 일관)
