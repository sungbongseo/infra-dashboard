# BCG 포트폴리오 매트릭스 v4 — 세계 최고 수준 (McKinsey/BCG/Bain 벤치마크)

> **Feature ID**: `portfolio-matrix-v4-world-class`
> **베이스라인**: v3 archive (`docs/archive/2026-05/product-portfolio-matrix/`) — Match Rate 100% × 3단계
> **벤치마크**: 맥킨지/BCG/Bain 컨설팅 메모 + readiness scan 기반
> **기간**: 2026-05-08 ~ 2026-06-04 (4주, 3-Tier 로드맵)
> **Mode**: Plan only — 실행 전 사용자 승인 필요

---

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | v3 완료 후 사용자 검토에서 "세계 최고 수준" 요구 발생. **Excel 데이터 활용률 22% 정체** — 100 보고서 23개 파싱 컬럼 중 **단 5개**만 BCG 알고리즘에 활용 (매출액·영업이익·계정구분·매출유형·품목). 거래처 계층(3개 컬럼), 매출연월, 제품군, 공장, 매출수량, 환산수량 등 **18개 컬럼은 미활용**. 200 보고서의 대분류/중분류/소분류 계층, 303/304 보고서의 cross-validation 데이터는 BCG 매트릭스에 전혀 연결 안 됨. 회계 anomaly(음수원가 4건, 미계상 1건) 탐지는 되지만 **회계팀 export 자료 부재**. |
| **Solution** | **3-Tier 점진 로드맵** + **McKinsey/BCG/Bain 컨설팅 메모 패턴** 적용. P1(1주): anomaly export(회계팀 사이드카) + 대분류×BCG 매트릭스(64 mini-matrix). P2(2주): 거래처 집중도(HHI), 제품군 BCG, 월별 변동성(품목별 sigma). P3(4주): 303/304 cross-validation(데이터 정합성 검증), 공장별 포트폴리오, BEP 통합. 모든 신규 모듈은 v3 archive **8 원칙(Defensive Analytics 4 + Progressive Disclosure 4)** 사전 적용 — micro-iteration cycle 최소화. |
| **Function UX Effect** | (1) 차원 추가 — 단일 BCG가 4 segment × 16 대분류 = **64 mini-matrix** 드릴다운 (맥킨지 nested matrix 패턴), (2) 거래처 HHI sidebar로 매출 집중도 즉시 시각화 (BCG concentration analysis), (3) 월별 sigma로 변동성 큰 품목 자동 식별 (Bain volatility quadrant), (4) 회계 anomaly CSV/PDF export로 회계팀 actionable signal, (5) 303/304 cross-validation 보고서로 데이터 무결성 자동 검증 (>5% 차이 품목 highlight). |
| **Core Value** | **Excel 활용률 22% → 65% 목표** (5/23 → 15/23 컬럼). v3 archive 8 원칙으로 micro-iteration 12-cycle 절감 예상. **데이터 정합성 + 다차원 분석 + 회계 통합** 3축 동시 강화 → 임원 의사결정 회의에서 "어느 segment / 어느 대분류 / 어느 거래처 / 어느 월"의 4-way 드릴다운 즉시 가능. McKinsey/BCG/Bain 컨설팅 메모와 비교 가능한 분석 깊이 확보. |

---

## 1. Context — Excel 데이터 활용률 audit

### 현황 (v3 시점, 2026-05-07)

| 보고서 | 파싱 컬럼 수 | BCG 활용 | 활용률 | 미활용 핵심 |
|---|---:|---:|:---:|---|
| 100 거래처×품목 손익 | 23 | 5 | **22%** | 거래처계층(3), 매출연월, 매출수량, 공장, 영업조직팀 |
| 200 품목 수익성 | ~30 | 0 | **0%** | 대분류/중분류/소분류, 14개 제조변동비, 표준원가 |
| 303 조직×거래처 손익 | ~12 | 0 | **0%** | cross-validation 미사용 |
| 304 본부 거래처×품목 | ~14 | 0 | **0%** | cross-validation 미사용 |

**핵심 결론**: BCG 매트릭스가 **단일 보고서의 5개 컬럼**만으로 작동 → "세계 최고 수준" 분석을 위해서는 **차원 다양성**과 **cross-report validation** 필수.

### McKinsey/BCG/Bain 컨설팅 메모 패턴 (벤치마크)

