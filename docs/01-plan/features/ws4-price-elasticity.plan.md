# WS4 — 가격 탄력성 (PED) 모델 Plan

**Workstream**: v2 Phase B · WS4
**작성일**: 2026-04-23
**목표 Match Rate**: 95%+ (사용자 메모리 규칙)
**참조**: `~/.claude/plans/reactive-leaping-backus.md` v2.1

## Executive Summary

| 축 | 내용 |
|---|---|
| **Problem** | 저가수주 판단기의 물량 슬라이더가 "판가 변경 시 수요 불변" 비현실 가정. 판가 10% 인하 → 실제 수량은 탄력성에 따라 5~20% 증가하는데 현재 모델은 수량을 고정하고 수동 입력만 받음. 273개 품목은 14개월 실측 데이터로 즉시 PED 추정 가능한데 활용 안 함. |
| **Solution** | `priceElasticity.ts` 신규 모듈: 로그-선형 회귀(`log Q = α + β log P + ε`)로 PED 계수 β 자동 추정. `calcTotalViewSimulation`에 `usePED?: boolean` 플래그 추가. 판단기 UI에 "PED 자동 적용" 토글 + 계수 수동 조정. 이상 PED(<-5 또는 >0) 자동 트림. 폴백: 대분류 평균 PED → 업계 벤치마크. |
| **Function UX Effect** | 판가 슬라이더 -10% 조작 → PED=-1.2면 수량 +12% 자동 제안. 이중 입력(판가+수량)이 단일 의사결정(판가만)으로 축소. 판단기에 "PED=-1.2 (R²=0.68, n=12M)" 신뢰도 표시. Monte Carlo(WS1)에 PED 불확실성(회귀 표준오차)까지 통합. |
| **Core Value** | McKinsey "B. 동적 가격 탄력성" 20→60% (+40%p). 14개월 실측 기반 증거 분석 확립. WS6(경쟁사 반응 게임이론) 기반 재사용 자산 확보. 회귀 + 신뢰구간 + 폴백 체인 완비로 Phase B 품질 설계 표준 수립. |

## Context

**왜 지금 착수하나?**
- Phase A 완료로 McKinsey 47.3% 달성. 남은 축 A/B/C가 모두 "전략성" 영역이라 이번 Phase B가 47→75% 도약 구간.
- WS4 PED는 Phase B의 출발점 — WS5 LTV의 이탈확률 보정과 WS6 경쟁사 반응 시뮬 모두 PED 계수를 재사용.
- v2.1 실측 검증: 273개 품목 6M+ 관측 + 14개월 완전 관측 23개로 회귀 즉시 가능.

**의도한 결과**:
판가 슬라이더 1개만 조작하면 수량이 자동 반영되어 저가수주 시뮬이 "의사결정 변수 1개 + 자동 파생 1개"로 단순화. 사용자는 "5% 인하가 실제 경영진 결정이면 수량은 어떻게 될까?"에 집중할 수 있음.

## 변경 파일

| 파일 | 변경 성격 | 예상 LOC |
|---|---|---|
| `src/lib/analysis/priceElasticity.ts` | **신규** — PED 회귀 + 샘플 추출 + 폴백 체인 | +220 |
| `src/lib/analysis/priceElasticity.test.ts` | **신규** — 20+ 단위 테스트 | +180 |
| `src/lib/analysis/offsetEffect.ts` | `calcTotalViewSimulation`에 `usePED` + PED 계수 옵션 추가 | +30 |
| `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx` | 판단기에 PED 토글 + 계수 표시 + 수동 조정 | +80 |
| (선택) `src/lib/analysis/monteCarlo.ts` | PED 신뢰구간 샘플러 추가 (회귀 표준오차 → sampleNormal) | +20 |

**총 추정**: ~530 LOC (Plan v2.1 +350 추정 +51% 버퍼 — Phase A 평균 +17%보다 큼. 이유: 회귀·이상치 트림·R²·샘플 부족 폴백 등 통계 로직 +90 LOC 추가 고려)

## 재사용 자산

