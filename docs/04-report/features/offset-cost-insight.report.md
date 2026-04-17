# PDCA Completion Report: 저가수주 원가 인사이트 + 200전용 시뮬 + 월별 분석

## Executive Summary

| 관점 | 내용 |
|------|------|
| Feature | 저가수주-원가인사이트 |
| Date | 2026-04-17 |
| Duration | 1 session |
| Match Rate | 100% (35/35 체크포인트) |

### Results

| 항목 | 수치 |
|------|------|
| Match Rate | 100% |
| 검증 항목 | 35건 전수 통과 |
| 수정 파일 | 2개 |
| 신규 기능 | 3개 |
| 빌드 | 통과 (0 errors) |

### 1.3 Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 200에만 있는 품목(생산O, 판매X) 선택 시 기준단가가 잘못 표시되고, 원가 대비 판매가 비교 불가, 시뮬레이터 미작동, 월별 데이터 확인 불가 |
| **Solution** | 원가 비교 카드(200 실적매출원가 기반), 200전용 희망 판매단가 입력 → 합성 CVPItem 시뮬 주입, 월별 단가·원가 추이 차트+테이블 |
| **Function UX Effect** | 품목 선택 즉시 원가·마진 확인, 200전용 품목도 단가 입력만으로 전사 영업이익 시뮬 가능, 월별 원가 변동 패턴 시각화 |
| **Core Value** | "원가 이하로 파는지" 즉각 판단 → 저가수주 의사결정 정확도 향상, 미투입 월 즉시 식별 |

---

## 1. Plan Summary

### 배경
사용자가 "BITU-PLAS_L(3.0*10M)_옥천_SP&F" 품목을 시뮬레이션할 때 발견한 4가지 문제:
1. 기준단가 66,513이 200 보고서의 매출액/수량에서 온 값인데, 100에 판매 실적이 없어 의미 없음
2. 실적 원가(~10만원)를 볼 수 없어 원가 미달 여부 판단 불가
3. 시뮬레이터가 100 기반이라 200 전용 품목은 효과 계산 자체가 불가
4. 3월 데이터를 넣지 않았는데 숫자가 나오는 이유를 월별로 확인할 수 없음

### 계획 (3개 기능)
- 기능 1: 원가 비교 카드 — 판매단가와 단위원가 나란히 표시
- 기능 2: 200 전용 시뮬 — 원가만 표시 + 희망 단가 입력 → 합성 CVPItem 주입
- 기능 3: 월별 추이 — rawItemProfit(month 보존) 기반 차트+테이블

---

## 2. Implementation Summary

### 수정 파일

| 파일 | 변경 내용 | LOC |
|------|-----------|-----|
| `src/app/dashboard/profitability/page.tsx` | rawItemProfitability prop 전달 | +1 |
| `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx` | 3개 기능 전부 (데이터 로직 + UI) | ~200 |

### 분석 모듈/타입 변경: 없음
기존 `calcTotalViewSimulation()`을 수정하지 않고, UI에서 합성 CVPItem을 `simItems` 배열에 주입하여 기존 시뮬 엔진이 자연스럽게 처리.

### 기능별 구현 상세

#### 기능 1: 원가 비교 카드

**데이터 로직**:
- `itemList` useMemo에서 `filteredItemProfitability` 순회 → 품목코드별 `actualCOGS`, `actualQty200`, `actualUnitCost`, `costRatio` 수집
- 다중 조직 동일 품목 → `costAgg` Map으로 합산 후 비율 재계산
- 기존 `기준단위` 추출 루프와 병합 (중복 순회 없음)

**UI**:
- 100+200 품목: 판매단가 / 단위원가 / 마진(색상 코딩) / 원가율 표시
- 200전용 품목: "판매 실적 없음 (200 보고서 전용)" + 실적 단위원가 + 200 기준 수량
- 마진 < 0: 빨간 배경 border + "원가 미달 — 판매단가가 실적 원가보다 낮습니다"
- 기존 기준단가 슬라이더 바(비율/절대 모두)에도 `| 원가: ₩X | 시뮬마진 ±₩Y` 병기

#### 기능 2: 200 전용 품목 시뮬 활성화

**데이터 로직**:
- `selectedItemInfo` / `is200Only` 파생 변수
- `manualUnitPrice` state (0 초기값, 품목 변경 시 리셋)
- `syntheticCvpItem` useMemo: `manualUnitPrice > 0 && is200Only` 시 15개 필드 CVPItem 생성
- `simItems = syntheticCvpItem ? [...cvpItems, syntheticCvpItem] : cvpItems`
- `totalSim`, `sensitivityGrid` 모두 `simItems` 사용
- `integrity` useMemo는 `totalSim` 뒤에 배치 (선언 순서 보장)

