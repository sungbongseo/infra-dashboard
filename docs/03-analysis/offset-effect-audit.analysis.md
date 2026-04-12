# Gap Analysis: offset-effect-audit (정밀 감사 11건 개선)

- **Feature**: 저가수주 상계효과 서브탭 정밀 감사 — 수치/로직/차트 개선
- **Commit**: `889a2dc`
- **Date**: 2026-04-13
- **Overall Match Rate**: **100% (11/11)**

## Issue-by-Issue Verification

### HIGH (5/5)

| # | 이슈 | 수용 기준 | 구현 위치 | 상태 |
|---|------|-----------|-----------|:----:|
| H1 | 음수 매출 필터링 | `revenue===0 && qty===0`만 제외 | `offsetEffect.ts:253-256` | ✅ |
| H2 | 음수 변동비 방어 | `Math.max(cost-fixed, 0)` | `offsetEffect.ts:523-524` | ✅ |
| H3 | BEP Infinity | `weightedUnitCM ≤ 0` → Infinity | `offsetEffect.ts:336-339` | ✅ |
| H4 | CVP X축 범위 | 2.2x 확대 | `OffsetEffectTab.tsx:187` | ✅ |
| H5 | Dog 필터 일관화 | `quadrant==="dog"`만 | `OffsetEffectTab.tsx:226-227` | ✅ |

### MEDIUM (6/6)

| # | 이슈 | 수용 기준 | 구현 위치 | 상태 |
|---|------|-----------|-----------|:----:|
| M1 | 중앙값 주석 | lower median 주석 | `offsetEffect.ts:295` | ✅ |
| M2 | weight=0 균등배분 | safeDivide fallback | `offsetEffect.ts:607-610, 649-651` | ✅ |
| M3 | 임계치 상수화 | STRONG_OFFSET_THRESHOLD | `OffsetEffectTab.tsx:292-293` | ✅ |
| M4 | 배분 토글 안내 | "장부상만 변함" | `OffsetEffectTab.tsx:1101-1103` | ✅ |
| M5 | tolerance fallback | 매출 기반 denominator | `offsetEffect.ts:769-774` | ✅ |
| M6 | 다크모드 밝기 | HSL lightness 상향 | `OffsetEffectTab.tsx:39-45` | ✅ |

### Tests (29/29)

| 구분 | 건수 |
|------|:----:|
| 기존 | 24 |
| 신규 (H1,H2,H3,M2,M5) | 5 |
| **합계** | **29** |

## Conclusion

11건 전수 구현 완료, 이슈 번호 주석(H1-H5, M1-M6) 추적 가능, 테스트 29개 통과.