| 자산 | 경로 | WS4 활용 |
|---|---|---|
| 200 보고서 `ItemProfitabilityRecord` | `@/types/profitability` | 월별 단가·수량 쌍 추출 |
| 100 보고서 `CustomerItemDetailRecord` | `@/types` | 거래처별 PED 세분 (옵션) |
| `calcTotalViewSimulation` | `offsetEffect.ts:505` | PED로 변형된 `volumeAbsolute` 적용 |
| `mulberry32`, `sampleNormal` (WS1) | `monteCarlo.ts` | PED 신뢰구간 MC 샘플 |
| `calcSalesForecast` | `forecast.ts` | 단순 선형 회귀 유틸 (재활용 검토) |
| `timeSeriesDecomposition.ts` | 동상 | 계절성 제거 후 PED 추정 (고급 옵션) |
| `MetricInfo`, glossary 시스템 | `lib/metrics/` | PED 툴팁 (초/중/전문가 3 tier) |
| Phase A `estimateSigma` 폴백 패턴 | `monteCarlo.ts:82-88` | PED 폴백 체인 설계 참조 |

## 핵심 알고리즘

### 1. 회귀 모델: 로그-선형 (로지스틱 수요함수 단순화)

```ts
// log Q = α + β log P + ε
// PED = β (탄력성 계수)
// R² = 설명력

export interface PEDResult {
  itemCode: string;
  ped: number;           // 탄력성 계수 (일반적 -3 ~ 0)
  r2: number;            // 결정계수
  samples: number;       // 샘플 수 (월 수)
  stderr: number;        // PED 표준오차 (MC 입력)
  confidence: "high" | "medium" | "low" | "insufficient";
  method: "direct" | "category_fallback" | "industry_fallback";
}

function estimatePED(series: Array<{ month: string; unitPrice: number; quantity: number }>): PEDResult | null {
  const clean = series.filter(s => s.unitPrice > 0 && s.quantity > 0);
  if (clean.length < 6) return null; // 최소 6개월
  const logP = clean.map(s => Math.log(s.unitPrice));
  const logQ = clean.map(s => Math.log(s.quantity));
  // OLS: β = cov(logP, logQ) / var(logP)
  // R² = 1 - SSR/SST
  // stderr(β) = sqrt(MSE / Σ(logP - mean(logP))²)
  ...
}
```

### 2. 이상 PED 트림 (품목별 PED > 0 또는 < -5 방어)

```ts
function trimOutlierPED(ped: number): { trimmed: number; wasOutlier: boolean } {
  if (ped > 0) return { trimmed: 0, wasOutlier: true };    // 판가↑ = 수량↑ 비상식
  if (ped < -5) return { trimmed: -5, wasOutlier: true };  // 극단 탄력성 보정
  return { trimmed: ped, wasOutlier: false };
}
```

### 3. 3단계 폴백 체인

```
품목별 회귀 (n ≥ 6M) → 대분류 평균 PED → 업계 벤치마크 (-1.0 기본)
```

`industryBenchmark.ts` 참고. 인프라 B2B 제조업 대분류별 기본 PED:
- 아스팔트/방수시트: -0.8 (상대적 비탄력)
- 부재료/상품매입: -1.5 (탄력)
- 공사자재: -1.2 (중간)

### 4. 시뮬 통합

```ts
// calcTotalViewSimulation 확장
interface TotalSimInput {
  ...
  usePED?: boolean;
  pedCoeff?: number; // 사용자 override (없으면 자동 추정)
}

// 시뮬 내부:
if (usePED && pedCoeff !== undefined) {
  const priceRatio = 1 + priceChangePct / 100;
  const quantityRatio = Math.pow(priceRatio, pedCoeff);
  newQty = baseQty * quantityRatio;
}
```

## UI 통합

### 위치: 판단기 카드의 제안단가 입력 바로 아래

```
💼 PED 자동 적용 [ON/OFF]
   PED = -1.23 (R²=0.68, n=14M, 방어적)
   → 판가 -10% 시 수량 +12.3% 자동 제안
   [ 수동 조정: [_____] ]
```

### MC 통합 (Phase A WS1 재활용)

```tsx
// MC 샘플링 시 PED 분포 포함
const pedSample = sampleNormal(pedCoeff, stderr, rng);
const volRatio = Math.pow(priceRatio, pedSample);
```

## 엣지 케이스

| 케이스 | 처리 |
|---|---|
| 품목 14개월 완전 관측 | 최고 신뢰도 (high) |
| 품목 6-13개월 관측 | medium — 결과 표시하되 "n=X개월" 명시 |
| 품목 3-5개월 관측 | low — 폴백 계수와 비교 툴팁 |
| 품목 <3개월 또는 관측 없음 | insufficient — 대분류 폴백, "추정치" 명시 |
| PED > 0 (판가↑→수량↑) | 0으로 트림 + "역상관" 경고 |
| PED < -5 | -5로 클램핑 + "극단 탄력성" 경고 |
| 단가 분산 σ=0 (변동 없음) | 회귀 불가, 폴백 |
| 단가-수량 상관 NaN | 폴백 |

