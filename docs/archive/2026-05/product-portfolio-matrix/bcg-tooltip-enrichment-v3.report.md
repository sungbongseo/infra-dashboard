# BCG 포트폴리오 매트릭스 — 분석 툴팁 강화 v3 PDCA 보고서

> Feature ID: `bcg-tooltip-enrichment-v3`
> 베이스: `product-portfolio-matrix-v2.report.md` (운영 fix 4건, 2026-05-06)
> 기간: 2026-05-07 단일 세션 (~2시간, Plan + Implementation + Verify)
> Status: ✅ v3 완료 · Match Rate 100% · 단위 테스트 41/41 + 전체 517/517 + 빌드 0 errors
> Commit: `3a187ba`

---

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | v2 출시 후 사용자 화면 검증에서 **분석 툴팁이 너무 부실하다**는 피드백. 13개 BCG glossary 엔트리는 일부 컨트롤(임계 select, Dynamic/Pareto 토글, KPI 가중/산술, 사분면 아이콘)에만 연결되어 있고, **차트 본체(축, 임계선)와 데이터 품질 안내(0매출/반품/거래월/outlier/원가) 영역은 평문 텍스트만 노출** — 사용자가 "X축 매출액이 무엇의 합인지", "임계선이 어떻게 정해지는지", "거래월 6개 미만이 무슨 의미인지" 알 수 없는 상태. |
| **Solution** | **MetricInfo + glossary 시스템을 화면 전 영역에 확장** — 알고리즘·데이터 흐름 무변경, 순수 UI/표현 계층만 강화. (1) glossary-portfolio.ts에 12 신규 엔트리 추가 (13→25), 모두 3-단계 progressive disclosure(초/중/전), 일부는 contextBranches로 임계 트리거 메시지 포함. (2) PortfolioMatrixTab.tsx 12 위치에 ⓘ 통합 — KPI/정보바/경고/차트 chip row/ChartCard action/footer/Top 5 mini-legend. (3) Recharts 한계(axis label은 React 미수용) 우회로 차트 위 chip row 패턴 도입. |
| **Function UX Effect** | 화면의 **모든 숫자/라벨/경고**가 hover 시 산식·해석·기준을 노출. 핵심 기준 4종 동시 표시: ① X 임계선(매출 median/p75/평균 모드별 산식), ② Y 임계선(median/가중/0% 모드별), ③ Y축 클램핑([-50,100]) 이유 + outlier 식별, ④ contextBranches로 outlier 10건+ 또는 missing/negative cost ≥1건 발생 시 자동 actionable warning. 사용자 학습 부담 ↓ (12 ⓘ는 hover 시만 표시, beginner 모드 ON 시 인라인 hint). |
| **Core Value** | **분석 신뢰성·교육성 통합** — 사용자가 처음 화면을 봐도 "왜 이 점이 outlier인지", "왜 이 품목이 미계상인지", "왜 음수 원가는 제외됐는지" 30초 안에 이해 가능. 의사결정 차상위 데이터(축·임계·필터) 모두 명문화되어 신규 사용자 onboarding 비용 ↓, 회의에서 "이 숫자 어떻게 나온거야?" 질문 0건 목표. v2의 Defensive Analytics 원칙(수학≠비즈니스)이 UI 표현 계층까지 확장됨. |

---

## 1. Plan (사용자 결정 기반)

베이스 plan 문서: `C:/Users/rcnd/.claude/plans/structured-soaring-coral.md`

사용자 결정 3건 (AskUserQuestion 응답):

| 질문 | 선택 | 설계 영향 |
|---|---|---|
| 범위 | 전체 10+ 항목 한번에 | 12 신규 entries + 12 UI 위치 (분할 안 함) |
| 임계선 노출 방식 | 차트 위 chip row | 새 컴포넌트 (chart 상단 4 ⓘ 1줄), Recharts ReferenceLine hover 한계 우회 |
| 추세 화살표 위치 | Top 5 카드 헤더 1번 | cell마다 ⓘ 추가 안 함, 시각적 노이즈 최소화 |

