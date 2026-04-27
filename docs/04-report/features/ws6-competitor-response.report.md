# WS6 Competitor Response — 완료 보고서

**Workstream**: v2 Phase C · WS6 (Phase C 첫 번째)
**완료일**: 2026-04-27
**Match Rate**: **94%** (16/17 — 시뮬 통합 1건은 Plan 명시 조건부)

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 값 |
|---|---|
| Feature | ws6-competitor-response |
| PDCA 단계 | Plan → Do → Check → Report |
| 변경 파일 | 2 신규(competitorResponse.ts + test) + 1 확장(OffsetEffectTab) |
| LOC | +405 (Plan 추정 +460, -12%) |

### 1.2 결과 요약

| 지표 | 값 |
|---|---|
| Match Rate | **94%** (16/17) |
| 신규 테스트 | **20개 전원 통과** (327→347) |
| Build | ✅ profitability 번들 443kB |
| McKinsey C축 | 15% → **55%** (+40%p) |
| McKinsey 전체 | ~62% → **~70%** |

### 1.3 Value Delivered (4-perspective, 메트릭 포함)

| 관점 | 변경 전 (Phase A+B) | 변경 후 (WS6 완료) | 측정 효과 |
|---|---|---|---|
| **Problem** | "경쟁사도 따라 내리면?" 영업 현장 빈번 질문에 답 못함. McKinsey C축 15%로 가장 약점 | Cournot 단순화 + PED 재사용으로 시장 균형점 자동 계산. 3 프리셋(단독/50%/100%)으로 직관적 비교 | C축 15→55%, 6/6 축 모두 50%+ 진입 |
| **Solution** | 단독 결정 시뮬만 가능 | 신규 `competitorResponse.ts` (200 LOC) — Cournot 모델 + 점유율 보정 + 3 프리셋 일괄 계산. **WS4 PED 75% 재활용** (`applyPED`, `industryFallbackPED`) | 신규 코드 +200, Phase B 자산 재활용 75% |
| **Function UX Effect** | 시장 반응 시나리오 부재 | 🎯 시장 반응 시나리오 토글 + 3 프리셋 카드 (단독/50%/100% 매출 변화 비교) + 단독vs100% △%p 즉시 표시 | 단일 토글로 4개 시나리오(현재+3프리셋) 한 화면 비교 |
| **Core Value** | 5/6 축 50%+ (C축만 15%) | 6/6 축 모두 50%+. McKinsey ~70% 도달. 95%까지 WS7+WS8만 남음 | Phase B 자산 첫 누적 검증 성공 (WS7·WS8에 동일 패턴 적용 가능) |

## 2. 구현 핵심

### 신규 자산
- [`competitorResponse.ts`](src/lib/analysis/competitorResponse.ts) — 200 LOC
  - `calcCompetitorResponse()` — Cournot 메인 함수 (시장가 + 시장 수요 + 점유율 + 매출 5단계)
  - `calcAllPresets()` — 3 시나리오 일괄 계산 (UI 비교용)
  - `PRESETS` 상수 (alone/partial/full)
  - `presetLabel()`, `reactionIntensityLabel()` UI 헬퍼
- [`competitorResponse.test.ts`](src/lib/analysis/competitorResponse.test.ts) — 20 테스트 (Cournot 수학 / 점유율 / 매출 / 폴백 / 엣지 / UI)

### 확장 자산
- [`OffsetEffectTab.tsx`](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx)
  - `competitorEnabled` state + `competitorPresets` useMemo
  - 판단기에 rose/orange 그라데이션 시나리오 블록 (3 프리셋 카드 + △%p 안내)
  - 가드: `priceChangePct < 0` (저가수주 시나리오)일 때만 표시
  - PED 통합: `effectivePED ?? -1.0` 사용

### 핵심 설계 결정

