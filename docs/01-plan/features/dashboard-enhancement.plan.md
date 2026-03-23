# Dashboard Enhancement Plan

> **Feature**: dashboard-enhancement (대시보드 종합 개선)
> **Created**: 2026-03-23
> **Status**: Draft
> **Scope**: Performance, Data Accuracy, Error Visibility, Features (PC only)

---

## Executive Summary

| 관점 | 설명 |
|------|------|
| **Problem** | 55개 탭 정적 import(번들 2.5MB+), 엑셀 파서 Critical 이슈 3건(aging 합계 필드 교차, as any 타입 우회, 0/null 미구분), 44개 console.error/warn 미노출, 미활용 분석 모듈 3개 잔존 |
| **Solution** | 4단계 개선: P1(성능-LazyTab), P2(엑셀 파서 정밀화), P3(에러 가시화+데이터 품질), P4(미활용 모듈 활성화). 모바일/태블릿 제외(PC 전용) |
| **Function UX Effect** | 초기 로딩 300-400KB 절감, 모바일/태블릿 완전 지원, 파일 업로드 후 품질 리포트 제공, 영업 프로세스 KPI 탭 신규 |
| **Core Value** | "어디서든, 빠르게, 신뢰할 수 있게" — 디바이스 무관한 접근성 + 성능 + 데이터 품질 투명성 확보 |

---

## Phase 1: 성능 최적화 — LazyTab + 메모이제이션 (Priority: HIGH)

초기 번들 크기를 줄이고 불필요한 리렌더를 방지합니다.

### P1-1. React.lazy 탭 코드 스플리팅

| 페이지 | 현재 정적 import | LazyTab 전환 대상 |
|--------|-----------------|-----------------|
| Sales | 16개 탭 | 전체 16개 |
| Profitability | 19개 탭 | 전체 19개 |
| Receivables | 9개 탭 | 전체 9개 |
| Orders | 7개 탭 | 전체 7개 |
| Profiles | 5개 탭 | 전체 5개 |

**구현 방식**:
```tsx
// LazyTabContent wrapper 생성
const LazyTabContent = ({ component, ...props }) => (
  <Suspense fallback={<LoadingSkeleton />}>
    <Component {...props} />
  </Suspense>
);

// 각 페이지에서 적용
const CustomerTab = React.lazy(() => import('./tabs/CustomerTab'));
```

**파일 변경**:
- `src/app/dashboard/sales/page.tsx` — 16개 import → React.lazy
- `src/app/dashboard/profitability/page.tsx` — 19개 import → React.lazy
- `src/app/dashboard/receivables/page.tsx` — 9개 import → React.lazy
- `src/app/dashboard/orders/page.tsx` — 7개 import → React.lazy
- `src/app/dashboard/profiles/page.tsx` — 5개 import → React.lazy

**예상 효과**: 초기 번들 300-400KB 절감, 탭 전환 시 on-demand 로딩

### P1-2. useCallback 메모이제이션

| 파일 | 대상 함수 | 이유 |
|------|----------|------|
| `GlobalFilterBar.tsx` | handleOrgToggle, handleCustToggle, handleSelectAllOrgs 등 | 매 렌더마다 재생성, 자식 Popover 불필요 리렌더 |
| `FileUploader.tsx` | onDrop, handleFileChange | 대용량 파일 처리 시 성능 |

### P1-3. Map 이터레이션 메모이제이션

- `layout.tsx`, `data/page.tsx`의 `Array.from(receivableAging.values())` 반복 호출을 `useMemo`로 감싸기

---

## Phase 2: 반응형 UI + 레이아웃 개선 (Priority: MEDIUM-HIGH)

모바일/태블릿에서도 사용 가능한 대시보드로 전환합니다.

### P2-1. 모달 반응형

| 컴포넌트 | 현재 | 개선 |
|----------|------|------|
| Customer360Modal | `max-w-4xl` 고정 | `max-w-[calc(100vw-2rem)] md:max-w-4xl` |
| AlertPanel | `w-80 max-h-72` 고정 | `w-full sm:w-80` + 반응형 max-height |

### P2-2. 사이드바 전환 애니메이션

