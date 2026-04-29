# 협상 우선순위 탭 정밀 진단 + 4 이슈 해결 — PDCA 완료 보고서

> Feature ID: `negotiation-priority-fix`
> 기간: 2026-04-29 단일 세션 (실 작업 ~2시간)
> Status: ✅ 완료 · Match Rate 100% · 14 단위 테스트 100% 통과

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | 사용자가 협상 우선순위 탭에서 거래처(리본TS) 검색 시 동일 거래처가 #1, #2 **2건 중복 표시**. 추가 의심점: 미수금 138,828,895원 vs Python raw 분석 151,344,230원 (12.5M 차이), 위험점수 40 vs Python dry-run 43 불일치, "13M 적자: +8,905,265" 라벨이 양수에 "적자" 표기. 회수 의사결정 신뢰도 = 협상 신뢰도 — 자기 모순이 있으면 영업이 데이터 자체를 의심. |
| **Solution** | 4 이슈 동시 해결: (1) `customerCompositeRisk.ts:509-540` 거래처 키 정규화 — 100 손익 매출거래처 키를 aging 코드로 변환 후 Set 추가하여 코드+이름 중복 차단, (2) 파일 truth 확정 — `./업로드자료/` (138M) 사용, `./기타/업로드자료/` (151M)는 archive README로 분리, (3) Python dry-run `DATA_DIR` 동기화로 점수 일치 (40점), (4) 라벨 조건부 — 양수 시 "13M 영업이익", 장기연체에 "(6M+)" 기간 명시. 5개 회귀 방지 단위 테스트 추가. |
| **Function UX Effect** | 거래처 검색 시 1건만 표시 (대성/건진/리본/일성 모두 검증). 라벨 자기 일관성 — 흑자 거래처는 "13M 영업이익: ₩890만" / 적자 거래처는 "13M 적자: -₩XXX만". 장기연체 정의 (6M+) 가시화로 회계 표준 aging 기준이 명확. PDF Bulk export 시 거래처당 카드 1장 (중복 카드 없음). |
| **Core Value** | **회수 의사결정의 신뢰 기반 회복** — 단일 거래처 단일 데이터 원칙 확립. 영업 현장에서 대시보드 = single source of truth로 기능. Python dry-run과 alignment로 알고리즘 검증 가능 (오프라인 sanity check 가능). 향후 신규 거래처 추가/이름 변경 시에도 dedup 자동 처리 (5 단위 테스트로 회귀 방지). |

---

## 1. 발견 경위 (Plan)

**Trigger**: 사용자가 미수금 페이지 → 협상 우선순위 탭에서 "리본" 검색 → #1, #2로 동일 데이터 2건 표시 발견.

**관련 의심점 동시 제기**:
- 미수금 138,828,895 (대시보드) vs 151,344,230 (Python 스크립트)
- 위험점수 40 (대시보드) vs 43 (Python dry-run)
- "13M 적자: +8,905,265" — "+" 부호와 "적자" 라벨이 모순

**시급성**: 오늘 리본TS 방문 직전, 곧 일성/티아이브이/구산 방문 예정 → 협상 시 데이터 신뢰도 직결.

---

## 2. 진단 (Plan Phase 2)

3개 Explore agent 병렬 실행으로 동시 조사:
1. **코드 구조** — NegotiationPriorityTab.tsx + customerCompositeRisk.ts + dataStore.ts
2. **엑셀 raw 데이터** — 모든 aging 파일에서 리본TS 검색 + 두 폴더 비교
3. **계산 로직** — 6개 점수 컴포넌트 + 가중치 + 임계값 검증

### 4 이슈 확정

| 이슈 | 심각도 | 위치 |
|---|---|---|
| 1. 거래처 코드+이름 중복 | HIGH | `customerCompositeRisk.ts:509-525` |
| 2. 파일 버전 불일치 (12.5M) | MEDIUM | `./업로드자료/` vs `./기타/업로드자료/` |
| 3. 위험점수 40 vs 43 | MEDIUM | Python `DATA_DIR` 차이 |
| 4. "13M 적자" 라벨 모순 | LOW | `NegotiationPriorityTab.tsx:128-131` |

---

## 3. 설계 (Design)

플랜: `C:/Users/rcnd/.claude/plans/cheeky-purring-nebula.md`

### 사용자 결정 (AskUserQuestion 3건 확정)

| 항목 | 결정 |
|---|---|
| 장기연체 정의 | 6M+ 유지 + 라벨에 기간 명시 |
| 파일 truth | `./업로드자료/` (138M) |
| Python 정렬 | 지금 즉시 (같은 fix 묶음) |

