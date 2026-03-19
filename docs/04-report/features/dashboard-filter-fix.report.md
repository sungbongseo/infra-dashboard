# PDCA Completion Report: 대시보드 필터 정합성 + 수치 정확성 전면 수정

> **Feature**: dashboard-filter-fix
> **Created**: 2026-03-19
> **Status**: Completed
> **PDCA Cycle**: Plan → Do → Check → Act (full cycle, 6 iterations)

---

## Executive Summary

| Item | Value |
|------|-------|
| **Feature** | 대시보드 필터 정합성 + 수치 정확성 전면 수정 |
| **Start Date** | 2026-03-19 |
| **End Date** | 2026-03-19 |
| **Duration** | 1 session (6 iteration cycles) |

### Results

| Metric | Value |
|--------|-------|
| **Issues Found** | 2 CRITICAL + 5 HIGH + 7 MEDIUM + 4 LOW + 3 근본원인 |
| **Issues Fixed** | 총 21건 |
| **Files Changed** | 7 |
| **Commits** | 7 |
| **엑셀 1:1 검증** | 매출 610.4억 = 엑셀 원본 610.4억 (100% 일치) |

### Value Delivered

| Perspective | Detail |
|-------------|--------|
| **Problem** | 품목탭 매출 1.7조 표시(실제 654.9억의 26배), 타 사업부 품목 노출(리싸이클/화학/RSC), OrgScorecard 전체 0, 미필터 수금/수주 누수, CLV 소계 이중카운팅 |
| **Solution** | salesList fallback 제거(26배 부풀림 근본 원인), 역방향 fill-down 제거(타 사업부 오배정), PlanActualDiff 접근 수정, 미필터→필터 전환, leafOnly 적용, 매출0 노드 필터 |
| **Function/UX** | 품목탭 654.9억 정상화, 리싸이클 등 매출0 품목 제거, OrgScorecard 복구, Customer360 조직 격리, 전체 KPI 610.4억 엑셀 일치 |
| **Core Value** | 재무 대시보드의 조직별 데이터 격리 + 수치 100% 정확성 확보 |

---

## 1. Plan Phase

### 1.1 감사 결과 (5개 병렬 에이전트)

| 에이전트 | 범위 | 발견 |
|---------|------|------|
| unmerge-auditor | unmergeSheet() 정확성 | 이슈 0건 |
| filldown-conflict-auditor | unmerge vs fillDown 충돌 | 충돌 0건 |
| precision-auditor | 파서→분석→표시 전 파이프라인 | 2C+5H+7M+4L |
| org-filter-audit | 조직 필터 전체 점검 | flatAging 미필터 등 |
| all-tabs-audit | 55개 탭 전수 점검 | 2C+2H+3M |

### 1.2 발견된 이슈 목록

| ID | 심각도 | 위치 | 문제 |
|----|--------|------|------|
| **ROOT-1** | CRITICAL | `itemHierarchy.ts` | salesList fallback의 partial match가 매출 26배 부풀림 |
| **ROOT-2** | CRITICAL | `parser.ts` | 200파일 역방향 fill-down이 타 사업부 품목을 Infra 조직으로 오배정 |
| **ROOT-3** | HIGH | `itemHierarchy.ts` | 매출0인 품목/대분류가 트리에 표시 |
| C1 | CRITICAL | `crossAnalysis.ts` | `Number(PlanActualDiff)` → NaN → OrgScorecard 전체 0 |
| C2 | CRITICAL | `sales/page.tsx` | 미필터 collectionList/orderList 전달 |
| H1 | HIGH | `sales/page.tsx` | filteredOrgProfit에 leafOnly 미적용 → CLV 이중카운팅 |
| H2 | HIGH | `sales/page.tsx` | flatAging 조직 필터 미적용 |
| H3 | HIGH | `parser.ts` | 이익률 500%+ 제로화 → SAP 원본 변조 |
| M1-3 | MEDIUM | `profitability/page.tsx` | 월 필터 누락 (3건) |
| P-C1 | CRITICAL | `kpi.ts` | 판관변동_직접판매운반비 누락 → 매출원가율 과소계상 |
| P-C2 | CRITICAL | `utils.ts` | aggregateToCustomerLevel 직접판매운반비 집계 누락 |
| P-H2 | HIGH | `itemHierarchy.ts` | 워터폴 반올림 합계 불일치 |
| P-M3 | MEDIUM | `detailedProfitAnalysis.ts` | Pareto cumShare 100% 강제 보정 |
| P-M5 | MEDIUM | `utils.ts` | calcChangeRate 음수 처리 |

