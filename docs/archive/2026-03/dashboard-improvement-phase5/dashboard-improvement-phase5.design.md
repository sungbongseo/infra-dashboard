# Design: 인프라 대시보드 종합 개선 (Phase 5+)

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | 인프라 대시보드 종합 개선 |
| Plan 참조 | docs/01-plan/features/dashboard-improvement-phase5.plan.md |
| 감사 대상 | 55개 분석 모듈 (15,994줄) + 64개 UI 파일 |
| 접근 | 3-에이전트 병렬 감사 → 우선순위 수정 → 빌드 검증 |

---

## 1. 현재 상태 기준선 (Phase 0 탐색 결과)

### 1.1 빌드 상태
- **빌드**: ✅ 성공
- **경고 2개**:
  - `useMemo` 누락 의존성: `cccAnalysis.hasDIO` (receivables/DsoTab)
  - 미사용 변수: `TC_PAD_ZERO`

### 1.2 분석 모듈 패턴 현황
| 지표 | 수치 | 비고 |
|------|------|------|
| 전체 분석 모듈 | 55개 | src/lib/analysis/ |
| safeDivide 사용 | 48개 (270회) | 대부분 적용 |
| safeDivide 미사용 | 7개 | ⚠️ 감사 필요 |
| 일반 나눗셈 패턴 | 31개 (126회) | 잠재적 NaN/Infinity |

### 1.3 UI 패턴 현황
| 지표 | 수치 / 전체 | 비고 |
|------|-------------|------|
| CHART_COLORS 사용 | 51 / 64 | 13개 미사용 ⚠️ |
| TOOLTIP_STYLE 사용 | 54 / 64 | 10개 미사용 ⚠️ |
| ErrorBoundary 적용 | 13 / 64 | 51개 미적용 ⚠️ (탭은 부모에서 감싸는 패턴) |
| EmptyState 사용 | 38 / 64 | 26개 미사용 ⚠️ |
| LoadingSkeleton 사용 | 6 / 64 | 페이지 단위만 적용 (정상) |
| 하드코딩 색상 | 15개 파일 (63회) | CHART_COLORS로 교체 필요 |

---

## 2. 감사 기준 (Audit Criteria)

### 2.1 분석 로직 감사 (Agent A: dashboard-analysis-auditor)

#### Critical (즉시 수정)
| ID | 항목 | 기준 | 검사 방법 |
|----|------|------|-----------|
| A-C1 | NaN/Infinity 출력 | 어떤 입력에서도 NaN/Infinity가 UI에 표시되면 안됨 | safeDivide 미사용 나눗셈 전수조사 |
| A-C2 | 집계 누락 | monthlyStrategy "concat" 파일에서 aggregate 함수 미적용 | filterByMonth + aggregate 패턴 확인 |
| A-C3 | 이중 카운팅 | COST_CATEGORIES_WITH_SUBTOTAL 로 합산하면 이중 집계 | COST_CATEGORIES 사용 확인 |

#### High (24시간 내 수정)
| ID | 항목 | 기준 | 검사 방법 |
|----|------|------|-----------|
| A-H1 | 비율 계산 오류 | 분모 0일 때 0 또는 null 반환 | 직접 나눗셈 패턴 전수조사 |
| A-H2 | 빈 배열 처리 | 데이터 없을 때 에러 대신 빈 결과 | .length === 0 체크 |
| A-H3 | 음수 처리 | 금액 음수가 비율/차트에 영향 | Math.abs 필요 여부 |

#### Medium (일괄 수정)
| ID | 항목 | 기준 | 검사 방법 |
|----|------|------|-----------|
| A-M1 | safeFixed 미사용 | UI에 표시되는 소수점이 15자리 | toFixed 대신 safeFixed |
| A-M2 | 타입 안전성 | any 타입 남용 | 명시적 타입 확인 |

### 2.2 UI/UX 감사 (Agent B: Explore)

#### Critical
| ID | 항목 | 기준 | 검사 방법 |
|----|------|------|-----------|
| B-C1 | 차트 에러 | 데이터 로드 시 화면 깨짐 | ErrorBoundary 유무 확인 |

#### High
| ID | 항목 | 기준 | 검사 방법 |
|----|------|------|-----------|
| B-H1 | 하드코딩 색상 | `#xxx` 직접 사용 (15파일 63회) | CHART_COLORS 교체 |
| B-H2 | TOOLTIP_STYLE 미적용 | 10개 파일 Recharts 커스텀 tooltip | TOOLTIP_STYLE 통일 |
| B-H3 | EmptyState 누락 | 데이터 없을 때 빈 화면 | 26개 파일 추가 필요 |

#### Medium
| ID | 항목 | 기준 | 검사 방법 |
|----|------|------|-----------|
| B-M1 | 다크모드 미대응 | dark: 클래스 누락 | 배경/텍스트 색상 확인 |
| B-M2 | 반응형 깨짐 | 모바일에서 차트 잘림 | 그리드/flex 확인 |
| B-M3 | 한국어 텍스트 일관성 | 용어 불통일 | 동일 개념 다른 표현 |

### 2.3 빌드 + 성능 감사 (Agent C: Bash)

#### Critical
| ID | 항목 | 기준 | 검사 방법 |
|----|------|------|-----------|
| C-C1 | 빌드 에러 | npm run build 실패 | 빌드 실행 |
| C-C2 | TypeScript 에러 | 타입 불일치 | tsc --noEmit |

#### High
| ID | 항목 | 기준 | 검사 방법 |
|----|------|------|-----------|
| C-H1 | useMemo 의존성 | 누락/과잉 의존성 | ESLint exhaustive-deps |
| C-H2 | 미사용 변수/import | dead code | ESLint no-unused-vars |