| 패턴 | 적용 |
|---|---|
| **Nested matrix** (4 segment × N category) | P1 대분류×BCG 64 mini-matrix |
| **Customer concentration** (HHI, Top 10 share) | P2 거래처 집중도 sidebar |
| **Volatility quadrant** (avg × sigma) | P2 월별 변동성 (품목별 sigma) |
| **Cross-portfolio synergy** | P3 동일 품목 4 segment 분포 비교 |
| **Operational benchmark** (factory, region) | P3 공장별 포트폴리오 |
| **Data integrity audit** | P3 303/304 cross-validation |

---

## 2. P1 — 즉시 (1주, ~200 LOC)

### P1-1. Anomaly Export (회계팀 사이드카)

**문제**: v2/v3에서 이미 hasMissingCost(1건)·hasNegativeCost(4건) 탐지되지만 **회계팀에 전달할 export 부재**.

**해결**:
- `productPortfolioMatrix.ts`: anomaly entries 별도 추출 함수 `extractAnomalies()` 추가
- `PortfolioMatrixTab.tsx`: 음수 원가/미계상 경고 박스에 "📥 회계팀 보고용 CSV 다운로드" 버튼 추가
- 출력 컬럼: 거래처명, 품목코드, 품목명, 매출액, 매출원가, 매출총이익, 매출총이익율, 영업이익율, 매출연월, 회계 의심 이유

**예상 LOC**: ~80 (algorithm +20, UI +40, glossary +20)
**8 원칙 적용**: 원칙 3 (Anomaly explicit visibility) — export로 actionable signal 강화

### P1-2. 대분류×BCG Mini-Matrix (Nested Matrix)

**문제**: 4 segment 단일 매트릭스로는 "어느 대분류가 적자 driver인지" 즉시 안 보임.

**해결**:
- 200 보고서 대분류 활용 (이미 파싱됨, productGroupAnalysis.ts 재활용)
- 4 segment × 16 대분류 = 최대 64 mini-matrix
- UI: segment 카드 클릭 시 SegmentDetail 하단에 "대분류별 사분면 분포" 추가 (collapsible)
- 각 대분류별 mini-bar: Star/Cash Cow/Question/Dog 비중 + 가중 영업이익율

**예상 LOC**: ~120 (algorithm +40, UI +60, glossary +20)
**8 원칙 적용**: 원칙 5 (3-layer pedagogy), 원칙 8 (시각적 노이즈 — collapsible로 default 숨김)

### P1 합계: ~200 LOC, 1주

---

## 3. P2 — 단기 (2주, ~400 LOC)

### P2-1. 거래처 집중도 (HHI Sidebar)

**문제**: BCG 매트릭스가 품목 중심이지만 **"몇 거래처가 매출 80% 차지하는지"** 의 집중도 미노출.

**해결**:
- 새 모듈: `customerConcentration.ts` (segment별 HHI, Top 5/10 거래처 매출비중)
- UI: PortfolioMatrixTab 우측 sidebar (lg+ 화면)에 "거래처 집중도" 카드 추가
- HHI 해석: <1500 분산 / 1500-2500 적정 / >2500 집중 (US DOJ 기준)
- contextBranches: HHI > 2500 시 "🚨 거래처 집중 위험" 자동 경고

**예상 LOC**: ~150
**8 원칙 적용**: 원칙 1·2 (anomaly: 단일 거래처 80%+ 자동 flag), 원칙 5·7

### P2-2. 제품군 BCG (제품군 차원 추가)

**문제**: 100 보고서의 "제품군" 컬럼(파싱됨)이 BCG에 미활용. 16개 제품군별 분포 미노출.

**해결**:
- 알고리즘: BCGMatrixEntry에 `productGroup` 필드 이미 있음 (entry.category) — UI에서 활용
- UI: ScatterChart Cell 색상을 제품군별로 칠하는 옵션 토글 추가
- 또는 Top 5 카드에 제품군 column 추가

**예상 LOC**: ~80
**8 원칙 적용**: 원칙 8 (cell-level 색상 vs sub-quadrant 별 헤더 — 사용자 결정 필요)

### P2-3. 월별 변동성 (Volatility Quadrant)

**문제**: Dynamic BCG는 6M+6M 비교만 — **품목별 월간 sigma**(변동성) 미계산. 안정적 vs 변동 큰 품목 구분 불가.