- `layout.tsx`: inline style `marginLeft` → Tailwind transition 클래스
- `transition-all duration-300 ease-in-out` 적용
- 모바일에서 overlay sidebar로 전환

### P2-3. 차트 높이 반응형

- 전체 `ChartContainer height="h-48"` → `h-48 md:h-64 lg:h-80` 반응형
- 특히 Customer360Modal, Overview 페이지 차트

### P2-4. KpiCard 그리드 반응형

- `grid-cols-4` 고정 → `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`
- 모바일에서 2열, 태블릿 3열, 데스크탑 4열

---

## Phase 3: 에러 가시화 + 데이터 품질 (Priority: MEDIUM)

44개 숨겨진 경고/에러를 사용자에게 노출하고, 데이터 품질 리포트를 제공합니다.

### P3-1. IndexedDB 에러 사용자 알림

- `dataStore.ts`의 19개 IndexedDB 저장 실패 → toast 알림 전환
- 재시도 버튼 포함한 에러 UI

### P3-2. 파서 경고 통합 리포트

- `parser.ts`의 45개 warning을 구조화된 배열로 반환
- 파일 업로드 후 "데이터 품질 리포트" 모달/패널 표시
  - 머지 셀 해제 건수
  - NaN/극값 감지 건수
  - 중복 행 수
  - 필터 후 0건 경고

### P3-3. 타입 안전성 강화

| 파일 | 현재 | 개선 |
|------|------|------|
| `FileUploader.tsx` | `result.data as any[]` (15회) | 적절한 타입 가드 |
| `parser.ts` | `(bucket as any).장부금액` (33회) | 타입 내로잉 |
| `FileUploader.tsx:129` | `"replaced" as any` | `"replaced" as const` |

### P3-4. Infinity/NaN 가드 누락 33곳

- 가드 없는 나눗셈 33곳에 `isFinite()` 체크 추가
- `kpi.ts` 등 핵심 분석 모듈 우선

---

## Phase 4: 미활용 모듈 활성화 (Priority: LOW-MEDIUM)

이미 구현된 분석 모듈을 탭에 연결합니다.

### P4-1. salesProcess.ts 활성화

- `calcWinRate()`, `calcAvgSalesCycle()`, `calcSalesVelocity()` → Sales 페이지 신규 탭 또는 Overview KPI
- 현재: Overview에 KpiCard 3개만 사용, 전용 탭 없음

### P4-2. crossAnalysis.ts 완전 활용

- `calcOrgScorecard()` 미사용 → Sales OrgScorecardTab에 통합 또는 별도 탭

### P4-3. 미사용 console 정리

- 44개 console.error/warn 중 P3에서 UI 전환되지 않는 나머지를 제거 또는 structured logging으로 변환

---

## 작업 규모 요약

| Phase | 파일 수 | 예상 변경량 | 우선순위 |
|-------|---------|-----------|---------|
| P1: 성능 최적화 | ~8 | ~200줄 | HIGH |
| P2: 반응형 UI | ~15 | ~300줄 | MEDIUM-HIGH |
| P3: 에러 가시화 | ~10 | ~400줄 | MEDIUM |
| P4: 모듈 활성화 | ~5 | ~200줄 | LOW-MEDIUM |
| **합계** | **~38** | **~1,100줄** | |

---

## 리스크 및 제약

| 리스크 | 대응 |
|--------|------|
| LazyTab 전환 시 탭 간 데이터 전달 깨짐 | 부모에서 props 전달 패턴 유지, Suspense boundary 탭 단위 |
| 반응형 변환 시 기존 레이아웃 깨짐 | Phase별 빌드 검증, 브라우저 테스트 |
| console 제거 시 디버깅 어려움 | structured error 객체 + ErrorBoundary에서 수집 |

---

## 검증 기준

- [ ] `npm run build` 0 errors, 0 warnings
- [ ] 초기 번들 크기 300KB 이상 감소 (build output 비교)
- [ ] 모바일 뷰포트 (375px) 에서 모든 페이지 렌더링 확인
- [ ] 파일 업로드 후 경고/에러 시 사용자에게 알림 표시
- [ ] 미사용 console 문 0개

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-23 | Initial plan created |