베이스라인: `product-portfolio-matrix-v2.report.md` (Defensive Analytics 원칙 4종 확립)

---

## 2. Do — Phase A/B/C 변경 사항

### Phase A — Glossary 신규 12 엔트리

`src/lib/metrics/glossary-portfolio.ts` (291 → 595 LOC, +304):

| ID | 카테고리 | 핵심 |
|---|---|---|
| `bcg_total_sales` | KPI | Σ 4 segment 매출 (필터 적용 후) |
| `bcg_total_op_profit` | KPI | Σ 4 segment 영업이익, 가중 마진율 산식 명시 |
| `bcg_x_axis_sales` | 축 | 품목별 매출 합 = Σ 월별 매출 (필터 적용 후) |
| `bcg_y_axis_margin` | 축 | 영업이익율 ÷ 매출 × 100, 클램핑 [-50,100] 이유 |
| `bcg_ref_line_sales` | 임계선 | Median/P75/평균 모드별 산식, segment 의존성 |
| `bcg_ref_line_margin` | 임계선 | Median/가중/0% 모드별 산식 |
| `bcg_excluded_zero_sales` | 데이터 품질 | 매출≤0 제외, 월별 concat 30~70% 정상 범위 |
| `bcg_excluded_returns` | 데이터 품질 | 매출유형='반품' 분리 카운트 |
| `bcg_insufficient_data` | 데이터 품질 | monthCount<6, Dynamic 미적용 |
| `bcg_outlier_clamping` | 데이터 품질 | \|마진\|>100% 식별, contextBranch 10건+ trigger |
| `bcg_missing_cost` | 원가 경고 | sales>0 AND cost=0 AND margin≥90%, contextBranch 1건+ trigger |
| `bcg_negative_cost` | 원가 경고 | cost<0 자동 제외, v2 reconciliation 보존, contextBranch trigger |

**3-단계 pedagogy 일관 적용**:
- beginner: 비유 + 60자 이내 (수식·약어 금지)
- intermediate: 산식 + 실무 판독 + 임계
- expert: 데이터 출처 + 코드 라인 + edge case + 통계/회계 주의사항

**3 contextBranches** (현재 값 기반 동적 actionable warning):
- `bcg_outlier_clamping` ≥ 10건 → "임계/필터 점검 권장"
- `bcg_missing_cost` ≥ 1건 → "🚨 회계팀 알림 필요 — 미계상 원가 분개 검토"
- `bcg_negative_cost` ≥ 1건 → "🚨 회계팀 알림 필요 — 환입·조정 분개 검토"

### Phase B — KpiBox 타입 확장

`PortfolioMatrixTab.tsx:200`:
```ts
metricId?: "bcg_weighted_margin" | "bcg_arithmetic_margin" | "bcg_pareto_80"
         | "bcg_dynamic_arrow" | "bcg_segment_4way"
         // v3:
         | "bcg_total_sales" | "bcg_total_op_profit";
```

### Phase C — UI 통합 12 위치

`PortfolioMatrixTab.tsx` (547 → 607 LOC, +60 + 26 modified):

| Phase | 위치 | 변경 | Variant |
|---|---|---|---|
| C1 | 정보 바 (line 142~) | 0매출/반품/거래월 3 span에 ⓘ 추가 | inline |
| C2 | outlier 경고 (line 154~) | currentValue+contextBranch | compact |
| C3 | 원가 미계상 경고 (line 159~) | currentValue+contextBranch | compact |
| C4 | 음수 원가 v2 박스 (line 164~) | 우상단 ⓘ 추가, 본문 reconciliation 보존 | heavy |
| C5 | 총매출/총이익 KPI (line 119~121) | metricId prop 주입 | inline (KpiBox auto) |
| C6 | 차트 위 chip row | **신규 row** — X 임계선·Y 임계선 + 값 + 2 ⓘ | inline |
| C7 | C6 row 좌측 끝 | X축·Y축 라벨 + 2 ⓘ (chip row 1줄에 4 ⓘ 통합) | inline |
| C8 | ChartCard action slot | segment_4way 개념 ⓘ | inline |
| C9 | segment footer outlier (line 491~) | 인라인 ⓘ 추가 | inline |
| C10 | segment footer 미계상 (line 497~) | 인라인 ⓘ 추가 | inline |
| C11 | Top 5 mini-legend (단일) | Pareto Top 20% ⓘ 1번 | inline |
| C12 | Top 5 mini-legend (단일) | 추세 ↗→↘ ⓘ 1번 (cell마다 X) | inline |