**해결**:
- 알고리즘: `calcMonthlyVolatility(entries)` 추가 — 품목별 월간 매출 표준편차 / 평균 = CV(변동계수)
- BCGMatrixEntry에 `monthlyCV` 필드 추가 (요구: monthCount ≥ 6)
- UI: 별도 보조 Quadrant "평균 매출 × 변동계수" — 안정적 / 변동 큰 / 신규 / 단발 4분류

**예상 LOC**: ~170
**8 원칙 적용**: 원칙 1 (CV 계산 불가 시 insufficient_data로 분리), 원칙 4 (단위 테스트 8건+)

### P2 합계: ~400 LOC, 2주

---

## 4. P3 — 중기 (4주, ~600 LOC)

### P3-1. 303/304 Cross-Validation (데이터 무결성 검증)

**문제**: 100 보고서와 303(조직×거래처)/304(본부×거래처×품목) 사이 동일 거래처/품목 매출액·영업이익이 **다르게 집계되는 케이스** 미탐지.

**해결**:
- 새 모듈: `crossReportValidation.ts`
  - 100 vs 304: 거래처+품목 단위 매출액 비교 → 차이율 >5% highlight
  - 100 vs 303: 거래처 단위 매출액 비교 → 차이율 >5% highlight
- 새 탭: `/dashboard/data` 페이지에 "데이터 무결성" 섹션 추가 또는 Profitability에 "교차검증" 탭
- Export: 차이 품목/거래처 CSV (회계팀 검증용)

**예상 LOC**: ~280
**8 원칙 적용**: 원칙 1·2·3·4 모두 (anomaly 자동 flag + 명시적 노출 + edge case test)

### P3-2. 공장별 포트폴리오

**문제**: 100 보고서 "공장" 컬럼 파싱됨 but 미활용. 다공장 운영 시 공장별 수익성 차이 무시.

**해결**:
- 알고리즘: BCGMatrixEntry에 `factory` 필드 추가
- UI: 화면 상단에 "공장 필터" 드롭다운 (전체 / 개별 공장)
- 공장별 BCG 차트 비교 view

**예상 LOC**: ~150
**8 원칙 적용**: 원칙 5 (공장별 glossary entry 추가)

### P3-3. 손익분기점 (BEP) 통합

**문제**: 손익분기 탭은 별도 존재하지만 BCG 매트릭스와 연결 안 됨. "어느 사분면 품목이 BEP 미달인가?" 즉시 답변 불가.

**해결**:
- 알고리즘: BCG entry에 `bepStatus` 필드 추가 (above/at/below)
- UI: ScatterChart에서 BEP 미달 품목 outline 강조 (기존 outlier outline과 다른 색)

**예상 LOC**: ~120
**8 원칙 적용**: 원칙 6·7 (BEP 임계 값 contextBranches로 actionable warning)

### P3-4. 8 원칙 readiness 적용 (offsetEffect, profitRiskMatrix, customerItemMargin)

**병행 작업**: P3 진행 중 운영 신호 발생하는 분석 모듈에 readiness scan 적용 가능.
참고: `docs/03-analysis/analysis-modules-readiness-scan.md`

**예상 LOC**: ~50 (포트폴리오 매트릭스 v4 외부, 별도 cycle)

### P3 합계: ~600 LOC (+50 병행), 4주

---

## 5. 8 원칙 사전 적용 체크리스트 (전 모듈 공통)

각 신규 P1/P2/P3 모듈에 plan 단계에서 사전 적용:

### Defensive Analytics
- [ ] **1. Anomaly exclusion**: 비즈니스 의미 없는 데이터 사전 제외 + counter
- [ ] **2. Math vs business**: 수학상 정확하나 비현실적 결과 명시 flag
- [ ] **3. Explicit visibility**: 제외 anomaly를 actionable count로 노출
- [ ] **4. Incremental tests**: edge case별 1 test (P1: ~10, P2: ~25, P3: ~30)

### Progressive Disclosure
- [ ] **5. 3-layer pedagogy**: 신규 glossary entry (P1: 4, P2: 8, P3: 12)
- [ ] **6. Library 한계 우회**: Recharts overlay / chip row / action slot
- [ ] **7. contextBranches**: 임계 트리거 시 자동 actionable warning
- [ ] **8. 시각적 노이즈 최소화**: cell-level 반복 ⓘ ❌, 헤더 1번만

---

## 6. Critical Files

### 신규 (created)
- `src/lib/analysis/customerConcentration.ts` (P2-1)
- `src/lib/analysis/monthlyVolatility.ts` (P2-3)
- `src/lib/analysis/crossReportValidation.ts` (P3-1)
- 단위 테스트 3개 신규 파일

