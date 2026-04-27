# WS6 — 경쟁사 반응 게임이론 Plan

**Workstream**: v2 Phase C · WS6 (Phase C 첫 번째)
**작성일**: 2026-04-27
**목표 Match Rate**: 95%+
**참조**: `~/.claude/plans/reactive-leaping-backus.md` v2.1

## Executive Summary

| 축 | 내용 |
|---|---|
| **Problem** | 저가수주 판단기는 "내 결정"의 효과만 평가. **"경쟁사도 따라 내리면 어떻게 되나?"**라는 6개월 후 시장 피드백 시나리오가 모델에 부재. McKinsey C축 15%로 가장 약점. 영업 현장에서 가장 자주 듣는 질문 ("경쟁사 다 쫓아오면?") 미해결. |
| **Solution** | `competitorResponse.ts` 신규 — Cournot 단순화 게임이론으로 경쟁사 가격 대응 시뮬레이션. **WS4 PED 재사용**: 시장 평균가 변화 → PED로 시장 전체 수요 변화 → 자사 점유율 가정으로 내 매출 재계산. 3단계 프리셋(단독/50% 반응/100% 반응) + Monte Carlo 통합으로 확률 가중 기대값. |
| **Function UX Effect** | 판단기에 **🎯 시장 반응 시나리오** 토글 + 3 프리셋 버튼. 활성 시 단독 결정 결과와 비교한 △ 표시: "단독 +6,319만 → 100% 보복 시 -2,100만 (반전 가능성 있음)". 경쟁사 반응 강도 슬라이더(0~100%) 수동 조정. |
| **Core Value** | McKinsey C축 15→**55%** (+40%p, 가장 큰 단일 도약 중 하나). PED + MC + 게임이론 3단 결합으로 "장기 시장 균형" 차원 추가. Phase C 첫 번째 자산으로 WS7·WS8에 부분 재사용 가능 (시장 가정 패러미터). |

## Context

**왜 지금 착수하나?**
- Phase B 완료 → McKinsey ~62%. Phase C로 95% 도달까지 3 WS 남음 (WS6, WS7, WS8)
- 영업 현장 피드백: "저가수주 6개월 후 경쟁사 가격이 따라오면 우리 이익은?" 빈번 질문
- WS4 PED 모듈 (Phase B 자산)을 시장 평균가 변동에 직접 적용 가능 — 재활용 강한 시점
- 외부 데이터 부재 한계 명확 → "시나리오 프리셋 + 사용자 가정"으로 구조화 가능

**의도한 결과**:
저가수주 검토 시 "단독 판정 +6,319만"과 함께 "경쟁사 50% 보복 시 +1,800만 / 100% 보복 시 -2,100만"이 동일 화면에 비교 표시. 3 시나리오를 한 클릭으로 토글 + 사용자가 반응 강도 0~100% 슬라이더로 정밀 조정. 의사결정자는 "가장 비관 시 손실 감내 가능?"을 즉답.

## 변경 파일

| 파일 | 변경 성격 | LOC |
|---|---|---|
| `src/lib/analysis/competitorResponse.ts` | **신규** — Cournot 모델 + 시장 평균가 + PED 재사용 + 시나리오 프리셋 | +200 |
| `src/lib/analysis/competitorResponse.test.ts` | **신규** — 18 테스트 | +130 |
| `src/lib/analysis/offsetEffect.ts` | `calcTotalViewSimulation`에 `competitorReactionPct?` + 후처리 옵션 | +25 |
| `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx` | 판단기에 시나리오 프리셋 + 슬라이더 + △ 비교 표시 | +90 |
| (옵션) `glossary-profitability.ts` | `competitor_reaction` 엔트리 (3 tier) | +15 |

**총 추정**: +460 LOC (Plan v2.1 +300 추정 +53% 버퍼 — Phase B 평균과 유사. 이유: 게임이론 단순화 모델 + 3 프리셋 UI + Monte Carlo 통합 +130 LOC)

## 재사용 자산 (Phase B 자산 재활용)

