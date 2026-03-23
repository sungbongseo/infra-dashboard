# 수주 분석 데이터 정확성 수정 — 완료 보고서

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | 수주 분석 7탭 데이터 정확성 100% 개선 |
| 시작일 | 2026-03-23 |
| 완료일 | 2026-03-23 |
| 소요 기간 | 1일 (단일 세션) |

| 지표 | 값 |
|------|-----|
| Match Rate | 100% |
| 수정 항목 | 4건 (1 HIGH, 2 MEDIUM, 1 LOW) |
| 변경 파일 | 5개 |
| 변경 라인 | ~35줄 |
| False Positive 제외 | 9건 (전체 13건 중) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 리드타임 음수가 "~7일"에 혼입, "전환율"이 3가지 다른 의미로 혼용, PipelineTab 미수잔액 경고 부재, extractMonth 점 구분자 미지원 |
| **Solution** | 음수 리드타임 별도 구간 분리, 매출전환율/수주완료율/O2C전환율 용어 분리, isAgingBased 조건부 경고, 점 구분자 파싱 추가 |
| **Function UX Effect** | 납품 리드타임 분포 차트의 "~7일" 건수 정확도 향상, 사용자가 3가지 전환율의 의미를 명확히 구분 가능, 미수잔액 수치의 신뢰성 판단 근거 제공 |
| **Core Value** | 수주 분석 페이지의 수치 해석 오류 방지 → 경영진 의사결정 품질 향상 |

---

## 1. 계획 (Plan)

### 1.1 배경

수주(Orders) 페이지의 7개 서브탭에 대한 전수 감사에서 13건의 잠재 이슈가 발견됨. 3개 병렬 Explore 에이전트가 (1) 페이지+탭 구조, (2) 파서/스키마/타입, (3) 분석 모듈 계산 로직을 동시 조사.

### 1.2 범위 결정

13건 중 9건은 이미 안전장치가 구비된 False Positive로 확인하여 제외. 실제 수정 필요 4건만 선별.

| False Positive (9건) | 이유 |
|----------------------|------|
| outstandingOrders 음수 | `> 0 ? ... : 0` 클램핑 존재 |
| salesOrderRatio 100% 초과 | "80~120% 정상" 벤치마크 설명 존재 |
| 수주유형 빈 문자열 | `"" \|\| "기타"` → 정상 처리 |
| pipeline.ts 선수금 undefined | `num()` 헬퍼가 undefined→0 보장 |
| inventoryMovement.month 미주입 | `!m → return true` 의도적 설계 |
| 재고 회전율 0 나누기 | `avg > 0 ?` + `isFinite()` 3중 방어 |
| DIO 계산 월수 | 수학적으로 상쇄, 결과 정확 |
| 장기재고 감지 | 역순 순회 + 정렬 후 처리 정확 |
| filterByDateRange vs filterByMonth | 다른 데이터 구조에 맞는 적절한 필터 |

---

## 2. 구현 (Do)

### Issue 1: [HIGH] 리드타임 음수 분류 오류

**파일**: `src/app/dashboard/orders/page.tsx`

| 수정 전 | 수정 후 |
|---------|---------|
| `days <= 7` 조건에 음수도 포함 | `days < 0` → "음수(확인필요)" 분리 |
| order 배열: 6개 구간 | order 배열: 7개 구간 (맨 앞 추가) |

**영향**: AnalysisTab "납품 리드타임 분포" 차트에서 "~7일" 건수 부풀림 해소.

### Issue 2: [MEDIUM] 전환율 용어 혼재 통일

| 위치 | 수정 전 | 수정 후 | 의미 |
|------|---------|---------|------|
| OrgTab (월별 갭) | 전환율 | **매출전환율** | 매출/수주 × 100 (금액 기준) |
| ConversionTab | 수주 전환율 | **수주완료율(건수기준)** | 완료건수/전체건수 × 100 |
| PipelineTab | 전환율 | 전환율 (변경 없음) | O2C 매출전환 (금액 기준) |

**변경 파일**: `page.tsx`, `OrgTab.tsx`, `ConversionTab.tsx`
**변경 범위**: interface, dataKey, name, tooltip formatter, chart titles, descriptions

### Issue 3: [MEDIUM] PipelineTab 미수잔액 경고 보강

**파일**: `page.tsx`, `PipelineTab.tsx`

| 조건 | 표시 |
|------|------|
| `isAgingBased = true` | "(채권연령 데이터 기준)" |
| `isAgingBased = false` + 기간 필터 | "⚠️ 기간 필터 적용 시 매출대비 추정치" 경고 |
| 기본 | 기존 설명만 |

### Issue 4: [LOW] extractMonth() 점 구분자

**파일**: `src/lib/utils.ts`

`"2025.01.15"` → `"2025-01"` 반환 지원. `.` 구분자 처리가 `-`(line 103)와 `/`(line 110) 사이에 배치되어 기존 포맷 하위호환 유지.

---

## 3. 검증 (Check)

### 3.1 빌드 검증

```
npm run build → ✓ Compiled successfully (0 errors, 0 warnings)
```

### 3.2 Gap Analysis

| Category | Score |
|----------|:-----:|
| Issue 1: 리드타임 음수 분류 | 100% ✅ |
| Issue 2: 전환율 용어 통일 | 100% ✅ |
| Issue 3: PipelineTab 미수잔액 경고 | 100% ✅ |
| Issue 4: extractMonth 점 구분자 | 100% ✅ |
| **Overall Match Rate** | **100%** ✅ |

### 3.3 하위호환 검증

| 항목 | 결과 |
|------|:----:|
| OrgTab props type ↔ page.tsx 출력 동기화 | ✅ |
| ConversionTab dataKey 유지 + name만 변경 | ✅ |
| PipelineTab 기존 전환율/수금율 용어 보존 | ✅ |
| extractMonth 기존 5개 포맷 동작 유지 | ✅ |
| 타입 정합성 (interface ↔ prop) | ✅ |

---

## 4. 변경 이력

| 파일 | 변경 내용 |
|------|----------|
| `src/app/dashboard/orders/page.tsx` | 리드타임 음수 분류, 매출전환율 필드명, isAgingBased prop 전달 |
| `src/app/dashboard/orders/tabs/OrgTab.tsx` | interface + chart에서 전환율→매출전환율 |
| `src/app/dashboard/orders/tabs/ConversionTab.tsx` | KPI/차트/툴팁에서 전환율→수주완료율 |
| `src/app/dashboard/orders/tabs/PipelineTab.tsx` | isAgingBased prop 수신 + 조건부 경고 |
| `src/lib/utils.ts` | extractMonth 점 구분자 지원 |

---

## 5. PDCA 사이클 요약

```
[Plan] ✅ → [Design] ✅ → [Do] ✅ → [Check] ✅ (100%) → [Report] ✅
```

- **Iteration 불필요**: Match Rate 100% 달성으로 Act 단계 스킵
- **총 수정량**: 5개 파일, ~35줄
- **품질 기준**: 빌드 0 errors, gap 분석 100%, 하위호환 100%
