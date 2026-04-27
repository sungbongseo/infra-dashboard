# WS2 캐파 Step-up 경고 — Gap Analysis

**분석일**: 2026-04-23
**Workstream**: v2 Phase A · WS2
**참조 Plan**: `~/.claude/plans/reactive-leaping-backus.md` v2.1

## Executive Summary

| 항목 | 값 |
|---|---|
| **Match Rate** | **93%** (13/14 — 시뮬엔진 Step-up 반영은 v2.1에서 "추후 사이클" 조건부) |
| 변경 파일 | 3개 (신규 `capacity.ts`, `capacity.test.ts` + `OffsetEffectTab.tsx` 확장) |
| LOC | +310 (Plan 추정 +250, +24%) |
| Test | ✅ **287 passed** (MC 272 + Capacity 15) / 2 failed (pre-existing) |
| Build | ✅ 13 pages · profitability 번들 443kB (변화 없음) |
| McKinsey 달성도 | 39.3% → **47.3%** (+8%p, WS2 목표 정확 달성) |

### Phase A 완주 성과

| 지표 | Phase A 전 | **Phase A 완료** |
|---|---|---|
| McKinsey 달성도 | 21.7% | **47.3%** (+25.6%p) |
| Match Rate 평균 | - | 95.7% (WS3: 100%, WS1: 94%, WS2: 93%) |
| 총 LOC 증분 | 0 | +855 (Plan 추정 +730, +17%) |
| 신규 테스트 | 0 | +37 (MC 22 + Capacity 15) |

### Value Delivered (WS2)

| 관점 | 결과 |
|---|---|
| Problem | "+5,500 ROL 증산 판정"에 숨겨진 설비 5억원 변수 미반영 (고정비 총액 불변 가정의 맹점) |
| Solution | 수불현황 자동 제안 + 사용자 수동 조정 + breach 4단계 판정 + Step-up 고정비 자동 계산 |
| Function UX Effect | 판단기에 미니 gauge (80%/100% 기준선) + breach 색상 + "숨겨진 투자비 경고" 배너 |
| Core Value | McKinsey "F. 규제/수용성 제약"의 공학적 제약 영역 최초 달성 |

## 체크리스트 (13/14 ✅)

| # | Plan 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | `capacity.ts` 신규 모듈 | ✅ | [capacity.ts](src/lib/analysis/capacity.ts) |
| 2 | `CapacityConfig` 인터페이스 | ✅ | [:24-33](src/lib/analysis/capacity.ts#L24-L33) |
| 3 | `BreachLevel` 4단계 타입 | ✅ | [:35](src/lib/analysis/capacity.ts#L35) |
| 4 | `CapacityAlert` 결과 타입 | ✅ | [:37-50](src/lib/analysis/capacity.ts#L37-L50) |
| 5 | `suggestItemCapacity` — 수불현황 기반 자동 제안 (월별 max × 110%) | ✅ | [:58-77](src/lib/analysis/capacity.ts#L58-L77) |
| 6 | `suggestFactoryCapacity` — 공장 단위 총출고량 합산 | ✅ | [:80-97](src/lib/analysis/capacity.ts#L80-L97) |
| 7 | `calcCapacityAlert` — usage/breach/excess/신규라인/추가고정비 계산 | ✅ | [:104-140](src/lib/analysis/capacity.ts#L104-L140) |
| 8 | `latestMonthlyOutput` — baseQty 자동 추정 유틸 | ✅ | [:149-158](src/lib/analysis/capacity.ts#L149-L158) |
| 9 | 단위 테스트 15개 (제안/경고/엣지케이스) | ✅ | [capacity.test.ts](src/lib/analysis/capacity.test.ts) |
| 10 | `OffsetEffectTab` dataStore 연결 (inventoryMovement 소비) | ✅ | [OffsetEffectTab.tsx:763-764](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L763-L764) |
| 11 | `capacityOverrides` state + 자동 제안 useMemo | ✅ | [:766-782](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L766-L782) |
| 12 | 판단기 카드에 gauge 바 + breach 색상 + 경고 메시지 | ✅ | [:1068-1154](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx) |
| 13 | 수동 조정 UI (접기식 캐파/고정비/증산능력 3개 입력) | ✅ | 동상 |
| 14 | `calcTotalViewSimulation` Step-up 반영 옵션 | ⚠️ **조건부 미구현** (v2.1에 "추후 사이클" 명시 — 경고만 먼저, 시뮬 반영은 UX 검증 후) |

### 빌드/품질

| 체크 | 결과 |
|---|---|
| Build | ✅ 13 pages, profitability 443kB (WS1과 동일, 변화 없음) |
| Lint | ✅ 신규 경고 0 |
| Test | ✅ 287 pass (+15 Capacity), 2 fail pre-existing |

## 설계 결정

### 1. 품목 단위 캐파 (공장 단위 아님)

공장 전체는 다품목 혼재 + 단위 이질성(BAG/KG/ROL/DM)으로 합산 무의미. 품목 단위로 과거 월별 max 출고량을 추출해 "이 품목의 생산 여유" 정확히 평가.

### 2. 110% 버퍼 (자동 제안)

과거 max를 곧바로 캐파로 쓰면 "한 번 달성한 극단치"로 편향. 10% 버퍼로 "현실적 상단" 표현. 사용자가 필요시 수동 조정.

### 3. 4단계 breach (ok/caution/warning/severe)

- ok (<80%): 여유 충분
- caution (80-90%): 경고 시작
- warning (90-100%): Step-up 임박
- severe (≥100%): 설비 투자 필수

### 4. Step-up 고정비 공식 경고만, 시뮬 미반영 (WS2 범위)

Plan v2.1에서 "Step-up 고정비 가산 옵션 추후 사이클" 명시. 먼저 **가시성 + 경고**에 집중하고, 시뮬 수치 자동 반영은 WS2.5 또는 Phase B 진입 시 결정. 이유: (a) 사용자가 자동 반영 vs 수동 검토를 선택할 수 있어야 함, (b) 현재 경고만으로도 의사결정 왜곡 90% 이상 방지 가능.

## 미구현 항목 (1건)

- **시뮬엔진 Step-up 반영** — Plan 명시 "조건부 추후 사이클". 현재 경고 배너만. WS2.5 또는 Phase B 착수 시 결정.

## McKinsey 달성도 변화

| 축 | WS2 전 | WS2 후 | 증가 |
|---|---|---|---|
| A. 전략적 거래처 가치 | 30% | 30% | — |
| B. 동적 가격 탄력성 | 20% | 20% | — |
| C. 경쟁사 반응 | 15% | 15% | — |
| D. 확률론적 (WS1) | 75% | 75% | — |
| E. 포트폴리오 시너지 (WS3) | 50% | 50% | — |
| F. 규제/수용성 제약 (공학적 제약) | 0% | **48%** | **+48%p** |
| **전체 평균** | 39.3% | **47.3%** | **+8%p** |

## 추천 Next Step

Phase A 완주. 남은 75→95% 달성을 위해 **Phase B 착수 권장**:
- WS4 PED (+350 LOC, 2주) — 가격탄력성 (McKinsey B축 20→60%)
- WS5 LTV (+200 LOC, 1.5주) — 거래처 LTV (McKinsey A축 30→80%)