| 자산 | 경로 | WS6 활용 |
|---|---|---|
| `estimatePED` | `priceElasticity.ts:190` | 시장 평균가 변화 → 시장 수요 변화 변환 |
| `applyPED` | `priceElasticity.ts:256` | 자사 수량 = baseQty × (시장가 변동)^PED × 점유율 보정 |
| `industryFallbackPED` | `priceElasticity.ts:135` | 시장 데이터 부재 시 폴백 |
| `calcMonteCarloVerdict` | `offsetEffect.ts:1762` | 경쟁사 반응 강도 분포(삼각: 0/50/100%) 결합 |
| `mulberry32`, `sampleTriangular` | `monteCarlo.ts` | 반응 강도 확률 분포 |
| `MetricInfo` glossary 시스템 | `lib/metrics/` | 시나리오 프리셋 툴팁 |
| `costChangePct`, `usePED` 옵셔널 패턴 | offsetEffect.ts | `competitorReactionPct?` 동일 패턴 |

## 핵심 알고리즘

### 1. Cournot 단순화 모델

```
변수 정의:
  P1 = 자사 새 판가 (사용자 입력)
  P0 = 자사 기존 판가
  Pmkt0 = 시장 평균 기존 판가 (= P0로 근사 — 자체 데이터만 사용)
  R = 경쟁사 반응 강도 (0~1, 사용자 선택)
  M = 자사 시장 점유율 (0~1, 기본 0.30 추정)

경쟁사 반응 후 시장 평균:
  Pmkt1 = R × P1 + (1-R) × Pmkt0
  // R=1 (100% 보복): 경쟁사도 P1로 인하 → Pmkt1 = P1
  // R=0 (단독): 경쟁사 무반응 → Pmkt1 = Pmkt0

시장 전체 수요 변화 (PED 적용):
  Qmkt1 / Qmkt0 = (Pmkt1 / Pmkt0) ^ PED

자사 수요 = 시장 수요 × 자사 점유율:
  내 수량 변화율 = ΔPmkt → ΔQmkt × M
  단, R=0이면 자사 점유율 ↑ (경쟁사 보복 X로 시장 일부 흡수)
  M_new = M + (1 - R) × (자사 가격 인하 정도) × η  (η=점유율 반응 계수, 기본 0.2)

내 매출 = 내 단가 × 내 수량 = P1 × (M_new × Qmkt1)
```

### 2. 3 프리셋 시나리오

```ts
type CompetitorScenario = "alone" | "partial" | "full";

const PRESETS: Record<CompetitorScenario, { reactionPct: number; label: string; description: string }> = {
  alone:   { reactionPct: 0,   label: "단독 결정", description: "경쟁사 무반응 가정" },
  partial: { reactionPct: 0.5, label: "50% 반응", description: "경쟁사 절반이 가격 동반 인하" },
  full:    { reactionPct: 1.0, label: "100% 보복", description: "전 경쟁사 동등 인하" },
};
```

### 3. UI 통합 (3 프리셋 + 비교 표시)

```
🎯 시장 반응 시나리오
┌──────────┬──────────┬──────────┐
│ 단독 결정 │ 50% 반응 │ 100% 보복 │  ← 클릭 토글
└──────────┴──────────┴──────────┘
반응 강도: [════════] 50% (수동 조정)

비교 표시 (3카드 그리드와 동일 형식):
   단독 +6,319만 │ 50% 반응 +1,800만 │ 100% 보복 -2,100만
```

### 4. Monte Carlo 통합 (확률 가중 기대값)

```ts
// MC 토글 ON + 경쟁사 시나리오 선택 시:
// 반응 강도를 sampleTriangular(0, 0.5, 1.0)로 샘플링
// 5,000 iteration 각각 반응 강도 + 원가/물량 분포 동시 적용
// → 기대값 + 95% CI + 손실확률 산출
// 결과: "전체 시나리오 평균 +1,200만, 95% CI -3,500만 ~ +6,800만, 손실확률 35%"
```

## 엣지 케이스

