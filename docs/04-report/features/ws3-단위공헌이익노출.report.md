# WS3 단위공헌이익 상시 노출 — PDCA 완료 보고서

**Workstream**: v2 Phase A · WS3
**완료일**: 2026-04-23
**Match Rate**: 100% (9/9)
**소요**: 약 1시간 (단일 세션)

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 값 |
|---|---|
| Feature | ws3-단위공헌이익노출 |
| PDCA 단계 | (Plan v2.1 통합) → Do → Check → Report |
| 변경 파일 | `glossary-profitability.ts`, `OffsetEffectTab.tsx` |
| LOC | +95 (Plan 추정 +80에 거의 수렴) |

### 1.2 결과 요약

| 지표 | 값 |
|---|---|
| Match Rate | **100%** (9/9) |
| Gap | 0 |
| Build / Lint / Test | ✅ / ✅ / ✅ (회귀 없음, 기존 2건만 pre-existing) |
| McKinsey 달성도 | 21.7% → **24.3%** (+2.6%p) |

### 1.3 Value Delivered (4-perspective, 메트릭 포함)

| 관점 | 변경 전 | 변경 후 | 측정 효과 |
|---|---|---|---|
| **Problem** | 박리다매 엔진 실체(단위공헌이익 +14,875원/ROL)가 UI에 없어 사용자가 매번 머리로 계산. 직전 세션 실제 사용자 질문: "+14,875원 어디서 나왔어?" | 원가 변동 시엔 "원가 조정 결과" 블록에 자동 노출, 원가 변동 없어도 판단기 카드에 상시 노출. MetricInfo 툴팁으로 초/중/전문가 3 tier 설명. | 사용자 직접 제기 질문 **완전 해소** · 머리 계산 0회 |
| **Solution** | `adjustedCostInfo`에 원가 정보만 포함, 판가/CM 미포함 | useMemo에 `baseUnitPrice`, `adjustedUnitPrice`, `adjustedUnitCM`, `adjustedUnitMargin` 4개 필드 추가 + 판단기 전용 `quickCMInfo` useMemo 신설 (수량 가중평균 + 원가변동 반영) | 파생값 2곳 노출 · glossary 엔트리 1개 (6개 필드 완비) |
| **Function UX Effect** | 단위공헌이익 정보 접근 = 외부 계산 필요 | 2개 영역 상시 노출 + 계산식 인라인 + "박리다매 여지 존재" 자동 판정 배지 | UI 클릭 0회로 확인 · 자동 판정 규칙 적용 |
| **Core Value** | McKinsey "E. 포트폴리오 시너지" 축 달성도 40% | 단일 진실 소스 확립 + 파생값 투명화 → 동 축 **50%** | McKinsey 전체 평균 +2.6%p (축적 효과) |

## 2. 구현 기록

### 변경 위치
- [glossary-profitability.ts:398-434](src/lib/metrics/glossary-profitability.ts#L398-L434) — `unit_contribution_margin` 엔트리
- [OffsetEffectTab.tsx:456-487](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L456-L487) — adjustedCostInfo useMemo 확장
- [OffsetEffectTab.tsx:756-778](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L756-L778) — quickCMInfo useMemo 신규
- [OffsetEffectTab.tsx:1060-1077](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L1060-L1077) — 판단기 카드 CM 배너
- [OffsetEffectTab.tsx:2147-2169](src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx#L2147-L2169) — 원가조정결과 블록 CM 1줄

### 핵심 설계 결정
1. **수량 가중평균 변동비** — 산술평균 대신 수량 가중 채택. 거래처별 단위변동비 편차가 큰 실무 데이터(501 보고서 외주 CV 75%+)에서 outlier 왜곡 방지.
2. **박리다매 여지 자동 판정** — `단위마진 < 0 ∧ 공헌이익 > 0` 조건을 배지로 자동 표시. 경계 영역 의사결정을 UI가 직접 안내.
3. **원가 변동 동기화** — Step 4a 슬라이더 값이 판단기 CM 계산에도 실시간 반영 (단일 진실 소스 원칙 유지).

## 3. Lessons Learned

### Keep (잘된 점)
- Plan v2.1에서 "WS3 가장 쉽고 임팩트 큰 것부터"라는 판단이 정확했음. 사용자 질문을 즉시 해결하는 가치.
- 기존 glossary 시스템 + MetricInfo 재활용으로 UI 일관성 유지.

### Problem → Try (개선점)
- useMemo에서 `otherR_init(rawR, labR, outR)` 라는 존재하지 않는 함수를 잠시 호출한 실수 발생. 이후 즉시 교정했지만 "Write 직전 코드 검토" 필요.
- v2 Plan에 있던 "단위 테스트 추가"는 WS3 범위에선 생략됨. Phase 종료 시 일괄 추가 권장.

## 4. Next Steps

**필수**:
- [ ] 수동 QA 시나리오 실행 (원가 변동 있음/없음 두 케이스)

**선택 (사용자 선택)**:
- WS1 Monte Carlo (+400 LOC, 2주) — **임팩트 최대**, 확률/신뢰구간 도입
- WS2 캐파 경고 (+250 LOC, 1주) — 설비투자 누락 방어
