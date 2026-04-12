# PDCA Completion Report: offset-effect-audit

## Executive Summary

### 1.1 Overview

| 항목 | 내용 |
|------|------|
| Feature | 저가수주 상계효과 서브탭 정밀 감사 — 수치/로직/차트 11건 개선 |
| Period | 2026-04-13 (단일 세션) |
| PDCA Phases | Plan → Do → Check → Report (Design 스킵 — 단일 파일 수정) |
| Commit | `889a2dc` |

### 1.2 Results

| 지표 | 결과 |
|------|------|
| Match Rate | **100%** (11/11) |
| 코드 변경 | +121 / -15 LOC (3개 파일) |
| 테스트 | **29/29 passed** (기존 24 + 신규 5) |
| 빌드 | 0 errors |
| 오탐 반증 | 2건 (cross-term 항등식, 변동비 개념) |

### 1.3 Value Delivered

| 관점 | 내용 | 지표 |
|------|------|------|
| **Problem** | 정밀 감사로 발견된 엣지 케이스 11건 — 음수 매출 누락, BEP 숨김, 차트 범위 부족, 필터 불일치 등 | HIGH 5 + MEDIUM 6건 |
| **Solution** | 방어 로직 6건 + UI/차트 수정 5건 + 테스트 5개 추가. 수학적 검증으로 오탐 2건 제거 | 코드 121 LOC, 테스트 5개 |
| **Function/UX Effect** | 환입/반품 데이터 정상 반영, BEP 불가 상태 명시, CVP-시뮬레이션 시각적 일관성, Dog 분류 일관성 | 엣지 케이스 0건 잔여 |
| **Core Value** | 분석 로직의 **엣지 안전성(Edge Safety)** 확보. 극단 데이터에서도 의미 있는 결과 보장 | 테스트 커버리지 24→29 (+21%) |

---

## 2. PDCA Phase Summary

### Plan
- 2개 Explore 에이전트로 `offsetEffect.ts` (로직) + `OffsetEffectTab.tsx` (UI/차트) 병렬 감사
- 에이전트 보고: 약 26건 → 수학적 검증(cross-term 증명)으로 오탐 2건 제거 → **확정 11건**
- 심각도 분류: HIGH 5, MEDIUM 6

### Do
- Phase 1: `offsetEffect.ts` 로직 수정 (H1,H2,H3,M1,M2,M5) — 6건
- Phase 2: `OffsetEffectTab.tsx` UI/차트 수정 (H4,H5,M3,M4,M6) — 5건
- Phase 3: `offsetEffect.test.ts` 엣지 케이스 테스트 5개 추가

### Check
- gap-detector 에이전트: 11/11 구현 확인 → **Match Rate 100%**
- 각 이슈에 H1-H5, M1-M6 주석으로 추적 가능

### Act
- 불필요 (Match Rate 100%)

---

## 3. Implementation Details

### 변경 파일

| 파일 | 변경 | LOC |
|------|------|-----|
| `src/lib/analysis/offsetEffect.ts` | H1,H2,H3,M1,M2,M5 로직 수정 | +35/-10 |
| `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx` | H4,H5,M3,M4,M6 UI/차트 | +25/-10 |
| `src/lib/analysis/offsetEffect.test.ts` | 5개 엣지 테스트 추가 | +61/-5 |

### HIGH 5건 상세

**H1 (음수 매출)**: `revenue ≤ 0 || qty ≤ 0` → `revenue === 0 && qty === 0`
- 환입/반품 행이 CVP에 정상 포함되어 공헌이익 정확도 향상

**H2 (음수 변동비)**: `cost - fixed` → `Math.max(cost - fixed, 0)`
- 실적매출원가 < 제조고정비인 비정상 데이터에서 변동비 음수 방지

**H3 (BEP Infinity)**: BEP=0 → BEP=Infinity + UI "BEP 도달 불가" 표시
- 손절 상태(단위공헌이익 ≤ 0)를 정직하게 표시

**H4 (CVP X축)**: 1.5x → 2.2x
- Step 4a 슬라이더 +100%까지 대응, CVP 그래프와 시뮬 결과 시각적 일치

**H5 (Dog 필터)**: `quadrant==="dog" || totalCM<0` → `quadrant==="dog"`
- 4사분면 판정 기준과 Dog 테이블 필터 일관성 확보

### MEDIUM 6건 상세

**M1**: lower median 주석 추가 (짝수 아이템 시 하위 중앙값 사용 명시)
**M2**: baseTotalWeight=0 균등 배분 fallback (base + simulated 모두)
**M3**: STRONG_OFFSET_THRESHOLD 상수화 + 경영관리 관행 기준 주석
**M4**: 배분 기준 토글 "장부상만 변함" 안내 추가
**M5**: tolerance denominator에 매출 기반 fallback (극소 이익 false positive 방지)
**M6**: QUADRANT_COLORS HSL 밝기 상향 (dark 배경 가독성)

---

## 4. Gap Analysis Summary

- **분석 문서**: `docs/03-analysis/offset-effect-audit.analysis.md`
- **Match Rate**: 100% (11/11)
- **누락**: 0건
- **초과 구현**: 0건
- **의도적 차이**: M6 — Recharts fill 속성이 CSS 변수 미지원이라 단일 HSL lightness 상향으로 대체 (수용 기준 충족)

---

## 5. Lessons Learned

1. **에이전트 오탐 필터링 필수**: 2개 Explore 에이전트가 ~26건 보고했으나, 수학적 검증으로 2건 오탐 제거. cross-term 항등식은 `volumeGain`이 `newPrice`(인하된 단가)를 사용하므로 정확히 성립.
2. **엣지 케이스 테스트의 가치**: H2(음수 변동비), M2(weight=0 균등배분) 같은 케이스는 실제 SAP 데이터에서 발생 가능. 테스트로 방어막 확보.
3. **Recharts HSL 제약**: Scatter fill은 CSS 변수나 조건부 값 불가 → lightness 조정이 현실적 최선.

---

## 6. Next Steps

- `/pdca archive offset-effect-audit --summary` — 아카이브 (메트릭 보존)
- 브라우저 수동 검증 — H3 BEP Infinity 표시, H4 CVP 확대, H5 Dog 필터 확인
- git push — 원격 반영
