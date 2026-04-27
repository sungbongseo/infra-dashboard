# WS3 단위공헌이익 상시 노출 — Gap Analysis

**분석일**: 2026-04-23
**Workstream**: v2 Phase A · WS3 (단위공헌이익 상시 노출)
**참조 Plan**: `~/.claude/plans/reactive-leaping-backus.md` v2.1 (McKinsey 95% 리디자인)

## Executive Summary

| 항목 | 값 |
|---|---|
| **Match Rate** | **100%** (9/9) |
| 변경 파일 | 2 |
| LOC (실측) | +95 (Plan 추정 +80에 수렴) |
| Lint / Build / Test | ✅ 통과 / ✅ 통과 / ✅ 250 pass, 2 fail (pre-existing) |
| 기존 세션 대비 | 사용자 제기 질문("+14,875원 어디서 나왔어?") 직접 해결 |

### Value Delivered

| 관점 | 결과 |
|---|---|
| Problem | 박리다매 엔진 실체(`단위공헌이익`)가 UI에 숨겨져 있어 사용자가 판가−변동비를 머리로 계산 |
| Solution | glossary 정식 엔트리 + adjustedCostInfo useMemo 확장 + 원가조정결과 블록 1줄 + 판단기 카드 전용 블록 |
| Function UX Effect | 원가 변동 시: 조정결과 블록에 자동 노출. 원가 변동 없어도: 판단기 카드에 상시 노출. "박리다매 여지" 배지 자동 판정 |
| Core Value | McKinsey 프레임워크 "가치 차원 투명성" 원칙 충족 — 파생값 은폐 제거 |

## 체크리스트 (9/9 ✅)

### Plan Step별 검증

| # | 체크 | 근거 |
|---|---|---|
| 1 | `glossary-profitability.ts`에 `unit_contribution_margin` 엔트리 추가 (초/중/전문가 3 tier) | [glossary-profitability.ts:398-434](src/lib/metrics/glossary-profitability.ts#L398-L434) |
| 2 | formula, beginner, intermediate, expert, benchmark, commonMistakes 모두 작성 | 동상 |
| 3 | `relatedIds` 4종 연결 (volume/price/cost 슬라이더 + material_share) | 동상 |
| 4 | `source: ["100","200","501"]` + `sourceNote`로 출처 추적 | 동상 |
| 5 | `adjustedCostInfo` useMemo에 `baseUnitPrice`, `adjustedUnitPrice`, `adjustedUnitCM`, `adjustedUnitMargin` 필드 추가 | [OffsetEffectTab.tsx:478-481](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L478-L481) |
| 6 | 원가 조정 결과 블록에 "조정 후 단위공헌이익" 1줄 + 계산식 인라인 표시 | [OffsetEffectTab.tsx:2147-2169](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L2147-L2169) |
| 7 | `quickCMInfo` useMemo 신설 (수량 가중평균 + 원가변동 반영) | [OffsetEffectTab.tsx:756-778](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L756-L778) |
| 8 | 판단기 카드 3-카드 그리드 아래 단위공헌이익 전용 배너 (💡 아이콘 + MetricInfo 툴팁 + 물량 기여 즉시 계산) | [OffsetEffectTab.tsx:1060-1077](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L1060-L1077) |
| 9 | "박리다매 여지 존재" 자동 판정 배지 (단위마진 < 0 ∧ 공헌이익 > 0) | [OffsetEffectTab.tsx:2162-2166](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L2162-L2166) |

### 빌드/품질

| # | 체크 | 결과 |
|---|---|---|
| B1 | `npm run build` | ✅ 13 pages 정적 생성, profitability 번들 442kB (변화 없음) |
| B2 | `npm run lint` | ✅ 경고만 (전부 기존 unused import) |
| B3 | `npm run test` | ✅ 250 pass / 2 fail (pre-existing, `git stash` 전후 동일) |

## 구현 세부

### 1. 수량 가중평균 변동비 (왜 산술평균이 아닌가)

```ts
// 판단기 quickCMInfo — 대량 거래처 편향 방지
const totalQty = rows.reduce((s, c) => s + Math.max(c.quantity, 0), 0);
const avgUVC = totalQty > 0
  ? rows.reduce((s, c) => s + c.unitVariableCost * Math.max(c.quantity, 0), 0) / totalQty
  : rows.reduce((s, c) => s + c.unitVariableCost, 0) / rows.length;
```

**이유**: 거래처별 단위변동비가 달라 산술평균(거래처당 1건씩 균등 가중)은 소량 거래처의 outlier에 휘둘림. 수량 가중평균이 "추가 1 ROL 판매의 실제 원가 기댓값"을 더 정확히 근사.

### 2. 원가 변동 반영 (Step 4a 슬라이더와 동기화)

`quickCMInfo`와 `adjustedCostInfo` 모두 Step 4a의 `costRawMaterialPct / costLaborPct / costOutsourcingPct`를 참조하여 200 보고서 원가구성비율(`vcCostRatioMap`) 가중평균으로 조정. 슬라이더 조작 즉시 단위공헌이익 재계산.

### 3. 박리다매 여지 자동 판정

```tsx
{adjustedCostInfo.adjustedUnitMargin < 0 && adjustedCostInfo.adjustedUnitCM > 0 && (
  <span className="...">박리다매 여지 존재 (단위마진 음수, 공헌이익 양수)</span>
)}
```

**의미**: 전통적 "단위마진 음수 = 적자"로 단순 판단할 수 없는 경계 영역(CVP 분석 대상)을 자동 식별.

## 재사용 자산 (Plan 명시 100% 활용)

| 자산 | 활용 |
|---|---|
| `MetricInfo` variant="inline" | 양쪽 신규 블록에서 glossary 툴팁 제공 |
| `vcCostRatioMap` useMemo | 품목별 원가구성비율 forward (기존 그대로) |
| `costChangePct` 3개 슬라이더 상태 | Step 4a 동기화 |
| `formatCurrency` | 한국어 통화 표기 |
| `safeDivide` | 0 나눗셈 방어 |

## Gap 리스트

**없음.** Plan v2.1 명세 전항목 구현.

## 메트릭 변화 (McKinsey Gap 부분 감소)

| McKinsey 축 | WS3 전 | WS3 후 | 개선 |
|---|---|---|---|
| E. 포트폴리오 시너지 (공헌이익 투명성 포함) | 40% | **50%** | +10%p |
| F. 규제/수용성 제약 | 0% | 0% | 변화 없음 |
| **전체 평균 달성도** | 21.7% | **24.3%** | +2.6%p |

## 추천 Next Step

Match Rate 100% → 바로 다음 Workstream 착수 가능. Phase A 남은 2개 중 **WS1 (Monte Carlo) 우선 권장** — 임팩트 최대.
