# Migration Churn 테스트 정합성 — 비즈니스 룰 반영 Fix Plan

**Workstream**: Phase A 정밀 검증 잔여 (단일 테스트 실패 정리)
**작성일**: 2026-04-29
**예상 공수**: 0.5시간 (테스트 시나리오 수정만)
**Trigger**: Phase A 검증 시 발견된 1 failed (`migration.test.ts > detects churned customers`)

## Executive Summary

| 축 | 내용 |
|---|---|
| **Problem** | `migration.test.ts:30-41` "detects churned customers" 테스트가 실패 — 1월 매출 → 2월 공백 → churned 감지 기대했으나 0건. 표면적으로는 알고리즘 버그처럼 보이나, **실제로는 알고리즘 정확 / 테스트가 비즈니스 룰 반영 못함**. `migration.ts:198-219`의 **B2B 보정 로직**(연속 3개월 미만 공백은 이전 grade 유지)이 의도적으로 1-2개월 단발 공백을 churn으로 간주하지 않음. 테스트가 이 비즈니스 룰 미반영. |
| **Solution** | 테스트 시나리오를 비즈니스 룰에 맞게 수정 — "**3개월 연속 매출 공백**" 시 churn 감지로 변경. 또한 B2B 보정 룰의 명시적 검증 케이스 추가 (1-2개월 공백 → 유지, 3개월 공백 → churn). 알고리즘 코드는 *변경 없음* (비즈니스 의도 정확히 반영 중). |
| **Function UX Effect** | 사용자 경험 변화 없음 — 알고리즘 동작은 동일. 다만 회귀 방지 강화 — B2B 보정 룰이 향후 의도치 않게 변경되면 새 테스트가 즉시 감지. 비즈니스 룰 명시적 문서화 효과. |
| **Core Value** | 알고리즘과 테스트의 자기 일관성 회복. 비즈니스 룰("연속 3개월 공백만 churn")을 코드 + 테스트로 이중 명시. Phase A "완벽 검증" 잔여 1건 정리로 전체 테스트 472/473 → **473/473 (100%)** 도달. |

---

## Root Cause 분석

### 알고리즘 (정확)

`src/lib/analysis/migration.ts:198-219`:
```ts
// B2B 보정: 연속 3개월 미만의 거래 공백은 N이 아닌 이전 등급 유지
// 연속 3개월 이상 거래 없을 때만 N으로 전환
for (const customer of Array.from(allCustomers)) {
  let consecutiveZero = 0;
  let lastActiveGrade: CustomerGrade = "N";

  for (let i = 0; i < months.length; i++) {
    const grade = gradeMap.get(customer) || "N";
    if (grade === "N") {
      consecutiveZero++;
      if (consecutiveZero < 3 && lastActiveGrade !== "N") {
        gradeMap.set(customer, lastActiveGrade);  // ← 이전 등급 유지
      }
    } else {
      consecutiveZero = 0;
      lastActiveGrade = grade;
    }
  }
}
```

**비즈니스 의도** (코드 주석 명시):
- B2B 거래는 단발 공백이 흔함 (월별 발주 패턴 변동)
- "연속 3개월 이상 매출 0"이어야 진짜 이탈로 간주
- 1-2개월 단발 공백 = 정상 거래 패턴 → 이전 등급 유지

### 테스트 (불완전)

`src/lib/analysis/migration.test.ts:30-41`:
```ts
it("detects churned customers (active → N)", () => {
  const sales = [
    makeSale("C001", "2024-01-15", 1000),
    // C001 has no sales in February → churned
    makeSale("C002", "2024-01-15", 500),
    makeSale("C002", "2024-02-15", 500),
  ];
  // ...
  expect(result.summaries[0].churned).toBeGreaterThanOrEqual(1);  // ← 실패
});
```

**문제**: C001이 1월 → 2월 1개월만 공백. B2B 보정이 1월 grade로 유지 → 2월 toGrade=D (not N) → churned 조건(`toGrade === "N"`) 미충족.

### 테스트 결과

