# PDCA Completion Report: analysis-insight-upgrade

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | 대시보드 분석탭 인사이트 품질 개선 |
| 기간 | 2026-03-20 |
| Duration | 1 session |
| Match Rate | 100% (12/12 항목) |

### 1.1 Project Overview

전수검증 결과 55개 탭 중 6개 탭이 14개월 데이터로는 신뢰할 수 없는 분석을 제공하고, 5개 탭이 인사이트 없이 수치만 나열하는 문제를 해결. 1 NEW 파일 + 11 수정 파일, ~365줄 변경.

### 1.2 Results Summary

| 항목 | 값 |
|------|-----|
| Match Rate | 100% |
| 수정 파일 | 12개 (1 NEW + 11 수정) |
| 변경 줄 수 | ~365줄 |
| 빌드 결과 | 성공 (0 errors) |
| Iteration | 0회 (1차 구현에서 100% 달성) |

### 1.3 Value Delivered

| 관점 | 설명 |
|------|------|
| **Problem** | 14개월 데이터로 CLV/코호트/시계열 등 다년도 분석이 부정확하게 표시되고, 조직수익성/채널/품목군 탭이 수치만 나열하여 의사결정에 활용 어려움 |
| **Solution** | DataSufficiencyNotice 공유 컴포넌트로 데이터 부족 탭을 정직하게 고지하고, 4개 탭에 조건부 인사이트 패널 추가 |
| **Function UX Effect** | 사용자가 신뢰할 수 없는 분석 결과에 의존하지 않게 되며, 인사이트 패널로 즉각적인 전략적 판단 가능 |
| **Core Value** | "거짓말 금지" 원칙 — 데이터 부족 시 분석을 숨기고 정직하게 고지, 충분한 데이터에서만 자동 활성화 |

---

## 2. Phase Details

### 2.1 Plan Phase

구현 계획서(Plan Mode)로 4개 Phase, 12개 작업 항목 정의:
- Phase 1: DataSufficiencyNotice 공유 컴포넌트 (P0)
- Phase 2: TIER 3 — 신뢰도 낮은 6탭 처리 (P1)
- Phase 3: TIER 2 — 인사이트 강화 4탭 (P2)
- Phase 4: Sales 탭 그룹 재구성 (P2)

### 2.2 Design Phase

별도 Design 문서 없이 Plan Mode 계획서에 파일별 변경사항, 조건 임계값, 텍스트 내용을 상세 정의하여 Design 역할 대체.

### 2.3 Do Phase (Implementation)

#### Phase 1: 공유 컴포넌트 (P0)
| 파일 | 작업 |
|------|------|
| `src/components/dashboard/DataSufficiencyNotice.tsx` | NEW — AlertTriangle + amber 카드, 5 props (title, reason, currentData, requiredData, alternativeTab) |

#### Phase 2: TIER 3 탭 처리 (P1, 6건)
| 파일 | 작업 |
|------|------|
| `ClvTab.tsx` | 30개월 미만 → DataSufficiencyNotice + RFM 대안 버튼 |
| `CohortTab.tsx` | 24개월 미만 → DataSufficiencyNotice |
| `DecompositionTab.tsx` | dataQuality "limited" 이하 → DataSufficiencyNotice |
| `ChurnTab.tsx` | "이탈 예측" → "거래 활동 모니터링" 리브랜딩 (라벨/KPI명/등급명/안내문) |
| `sales/page.tsx` | 탭 ID churn→activity, CLV/코호트/시계열을 "실험적 분석" 그룹 이동 |
| `BenchmarkReportTab.tsx` | "참고용 벤치마크" 안내 배너 추가 |
| `page.tsx` (Overview) | R² < 0.3 시 회귀선 숨김, 0.3~0.5 주의 표시 |

#### Phase 3: TIER 2 인사이트 강화 (P2, 4건)
| 파일 | 작업 |
|------|------|
| `OrgTab.tsx` | 중앙값 4사분면 + ReferenceArea 배경 + 해석 패널 (핵심/성장/효율/재검토) |
| `ChannelTab.tsx` | 현금<20% / 편중>70% 조건부 전략 텍스트 |
| `ProductGroupTab.tsx` | BCG 요약 패널 (Star/Cash Cow/Question/Dog + 대표 품목 + 최대 매출 기여) |
| `FxTab.tsx` | 외화 비중 5% 미만 시 범위 안내 배너 |

### 2.4 Check Phase (Gap Analysis)

| Category | Score |
|----------|:-----:|
| Design Match | 100% |
| Architecture Compliance | 100% |
| Convention Compliance | 100% |
| **Overall** | **100%** |

12개 항목 전수 검증: 모든 조건 임계값, 텍스트, 컴포넌트 구조가 계획과 일치.

### 2.5 Act Phase

Match Rate 100%로 iteration 불필요.

---

## 3. Key Decisions

| 결정 | 근거 |
|------|------|
| 분석 모듈 코드 보존 | 데이터 기간 충족 시 자동 활성화 — 코드 삭제 없이 UI 레이어에서만 게이트 |
| "이탈 예측" → "거래 활동 모니터링" | 규칙 기반 접근(recency+frequency+amount)은 14개월에도 유효하나 "예측"이 과장 |
| 탭 그룹 "실험적 분석" 분리 | CLV/코호트/시계열은 데이터 부족 상태이므로 메인 그룹에서 분리하여 기대치 관리 |
| R² 기반 회귀선 조건부 표시 | R²<0.3은 설명력 없음 → 회귀선 숨김, 0.3~0.5는 주의 표시, >0.5은 현행 유지 |

---

## 4. Verification

- `npm run build`: 성공 (0 errors, 0 warnings after fix)
- 빌드 중 발견/수정된 이슈: OrgTab useMemo Hook 순서 위반 → early return 전으로 이동, DecompositionTab 미사용 Info import 제거

---

## 5. Lessons Learned

1. **정직한 고지 > 화려한 차트**: 데이터가 부족할 때 분석을 표시하는 것보다 명확하게 한계를 알리는 것이 사용자 신뢰를 높임
2. **리브랜딩의 효과**: "이탈 예측"이라는 라벨을 "거래 활동 모니터링"으로 바꾸는 것만으로 분석의 정확성이 개선됨 (기능은 동일하나 기대치가 적절해짐)
3. **조건부 인사이트**: 수치 나열에 데이터 기반 조건부 텍스트를 추가하면 비전문가도 즉각적인 판단 가능
