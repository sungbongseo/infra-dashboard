# 저가수주 상계효과 정밀 진단 제안서

> 진단일: 2026-04-14
> 대상: `offsetEffect.ts` (1,093줄), `OffsetEffectTab.tsx` (1,865줄), `offsetEffect.test.ts` (41 tests)
> 방법: 3개 병렬 에이전트 (코드 품질, 수학 검증, UI/테스트)

---

## Executive Summary

| 항목 | 값 |
|------|------|
| 코드 품질 점수 | 78/100 |
| 발견 항목 | 20건 (CRITICAL 3, HIGH 5, MEDIUM 8, LOW 4) |
| 테스트 갭 | 11건 (CRITICAL 3, HIGH 3, MEDIUM 3, LOW 2) |
| 항등식 검증 | 4a ✅ 정상 / 4b ⚠️ 문서 오류 |

---

## CRITICAL (즉시 수정 필요 — 3건)

### C1. 음수 수량 품목의 절대 수량 분배 반전
- **위치**: `offsetEffect.ts:469-471`
- **현상**: `targetTotalQty`가 음수(반품이 정상보다 많은 경우) → `qtyShare`가 음수 → `volumeAbsolute * 음수 = 감소`
- **영향**: "+200개 추가" 시나리오가 실제로는 "감소"로 작동
- **수정**: `targetTotalQty <= 0` 시 균등 분배 또는 absolute 모드 비활성화

### C2. 감도 분석 Binary Search 상한 돌파
- **위치**: `offsetEffect.ts:1072`
- **현상**: CM ≤ 0일 때 500% 물량 증가로도 손익분기 불가능 → 중간값 250%를 "필요 물량"으로 표시
- **영향**: 사용자가 250% 물량 증가면 손익분기라고 오해
- **수정**: 탐색 종료 후 실제 달성 여부 검증 → 미달성 시 "불가능" 표시

### C3. cvpChartData useMemo 누락 의존성
- **위치**: `OffsetEffectTab.tsx:287` (dependency array)
- **현상**: `inputMode`가 내부에서 사용되지만 의존성 배열에 미포함
- **영향**: 입력 모드 전환 시 차트 데이터 갱신 안 됨 (stale data)
- **수정**: 의존성 배열에 `inputMode` 추가

---

## HIGH (조기 수정 권장 — 5건)

### H1. 시나리오 저장 시 단가 변동 불일치
- **위치**: `OffsetEffectTab.tsx:1267`
- **현상**: absolute 모드에서 `priceChangePct`(슬라이더 값)를 저장하나, 실제 시뮬은 `priceChangeDirect` 사용
- **수정**: `inputMode === "absolute" ? priceChangeDirect : priceChangePct` 저장

### H2. 프리셋 버튼 absolute 모드 호환 문제
- **위치**: `OffsetEffectTab.tsx:1147`
- **현상**: 프리셋이 `volumeIncreasePct` 설정하지만 absolute 모드에서는 `volumeIncreasePct=0`으로 전달 → 프리셋 무효
- **수정**: 프리셋 클릭 시 `setInputMode("percent")` 복원 (이전 동작으로 회귀)

### H3. Pool 시뮬레이션 인덱스 기반 매칭 취약
- **위치**: `offsetEffect.ts:766-773`
- **현상**: `baseItems[i]`와 `simulatedItems[i]`가 같은 품목이라는 가정 → 정렬/필터 변경 시 깨짐
- **수정**: item key 기반 매칭 사용 (즉시 위험은 아니나 리팩토링 시 버그 유발)

### H4. Step 3 데이터 출처 툴팁 오류
- **위치**: `OffsetEffectTab.tsx:847-851`
- **현상**: "X축 (수량), Y축 (단위공헌이익)"으로 표시하나 실제는 X=매출, Y=공헌이익률(%)
- **수정**: 툴팁 텍스트를 실제 축에 맞게 변경

### H5. 14개 변동비 직접 합산 fallback 사각지대
- **위치**: `offsetEffect.ts:605`
- **현상**: `directVC > 0` 조건으로 fallback 판단 → 모든 항목이 정상적으로 0인 경우도 fallback 발동
- **수정**: `directVC === 0 && cost > 0`일 때 경고 추가 (fallback 사용 알림)

---

## MEDIUM (개선 권장 — 8건)