```
AssertionError: expected 0 to be greater than or equal to 1
src/lib/analysis/migration.test.ts:40:55
```

---

## Fix 방향 (3 옵션)

### 옵션 A (권장): 테스트 시나리오 수정 — 비즈니스 룰 반영

**전략**: 테스트 데이터에 *3개월 연속 공백*을 만들어 churn 조건 충족.

```ts
it("detects churned customers (active → N after 3+ consecutive empty months)", () => {
  const sales = [
    makeSale("C001", "2024-01-15", 1000),
    // C001: 2/3/4월 모두 공백 → 5월 시점에서 N
    makeSale("C002", "2024-01-15", 500),
    makeSale("C002", "2024-02-15", 500),
    makeSale("C002", "2024-03-15", 500),
    makeSale("C002", "2024-04-15", 500),
    makeSale("C002", "2024-05-15", 500),
  ];
  const result = calcCustomerMigration(sales);
  // 5개 transition (1→2/2→3/3→4/4→5)
  // C001은 1→2에서 D 유지 → 2→3에서 D 유지 → 3→4에서 N (3개월 연속 공백)
  const lastSummary = result.summaries[result.summaries.length - 1];
  expect(lastSummary.churned).toBeGreaterThanOrEqual(1);
});
```

**보너스 테스트 (비즈니스 룰 명시적 검증)**:
- "1개월 공백 → 이전 등급 유지 (not churn)"
- "2개월 공백 → 이전 등급 유지 (not churn)"
- "3개월 공백 → N (churn)"

### 옵션 B: 알고리즘에 strictChurn 옵션 추가

**전략**: `calcCustomerMigration(sales, { strictChurn: true })` 추가하여 B2B 보정 끄기 가능.

**평가**: 비즈니스 의도와 직교. UI에 노출하기 애매하고 호출 코드 모두 변경 필요. **권장 안 함**.

### 옵션 C: B2B 보정 자체 제거

**평가**: 비즈니스 의도 명확히 위배. 단발 공백을 churn으로 잡으면 false positive 폭증. **권장 안 함**.

---

## 사용자 결정 필요 사항

| 항목 | 옵션 |
|---|---|
| Fix 방향 | A (테스트 수정 + 비즈니스 룰 검증) **권장** / B / C |
| 보너스 테스트 추가 여부 | 추가 (1M / 2M / 3M 공백 각 케이스) **권장** / 단일 케이스만 |

---

## 변경 파일 (옵션 A 채택 시)

| 파일 | 변경 |
|---|---|
| `src/lib/analysis/migration.test.ts` | "detects churned" 테스트 시나리오 수정 (5개월 데이터) + B2B 보정 검증 3 신규 테스트 |
| (옵션) `src/lib/analysis/migration.ts` | 코드 변경 없음 (알고리즘 정확) |
| `docs/04-report/migration-churn-fix.report.md` | 완료 보고서 (선택) |

**총 추정**: +50 LOC (테스트 추가)

---

## Acceptance Criteria

| # | 기준 | 검증 |
|---|---|---|
| 1 | "detects churned" 테스트 통과 | `npm run test migration` |
| 2 | 1개월 공백 → 이전 등급 유지 검증 | 신규 테스트 |
| 3 | 2개월 공백 → 이전 등급 유지 검증 | 신규 테스트 |
| 4 | 3개월 공백 → N (churn 감지) 검증 | 신규 테스트 |
| 5 | 전체 테스트 473/473 통과 | `npm run test -- --run` |

---

## Verification

```bash
# 1. 단위 테스트
npm run test migration -- --run
# Expected: 5+ pass (기존 + 신규 4)

# 2. 전체 테스트 - 100% 통과
npm run test -- --run
# Expected: 473/473 통과 (이전 472)

# 3. 빌드
npm run build
# Expected: 0 errors
```

---

## Status

- 🟡 **Plan 작성 완료**
- 사용자 옵션 A 승인 시 → 즉시 fix 가능 (0.5시간)
- 본 fix 완료 시 Phase A 정밀 검증 100% (473/473) 도달