### 핵심 알고리즘 — 코드 정규화 패턴

```ts
// 100 데이터 키를 aging 코드로 정규화 후 Set에 추가
for (const k of Array.from(customerSales.keys())) {
  let normalized = customerNameToCode.get(k);  // 정확 매칭

  if (!normalized) {  // 부분 일치 fallback
    for (const m of Array.from(mergedAging.values())) {
      if (m.판매처명 && (k.includes(m.판매처명) || m.판매처명.includes(k))) {
        normalized = m.판매처;
        customerNameToCode.set(k, normalized);  // 캐시
        break;
      }
    }
  }

  allCustomerCodes.add(normalized || k);  // 정규화 코드 또는 원본
}
```

기존 L530-543 fallback 로직은 유지 (개별 거래처 sales 매칭에 필요).

---

## 4. 구현 (Do)

### 변경 사항 (커밋 `0619530`)

| 파일 | 변경 | LOC |
|---|---|---|
| `src/lib/analysis/customerCompositeRisk.ts` | L519-540 정규화 + dedup | +18 |
| `src/lib/analysis/customerCompositeRisk.test.ts` | 5 신규 테스트 | +90 |
| `src/app/dashboard/receivables/tabs/NegotiationPriorityTab.tsx` | L128-138 라벨 조건부 | +5 |
| `scripts/dry-run-composite-risk.py` | DATA_DIR 변경 | +1 |
| `docs/03-analysis/협상우선순위-진단-2026-04-29.md` | 진단 보고서 | +250 |
| `docs/01-plan/features/silent-risk-detection.plan.md` | 보류 계획서 | +280 |
| `기타/업로드자료/_ARCHIVE_README.md` | archive 명시 | +35 |

**총**: 7 files, 746 insertions

---

## 5. 검증 (Check)

### 5.1 단위 테스트 (vitest)

```
✓ src/lib/analysis/customerCompositeRisk.test.ts (14 tests) 14ms
Test Files  1 passed (1)
     Tests  14 passed (14)
```

**14/14 통과** = 기존 9 + 신규 5
- ✅ aging에만 있는 거래처 → 1건
- ✅ 100 손익에만 있는 거래처 → 1건
- ✅ 코드+이름 동시 등장 → 1건 dedup (리본TS 케이스)
- ✅ 부분 일치 (대성이앤씨 vs 대성이앤씨 주식회사) → 1건
- ✅ 같은 코드 multiple aging 행 (일성: 김승욱+이승현) → 1건 합산

### 5.2 빌드

```
✓ Generating static pages (13/13)
Route (app)
├ ○ /dashboard/receivables  7.29 kB  304 kB
```

TypeScript 0 errors, ESLint 0 errors, Static prerender 13/13.

### 5.3 Python dry-run 정렬

| 거래처 | 변경 전 | 변경 후 |
|---|---|---|
| 대성이앤씨 | 75 | 75 |
| 건진케미컬 | 73 | 62 |
| **리본TS** | **43** | **40 ✅ 대시보드 일치** |

### 5.4 Match Rate

|  | Match Rate |
|---|---|
| 계획 대비 구현 | **100%** (7 Step 모두 완료) |
| 단위 테스트 통과율 | **100%** (14/14) |
| 사용자 결정 반영 | **100%** (3/3 옵션 모두 적용) |

→ **PDCA Match Rate 100%** — iterate 불필요.

---

## 6. 회고 (Act / 학습)

### 무엇이 잘 된 것

1. **Plan mode 전 Explore agent 3개 병렬** — 코드/데이터/알고리즘 동시 조사로 진단 시간 단축 (~10분)
2. **AskUserQuestion 3건 묶어서 한번에** — 의사결정 round-trip 1회로 압축
3. **5 단위 테스트로 회귀 방지** — 향후 리팩토링 안전성 확보
4. **알고리즘 변경 최소** — 정규화 추가만, 기존 fallback 매칭 유지

### 무엇이 어려웠나

1. **두 폴더 파일 차이 발견** — 단순 코드 버그가 아닌 *파일 관리 이슈*가 섞여 있어 진단 시 혼란. Explore agent 2가 이 부분을 정확히 짚어준 게 결정적.
2. **Python script "출고금액" 컬럼 명명 오류** — 변수명이 `shipment`인데 실제 데이터는 항상 0. 부가세 역산으로 의미 ("거래금액 = 매출+세, 장부금액 = 미수, 출고금액 = 미사용 컬럼") 확인.

