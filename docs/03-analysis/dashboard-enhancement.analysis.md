# Design-Implementation Gap Analysis: dashboard-enhancement

> **Created**: 2026-03-23
> **Status**: Approved
> **Feature**: dashboard-enhancement
> **Match Rate**: 90% (18/20 items)

---

## Overall Scores

| Phase | Score | Status |
|-------|:-----:|:------:|
| P1: 성능 최적화 (LazyTab + 메모이제이션) | 100% | ✅ |
| P2: 엑셀 파서 정밀화 | 95% | ✅ |
| P3: 에러 가시화 + 타입 안전성 | 100% | ✅ |
| P4: 미활용 모듈 활성화 (LOW) | 50% | ⚠️ |
| **Overall** | **90%** | **✅** |

---

## Phase 1: 성능 최적화 (100%)

| # | Item | Status | Evidence |
|---|------|:------:|----------|
| D1-1 | LazyTabContent 래퍼 컴포넌트 | ✅ | `LazyTabContent.tsx` — Suspense + KpiSkeleton fallback |
| D1-2 | Sales 16탭 React.lazy | ✅ | 15개 lazy import + Suspense 래핑 |
| D1-2 | Profitability 19탭 React.lazy | ✅ | 20개 lazy import + Suspense 래핑 |
| D1-2 | Receivables 9탭 React.lazy | ✅ | 9개 lazy import + Suspense 래핑 |
| D1-2 | Orders 7탭 React.lazy | ✅ | 7개 lazy import + Suspense 래핑 |
| D1-2 | Profiles 5탭 React.lazy | ✅ | 5개 lazy import + Suspense 래핑 |
| D1-3 | GlobalFilterBar useCallback | ✅ | 7개 핸들러 (설계 4개 초과 달성) |

---

## Phase 2: 엑셀 파서 정밀화 (95%)

| # | Item | Status | Evidence |
|---|------|:------:|----------|
| D2-1 | Aging 합계 교차 검증 | ✅ | month1-overdue 장부금액 합산 vs 합계.장부금액 비교, 1원 오차 허용 |
| D2-2 | as any 제거 (parser) | ⚠️ | 9→6 (mergeMultiLevelRecords 내 구조적 한계) |
| D2-2 | as any 제거 (FileUploader) | ✅ | 15→0 — 모든 구체적 타입 적용 |
| D2-3 | numOrNull 함수 | ✅ | eslint-disable로 예비 함수 보존 |
| D2-4 | 빈 파일/컬럼 검증 강화 | ✅ | 3곳 모두 dataRowCount 체크 |
| D2-5 | unmergeSheet 빈 원본 경고 | ✅ | emptyMergeCount 추적 + 경고 |
| D2-6 | 월 형식 시맨틱 검증 | ✅ | 01-12 범위 검증 |
| D2-7 | as any → Record<string,unknown> | ✅ | 3곳 변환 완료 |

---

## Phase 3: 에러 가시화 (100%)

| # | Item | Status | Evidence |
|---|------|:------:|----------|
| D3-1 | IndexedDB 에러 세션 1회 경고 | ✅ | handleDbSaveError 헬퍼, dbSaveErrorNotified 플래그 |
| D3-2 | 파서 경고 UI 표시 | ✅ | 기존 warnings.map() 정상 동작 확인 |
| D3-3 | FileUploader 타입 단언 구체화 | ✅ | 14개 as any[] → 구체적 타입 |
| D3-4 | "replaced" 상태 타입 추가 | ✅ | types/index.ts UploadedFile.status 유니온 |

---

## Phase 4: 미활용 모듈 활성화 (50%)

| # | Item | Status | Evidence |
|---|------|:------:|----------|
| D4-1 | salesProcess.ts 탭 연결 | ❌ | LOW 우선순위로 미구현 |
| D4-2 | calcOrgScorecard 활성화 | ✅ | calcOrgScorecards로 이미 활용 중 |

---

## 빌드 검증

| 항목 | 결과 |
|------|------|
| `npm run build` | 0 errors, 0 warnings |
| Orders First Load JS | 298 kB (lazy 효과) |
| Receivables First Load JS | 300 kB |
| Profiles First Load JS | 327 kB |
| Profitability First Load JS | 369 kB |

---

## 미해결 항목 (2건)

| 항목 | 사유 | 우선순위 | 권장 조치 |
|------|------|---------|----------|
| parser.ts `as any` 6건 잔존 | mergeMultiLevelRecords 동적 프로퍼티 접근 | LOW | 구조적 리팩토링 필요, 현재 런타임 위험 없음 |
| salesProcess.ts 미연결 | 설계 시 LOW 우선순위 | LOW | 향후 별도 feature로 진행 |
