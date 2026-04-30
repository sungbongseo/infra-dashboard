# 제품/상품 포트폴리오 매트릭스 (4-way BCG + SQA) Plan

> **상태**: 🟡 Plan 작성 완료 (구현 보류 — D+14 Phase A 안정화 후 시작)
> **작성일**: 2026-04-30
> **참조 plan**: `C:/Users/rcnd/.claude/plans/logical-mixing-hammock.md`

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | 현재 대시보드는 거래처/협상 자동화는 강하나(Phase A 완료 후 95%) 품목/제품/상품 **포트폴리오 의사결정** 자동화는 약함. "제품/상품 어디에 집중할지", "내수/해외 비중 어떻게 가져갈지" 같은 본부장 질문에 답할 시각화 부재. 영업진이 매월 수동으로 매출/마진 cross-tab 정리 중 (~30분/회). |
| **Solution** | **Strategic Quadrant Analysis (SQA)** 도입 — 사용자 요청 4-way BCG (제품/상품 × 내수/해외) + 정통 BCG 한계 보완 3종: (1) Dynamic BCG 시계열 화살표 (12M → 6M+6M), (2) 매출 가중 마진율 (산술 평균 왜곡 회피), (3) Pareto 80/20 강조 (Top 20% 품목 집중 영역). 신규 모듈 `productPortfolioMatrix.ts` + 신규 탭 `PortfolioMatrixTab.tsx`, 기존 `profitRiskMatrix`/`profitability` 자산 75% 재활용. |
| **Function UX Effect** | Profitability 페이지에 **🎯 포트폴리오 매트릭스** 탭 신설. 4 사분면 산점도 (각 230/397/35/97 품목) + 시계열 화살표 + Pareto 80% 강조. 슬라이더로 X/Y 임계 동적 조정 (median 기본). 사분면별 Top N 품목 표 + NLG 인사이트 ("내수×상품 Dog 영역 매출 49.8억 — 단가 인상 잠재력 +X%"). |
| **Core Value** | 매월 30분 수동 분석 → 1클릭 자동화. 영업진 포트폴리오 의사결정 시간 90% 단축 + 데이터 기반 strategic priority 도출. 정통 BCG의 한계 (외부 시장 데이터 필요, 시간 정보 부재, 산술 평균 왜곡) 모두 보완 = 세계 최고 수준 자체 framework. |

## 데이터 검증 결과 (실측)

| 매트릭스 | 품목수 | 매출 | 영업이익 | 가중 마진 |
|---|---:|---:|---:|---:|
| 상품 × 내수 | 397 | 119.42억 | +0.88억 | **0.7%** ⚠ |
| 제품 × 내수 | 230 | 56.81억 | +2.84억 | **5.0%** ✅ |
| 상품 × 해외 | 97 | 47.94억 | +0.38억 | **0.8%** ⚠ |
| 제품 × 해외 | 35 | 12.90억 | +0.93억 | **7.2%** ✅ |

**핵심 사전 인사이트** (구현 전 데이터로만 도출):
- 제품 마진율 (5-7%) >> 상품 마진율 (<1%) → 제품 비중 확대 전략
- 해외 마진율 > 내수 마진율 → 해외 진출 강화
- 적자 품목 43.3% (335/774) → Dog 사분면 자동 채워짐

## 사용자 결정 (확정)

| 항목 | 결정 |
|---|---|
| 임계 기준 | **Median + 사용자 슬라이더** |
| Dynamic BCG | **포함** (12M → 6M+6M 화살표) |
| Pareto 80/20 | **포함** (Top 20% 강조 + 누적 곡선) |
| 포함 범위 | **제품 + 상품만** (627개 품목) |

## 변경 파일 (구현 시)

| 파일 | LOC |
|---|---|
| `src/lib/analysis/productPortfolioMatrix.ts` (신규) | +400 |
| `src/lib/analysis/productPortfolioMatrix.test.ts` (신규, 25+ 테스트) | +250 |
| `src/app/dashboard/profitability/tabs/PortfolioMatrixTab.tsx` (신규) | +600 |
| `src/types/portfolio.ts` (또는 기존 types 추가) | +30 |
| `src/app/dashboard/profitability/page.tsx` (탭 추가) | +20 |
| `docs/03-analysis/포트폴리오-매트릭스-진단-YYYY-MM-DD.md` | +200 |

**총**: +1,500 LOC | 공수: 2-3 영업일 | 재사용률: 75%

## Decision Gate

본격 구현 시점:
- ✅ Phase A 안정화 (D+14, 2026-05-13) 통과 후 권장
- 또는 즉시 시작 (Phase A와 코드 분리되어 회귀 영향 0)

## Next Steps

1. D+14 (2026-05-13) Phase A 안정화 회고 (운영-추적-템플릿 §4)
2. Phase A 안정화 확인 시 → 본 plan으로 `/pdca do product-portfolio-matrix` 진행
3. 기능 완료 시 → `/pdca report product-portfolio-matrix`

## 관련 문서

- 상세 plan: `C:/Users/rcnd/.claude/plans/logical-mixing-hammock.md`
- Phase A 보고서: `docs/04-report/dashboard-accuracy-phase-a.report.md`
- 운영 추적: `docs/03-analysis/운영-추적-템플릿-2026-04-29.md`
