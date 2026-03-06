# Plan: dashboard-ux-perf — UX/성능 종합 개선

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Profitability 25탭 + Sales 15탭이 단일 TabsList에 나열되어 탐색 불가능. 모든 탭이 동시 마운트되어 53개 useMemo가 페이지 진입 시 즉시 실행. Customer360가 Sales에만 존재하여 다른 페이지에서 거래처 drill-through 불가. KpiCard sparkline gradient id 충돌. |
| **Solution** | 5단계 개선: (1) 즉시 수정 가능한 버그 4건 (2) TabGroup 2-level 네비게이션 + lazy mount (3) Customer360 글로벌 모달 + 차트 클릭 인터랙션 (4) 거래처 필터 연동 완성 + 알림 경로 개선 (5) 접근성 강화 + 모바일 반응형 |
| **Function UX Effect** | 탭 그룹화로 25탭→5그룹 직관 탐색, lazy mount로 초기 로드 50%+ 감소, 어느 페이지에서든 거래처 360도 뷰 즉시 접근, 차트 클릭→필터 연동으로 drill-down UX |
| **Core Value** | "찾을 수 없는 대시보드"에서 "3클릭 내 모든 인사이트 접근 가능한 대시보드"로 전환 |

---

## Phase 1: 즉시 수정 버그 4건 — 4파일, ~30줄

### 1-1. KpiCard sparkline gradient id 충돌 수정
- **파일**: `src/components/dashboard/KpiCard.tsx`
- **문제**: sparkline SVG gradient가 하드코딩된 id 사용 → 같은 페이지에 여러 KpiCard가 있으면 gradient 참조 충돌
- **수정**: `useId()` 훅으로 고유 id 생성 (~5줄)

### 1-2. ChartContainer minHeight 분기 로직 수정
- **파일**: `src/components/charts/index.tsx` (ChartContainer)
- **문제**: `minHeight >= 320` 분기로 className과 style이 상호 배타적 적용 → 둘 다 적용되어야 함
- **수정**: 항상 className(height) + style(minHeight) 동시 적용 (~3줄)

### 1-3. standardCostAnalysis.ts 미사용 모듈 정리
- **파일**: `src/lib/analysis/standardCostAnalysis.ts`
- **문제**: 프로젝트 전체에서 import 0건. StandardCostTab은 standardCostVariance.ts 사용
- **수정**: 삭제 또는 standardCostVariance.ts와 통합

### 1-4. GlobalFilterBar 컨트롤/뱃지 분리
- **파일**: `src/components/dashboard/GlobalFilterBar.tsx`
- **문제**: 필터 컨트롤과 활성 뱃지가 같은 줄에 혼재 → 다수 필터 활성 시 구분 어려움
- **수정**: 2-row 레이아웃 (컨트롤 / 뱃지) (~15줄)

---

## Phase 2: TabGroup 2-level 네비게이션 + Lazy Mount — 5파일, ~300줄

가장 큰 체감 개선. 25개 탭 → 5그룹 + 보이는 탭만 마운트.

### 2-1. `src/components/dashboard/TabGroup.tsx` (신규, ~80줄)
- 2-level 탭 구조: 상위 카테고리 pill + 하위 세부 탭
- 선택된 그룹의 탭만 표시
- 모바일에서 상위 카테고리는 드롭다운 전환

### 2-2. `src/components/dashboard/LazyTabContent.tsx` (신규, ~30줄)
- 최초 선택 시에만 마운트하는 lazy wrapper
- `useState` + `useEffect`로 한번 마운트 후 유지 (탭 전환 시 리렌더링만)
- Suspense fallback으로 LoadingSkeleton 표시

### 2-3. `src/app/dashboard/profitability/page.tsx` (수정, net -100줄)
- 25탭 → 5그룹:
  - 기본 분석 (5): 손익현황, 조직수익성, 팀원별공헌, 비용구조, 제품수익성
  - 계획 vs 실적 (4): 계획달성, 3-way차이, 수익성×리스크, 판관비세부
  - 거래처 분석 (5): 거래처손익, 거래처×품목, 상세수익, 거래처리스크, 계정유형
  - 원가 분석 (4): 품목원가, 원가차이, 표준원가, 손익분기
  - 시뮬레이션 (3): 시나리오, 민감도, 표준원가분석
- 부모 useMemo 중 특정 탭 전용 계산을 LazyTabContent 내부로 이동

### 2-4. `src/app/dashboard/sales/page.tsx` (수정)
- 15탭 → 3그룹:
  - 매출 분석 (5): 거래처, 품목, 유형별, 채널, 품목군
  - 고객 분석 (5): RFM, CLV, 거래처이동, 거래처360°, 코호트
  - 고급 분석 (5): FX, 이상치, 이탈예측, 시계열, 조직스코어카드

