# Plan Plus: 인프라 대시보드 종합 개선 (Phase 5+)

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | 인프라 대시보드 종합 개선 (분석 + UI + 성능) |
| 시작일 | 2026-03-27 |
| 예상 범위 | 55개 분석 모듈 + 64개 페이지/탭 파일 |
| 접근 방식 | 병렬 에이전트 감사 → 우선순위 수정 → 빌드 검증 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 55개 분석 모듈과 64개 UI 파일에 계산 오류, UI 불일치, 성능 이슈가 산재. 체계적 감사 없이 개별 수정만 반복 |
| **Solution** | 3개 전문 에이전트 병렬 감사(분석/UI/성능) → 우선순위 분류 → 체계적 수정 → 빌드 검증 |
| **Function UX Effect** | 정확한 KPI 수치, 일관된 차트 스타일, 빠른 페이지 응답으로 경영진 의사결정 신뢰도 향상 |
| **Core Value** | 데이터 정확성 보장 + 사용자 경험 통일 + 성능 안정성 확보 |

---

## 1. User Intent Discovery

### Core Problem
- 55개 분석 모듈과 64개 UI 파일이 Phase 8까지 누적 개발되면서 계산 오류, UI 불일치, 성능 이슈가 산재
- 개별 수정이 아닌 체계적 감사를 통한 종합 품질 향상 필요

### Target Users
- 인프라 사업본부 경영진 (대시보드 최종 사용자)
- 데이터 분석 담당자 (Excel 업로드 및 분석 활용)

### Success Criteria
1. `npm run build` 에러 0개
2. 분석 계산 오류 0개 (NaN/Infinity/잘못된 비율 계산 없음)
3. UI 일관성 확보 (차트 스타일, 컬러, 레이아웃 통일)
4. 성능 최적화 (불필요한 리렌더링 제거, useMemo 최적화)

---

## 2. Alternatives Explored

### A. 병렬 에이전트 감사 → 우선순위 수정 ✅ (Selected)
- 3개 전문 에이전트(분석/UI/빌드+성능) 병렬 감사
- 발견 문제를 Critical/High/Medium/Low로 분류
- 우선순위순 수정 → 빌드 검증
- **선택 이유**: 빠른 발견, 누락 최소화, 사용자가 우선순위 확인 가능

### B. 페이지별 순차 개선
- 한 페이지씩 분석+UI 동시 개선
- 크로스커팅 이슈 발견이 늦음

### C. 레이어별 Bottom-up
- 분석 모듈 → 공통 컴포넌트 → 페이지 UI
- UI 결과 확인이 늦음

---

## 3. YAGNI Review

### In Scope (1차)
- [x] 분석 계산 오류 수정 (NaN, Infinity, 집계 누락, 비율 오류)
- [x] UI 가독성/일관성 개선 (차트 색상, 툴팁, 레이아웃, 다크모드)
- [x] 성능 최적화 (useMemo, 리렌더링, 대량 데이터 처리)

### Out of Scope (다음 사이클)
- [ ] 새 분석 모듈 추가 (기존 55개 모듈 품질 우선)
- [ ] 대시보드 구조 변경 (페이지/탭 재구성)
- [ ] 새 Excel 파일 타입 추가

---

## 4. Implementation Plan

### Phase 1: 병렬 감사 (3 에이전트)

#### Agent A: 분석 로직 감사
- **대상**: `src/lib/analysis/` 55개 모듈
- **검사 항목**:
  - NaN/Infinity 방어 (safeDivide, safeFixed 사용 여부)
  - 집계 함수 정확성 (월별 concat 데이터 aggregation)
  - 비율 계산 정확성 (분모 0 방어)
  - 빈 데이터/엣지 케이스 처리
  - COST_CATEGORIES vs COST_CATEGORIES_WITH_SUBTOTAL 오용

#### Agent B: UI/UX 감사
- **대상**: `src/app/dashboard/` 64개 파일
- **검사 항목**:
  - 차트 색상/스타일 일관성 (CHART_COLORS, TOOLTIP_STYLE)
  - 다크모드 대응 누락
  - 반응형 레이아웃 깨짐
  - EmptyState/LoadingSkeleton 누락
  - ErrorBoundary 미적용
  - 한국어 UI 텍스트 일관성

#### Agent C: 빌드 + 성능 감사
- **대상**: 전체 프로젝트
- **검사 항목**:
  - `npm run build` 에러/경고
  - TypeScript 타입 에러
  - useMemo 의존성 배열 오류
  - 불필요한 리렌더링 패턴
  - 대량 데이터 처리 병목

### Phase 2: 결과 통합 및 우선순위 분류

| 우선순위 | 기준 | 예시 |
|----------|------|------|
| Critical | 빌드 실패, 데이터 부정확 | NaN 표시, 잘못된 합계 |
| High | 사용성 저해 | 깨진 레이아웃, 누락된 에러 처리 |
| Medium | 일관성/품질 | 스타일 불일치, 미사용 코드 |
| Low | 개선 사항 | 성능 미세 최적화 |

### Phase 3: 수정 실행
- Critical + High → 즉시 수정
- Medium → 일괄 수정
- Low → 기록만 (다음 사이클)

### Phase 4: 검증
- `npm run build` 통과
- 수정 항목별 before/after 확인
- 빌드 성공 증거 제시

---

## 5. Brainstorming Log

| Phase | Decision | Rationale |
|-------|----------|-----------|
| Intent | 분석 + UI 모두 개선 | 데이터 정확성과 사용자 경험 동시 확보 |
| Scope | 전체 감사 → 문제 발견 → 우선순위 결정 | 체계적 접근으로 누락 방지 |
| Success | 종합 품질 (빌드 + 정확성 + UI) | 부분 개선이 아닌 전방위 품질 확보 |
| Approach | 병렬 에이전트 감사 | 빠른 발견, 전문 영역별 깊이 |
| YAGNI | 신규 모듈 제외 | 기존 55개 모듈 품질 우선 |

---

## 6. Technical Notes

### 알려진 제약사항 (from CLAUDE.md)
- Map 순회: `Array.from(map.entries())` 필수
- Recharts tooltip: `(v: any, name: any)` 타입
- Pie label: `(props: any)` 타입
- COST_CATEGORIES (17개) vs COST_CATEGORIES_WITH_SUBTOTAL (18개) 구분 필수
- monthlyStrategy "concat" 파일: 반드시 `filterByMonth()` + aggregate 함수 적용

### 에이전트 구성
- `dashboard-analysis-auditor`: 분석 계산 정확성 감사
- `dashboard-ui-enhancer` (Explore agent): UI/UX 일관성 감사
- `build-validator` (Bash): 빌드+성능 검증

---

## 7. Next Steps

```
✅ Plan Plus 완료
📄 Document: docs/01-plan/features/dashboard-improvement-phase5.plan.md
➡️ Next: 병렬 에이전트 감사 실행
```
