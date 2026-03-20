# Gap Analysis: dashboard-data-integrity

> 분석일: 2026-03-20 | Match Rate: **100%** (수정 후)

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | 대시보드 데이터 정합성 전면 개편 |
| 설계 항목 수 | 6 |
| 초기 Match Rate | 83.3% (5.0/6.0) |
| 수정 후 Match Rate | 100% (6.0/6.0) |
| 수정 파일 수 | 7 (초기 6 + 수정 1) |

## 항목별 검증 결과

| # | 항목 | 우선순위 | 초기 판정 | 수정 후 | 비고 |
|---|------|:--------:|:---------:|:-------:|------|
| 1 | parser.ts orgNames 필터 제거 | P0 | Partial | Match | 데이터 원본 보존 달성. 통계 로깅으로 교체 |
| 2 | FileUploader.tsx orgNames 전달 제거 | P0 | Match | Match | orgNames 파라미터 제거 완료 |
| 3 | data/page.tsx 재업로드 배너 + 크로스 검증 | P1 | Match | Match | 배너 닫기 가능, 5%/10% 색상 코딩 |
| 4 | overview page.tsx KPI 소스 배지 | P1 | Match | Match | [조직별손익 기준] 명시 |
| 5 | profitability/page.tsx Smart Data Source 알림 | P1 | Match | Match | 901/100 데이터 소스 설명 |
| 6 | orders StatusTab.tsx salesOrderRatio prop | P2 | Partial | Match | prop 이름 전체 체인 통일 |

## 수정 이력

### 초기 구현 (83.3%)
- 6개 파일 수정, npm run build 성공

### Gap Fix 1: StatusTab prop 이름 통일 (→100%)
- `StatusTab.tsx`: `conversionRate` → `salesOrderRatio` prop 리네이밍
- `orders/page.tsx`: prop 전달 이름 일치

## 핵심 변경 내역

### CRITICAL: 파서 조직 필터 제거
- **Before**: 업로드 시 orgNames에 없는 조직의 데이터 영구 제거 (8,063억 중 647.9억만 저장)
- **After**: 모든 데이터 원본 보존. 필터는 렌더 시점에만 적용

### HIGH: 수치 투명성 확보
- Overview KPI: 데이터 소스 명시 ([조직별손익 기준])
- 수익성 페이지: Smart Data Source 전환 시 두 데이터 소스 차이 설명
- 데이터 관리: 크로스 검증 대시보드로 소스 간 차이 시각화

### MEDIUM: 수주 분석 라벨 정확성
- "전환율" → "매출/수주 비율"로 전체 체인 통일

## 사용자 조치 필요

코드 수정 후 반드시 **데이터 관리 → 전체 초기화 → 모든 엑셀 재업로드** 필요.
