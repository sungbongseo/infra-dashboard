# WS8 카니발라이제이션 — Gap 분석 보고서

**분석일**: 2026-04-27
**최종 갱신**: 2026-04-27 (gap-01 해결 후 재집계)
**분석자**: bkit-gap-detector + 자동 후속 조치
**Plan 문서**: `docs/01-plan/features/ws8-cannibalization.plan.md`

---

## 결론 (Conclusion First) — 최종

| 항목 | 값 |
|---|---|
| **Match Rate (최종)** | **36 / 36 (100%)** ✅ |
| **판정** | **PASS** (사용자 100% 정책 기준) |
| **이력** | 1차 분석: 35/36 (97.2%) → gap-01(heatmap) 즉시 해결 → **100% 도달** |

### 1차 분석 (gap-01 해결 전)
| 항목 | 값 |
|---|---|
| Match Rate | 35 / 36 (97.2%) |
| 판정 (Plan 95% 기준) | PASS ✅ |
| 판정 (사용자 100% 정책) | FAIL ❌ — 1건 GAP |
| 유일 GAP | 잠식 매트릭스 heatmap UI (Top-15 × 15) 미구현 |

### gap-01 해결 조치
- **위치**: `OffsetEffectTab.tsx` line 1389~ (△ 비교 위에 삽입, +85 LOC)
- **구현**: Top-N × Top-N HTML table 격자, violet 5단계 그라데이션, 양의 상관 회색(보완재), 같은 대분류 ring 외곽선 강조, 셀 hover 시 품목쌍/ρ/c/신뢰도/거래처 수 툴팁
- **데이터 활용**: `cannibalResult.matrix` + `topItemsByRevenue`로 N×N 매트릭스 구축, `Map<itemA__itemB, cell>` 룩업으로 O(1) 접근
- **회귀 검증**: 테스트 29/29 통과, 빌드 성공 (profitability 번들 27.4 kB 유지), TS 에러 0
- **접근성**: `role="grid"` + `aria-label`, sticky 헤더 (열/행 1번째), `overflow-x-auto` 모바일 대응, `title` 속성으로 키보드 hover 정보 노출

---

## 요약 표 (Plan vs 구현)

