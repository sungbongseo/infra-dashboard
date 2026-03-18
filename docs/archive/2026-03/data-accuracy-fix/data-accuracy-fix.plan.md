# Plan: data-accuracy-fix — 엑셀 데이터 정합성 3단계 개선

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | 22개 엑셀 파일의 월별 시트, SAP 머지셀, PAD 컬럼 구조를 파싱할 때 데이터 손실/왜곡이 발생하여 대시보드 분석탭 수치가 원본과 불일치 (2C/7H/14M 발견) |
| **Solution** | 3단계(긴급→구조→품질) 순서로 파서 정확도, 데이터 흐름 안전성, 분석 계산 신뢰도를 개선 |
| **Function UX Effect** | 품목탭 누락 매출 복원, Profitability 수치 정확도 향상, 파일 재업로드 시 데이터 병합 지원 |
| **Core Value** | 경영진이 대시보드 수치를 SAP 원본과 동등하게 신뢰할 수 있는 수준으로 끌어올림 |

---

## 1. Background & Problem

### 1.1 감사 결과 요약

3개 병렬 감사 에이전트(엑셀구조/파서코드/분석탭)를 통해 발견된 총 31건의 이슈:

| Severity | Count | 대표 이슈 |
|----------|:-----:|-----------|
| CRITICAL | 2 | KG-row 머지 시 데이터 삭제, 901 컬럼 인덱스 밀림 |
| HIGH | 7 | 파일 덮어쓰기, fillDown 오염, receivableAging 에러 미격리, 거래처코드 매핑, KPI 데이터 혼합, DSO 합성 |
| MEDIUM | 14 | 월별 이중카운팅, fuzzyGet 오매칭, 스냅샷 필터 무시 등 |
| LOW | 8 | dead code, 행번호 오프셋, isFinite 가드 등 |

### 1.2 영향 범위

| 대시보드 페이지 | 영향받는 탭 수 | 핵심 이슈 |
|---------------|:-------------:|-----------|
| Overview | 4/4 | H-6 KPI 데이터 소스 혼합 |
| Sales | 3/13 | C-1 품목탭 KG머지 데이터 손실 |
| Profitability | 8/18 | C-2 901 컬럼 밀림, M-04 fuzzyGet |
| Receivables | 2/9 | H-4 파서 에러 미격리, H-7 DSO 합성 |
| Orders | 0/6 | 영향 없음 |
| Profiles | 1/5 | H-6 간접 영향 |

### 1.3 교차 검증 수치

| 데이터 소스 | 엑셀 합계 | 대시보드 상태 |
|------------|-----------|-------------|
| 매출리스트 | 1,220.7억 | 정상 |
| 수주리스트 | 1,513.2억 | 정상 |
| 수금리스트 | 6,247.9억 | 정상 |
| 200 품목별 수익성 | 월 480~752억 | 부분 누락 (C-1) |
| 901 수익성분석 | 검증 필요 | 왜곡 위험 (C-2) |

---

## 2. Goals & Success Criteria

### 2.1 목표

1. **데이터 정확도**: 엑셀 원본 대비 대시보드 수치 오차율 1% 미만
2. **파서 안전성**: 모든 파일 타입에서 에러 격리 및 행 추적 가능
3. **사용자 신뢰**: 데이터 소스 투명성 확보 (tooltip, 합성 데이터 표시)

### 2.2 성공 기준

| 기준 | 목표 | 측정 방법 |
|------|------|-----------|
| CRITICAL 이슈 해소 | 2/2 해결 | 엑셀 원본 대조 스크립트 |
| HIGH 이슈 해소 | 7/7 해결 | 코드 리뷰 + 빌드 성공 |
| 빌드 성공 | 0 errors | `npm run build` |
| 수치 정합성 | 오차 <1% | 주요 KPI 5개 교차 검증 |

---

## 3. Implementation Plan — 3 Phases

### Phase A: 긴급 수정 (P0, 예상 5시간)

파서 레벨의 데이터 손실/왜곡을 즉시 해결.

