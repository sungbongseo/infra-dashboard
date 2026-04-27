# Phase A 완주 보고서 (WS3 + WS1 + WS2 통합)

**완료일**: 2026-04-23
**Phase**: v2 Phase A (McKinsey 95% 리디자인 1단계)
**Match Rate 평균**: 95.7%

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 값 |
|---|---|
| Phase | v2 Phase A (Quick Win) |
| Workstream | 3개 (WS3 공헌이익 노출 / WS1 Monte Carlo / WS2 캐파 Step-up) |
| 진행 순서 | WS3(+95) → WS1(+450) → WS2(+310) |
| 총 LOC | **+855** (Plan 추정 +730, +17% 버퍼) |
| 신규 모듈 | 2개 (`monteCarlo.ts`, `capacity.ts`) |
| 신규 테스트 | **+37개** (MC 22 + Capacity 15) 전원 통과 |

### 1.2 결과 요약

| 지표 | Phase A 시작 전 | **완료** | 증가 |
|---|---|---|---|
| McKinsey 달성도 | 21.7% | **47.3%** | +25.6%p |
| Match Rate 평균 | - | **95.7%** | (WS3: 100%, WS1: 94%, WS2: 93%) |
| 테스트 수 | 250 | **287** | +37 |
| Build | ✅ | ✅ | — |

### 1.3 Value Delivered (3 Workstream 통합)

| 관점 | Phase A 전 | Phase A 완료 | 측정 효과 |
|---|---|---|---|
| **Problem** | (1) 단위공헌이익 UI 부재 (2) 점추정값의 가짜 확신 (3) 캐파 Step-up 미반영 | 3대 Showstopper 모두 해소 | 3/3 완결 |
| **Solution** | 단일 결정론 CVP 계산 | 결정론 유지 + MC 엔진(+175) + 캐파 모듈(+160) + 공헌이익 UI(+95) | 재활용률 70%+ |
| **Function UX Effect** | 점추정값만 표시, 공헌이익 머리계산 필요 | 단위공헌이익 상시 2곳 노출, MC 4창(평균/CI/손실확률/σ), 캐파 gauge + breach 경고 + 숨겨진 투자비 배너 | UI 정보밀도 3배 |
| **Core Value** | McKinsey 전체 평균 21.7% | McKinsey 평균 **47.3%** (D 25→75%, E 40→50%, F 0→48%) | +25.6%p · 3개 축 진전 |

## 2. Workstream별 상세

### WS3 (단위공헌이익 상시 노출) — Match Rate 100%
- **임팩트**: 사용자 직전 질문 "+14,875원 어디서 나왔어?" 완전 해소
- **변경**: glossary 엔트리 1개 + adjustedCostInfo 확장 + 원가조정결과 블록 1줄 + 판단기 CM 배너
- **LOC**: +95 | **McKinsey**: E축 40→50%
- **보고서**: [ws3-단위공헌이익노출.report.md](docs/04-report/features/ws3-단위공헌이익노출.report.md)

### WS1 (Monte Carlo 불확실성 엔진) — Match Rate 94%
- **임팩트**: "박리다매 +6,319만" 점추정값 → "평균 +6,319만 (95% CI ±3,500만, 손실확률 22%)" 확률 분포로 전환
- **변경**: 신규 monteCarlo.ts (175 LOC) + calcMonteCarloVerdict + 판단기 MC 토글·4창 UI + 22 테스트
- **LOC**: +450 | **McKinsey**: D축 25→75% (+50%p)
- **보고서**: [ws1-monte-carlo.report.md](docs/04-report/features/ws1-monte-carlo.report.md)

### WS2 (캐파 Step-up 경고) — Match Rate 93%
- **임팩트**: "+5,500 ROL 증산" 판정의 숨겨진 설비 5억원 투자 변수 자동 경고
- **변경**: 신규 capacity.ts + 수불현황 자동 제안 + 판단기 gauge + 수동 조정 UI + 15 테스트
- **LOC**: +310 | **McKinsey**: F축 0→48% (+48%p)
- **분석**: [ws2-capacity-stepup.analysis.md](docs/03-analysis/ws2-capacity-stepup.analysis.md)

## 3. 누적 재활용 자산

| 자산 | Phase A 활용 |
|---|---|
| `calcTotalViewSimulation` | WS1 MC 내부 루프 / WS2 경고 (시뮬 반영 보류) |
| `vcCostRatioMap` useMemo | WS1 MC σ 추정 / WS3 공헌이익 계산 |
| `costChangePct` 슬라이더 | WS1 MC 기대값 / WS3 공헌이익 조정 |
| `MetricInfo` variant="inline" | WS3 툴팁 (2곳) |
| `InventoryMovementRecord` + dataStore | WS2 캐파 자동 제안 |
| `mulberry32`, `sampleNormal`, `sampleTriangular` (WS1 신규) | Phase B/C WS4·WS6 재사용 예정 |

## 4. Lessons Learned (Phase A 통합)

### Keep (잘된 점)
- 각 WS를 독립 PDCA 사이클로 진행 → Plan 성공 기준 명확, 체크리스트 검증 객관화
- 실측 σ/CV를 v2.1 Plan에 명시하고 코드화(FALLBACK_CV 상수) → 데이터 누적 시 자동 갱신 경로 확보
- 제네릭 유틸 설계(`runMonteCarlo`, `suggestItemCapacity`) → Phase B/C 작업량 20-30% 사전 절감

### Problem → Try
- Plan LOC 추정 오차 평균 +17% (WS3 +19%, WS1 +13%, WS2 +24%). 향후 Plan 수립 시 +20% 버퍼 표준화 권장
- MC Plan의 10k를 5k로 조정(UX 응답성). 사용자 검증 후 Web Worker로 10k 상향 가능
- WS2의 시뮬엔진 Step-up 자동 반영은 이번 범위 밖으로 남김(경고만 노출). Phase B 진입 전 사용자 결정 필요

### Try Next
- Phase B 시작 시 **WS4(PED) → WS5(LTV) 순**으로 권장. WS4의 회귀 유틸이 WS5 churn 확률 보정에도 재활용 가능
- Web Worker 전환은 Phase B 완료 후 일괄 이관 (MC + PED + LTV가 누적되면 성능 임계치 도달 예상)

## 5. 다음 단계

### Phase B (4~6주 예상, McKinsey 47→75%)
- **WS4 가격 탄력성 (PED)** — +350 LOC, 2주. 273개 품목 즉시 회귀 가능
- **WS5 LTV 거래처 가치** — +200 LOC, 1.5주. 1,584개 거래처 전수 LTV

### Phase C (8~12주 예상, McKinsey 75→95%)
- WS6 경쟁사 반응 게임이론
- WS7 시간 차원 (12개월 롤링 + 학습곡선)
- WS8 카니발라이제이션

## 6. 승인·롤아웃 체크리스트

- [ ] 경영진 데모 세션 (3개 WS 통합 시연)
- [ ] 실제 저가수주 건으로 End-to-End 테스트
- [ ] WS2 시뮬엔진 Step-up 반영 여부 결정 (자동 vs 수동 검토)
- [ ] Phase B 착수 승인