#### Medium
| ID | 항목 | 기준 | 검사 방법 |
|----|------|------|-----------|
| C-M1 | 번들 크기 | 페이지별 First Load JS > 500KB | 빌드 출력 확인 |
| C-M2 | 불필요한 리렌더링 | store 전체 구독 | 개별 selector 확인 |

---

## 3. 에이전트 실행 전략

### 3.1 병렬 실행 구성

```
┌─────────────────────────────────────────────────┐
│           Phase 1: 병렬 감사 (동시 실행)           │
├─────────────────┬───────────────┬───────────────┤
│ Agent A         │ Agent B       │ Agent C       │
│ 분석 로직 감사   │ UI/UX 감사    │ 빌드+성능 감사 │
│                 │               │               │
│ - 55 모듈 스캔  │ - 64 파일 스캔│ - npm build   │
│ - NaN/Infinity  │ - 하드코딩 색상│ - tsc check   │
│ - 집계 누락     │ - EmptyState  │ - useMemo     │
│ - 비율 계산     │ - 다크모드    │ - 미사용 코드  │
├─────────────────┴───────────────┴───────────────┤
│           Phase 2: 결과 통합                       │
│ - 3개 감사 결과 → 통합 이슈 목록                    │
│ - Critical/High/Medium/Low 우선순위 분류           │
│ - 사용자 확인 후 수정 범위 결정                     │
├─────────────────────────────────────────────────┤
│           Phase 3: 수정 실행                       │
│ - Critical → High → Medium 순서                   │
│ - 파일별 일괄 수정 (같은 파일 여러 이슈 동시)       │
├─────────────────────────────────────────────────┤
│           Phase 4: 검증                            │
│ - npm run build (0 errors, 0 warnings 목표)       │
│ - 수정 항목별 before/after                         │
└─────────────────────────────────────────────────┘
```

### 3.2 에이전트별 프롬프트 설계

#### Agent A: dashboard-analysis-auditor
```
대상: src/lib/analysis/ 55개 모듈 전체
목표: 계산 정확성 감사
체크리스트:
1. safeDivide 미사용 나눗셈 → NaN/Infinity 리스크
2. monthlyStrategy "concat" 데이터 aggregate 함수 적용 여부
3. COST_CATEGORIES vs COST_CATEGORIES_WITH_SUBTOTAL 오용
4. 빈 배열/null 입력 방어
5. 비율 계산 시 분모 0 체크
출력: 파일명, 줄번호, 이슈 유형, 심각도
```

#### Agent B: UI/UX Auditor (Explore)
```
대상: src/app/dashboard/ 64개 파일
목표: UI 일관성 및 사용성 감사
체크리스트:
1. 하드코딩 색상 (#xxx) → CHART_COLORS 교체 목록
2. TOOLTIP_STYLE 미적용 Recharts tooltip
3. EmptyState 미사용 탭 (데이터 없을 때 빈 화면)
4. 다크모드 dark: 클래스 누락
5. Recharts tooltip formatter 타입 (v: any, name: any)
출력: 파일명, 줄번호, 이슈 유형, 심각도
```

#### Agent C: Build + Performance
```
대상: 전체 프로젝트
목표: 빌드 안정성 및 성능 감사
체크리스트:
1. npm run build 에러/경고 전체 목록
2. useMemo 의존성 배열 경고
3. 미사용 변수/import
4. 번들 크기 (500KB 초과 페이지)
5. store 전체 구독 패턴
출력: 파일명, 이슈 유형, 심각도
```

---

## 4. 수정 우선순위 및 실행 순서

### Phase 3 수정 순서

| 순서 | 우선순위 | 이슈 유형 | 예상 작업량 |
|------|----------|-----------|-------------|
| 1 | Critical | NaN/Infinity 방어, 집계 누락, 이중 카운팅 | ~10 파일 |
| 2 | Critical | 빌드 에러/타입 에러 (현재 0) | 0 파일 |
| 3 | High | safeDivide 미사용 나눗셈 교체 | ~31 파일 |
| 4 | High | 하드코딩 색상 → CHART_COLORS | ~15 파일 |
| 5 | High | EmptyState 추가 | ~26 파일 |
| 6 | High | TOOLTIP_STYLE 통일 | ~10 파일 |
| 7 | Medium | useMemo 의존성, 미사용 코드 | ~5 파일 |
| 8 | Medium | 다크모드, 반응형 | 발견 시 |

### 수정 원칙
- **동일 파일 다중 이슈**: 한 번에 모두 수정 (파일 열기 최소화)
- **빌드 검증**: Critical/High 수정 후 중간 빌드, 최종 빌드
- **기존 패턴 준수**: 새 패턴 도입 금지, 기존 프로젝트 컨벤션 따름

---

## 5. 성공 기준 (Exit Criteria)

| 기준 | 목표 | 검증 방법 |
|------|------|-----------|
| 빌드 | 에러 0, 경고 0 | `npm run build` |
| NaN/Infinity | 0건 | safeDivide 전수 적용 확인 |
| 집계 누락 | 0건 | concat 파일 aggregate 패턴 확인 |
| 하드코딩 색상 | 0건 | `#xxx` 패턴 grep 0건 |
| EmptyState | 모든 탭 적용 | grep 확인 |
| TOOLTIP_STYLE | 모든 Recharts tooltip | grep 확인 |

---

## 6. 리스크 및 대응

| 리스크 | 확률 | 대응 |
|--------|------|------|
| 수정으로 기존 기능 깨짐 | 중 | 수정 후 즉시 빌드 검증 |
| 대량 파일 수정으로 컨텍스트 초과 | 중 | 에이전트 분할, 파일 단위 처리 |
| 감사에서 예상보다 많은 이슈 | 높 | Critical/High만 1차 수정, 나머지 Out of Scope |