| # | 작업 | 파일 | 이슈 | 예상 |
|---|------|------|------|------|
| A-1 | KG-row 머지 개선 — non-KG 행 보존 또는 데이터 병합 + 경고 추가 | parser.ts:793-804 | C-1 | 2h |
| A-2 | 901 파서 컬럼 매핑 실측 검증 — Excel 직접 대조 후 인덱스 확인/수정 | parser.ts:617-638 | C-2 | 2h |
| A-3 | 거래처코드/거래처명 컬럼 분리 매핑 (orgCustomerProfit, hqCustomerItemProfit) | parser.ts:647-648, 684-685 | H-5 | 1h |

**검증**: A-1~A-3 완료 후 `npm run build` + 엑셀 원본 대조 스크립트 실행

### Phase B: 구조적 개선 (P1, 예상 12시간)

데이터 흐름 안전성과 파서 견고성 강화.

| # | 작업 | 파일 | 이슈 | 예상 |
|---|------|------|------|------|
| B-1 | FileUploader 동일 FileType 재업로드 시 merge/replace 옵션 추가 | FileUploader.tsx | H-1 | 4h |
| B-2 | fillDown 안전장치 — 소계 경계 검사 + 중간레벨 역방향 fill-down | parser.ts:117-128, 196-208 | H-2, H-3 | 3h |
| B-3 | receivableAging을 safeParseRows 래퍼로 전환 | parser.ts:324+ | H-4 | 1h |
| B-4 | 월별 시트 합산 전략 분기 (fileType별 누계/델타 설정) | parser.ts:932-956, schemas.ts | M-01 | 3h |
| B-5 | KPI 카드 tooltip에 데이터 소스 명시 | KpiCard.tsx, kpi.ts | H-6 | 1h |

**검증**: B-1~B-5 완료 후 전체 빌드 + 6개 페이지 핵심 KPI 교차 검증

### Phase C: 품질 개선 (P2-P3, 예상 6시간)

분석 정확도와 코드 품질 향상.

| # | 작업 | 파일 | 이슈 | 예상 |
|---|------|------|------|------|
| C-1 | fuzzyGet → orgMapping.ts isSameOrg 통합 | profitRiskMatrix.ts:133-142 | M-04 | 1h |
| C-2 | DSOTrend isSynthetic UI 표시 (차트 범례/tooltip) | dso.ts, RecTab | H-7 | 1h |
| C-3 | 에러 리포팅 확장 (5건→전체) + 행번호 정확도 | parser.ts:252-258 | M-08 | 2h |
| C-4 | hasMergedHeader 스키마 메타데이터 정리 (itemProfitability) | schemas.ts:68 | H-2 보조 | 0.5h |
| C-5 | calcWeightedAverageDays 삭제 (dead code) | aging.ts:183-212 | H-3 (dead) | 0.5h |
| C-6 | insight.value isFinite 가드 추가 | page.tsx:864 | L-02 | 0.5h |
| C-7 | waterfall 영업이익 불일치 보정 (독립 합산 → 워터폴 일관성) | itemHierarchy.ts:444-462 | M-03 | 0.5h |

**검증**: 전체 빌드 + Vercel 배포 + 최종 교차 검증

---

## 4. Key Files

### 4.1 수정 대상 파일 (우선순위 순)

| 파일 | Phase | 변경 유형 |
|------|:-----:|----------|
| `src/lib/excel/parser.ts` | A, B | 파서 로직 수정 (KG머지, 901컬럼, fillDown, aging, 에러리포팅) |
| `src/lib/excel/schemas.ts` | B, C | 스키마 메타데이터 수정 |
| `src/components/dashboard/FileUploader.tsx` | B | merge/replace UI 추가 |
| `src/components/dashboard/KpiCard.tsx` | B | 데이터소스 tooltip 확장 |
| `src/lib/analysis/profitRiskMatrix.ts` | C | fuzzyGet → isSameOrg |
| `src/lib/analysis/dso.ts` | C | isSynthetic 표시 |
| `src/lib/analysis/aging.ts` | C | dead code 삭제 |
| `src/lib/analysis/itemHierarchy.ts` | C | waterfall 일관성 |
| `src/app/dashboard/page.tsx` | C | insight isFinite 가드 |