| 케이스 | 처리 |
|---|---|
| PED 부재 (insufficient) | 산업 폴백 -1.0 사용 + "추정치" 배지 |
| 자사 점유율 미입력 | 기본 30% (인프라 B2B 평균 가정) |
| `priceChangePct >= 0` (인상) | 경쟁사 반응 시나리오 비활성 (저가수주 가설 무관) |
| 반응 강도 > 100% | 100%로 클램핑 |
| 시장 평균 = 0 | 회귀 불가, 단독 시나리오로 폴백 |

## Verification

### 단위 테스트 (18개 예상)
1. Cournot 공식 — R=0 → 단독, R=1 → 100% 보복 (수학적 정확성)
2. 점유율 보정 — R=0일 때 점유율 증가, R=1일 때 변화 없음
3. 3 프리셋 일관성 (alone < partial < full 패턴)
4. PED 재사용 — `applyPED` 호출 정확성
5. 인상 시 반응 시나리오 비활성
6. 반응 강도 클램핑 [0, 1]
7. PED insufficient 폴백
8. MC 통합 — 5k iteration 기대값 합리성
9. 시장 평균 0 방어
10. -0 회피 (mirror 패턴)

### 빌드/회귀
- `competitorReactionPct?` 옵셔널 → Phase A/B 동작 그대로
- 기본값 `undefined` → 단독 시뮬 (회귀 0)

## 성공 판정 기준

- [ ] 3 프리셋 토글 시 결과값 단조성 검증 (alone ≥ partial ≥ full)
- [ ] PED 재사용 — `applyPED` 호출이 단위 테스트로 확인
- [ ] MC + 경쟁사 통합 — 5,000 iteration 1.5초 이내
- [ ] McKinsey C축 self-audit 55% 달성
- [ ] 18 단위 테스트 전원 통과

## 회귀 방어 (Phase A+B 동작 보존)

| 항목 | 보장 |
|---|---|
| `competitorReactionPct` 미지정 | 기존 단독 시뮬과 동일 결과 |
| 토글 OFF (기본) | UI 미렌더 → 기존 화면 그대로 |
| MC 통합 | 경쟁사 변수 없으면 기존 4창 결과 동일 |
| feature-flag 패턴 | WS1·WS4와 동일 — 옵셔널 props 추가만 |

## 범위 외

- **실제 경쟁사 가격 데이터 연계** — 외부 API 부재. v3 이후
- **나의 시장 점유율 정확 측정** — 기본 30% 추정. 사용자 수동 조정 허용
- **다중 경쟁사 차등 반응** — 균질 가정. Phase C 후 별도 R&D
- **장기 균형 시뮬** (T+12개월) — WS7 시간 차원에서 처리
- **카니발라이제이션 결합** — WS8과 분리 진행

## 리스크와 완화

| 리스크 | 가능성 | 완화 |
|---|---|---|
| Cournot 가정 과잉 단순화 | 중-상 | "이것은 가설입니다" 배너 + 사용자 점유율·반응강도 수동 조정 |
| 점유율 30% 기본값 부정확 | 중 | UI에 명시적 점유율 입력 필드 노출 |
| 경쟁사 반응 강도 불확실성 | 매우 높음 | MC 삼각분포로 반응 강도까지 확률화 |
| 사용자 "이론 모델 거부감" | 중 | 3 프리셋(단독/50/100%)으로 직관 단순화. 슬라이더는 보조 |

## 예상 영향

- **LOC**: +460 (Plan v2.1 추정 +300, +53%)
- **McKinsey C축**: 15% → **55%** (+40%p, 단일 최대 도약 중 하나)
- **McKinsey 전체**: 62% → **약 70%** (+8%p)
- **WS7·WS8 자산**: PED + 점유율 추정 패러미터 재활용 가능
- **Phase C 진행률**: 1/3 완료 (WS7·WS8 남음)

## 다음 단계 (Plan 승인 후)

1. `/pdca do ws6-competitor-response` 또는 바로 구현 착수
2. Match Rate ≥ 95% 달성 후 Gap 분석 + Report
3. Phase C 진행: WS7 (시간 차원) → WS8 (카니발라이제이션) → 최종 95% 달성