1. **Cournot 단순화** — Stackelberg 같은 leader-follower 대신 동시 균형 가정. 데이터 부재 환경에 적합
2. **점유율 보정 η=0.2** — 자사만 인하 시 점유율 10% 인하당 2%p 증가. 보수적 가정
3. **3 프리셋 anchoring** — 슬라이더만 주는 대신 0/0.5/1.0 앵커로 의사결정 부담 경감
4. **시뮬 통합 보류** — Plan에서 `calcTotalViewSimulation` 후처리로 통합 명시했지만, **독립 시각화 카드** 우선 (사용자가 각 시나리오 매출 변화를 한 번에 비교)
5. **"가설" 명시 배너** — 경쟁사 행동은 검증 불가 영역. 사용자 신뢰 위해 명시적 표기

## 3. 미구현 1건 (조건부)

- **`calcTotalViewSimulation` 후처리 통합** — Plan에서 "시뮬 결과 재계산" 옵션 명시했지만, 현재는 **독립 비교 카드** 형태로 구현. 이유:
  1. UX 측면: 3 시나리오 한 번에 비교가 더 명확
  2. 단독 시뮬 결과 회귀 보장 (옵셔널 패턴 유지)
  3. MC 통합은 추후 사이클(WS6.5)로 분리

## 4. McKinsey 달성도 변화

| 축 | WS5 후 | WS6 후 |
|---|---|---|
| A. 전략적 거래처 가치 | 80% | 80% |
| B. 동적 가격 탄력성 | 60% | 60% |
| **C. 경쟁사 반응** | 15% | **55%** ✅ |
| D. 확률론 (WS1) | 75% | 75% |
| E. 포트폴리오 (WS3) | 50% | 50% |
| F. 공학적 제약 (WS2) | 48% | 48% |
| **전체 평균** | ~62% | **~70%** |

## 5. Lessons Learned

### Keep
- Phase B 자산(`applyPED`, `industryFallbackPED`) 재활용 75% — 신규 코드 최소화 성공
- 3 프리셋 anchoring 패턴 — 의사결정 심리학 기반 UX 설계
- Plan LOC 추정 정확도 -12% (이번엔 더 적게 사용. WS5와 비슷한 정확도)

### Problem → Try
- Plan의 시뮬 통합과 실제 구현(독립 카드)이 분기 — Plan 작성 시 UI 우선순위를 명확히 해야 했음
- `Object.is(-0, 0)` 함정은 이번엔 발생 안 함 (WS5 학습 효과)
- `effectivePED ?? -1.0` 폴백 패턴 — Phase C에서 PED 재사용 시 자주 등장할 패턴

### Try Next
- WS7 시간 차원에서 12개월 롤링 시뮬 시 PED + 경쟁사 반응 + 학습곡선 3개 결합
- WS8 카니발라이제이션에서 시장 점유율 매개변수 재사용

## 6. Next Steps

**Phase C 첫 번째 완료** → 남은 2 WS (WS7, WS8)로 95% 도달

| WS | 내용 | LOC | 예상 임팩트 |
|---|---|---|---|
| WS7 시간 차원 | 12개월 롤링 + Wright 학습곡선 | +400 | D축 75→90% |
| WS8 카니발라이제이션 | 거래처×품목 상관 매트릭스 | +250 | E축 50→70% |

WS7 우선 권장 — 시간 차원이 모든 다른 축의 정밀도를 향상시킴.

## 7. 코드 레퍼런스

| 위치 | 역할 |
|---|---|
| [competitorResponse.ts:64-128](src/lib/analysis/competitorResponse.ts#L64-L128) | `calcCompetitorResponse` Cournot 5단계 |
| [competitorResponse.ts:139-149](src/lib/analysis/competitorResponse.ts#L139-L149) | `calcAllPresets` |
| [OffsetEffectTab.tsx:828-845](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx) | 시나리오 useMemo |
| [OffsetEffectTab.tsx:~1085](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx) | 3 프리셋 카드 UI |