### 4.2 참조 파일 (읽기 전용)

| 파일 | 용도 |
|------|------|
| `업로드자료/*.xlsx` | 원본 데이터 대조 |
| `src/stores/dataStore.ts` | 데이터 흐름 확인 |
| `src/lib/utils.ts` | filterByOrg, aggregateOrgProfit 동작 확인 |
| `src/types/itemCost.ts` | 타입 정의 확인 |
| `docs/04-report/comprehensive-audit-2026-03-17.md` | 감사 보고서 참조 |

---

## 5. Dependencies & Risks

### 5.1 의존성

| 의존성 | 영향 | 대응 |
|--------|------|------|
| 엑셀 원본 파일 접근 | A-2 컬럼 검증에 필수 | 업로드자료 폴더에 파일 존재 확인됨 |
| XLSX 라이브러리 | 파서 수정 시 호환성 | 기존 버전 유지 |
| Vercel 배포 | 최종 검증 | 자동 배포 설정 완료 |

### 5.2 리스크

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| 901 컬럼 인덱스 수정 시 기존 정상 데이터 깨짐 | 중 | 높음 | 수정 전후 5개 조직 수치 비교 |
| FileUploader merge 기능이 기존 UX 복잡화 | 낮 | 중 | 기본값 replace 유지, merge는 확인 다이얼로그 |
| fillDown 수정이 다른 파일 타입에 영향 | 중 | 중 | 14개 파일 타입 전체 파싱 테스트 |

---

## 6. Out of Scope

- 새 분석 기능 추가 (거래처 FIFO 수금매칭, 조직 통폐합 시뮬레이션 등)
- UI 디자인 변경 (기존 레이아웃 유지)
- 테스트 프레임워크 도입 (현재 미설정)
- 백엔드 API 구축

---

## 7. Implementation Order

```
Phase A (5h, Day 1)
  A-2: 901 컬럼 실측 검증 (다른 수정의 기준선)
  A-1: KG-row 머지 개선
  A-3: 거래처코드 매핑 분리
  → 빌드 검증 + 커밋

Phase B (12h, Day 2-3)
  B-3: receivableAging safeParseRows (가장 작음, 워밍업)
  B-2: fillDown 안전장치 (핵심)
  B-4: 월별 시트 합산 전략 분기 (핵심)
  B-1: FileUploader merge/replace (UI 작업)
  B-5: KPI tooltip 데이터소스
  → 빌드 검증 + 커밋

Phase C (6h, Day 4)
  C-5: dead code 삭제 (가장 작음)
  C-6: isFinite 가드
  C-4: hasMergedHeader 정리
  C-7: waterfall 일관성
  C-1: fuzzyGet → isSameOrg
  C-2: isSynthetic 표시
  C-3: 에러 리포팅 확장
  → 최종 빌드 + Vercel 배포 + 교차 검증
```

---

## 8. Verification Plan

### 8.1 Phase별 검증

| Phase | 검증 방법 | 기준 |
|-------|----------|------|
| A | 엑셀 원본 대조 스크립트 (node.js) | 200/901 파일 수치 일치 |
| B | 전체 빌드 + 6페이지 KPI 스팟체크 | 0 errors, KPI 오차 <1% |
| C | Vercel 배포 후 실사용 검증 | 모든 탭 정상 렌더링 |

### 8.2 교차 검증 대상 KPI (5개)

1. **총매출** — salesList 장부금액 합계 vs Overview KPI
2. **매출총이익** — 200 파일 매출총이익 합계 vs Profitability 탭
3. **품목별 매출** — 200+salesList 병합 결과 vs Sales 품목탭
4. **미수금 총액** — aging 파일 합계 vs Receivables 현황탭
5. **수주 총액** — 수주리스트 장부금액 합계 vs Orders 현황탭