**UI**:
- 파란 카드: DollarSign 아이콘 + "희망 판매단가를 입력하면 시뮬레이션이 작동합니다"
- 숫자 input (step=1000, 원가 참고 placeholder)
- 입력 즉시 예상 마진 표시 (빨강/초록 색상 + "원가 미달!" 경고)
- 200전용 선택 시 inputMode 자동 "absolute" 전환
- 품목 드롭다운에 "200전용" amber 배지

#### 기능 3: 월별 단가·원가 추이

**데이터 로직**:
- `rawItemProfitability` prop (page.tsx → OffsetEffectTab, PortfolioTab 동일 패턴)
- `monthlyBreakdown` useMemo: rawItemProfitability에서 targetItem 매칭 → month 그룹화
- 월별 `{ monthLabel, unitPrice, unitCost, margin, costRatio, quantity }`
- `safeDivide` 전수 적용

**UI**:
- `<details>` 접이식: "📅 월별 단가·원가 추이 (N개월)"
- 원가 미달 월 있으면 빨간 "원가 미달 월 있음" 배지
- 2개월 이상: ComposedChart (Bar=매출단가, Line=단위원가 빨간 점선, Bar=수량 투명)
- 1개월: 테이블만 표시
- 테이블: 6컬럼 (월, 매출단가, 단위원가, 마진, 원가율, 수량), qty=0 → "—"

### 부수 개선 (이전 세션에서)
- "Q1 판매단가 기준" → 동적 기간 라벨 (`dataPeriodLabel` useMemo)
- 원가 변동 슬라이더(원자재/노무/외주) 절대수량 모드에서도 표시

---

## 3. Gap Analysis

### Match Rate: 100%

| Category | Score |
|----------|:-----:|
| Design Match | 100% |
| Architecture Compliance | 100% |
| Convention Compliance | 100% |
| **Overall** | **100%** |

### 35건 체크포인트 전수 통과

| 영역 | 항목 수 | 통과 |
|------|---------|------|
| 기능 1: 원가 비교 카드 | 7 | 7/7 |
| 기능 2: 200전용 시뮬 | 12 | 12/12 |
| 기능 3: 월별 추이 | 12 | 12/12 |
| 교차 검증 | 4 | 4/4 |

### 누락/변경 사항
- 누락: 없음
- 변경: 없음
- 추가: `actualQty200` 필드 (계획에 없지만 합성 CVPItem에 유용한 보조 데이터)

---

## 4. Build Verification

```
npm run build → ✓ Compiled successfully
0 errors, warnings only (기존 unused vars)
```

---

## 5. Key Design Decisions

### 합성 CVPItem 주입 패턴
분석 모듈(`offsetEffect.ts`)을 수정하지 않고 UI에서 데이터만 조작하는 설계.
비유: 엔진(분석 모듈)은 그대로 두고 연료(데이터)만 바꾼 것.
- 장점: 기존 CVP 계산 로직 무결성 유지, 사이드이펙트 최소화
- 합성 아이템의 `customer: "__manual__"`로 일반 거래처와 구분

### rawItemProfitability 전달 패턴
PortfolioTab에서 이미 사용 중인 동일 패턴 재사용.
- `rawItemProfit`: org+date 필터 적용, aggregate 전 (month 보존)
- `filteredItemProfitability`: aggregate 후 (month 제거)
- 두 데이터를 모두 props로 전달하여 용도별 사용

### 200 전용 품목의 inputMode 자동 전환
비율 모드는 "기존 기준단가 대비 X%" 개념인데, 200전용 품목은 기준단가가 없으므로 비율 모드가 무의미.
→ 자동으로 "absolute" 모드 전환하여 직접 수량/단가 입력 유도.

---

## 6. Lessons Learned

1. **100과 200의 근본적 차이**: 100은 매출 전표(판매 발생), 200은 원가 대장(생산 발생). 생산만 하고 안 팔면 100에 없음.
2. **기존 시뮬 엔진 활용**: 합성 데이터 주입으로 기존 로직 100% 재사용 — 새 함수/타입 불필요.
3. **월별 데이터 보존**: aggregate 함수가 month를 제거하므로, 월별 분석이 필요하면 aggregate 전 데이터(rawItemProfit)를 별도 전달해야 함.