**Recharts 한계 우회 (C6/C7)**: Recharts XAxis/YAxis `label` prop은 string만 허용, React 컴포넌트 불가. 따라서 ChartContainer 직전에 별도 `<div>` row 추가 — text-[10px] + flex-wrap, 차트 면적 침범 최소.

**ChartCard `action` slot 활용 (C8)**: ChartCard는 title이 string-only이지만 `action?: ReactNode` prop을 우상단에 렌더. 별도 외부 row 없이 segment_4way ⓘ 자연스럽게 배치.

---

## 3. Check — Match Rate 100%

| 항목 | 베이스 (v2) | v3 최종 | 검증 |
|---|---|---|---|
| Glossary entries | 13 | **25** (+12) | `import` 검증 |
| MetricInfo 통합 위치 | ~5 | **17** (+12) | 코드 grep |
| 단위 테스트 | 41/41 | **41/41** (변경 없음 — 알고리즘 무변경) | `npm test` |
| 전체 테스트 | 517/517 | **517/517** | `npm test` |
| 빌드 errors | 0 | **0** | `npm run build` |
| TypeScript 신규 에러 | — | **0** (KpiBox union 확장 깨끗) | `tsc --noEmit` |
| ContextBranch 자동 경고 | 1건 (arithmetic) | **4건** (+3) | code review |
| 사용자 결정 반영 | — | **3/3** | plan vs commit |

**Match Rate 100%** — 사용자 결정 3건 모두 반영, 회귀 0, 알고리즘 무변경 확인.

---

## 4. Act — 운영 학습 (v2 원칙 확장)

본 v3 사이클에서 도출된 추가 원칙:

### 원칙 5: Progressive Disclosure 3-layer mandate
- 모든 분석 지표는 beginner(비유)/intermediate(산식)/expert(출처+edge case) 3-layer 필수
- beginner는 수식·영어 약어 금지 — 일상 비유 1개 + 60자 이내
- expert는 코드 라인까지 구체적으로 (e.g., "productPortfolioMatrix.ts:340-347")

### 원칙 6: Recharts 라이브러리 한계는 컴포넌트 API로 우회
- Recharts XAxis/YAxis label은 React 미수용 → 차트 위 chip row 별도 div
- ReferenceLine hover 불가 → 동일 chip row에 임계선 값 + ⓘ 명시
- ChartCard `action` slot 활용 → title 제약 우회

### 원칙 7: contextBranches로 actionable signal 강화
- 정적 텍스트 대신 currentValue 기반 동적 메시지
- 임계 트리거 (예: outlier ≥10건, missing cost ≥1건) 시 자동 경고 노출
- 사용자 hover 시 즉시 actionable signal 인식 — 별도 분석 불필요

### 원칙 8: 시각적 노이즈 최소화 (사용자 결정 우선)
- cell마다 ⓘ 추가하면 차트 가독성 ↓ — Top 5 헤더에 1번만 (사용자 선택)
- 사용자 결정 사항은 plan 단계에서 AskUserQuestion으로 명확화

---

## 5. 파일 변경 통계 (v2 → v3)

```
glossary-portfolio.ts                +304 LOC (291 → 595, 13 → 25 entries)
PortfolioMatrixTab.tsx                +60 LOC, ~26 modified (547 → 607)
─────────────────────────────────────────
Total                              +378 LOC, 2 files, 1 commit
```

| Commit | 단위 | 전체 | 핵심 |
|---|---|---|---|
| `3a187ba` | 41/41 | **517/517** | 12 신규 glossary + 12 UI 통합 |

---