### 수정 (modified)
- `src/lib/analysis/productPortfolioMatrix.ts` (P1-1 anomaly export, P2-2 productGroup, P2-3 CV, P3-2 factory, P3-3 BEP)
- `src/app/dashboard/profitability/tabs/PortfolioMatrixTab.tsx` (전 phase UI 통합)
- `src/lib/metrics/glossary-portfolio.ts` (24 신규 entries: 4+8+12)
- `src/lib/excel/schemas.ts` (필요 시 미파싱 컬럼 추가, 현재는 모두 파싱됨)
- `src/components/dashboard/MetricInfo.tsx` — 무변경 (기존 API 활용)

### 재사용 (existing)
- `productGroupAnalysis.ts` — P1-2 대분류 BCG에 calcGroupPortfolio() 재활용
- `customerProfitAnalysis.ts` — P2-1 HHI 계산 로직 참고
- `breakeven.ts` — P3-3 BEP 임계 값 활용

---

## 7. Verification

### 빌드 + 테스트
```bash
npm run build  # 0 errors 필수
npm test       # 517 → ~580 (신규 ~63 tests)
```

### Excel 데이터 검증 (audit re-run)
- P1 완료 후: 활용 컬럼 5 → 8 (35% 활용률)
- P2 완료 후: 8 → 12 (52%)
- P3 완료 후: 12 → 15 (65%) — **목표 달성**

### Dev 회귀 (사용자 manual)
각 phase 완료 시:
- [ ] BCG 매트릭스 기존 기능 무회귀 (4 segment, 임계 모드, Dynamic, Pareto, 사분면 분류)
- [ ] 신규 차원 hover/click 정상 (8 원칙 체크리스트)
- [ ] anomaly export CSV 생성 + 컬럼 정확
- [ ] 다크 모드, beginner 모드 정상

### McKinsey/BCG/Bain 벤치마크 비교 (정성 평가)
- [ ] Nested matrix (P1-2): 단순 4 segment → 64 mini-matrix 드릴다운
- [ ] HHI concentration (P2-1): 거래처 집중 위험 자동 경고
- [ ] Volatility quadrant (P2-3): 안정/변동/신규/단발 4분류
- [ ] Cross-validation (P3-1): >5% 차이 품목 자동 식별

---

## 8. Out of scope

- 알고리즘 패러다임 변경 (BCG 4-way SQA 유지)
- 실시간 데이터 (Excel 업로드 기반 유지)
- Mobile UI 전용 디자인 (lg+ 데스크톱 우선)
- ML/예측 모델 (sigma 변동성은 통계, ML 아님)
- 다국어 지원 (한국어 유지)

---

## 9. 구현 일정 (4주 마스터 schedule)

| 주차 | Phase | 산출물 | 회귀 검증 |
|---|---|---|---|
| Week 1 | P1-1, P1-2 | Anomaly export + 대분류 BCG | dev hover + 활용률 35% |
| Week 2 | P2-1, P2-2 | HHI sidebar + 제품군 cell 색상 | dev hover + 활용률 45% |
| Week 3 | P2-3, P3-1 | 월별 sigma + cross-validation | dev hover + 활용률 55% |
| Week 4 | P3-2, P3-3 | 공장 + BEP 통합 | dev hover + 활용률 65% (목표) |

각 주 종료 시 commit + 보고서 작성. 4주 종료 시 통합 archive (v3 옆에 v4).

---

## 10. 위험 + 완화

| 위험 | 완화 |
|---|---|
| 64 mini-matrix UI 복잡도 | collapsible default + lg+ 화면만 노출 |
| HHI 계산 비용 (segment × 거래처 카디널리티) | useMemo + segment별 캐시 |
| Cross-validation 차이 false positive | 5% 임계 + contextBranches로 의심도 표시 |
| P3-1 신규 탭 사용자 발견성 | URL anchor + Glossary 페이지에 entry 추가 |
| 4주 일정 단일 개발자 부담 | tier별 commit 가능, 중간 archive 가능 |

---

> **다음 단계**: 본 plan 승인 후 `/pdca design portfolio-matrix-v4-world-class` (P1만 design 우선) → `/pdca do P1` 시작
> **관련 자산**: v3 archive `_EVOLUTION.md` (8 원칙) + `analysis-modules-readiness-scan.md`