| # | 위치 | 내용 |
|---|------|------|
| M1 | offsetEffect.ts:18 | **문서 오류**: `netPoolMarginDelta ≈ 0`이라는 주석은 잘못됨. 대상 품목 매출/단가 변경 시 풀 전체 이익 변동 가능 |
| M2 | OffsetEffectTab.tsx:14개 useState | **아키텍처**: 14개 독립 state → `useReducer`로 통합 시 불일치 방지 |
| M3 | OffsetEffectTab.tsx:1865줄 | **파일 크기**: 800줄 초과 → Step별 컴포넌트 분리 권장 |
| M4 | offsetEffect.ts:반품↔건전/출혈 중복 | **분류 중복**: 반품 아이템이 `healthyCount`와 `returnItemCount`에 동시 포함 가능 |
| M5 | OffsetEffectTab.tsx:300 | **Scatter 500건 절삭**: 5000건 중 4500건 무통보 삭제 → 절삭 배지 표시 필요 |
| M6 | offsetEffect.ts:경고 중복 | **Pool 경고 미중복제거**: 월별 12행의 같은 품목이 12건 경고 생성 가능 |
| M7 | OffsetEffectTab.tsx:926 | **CSV 내보내기 불완전**: Dog 테이블 5개 필드만 → `variableCost`, `unitPrice` 등 누락 |
| M8 | OffsetEffectTab.tsx:243-247 | **Chart 적응형 범위**: `selectedGroup?.totalQuantity` 사용하나 전사 모드에서는 부적절 |

---

## LOW (향후 참고 — 4건)

| # | 위치 | 내용 |
|---|------|------|
| L1 | offsetEffect.ts:309 | `median()` → `medianOfSorted()`로 이름 변경 (정렬 전제 명확화) |
| L2 | offsetEffect.ts:557 | `(r as any)[poolLevel]` 타입 단언 → typed accessor 사용 |
| L3 | OffsetEffectTab.tsx:663 | Pie Cell key에 배열 인덱스 대신 `entry.name` 사용 |
| L4 | OffsetEffectTab.tsx:229 | itemList가 poolItems 변경 시 불필요 재계산 |

---

## 테스트 갭 (11건)

### 미테스트 기능

| 우선순위 | 기능 | 현재 상태 |
|:--------:|------|-----------|
| CRITICAL | 시나리오 비교 (savedScenarios) | 전혀 미테스트 |
| CRITICAL | 적응형 차트 범위 (maxMultiplier) | 전혀 미테스트 |
| CRITICAL | 감도 분석 CM≤0 엣지 (binary search) | 기본 1건만 |
| HIGH | Pool 경고 중복 제거 | 함수 반환만 확인 |
| HIGH | Integrity 경계 조건 (totalRevenue=0) | baseOP=0만 확인 |
| HIGH | CSV 내보내기 데이터 매핑 | 전혀 미테스트 |
| MEDIUM | getUnitGroups 경계값 (정확히 2개) | 1개만 확인 |
| MEDIUM | calcGroupCVP BEP=Infinity | 유한값만 확인 |
| MEDIUM | hypothesisResult 3단계 일관성 | 간접적만 확인 |
| LOW | 입력 모드 전환 일관성 | 1건만 |
| LOW | 혼합 단위 그룹 CVP | 미테스트 |

---

## 수학적 검증 결과

| 검증 항목 | 결과 | 비고 |
|----------|:----:|------|
| 항등식 1 (총액) | ✅ | `newOP - baseOP ≡ priceLoss + volumeGain` 대수적 증명 완료 |
| 항등식 2 (배분) | ⚠️ | 항등식 자체는 성립하나, `netPoolMarginDelta ≈ 0` 주장은 오류 |
| 중앙값 함수 | ✅ | 홀수/짝수 모두 정확 |
| 감도 분석 수렴 | ✅ | 15회 반복, 0.015% 정밀도 (CM>0 전제) |
| 변동비 4a↔4b 일관성 | ⚠️ | 서로 다른 데이터 소스, 교차 검증 없음 |

---

## 권장 구현 순서

| 순번 | 항목 | 난이도 | 예상 소요 |
|:----:|------|:------:|:---------:|
| 1 | C3: useMemo 의존성 수정 | 쉬움 | 5분 |
| 2 | C2: 감도 분석 "불가능" 표시 | 쉬움 | 15분 |
| 3 | C1: 음수 targetTotalQty 가드 | 보통 | 15분 |
| 4 | H1: 시나리오 저장 단가 수정 | 쉬움 | 5분 |
| 5 | H2: 프리셋 모드 복원 | 쉬움 | 5분 |
| 6 | H4: 툴팁 텍스트 수정 | 쉬움 | 5분 |
| 7 | H5: fallback 경고 추가 | 쉬움 | 10분 |
| 8 | M1: 문서 주석 수정 | 쉬움 | 5분 |
| 9 | M4: 반품 분류 정리 | 보통 | 15분 |
| 10 | M6: 경고 중복 제거 | 보통 | 15분 |
| 11 | M7: CSV 필드 추가 | 쉬움 | 10분 |
| 12 | 테스트 갭 보강 (6건) | 보통 | 45분 |

**총 예상 소요: ~2.5시간**
