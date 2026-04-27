# WS7 시간 차원 (12개월 롤링) — 완료 보고서

**Workstream**: v2 Phase C · WS7 (Phase C 두 번째)
**완료일**: 2026-04-27
**Match Rate**: **96%** (24/25 — 24개월+ 시뮬은 Plan 명시 범위 외)

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 값 |
|---|---|
| Feature | ws7-time-dimension |
| PDCA 단계 | Plan → Do → Check → Report |
| 변경 파일 | 2 신규(timeSeriesSimulation.ts + test) + 1 확장(OffsetEffectTab) |
| LOC | +485 (Plan 추정 +520, -7%) |

### 1.2 결과 요약

| 지표 | 값 |
|---|---|
| Match Rate | **96%** (24/25) |
| 신규 테스트 | **31개 전원 통과** (347→378) |
| Build | ✅ profitability 번들 ~445kB |
| McKinsey D축 | 75% → **90%** (+15%p) |
| McKinsey 전체 | ~70% → **~80%** |

### 1.3 Value Delivered (4-perspective, 메트릭 포함)

| 관점 | 변경 전 (Phase A+B+WS6) | 변경 후 (WS7 완료) | 측정 효과 |
|---|---|---|---|
| **Problem** | t=0 단일 스냅샷 시뮬만 가능. "초기 6개월 손실 → 후반 흑자 전환" 같은 시간 차원 평가 불가. 원가 인상 지연·계절성·NPV 모두 부재 | 12개월 월별 시뮬 + Wright 학습곡선 + costLag 3M 기본 + NPV 할인. BEP 시점 자동 산출 | "단기 vs 장기" 의사결정 프레임 도입 |
| **Solution** | 단일 시점 결정론 | 신규 `timeSeriesSimulation.ts` (250 LOC) — Wright 공식 + 선형 ramp lag + 계절성 + NPV. 월별 12 포인트 객체 배열 반환 | Phase A/B/C 누적 자산 재활용 75% (timeSeriesDecomposition, forecast, PED) |
| **Function UX Effect** | 단일 숫자 결과 | 🕒 12개월 시뮬 토글 + ComposedChart (월별 손익 막대 + 누적 NPV 라인) + 학습률·lag 슬라이더 + 3개 KPI 카드 (NPV/BEP/평균 학습 절감) | 동적 인사이트 ("M3 흑자 전환 / 12M NPV +5,800만") |
| **Core Value** | McKinsey D축 75%로 정밀도 한계 | D축 75→**90%** (+15%p, Phase C 두 번째 도약). 시간 차원이 모든 다른 축의 정밀도 향상 | McKinsey ~80% 도달, 95%까지 WS8만 남음 |

## 2. 구현 핵심

### 신규 자산
- [`timeSeriesSimulation.ts`](src/lib/analysis/timeSeriesSimulation.ts) — 250 LOC
  - `calcTimeSeriesSimulation()` 메인 (12개월 월별 시뮬 + NPV)
  - `wrightLearningCurve()` 순수 함수 (테스트 가능)
  - `costLagFactor()` 선형 ramp-up
  - `getSeasonalFactor()`, `extractSeasonalPattern()` decomp 결과 추출
  - `summarizeBEP()`, `formatMonthLabel()` UI 헬퍼
  - 4개 상수 export (학습률 기본/min/max + 시뮬 horizon)
- [`timeSeriesSimulation.test.ts`](src/lib/analysis/timeSeriesSimulation.test.ts) — 31 테스트
  - Wright 공식 수학적 검증
  - 학습률 클램핑 [0.5, 1.0]
  - lag 0/3/12 케이스
  - 계절성 패턴 적용
  - NPV vs 단순 누적 비교
  - BEP 도달/미도달 양 케이스
  - 엣지 케이스 (0 입력 방어)

### 확장 자산
- [`OffsetEffectTab.tsx`](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx)
  - `tsEnabled`, `learningRate`, `lagMonths` 3개 state
  - `tsResult` useMemo (cvpItems → baseQty/initialUnitVC 추정)
  - 청록(cyan) 그라데이션 시간 차원 블록
  - ComposedChart (월별 손익 막대 + 누적 NPV 라인) + 3 KPI 카드 + 슬라이더
  - `ResponsiveContainer` import 추가 (이전엔 미사용)

### 핵심 설계 결정

1. **Wright 공식 채택** — Henderson Curve나 Stanford-B 같은 변형보다 가장 단순하고 검증된 모델. 학습률 1개 파라미터로 표현 가능
2. **선형 ramp lag** — 비선형(S-curve) 대신 단순 선형. 사용자 직관적
3. **NPV 월 0.5% 기본** — 연 6%, 인프라 B2B 일반 자본비용 추정. 사용자 조정은 추후 옵션
4. **horizon=12 고정** — 14M 데이터 한계로 더 길면 신뢰도 급락
5. **Phase B/C 자산 재활용 75%** — `decomposeTimeSeries`, `applyPED`, `MetricInfo` 모두 활용
6. **느린 변동(VC) vs 빠른 변동(price) 분리** — 학습곡선은 VC만, 단가는 고정 가정. 단순화

## 3. 미구현 1건 (조건부)

- **24개월+ 시뮬** — 현재 데이터 14M 한계. Plan 범위 외 ("v3 이상" 명시)

## 4. McKinsey 달성도 변화

| 축 | WS6 후 | WS7 후 |
|---|---|---|
| A. 전략적 거래처 가치 | 80% | 80% |
| B. 동적 가격 탄력성 | 60% | 60% |
| C. 경쟁사 반응 | 55% | 55% |
| **D. 확률론 (WS1)** | 75% | **90%** ✅ |
| E. 포트폴리오 (WS3) | 50% | 50% |
| F. 공학적 제약 (WS2) | 48% | 48% |
| **전체 평균** | ~70% | **~80%** |

## 5. Lessons Learned

### Keep
- 순수 함수 분리 (Wright/lag/seasonal) — 테스트 31개 작성 용이
- ComposedChart 패턴 재활용 — 차트 신규 LOC 최소화
- Phase B/C 자산 재활용 75%+ 일관 유지

### Problem → Try
- TOOLTIP_STYLE이 props 모음(contentStyle/labelStyle/cursor)인 줄 모르고 contentStyle prop으로만 전달 시도 → 빌드 실패. 다음부터 utils의 export 객체 구조 grep 선행
- ResponsiveContainer 누락 → 차트 신규 추가 시 import 체크리스트 필요

### Try Next
- WS8 카니발라이제이션에서 시간 축 매트릭스 (월별 거래처×품목 상관)에 동일 패턴 재사용 가능
- 24개월+ 시뮬은 데이터 누적 후 Phase v3 이관

## 6. Next Steps

**Phase C 2/3 완료** → 마지막 WS8만 남음

| WS | 내용 | 예상 임팩트 |
|---|---|---|
| WS8 카니발라이제이션 | 거래처×품목 상관 매트릭스 (자기잠식 효과) | E축 50→70% → McKinsey ~85-95% 도달 |

**Phase C 종료 = McKinsey 95% 달성 예상**.

## 7. 코드 레퍼런스

| 위치 | 역할 |
|---|---|
| [timeSeriesSimulation.ts:81-92](src/lib/analysis/timeSeriesSimulation.ts#L81-L92) | Wright 학습곡선 + lag |
| [timeSeriesSimulation.ts:111-188](src/lib/analysis/timeSeriesSimulation.ts) | 메인 시뮬 함수 |
| [OffsetEffectTab.tsx:~810](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx) | tsResult useMemo |
| [OffsetEffectTab.tsx:~1230](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx) | 12개월 차트 UI |