| # | 항목 | Plan 명시 | 구현 상태 | 결과 |
|---|---|---|---|---|
| 1 | `cannibalization.ts` 신규 | +280 LOC | 533 LOC | ✅ |
| 2 | `cannibalization.test.ts` | +180 LOC, 25 테스트 | 365 LOC, **29 테스트** | ✅ |
| 3 | `offsetEffect.ts` 확장 | +30 LOC | 후처리 옵션 추가 | ✅ |
| 4 | `OffsetEffectTab.tsx` UI | 토글+프리셋+heatmap+Top-N+△ | 토글+프리셋+슬라이더+△+Top-N+**heatmap (gap-01 해결)** | ✅ |
| 5 | glossary 3 엔트리 (옵션) | cannibalization, cannibal_rate, portfolio_net_effect | 3 엔트리 모두 추가 | ✅ |
| 6 | Pearson 상관 | 분산 0/길이 <2 방어 | 정확 구현 | ✅ |
| 7 | 회귀 기울기 β | Cov/Var(B) | 정확 구현 | ✅ |
| 8 | elasticity ε | β × meanB / meanA | `calcElasticity` 정확 | ✅ |
| 9 | 카니발 c | max(0, -ρ × \|ε\|) × boost → clamp | 정확 구현 | ✅ |
| 10 | 음의 상관만 활성 | 명시 | `correlation >= 0` 조기 반환 | ✅ |
| 11 | meanA/meanB ≤ 0 방어 | 명시 | 조기 반환 | ✅ |
| 12 | 대분류 1.5배 보정 | 명시 | `SAME_CATEGORY_BOOST = 1.5` | ✅ |
| 13 | 거래처별 그룹화 | 명시 | 3중 Map 구조 | ✅ |
| 14 | ≥4M 필터 | MIN_SAMPLE_MONTHS=4 | 정확 적용 | ✅ |
| 15 | 거래처별 ρ 평균 | 명시 | PairAccum 누적→평균 | ✅ |
| 16 | Top-N 15 한정 | 명시 | TOP_N_ITEMS=15 | ✅ |
| 17 | 신뢰도 분류 | 4M low / 8M med / 12M+ high | `classifyConfidence` | ✅ |
| 18 | target=itemB 필터 | 명시 | applyCannibalCorrection | ✅ |
| 19 | effectRatio 산식 | 명시 | 동일 계산 | ✅ |
| 20 | expectedLoss 산식 | 명시 | 정확 적용 | ✅ |
| 21 | TOP_N_CANNIBALIZED=5 | 명시 | slice 적용 | ✅ |
| 22 | 절댓값 정렬 | 명시 | `Math.abs(b)-Math.abs(a)` | ✅ |
| 23 | 3 프리셋 0.5/1.0/1.5 | 명시 | PRESETS 정확 | ✅ |
| 24 | inbound/outbound risk | 명시 | ItemRiskScore 인터페이스 | ✅ |
| 25 | UI 위치 (WS7→WS8→WS6) | violet/purple 블록 | 정확 배치 | ✅ |
| 26 | 조건부 렌더 | targetItem && qdProposedPrice > 0 | 동일 적용 | ✅ |
| 27 | 토글 OFF 기본 | 회귀 방어 | useState(false) | ✅ |
| 28 | 데이터 부족 안내 배지 | 명시 | amber 배지 | ✅ |
| 29 | "상관 ≠ 인과" 명시 | 명시 | italic 표기 | ✅ |
| 30 | △ 3-grid 비교 | 명시 | emerald/amber/violet 색상 | ✅ |
| 31 | 잠식 Top-N 리스트 | 명시 | 정확 구현 | ✅ |
| 32 | **잠식 매트릭스 heatmap** | 명시 (Plan ASCII 도식) | **✅ 구현 완료 (gap-01 해결, +85 LOC)** | ✅ |
| 33 | useCannibalization 옵셔널 | 명시 | cannibalEnabled state | ✅ |
| 34 | 모듈 독립성 | offsetEffect 의존 X | 타입 import만 | ✅ |
| 35 | 기존 차트 무변경 | 명시 | 옵셔널 후처리만 | ✅ |
| 36 | 테스트 25개 목표 | 명시 | **29 테스트** 초과 달성 | ✅ |

**합계: 36/36 PASS (100%)** — gap-01 즉시 해결 완료

---

## Gap 이력

### gap-01: 잠식 매트릭스 heatmap UI (✅ 해결 완료)

| 항목 | 내용 |
|---|---|
| **Plan 위치** | Plan UI 통합 섹션 ASCII 도식, 성공 판정 기준 "heatmap + Top-N 리스트 동시 시각화" |
| **1차 분석 시점 상태** | OffsetEffectTab.tsx에 heatmap 코드 0건 |
| **해결 조치 (즉시)** | OffsetEffectTab.tsx line 1389~ HTML table 격자 +85 LOC |
| **구조** | Top-N × Top-N (cannibalResult.matrix → Map 룩업 O(1)) |
| **시각화** | violet 5단계 그라데이션 (rate ≥0.6/0.4/0.2/0.05/<0.05) + 보완재 회색 + 같은 대분류 ring 외곽선 |
| **접근성** | role="grid" + aria-label + sticky 1열/1행 + overflow-x-auto + title 툴팁 |
| **검증** | 29/29 테스트 통과, 빌드 성공, profitability 번들 27.4 kB 유지 |
| **결과** | **36/36 (100%) PASS** |

---

## Match Rate 산출 근거 (최종)

| 카테고리 | PASS / Total |
|---|---|
| Plan 산출물 | 5/5 |
| 알고리즘 정확성 | 7/7 |
| 데이터 처리 | 5/5 |
| 보정 로직 | 5/5 |
| UI 통합 | **8/8** (heatmap 해결) |
| 회귀 방어 | 4/4 |
| 테스트 커버리지 | 1/1 (29 ≥ 25) |
| 위치/조건부 | 1/1 |
| **합계** | **36/36 (100%)** ✅ |
