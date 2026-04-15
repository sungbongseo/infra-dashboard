# Gap Analysis: excel-auto-unmerge (셀 병합 자동 해제)

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Excel 셀 병합 자동 해제 |
| 분석일 | 2026-03-20 |
| Match Rate | **100% (17/17)** |
| 수정 파일 | 1개 (parser.ts) |

## 요구사항 매칭 상세

### Req 1: `unmergeSheet()` 함수 복원 (5/5) ✅

| # | 항목 | 상태 | 증거 |
|---|------|:----:|------|
| 1.1 | `sheet['!merges']` 메타데이터 읽기 | ✅ | L949: `const merges = sheet["!merges"]` |
| 1.2 | 병합 범위의 좌상단 셀 값 복사 | ✅ | L954: `const originCell = sheet[originAddr]` → L959: `sheet[addr] = { ...originCell }` |
| 1.3 | `!merges` 삭제 (중복 적용 방지) | ✅ | L963: `delete sheet["!merges"]` |
| 1.4 | 처리된 셀 수 반환 | ✅ | L964: `return filledCount` |
| 1.5 | originCell 없을 때 skip | ✅ | L955: `if (!originCell) continue` |

### Req 2: `sheet_to_json` 호출 전 3곳 적용 (3/3) ✅

| # | 호출 위치 | 상태 | 증거 |
|---|----------|:----:|------|
| 2.1 | latest 전략 단일 시트 | ✅ | L1015 `unmergeSheet(sheet)` → L1019 `sheet_to_json` |
| 2.2 | concat 전략 다중 시트 루프 | ✅ | L1040 `unmergeSheet(sheet)` → L1044 `sheet_to_json` |
| 2.3 | 단일 시트 | ✅ | L1068 `unmergeSheet(sheet)` → L1072 `sheet_to_json` |

### Req 3: warnings 메시지 (3/3) ✅

| # | 항목 | 상태 | 증거 |
|---|------|:----:|------|
| 3.1 | latest: `[파일유형] N개 병합 셀 자동 해제` | ✅ | L1017 |
| 3.2 | concat: 시트명 포함 메시지 (설계 대비 개선) | ✅ | L1042 |
| 3.3 | 단일: `[파일유형] N개 병합 셀 자동 해제` | ✅ | L1070 |

### Req 4: 안전성 (4/4) ✅

| # | 항목 | 상태 | 증거 |
|---|------|:----:|------|
| 4.1 | `!merges` 등록된 실제 병합 셀만 해제 | ✅ | L949: merges 배열 순회, 의도적 공백은 !merges에 없으므로 영향 없음 |
| 4.2 | fillDown 함수와 충돌 없음 | ✅ | unmergeSheet는 XLSX WorkSheet 객체, fillDown은 파싱 후 TypeScript 레코드 — 실행 단계가 다름 |
| 4.3 | SAP 소계행 빈 필드 영향 없음 | ✅ | 소계행 빈 품목은 병합이 아닌 의도적 공백 → unmerge 대상 아님 |
| 4.4 | 이전 5-25배 매출 부풀림 재현 안 됨 | ✅ | 테스트: 매출 647.9억, 매출총이익율 15.9% (합리적 범위) |

### Req 5: 빌드/린트 (2/2) ✅

| # | 항목 | 상태 | 증거 |
|---|------|:----:|------|
| 5.1 | `npm run build` 통과 | ✅ | Compiled successfully, 0 errors |
| 5.2 | `npx next lint` 통과 | ✅ | No ESLint warnings or errors |

## E2E 테스트 결과

| 항목 | 결과 |
|------|------|
| 업로드 파일 수 | 19개 (조직 1 + 데이터 11 + 미수채권 7) |
| 파싱 오류 | **0건** |
| 병합 해제 경고 | **29건** (정상 표시) |
| 콘솔 에러 | **0건** |
| Overview KPI | 매출 647.9억, 영업이익율 2.0%, 수금율 107.6% |
| 수익성 KPI | 매출총이익 4.1억 (15.9%), 공헌이익 4.5억 |
| 페이지 렌더링 | Overview, 수익성, 매출 분석 — 모두 정상 |

### 병합 해제 상세

| 파일 유형 | 해제 셀 수 |
|-----------|-----------|
| customerItemDetail (100) | 1,258,880 |
| orderList | 16,112 |
| itemProfitability (200) | ~95,898 (14시트) |
| hqCustomerItemProfit (304) | 7,774 |
| profitabilityAnalysis (901) | 4,944 |
| orgCustomerProfit (304) | 3,581 |
| itemCostDetail (501) | 1,343 |
| teamContribution (401) | 173 |
| receivableAging (7파일) | 161 |
| orgProfit (303) | 63 |

## 설계 대비 개선 사항

| # | 개선 | 설명 |
|---|------|------|
| 1 | concat 시트별 경고 메시지 | 설계는 파일유형만 표시했으나, 구현은 시트명도 포함하여 디버깅 용이 |

## 결론

**Match Rate: 100%** — 모든 요구사항이 충족되었으며, 안전성 검증도 E2E 테스트로 확인 완료.