## 6. Dev 검증 체크리스트 (사용자 manual)

> 본 보고서는 plan 단계에서 정의된 D3 체크리스트를 그대로 옮김. dev 서버에서 hover/click 동작을 사용자가 직접 확인.

```bash
npm run dev
# /dashboard/profitability → 포트폴리오 매트릭스 탭
```

- [ ] **KPI 카드 4종 hover** — 4 ⓘ 모두 hover/click 동작 (총매출, 총이익, 가중, 산술)
- [ ] **데이터 품질 정보 바** 3 ⓘ (0매출, 반품, 거래월) hover → 산식·임계 표시
- [ ] **outlier 경고 ⓘ** click → 초/중/전 탭 전환 / contextBranch (10건+ 시) 자동 메시지
- [ ] **원가 미계상 ⓘ** + **음수 원가 ⓘ** → v2 3-way reconciliation 보존 + contextBranch 알림
- [ ] **4 ScatterChart 각각 chip row** 표시 — X축·Y축·X 임계선·Y 임계선 4 ⓘ
- [ ] **임계 모드 변경** (Median→P75→평균) 시 chip row 값 갱신 + ⓘ 텍스트는 모드 모두 설명
- [ ] **segment 카드 우상단 ⓘ** (segment_4way) → 제품/상품 × 내수/해외 정의
- [ ] **차트 footer 경고** (outlier, 미계상) ⓘ — segment 단위 컨텍스트
- [ ] **Top 5 mini-legend** ⓘ (Pareto, 추세) — cell마다 X, 헤더 1번만 ✓ (사용자 결정 반영)
- [ ] **beginner 모드 토글** (`uiStore.beginnerMode`) ON 시 lg+ 화면에서 인라인 💡 hint 표시
- [ ] **다크 모드**에서 모든 ⓘ 가시성 정상

---

## 7. 다음 단계 제안

| 우선순위 | 항목 | 트리거 |
|---|---|---|
| P1 | Dev hover 회귀 검증 (위 체크리스트 11건) | 즉시 — 사용자 manual |
| P2 | v2 + v3 통합 archive (`product-portfolio-matrix-v2-v3` 또는 segment archive) | 회귀 통과 후 |
| P3 | Defensive Analytics + Progressive Disclosure 원칙을 다른 분석 모듈 적용 (offsetEffect, profitRiskMatrix, customerItemMargin) | 운영 1주 후 |
| P4 | 423 KpiCard inline formula 자동 추출 → glossary 이관 (Phase 4+) | 별도 사이클 |
| P5 | Tooltip hover 텔레메트리 (어느 ⓘ가 가장 자주 열리는지) | 운영 1개월 후 |

---

## 8. v2 ↔ v3 비교

| 차원 | v2 | v3 |
|---|---|---|
| 트리거 | 사용자 dev 검증 → 4 micro-iteration (수치 정확성) | 사용자 1회 피드백 → Plan-mode 1회 cycle (교육성) |
| 변경 범위 | 알고리즘 + UI (Defensive Analytics) | UI/표현 계층만 (Progressive Disclosure) |
| 핵심 원칙 | 데이터 anomaly 자동 제외 (수학≠비즈니스) | 산식·해석·기준 명문화 (3-layer pedagogy) |
| 신규 코드 | +833 LOC (4 commits) | +378 LOC (1 commit) |
| 테스트 변화 | 505→517 (+12 신규) | 517→517 (변경 없음) |
| 사용자 의문 | 4건 (215% 등 수치) | 1건 (전체 툴팁 부실) |
| Match Rate | 100% (수학/회계/비즈니스 reconciliation) | 100% (12/12 위치 + 사용자 3 결정 반영) |

---

> 검증 명령: `npm test && npm run build` → 517/517 + 0 errors ✓
> 마지막 commit: `3a187ba` (2026-05-07)
> 베이스 보고서: [`product-portfolio-matrix-v2.report.md`](./product-portfolio-matrix-v2.report.md)
> Plan 문서: `C:/Users/rcnd/.claude/plans/structured-soaring-coral.md`