## Verification (검증 전략)

### 단위 테스트 (+180 LOC 예상)

1. `estimatePED` 정상 케이스 (14M 완전 관측 샘플로 이론값 검증)
2. 이상 PED 트림 (> 0, < -5)
3. 폴백 체인 3단계 전부 커버
4. R² 계산 정확성 (수동 계산값과 대조)
5. 표준오차 stderr 계산 (MC 연동 전제)
6. 신뢰도 레벨 4등급 (high/medium/low/insufficient)
7. 단가 분산 0 → 폴백
8. 샘플 < 6 → null 반환

### 수동 QA 시나리오

1. 14M 완전 관측 품목 선택 → PED + R² 자동 표시, 판가 슬라이더 조작 시 수량 자동 변화
2. 6M 관측 품목 → "n=6M, 신뢰도 medium" 배지
3. 관측 부족 품목 → 폴백 PED 사용 + 안내 문구
4. PED OFF → 기존(Phase A) 동작과 동일 (회귀 방어)
5. MC + PED 조합 → 판가 변경 시 CI 폭 확대 확인

### 빌드/타입 검증

```bash
npm run lint
npm run build
npm run test    # 287 → 305+ 예상
```

## Phase A 회귀 방어

| 항목 | 보장 |
|---|---|
| `usePED` 기본값 `false` | Phase A 기능 그대로 유지 |
| 기존 `calcTotalViewSimulation` 호출부 | 옵셔널 파라미터라 무변경 |
| MC 엔진 | PED 미사용 시 기존 σ만 적용 |
| 판단기 UI | PED 토글 기본 OFF |

## 성공 판정 기준

Phase B 진입 시 공식 WS4 완료 조건:

- [ ] 273개 6M+ 품목 중 85%+ (약 232개)가 `high`/`medium` 신뢰도 PED 산출
- [ ] 이상 PED 트림 로직 테스트 전원 통과
- [ ] 폴백 체인 3단계 모두 수동 QA 통과
- [ ] PED ON/OFF 비교 값 ±30% 이내 (큰 편차는 이상 신호)
- [ ] Monte Carlo + PED 조합 CI 폭 확대 시각 확인 (기대: +15~25%)
- [ ] McKinsey B축 20→60% 달성 (self-audit)

## 범위 외

- **거래처별 PED 세분화** — 100 보고서 기반 가능하나 샘플 부족 빈번. WS4.5 또는 Phase C로 이관
- **비선형 수요함수** (로지스틱/S커브) — 현 로그-선형으로 충분
- **계절성 제거** — `timeSeriesDecomposition` 연동은 고급 옵션, 초기는 원시 데이터 회귀
- **외생 변수 (환율/원자재 선물)** — Phase C 범위

## 리스크와 완화

| 리스크 | 가능성 | 완화 |
|---|---|---|
| 273개 중 90%+ R² < 0.3 (약한 상관) | 중 | 신뢰도 레벨로 사용자에게 명시, 폴백 자동 적용 |
| PED 음수여도 상식 이상 절댓값 | 중 | -5 클램핑 + 경고 |
| 판가 변동성 ↓ (σ→0) | 높음 | "변동 이력 부족" 배지 + 업계 벤치마크 폴백 |
| 사용자 혼란 "자동 수량 = 이해 안 됨" | 중 | MetricInfo 툴팁에 공식+R²+예시 표기, 토글 기본 OFF |

## 예상 영향

- **LOC**: +530 (Plan v2.1 추정 +350, +51% 버퍼)
- **McKinsey**: 47.3% → **약 54%** (B축 +40%p × 축 가중치 = 약 +6~7%p 전체)
- **의존성**: Phase A 모듈 재사용 70% (MC 엔진, MetricInfo, glossary)
- **Phase B 완료까지 남은 WS**: WS5 LTV (+200 LOC)

## 다음 단계 (Plan 승인 후)

1. `/pdca design ws4-price-elasticity` (선택) — 세부 설계 문서
2. 또는 바로 `/pdca do` 착수
3. Match Rate ≥ 95% 달성 후 `/pdca analyze ws4-price-elasticity`
4. 완료 후 `/pdca report ws4-price-elasticity` → WS5로 진행