### 2-5. OrgScorecardTab 신규 (Sales 또는 Overview)
- `crossAnalysis.ts`의 `calcOrgScorecards()` 활용 (현재 미사용)
- 조직별 가중 점수 RadarChart + 랭킹 테이블

---

## Phase 3: Customer360 글로벌화 + 차트 인터랙션 — 4파일, ~250줄

### 3-1. `src/components/dashboard/Customer360Modal.tsx` (신규, ~150줄)
- Customer360Tab의 핵심 로직을 모달/시트 컴포넌트로 추출
- 거래처명을 prop으로 받아 즉시 360도 뷰 표시
- Radix Dialog 기반, 반응형 (모바일: 전체 화면 시트)

### 3-2. 차트 클릭 → 거래처 360도 모달 연동
- **파일**: 거래처 관련 차트가 있는 탭들 (profitability 거래처손익, receivables 미수금현황 등)
- Bar/Scatter 차트의 onClick → Customer360Modal 열기
- `uiStore`에 `customer360Target: string | null` 상태 추가

### 3-3. Overview 차트 클릭 → 필터 자동 적용 + 페이지 이동
- **파일**: `src/app/dashboard/page.tsx`
- 조직별 매출 Bar 클릭 → `setSelectedOrgs([orgName])` + `router.push("/dashboard/sales")`

### 3-4. alertStore.evaluate() 호출 위치 개선
- **파일**: `src/app/dashboard/layout.tsx` 또는 `src/components/layout/Header.tsx`
- 현재 Overview에서만 evaluate → Layout 레벨로 이동
- 데이터 변경 시 자동 evaluate

---

## Phase 4: 거래처 필터 완성 + 데이터 정합성 — 3파일, ~60줄

### 4-1. useFilteredData.ts 거래처 필터 확장
- `useFilteredOrgCustomerProfit()`: 매출거래처명 기준 필터
- `useFilteredHqCustomerItemProfit()`: 매출거래처명 기준 필터
- `useFilteredCustomerItemDetail()`: 거래처명 기준 필터

### 4-2. Profitability/Receivables 거래처 필터 적용
- orgCustomerProfit, customerItemDetail 사용하는 탭에 필터 연동
- 거래처 필터 미적용 탭에 "거래처 필터 미적용" 안내 배지

### 4-3. 필터 상태 안내 UI
- GlobalFilterBar에 활성 필터 요약 + 적용 범위 표시
- "매출/수주/수금 데이터에 적용됨" 안내 텍스트

---

## Phase 5: 접근성 + 모바일 반응형 — 5파일, ~150줄

### 5-1. ChartCard/KpiCard 접근성 강화
- ChartCard: `aria-label` + sr-only 텍스트 요약
- KpiCard: `role="status"` + aria-label
- 색상 전용 구분 차트에 패턴/범례 라벨 보강

### 5-2. disabled 탭 접근성 tooltip
- disabled TabsTrigger에 Tooltip 추가: 비활성화 이유 안내
- 스크린 리더 사용자 + 일반 사용자 모두 혜택

### 5-3. 모바일 반응형 보강
- `grid-cols-4` 직접 사용 → `grid-cols-2 lg:grid-cols-4` 통일
- 차트 높이 뷰포트 비례 조정
- TabGroup 모바일 드롭다운 (Phase 2와 연계)

### 5-4. 인라인 table → DataTable 통일
- sales/page.tsx 등 raw `<table>` 사용 → DataTable simple variant로 전환

---

## 전체 요약

| Phase | 테마 | 파일 | 현장 임팩트 | 의존성 |
|-------|------|------|-----------|--------|
| 1 | 즉시 버그 수정 | 4 | ★★★★ | 없음 |
| 2 | TabGroup + Lazy Mount | 5 | ★★★★★ | 없음 |
| 3 | Customer360 글로벌 + 인터랙션 | 4 | ★★★★ | 없음 |
| 4 | 거래처 필터 완성 | 3 | ★★★ | P2(부분) |
| 5 | 접근성 + 모바일 | 5 | ★★★ | P2 |

## 실행 순서

```
P1 (4파일, 30줄) → build → P2 (5파일, 300줄) → build → P3 (4파일, 250줄) → build → P4 (3파일, 60줄) → build → P5 (5파일, 150줄) → build
```

P1 독립 실행. P2 독립 실행. P3 독립 실행. P4는 P2 부분 의존. P5는 P2 의존.