### 다음을 위한 인사이트

1. **Excel 컬럼 의미는 raw 데이터로 검증** — 변수명만 믿지 말고 실제 값 분포로 확인
2. **두 출처 통합 시 정규화는 필수** — Set/Map의 키가 코드/이름 mixed면 dedup 누락
3. **사용자 검증 = 알고리즘 검증** — "Python 43 vs 대시보드 40" 같은 이중 검증 체계가 버그 조기 발견에 결정적

---

## 7. 잔여 작업 (Out of Scope, 별도 계획)

### Silent Risk Detection 모듈 (보류 계획서)

본 fix 과정에서 발견한 *조용한 위험* 패턴 (점수 40-69 영역의 Slow Death):
- 위치: `docs/01-plan/features/silent-risk-detection.plan.md`
- 상태: 🟡 계획만 수립, 구현 보류
- Decision Gate: **D+60 (2026-06-28)** — 운영 데이터로 Go/No-Go 결정

리본TS 케이스가 본 모듈의 Trigger 케이스 (점수 43이지만 5대 위험 동시 보유).

### 다른 스크립트 DATA_DIR 일괄 정리

6개 스크립트(generate-bulk-cards.py, customer-visit-ribbon.py 등)가 여전히 `./기타/업로드자료/` 참조. 점진 정리 예정 (운영 1-2개월 후).

---

## 8. 결론

| 질문 | 답변 |
|---|---|
| **중복 버그 해결?** | 🟢 코드 정규화 + 5개 단위 테스트 |
| **숫자 정확?** | 🟢 알고리즘 검증, 파일 버전 차이 archive 분리 |
| **라벨 일관성?** | 🟢 13M 조건부 + 장기연체 (6M+) 명시 |
| **Python 정합성?** | 🟢 리본TS 40점 일치 |
| **Match Rate?** | 🟢 100% — iterate 불필요 |

### 핵심 메시지

> **사용자가 발견한 1건의 중복 버그가 4개 이슈의 빙산의 일각이었다. 2시간 진단/구현/검증 사이클로 모두 해결, 협상 우선순위 탭은 이제 자기 일관성을 갖는 single source of truth로 기능한다. 회수 의사결정 신뢰 기반 회복.**

---

## 부록 A — 데이터 검증 트레일

### 부가세 10% 역산 검증 (aging vs 100 매칭)

```
2025-11 일성 매출 검증:
- 100 손익: 22,505,400원 (945 EA)
- Aging 거래(매출+세): 24,756,160원
- 부가세 역산: 22,505,400 × 1.1 = 24,755,940
- 차이: 0.001% ✅

2025-11 리본TS 매출 검증:
- 100 손익: 48,723,330원 (1,143 EA)
- Aging 거래: 53,587,380원
- 부가세 역산: 48,723,330 × 1.1 = 53,595,663
- 차이: 0.015% ✅
```

→ Aging 컬럼 의미 ("거래금액 = 매출 + 부가세 10%, 장부금액 = 미수 잔액, 출고금액 = 미사용 0") 확정.

### 미수금 3 method 일치 검증

```
리본TS:
- Method A (월별 7개 bucket 합) = 138,828,895
- Method B (col 29 합계 장부금액) = 138,828,895
- Method C (col 28 합계 거래금액) = 138,828,895
→ 3 method 일치 ✅
```

---

## 부록 B — 관련 문서

| 문서 | 경로 | 역할 |
|---|---|---|
| 진단 보고서 | `docs/03-analysis/협상우선순위-진단-2026-04-29.md` | 4 이슈 정밀 분석 + 전/후 매트릭스 |
| Silent Risk 계획서 | `docs/01-plan/features/silent-risk-detection.plan.md` | D+60 Decision Gate 보류 계획 |
| 운영 추적 템플릿 | `docs/03-analysis/운영-추적-템플릿-2026-04-29.md` | D+7/D+30/D+60 회고 양식 |
| 리본TS 제안서 | `docs/03-analysis/채권방문-리본TS-제안서-2026-04-29.md` | 방문 시 사용 자료 |
| 일성 분석 (이번 세션 답변) | (commit 미포함, 화면 출력만) | 일성 방문 시 사용 자료 |

---

**작성**: 2026-04-29 — 협상 우선순위 탭 정밀 진단 사이클 완료
**커밋**: `0619530` (origin/master 푸시 완료)
**다음 액션**: 사용자 dev 서버 수동 회귀 검증 → D+30 (2026-05-29) Python dry-run 재실행 → D+60 (2026-06-28) silent-risk-detection Decision Gate