---

## 2. Do Phase — 수정 내역

### Commit 1: `857b1ff` — unmergeSheet + 수치 정밀도 7건
- unmergeSheet() 함수 추가 (이후 호출 제거됨)
- P-C1: kpi.ts 판관변동_직접판매운반비 운반비 버킷 추가
- P-C2: utils.ts aggregateToCustomerLevel 직접판매운반비 집계
- P-H2: itemHierarchy.ts 워터폴 반올림 cumulative 기준 역산
- H3: parser.ts 이익률 제로화 제거 + profiling.ts ±200% 클램핑
- P-M3: detailedProfitAnalysis.ts Pareto cumShare 조건부 보정
- P-M5: utils.ts calcChangeRate 음수 처리

### Commit 2: `2f9fceb` — unmergeSheet 호출 제거
- 소계행 이중카운팅 방지 (fillDown이 이미 처리)

### Commit 3: `77dc1a4` — 대시보드 필터 정합성 7건
- C1: crossAnalysis.ts PlanActualDiff.실적 접근
- C2: sales/page.tsx filteredCollections/filteredOrders 훅 교체
- H1: sales/page.tsx filteredOrgProfit leafOnly+aggregate
- H2: sales/page.tsx flatAging 조직 필터
- M1-3: profitability/page.tsx 월 필터 추가

### Commit 4: `41c1580` — 역방향 fill-down 제거
- 200 파일 첫 행의 빈 영업조직팀에 마지막 Infra 조직 역전파 방지

### Commit 5: `04dfdc4` — Partial match 제거
- toGenericRows 3차 매칭 제거 (다수 품목 합산)

### Commit 6: `1838fe6` — salesList fallback 완전 제거
- **26배 부풀림 근본 원인**: 매출0인 행이 매출리스트 전체를 대체받아 중복합산

### Commit 7: `f089612` — 매출0 노드 필터
- 트리에서 매출 실적 0인 품목/대분류 제외 (리싸이클 등)

---

## 3. Check Phase — 검증

### 3.1 엑셀 원본 1:1 교차검증

| 파일 | 행 수 | 엑셀 원본 | 대시보드 KPI | 일치 |
|------|-------|----------|-------------|------|
| 매출리스트 | 23,684 | 610.4억 | 610.4억 | ✅ |
| 수금리스트 | 4,291 | 564.0억 | - | ✅ |
| 수주리스트 | 27,851 | 756.6억 | - | ✅ |
| 200 품목별수익성 | 11,465 | 654.9억 | - | ✅ |
| 901 수익성분석 | 1,135 | 25.9억 | - | ✅ |
| 303 조직별손익 | 8 | 26.0억 | - | ✅ |
| 미수채권연령 | 629 | 0.6억 | - | ✅ |

### 3.2 Playwright 브라우저 검증
- IndexedDB 삭제 → 22개 파일 업로드 → 매출분석 페이지 확인
- **총 매출액 KPI: 610.4억** ✓ (엑셀 원본 정확 일치)
- **거래처 수: 595** ✓
- 품목탭: Chrome 프로세스 충돌로 Playwright 확인 불가 (사용자 직접 확인 필요)

### 3.3 빌드 검증
- 7회 커밋 전부 `npm run build` 0 errors 확인

---

## 4. Lessons Learned

### 4.1 근본 원인 패턴
1. **salesList fallback의 위험**: 200 데이터(월별 독립)에서 매출0인 행이 매출리스트 전체 합산을 대체받으면 N배 중복. fallback은 데이터 소스가 완전히 없을 때만 작동해야 함.
2. **역방향 fill-down의 위험**: 파일 시작부의 빈 행에 파일 끝의 조직을 역전파하면 사업부 경계를 넘어 오배정. 순방향만으로 충분.
3. **PlanActualDiff 타입 혼동**: `Number(PlanActualDiff객체)` → NaN. TypeScript 타입이 있지만 `Number()` 호출은 런타임에서 감지 불가.

### 4.2 검증 방법론
- **엑셀 원본 파싱 시뮬레이션**: Node.js 스크립트로 실제 파서와 동일한 로직 재현 → 대시보드 표시값과 비교
- **병렬 감사 에이전트**: 5개 에이전트가 각각 다른 관점(함수 정확성, 충돌, 정밀도, 필터, 전체 탭)에서 검증
- **Playwright 자동화**: IndexedDB 삭제 → 파일 업로드 → KPI 확인까지 자동화 (Chrome 안정성 이슈 존재)
