# 세계 최고 수준 툴팁 시스템 롤아웃 플랜

> Project: `d:/분석/인프라 대시보드/` (Next.js 14 분석 대시보드)
> Feature ID: `tooltip-system-v1`
> Scope: Step 4a 슬라이더/워터폴 + PricingSim + 13개 0-KpiCard 탭 + 공통 인프라 + **423 formula 일괄 정비** + **inline Tooltip 전역 통합**
> Estimated: **12~18 개발일** (Phase 1~4 전체)
> **Decision Record (2026-04-22):**
> - Beginner Mode 기본값 = **OFF** (실무자 중심, 교육 세션 시 수동 ON)
> - Phase 4 = **포함** (세계 최고 수준 기준 달성 위해 423 formula 일괄 정비)
> - VerdictInfo 치환 = **전체 범위** (OffsetEffectTab 6곳 + 대시보드 전역 inline Tooltip 패턴 grep 후 MetricInfo로 통일)

---

## Context (왜 지금)

**사용자 불만 (이번 세션 누적):**
1. 저가수주 판단기 "거래처 포트폴리오 1,708,299,818원이 무엇인지 모르겠다" — 시나리오 효과와 기존 실적 총량을 구분 못함. (해결됨: 커밋 `1ee8653`)
2. **확장 요청**: "Step 4a 슬라이더 3개, Pricing Simulation 등 유사 분석 탭에도 세계 최고 수준으로 툴팁 반영"

**감사 결과:**
- 65개 탭 중 46개가 이미 `KpiCard formula/benchmark` 활용 (423 formula 인스턴스)
- 0 KpiCard 탭 13개 (RfmTab 🔴 최우선)
- Step 4a 섹션(OffsetEffectTab.tsx **1652~2350**): 슬라이더 3개·워터폴 5단·프리셋 4개에 **설명 완전 없음**
- PricingSimTab: KPI 4개는 formula 있으나, 7개 원가 버킷 슬라이더·4개 프리셋·테이블 컬럼은 **설명 없음**
- 초보자 혼란 Top 10: 필요 단가 인상률, 가격효과, 원가효과, 물량효과, 고위험 품목, 이익 감소, 기존/최종 영업이익, 재료비 비중, 원가 슬라이더

**기대 결과:**
- 비개발자가 3분 내 주요 지표 의미 이해
- 같은 지표는 어디서든 동일 설명 (단일 소스)
- 기존 446개 formula 자산 보존 + 신규 영역만 집중

---

## 설계 원칙 (세계 최고 수준 기준)

| # | 원칙 | 구체화 |
|---|---|---|
| 1 | **Single Source of Truth** | `src/lib/metrics/glossary.ts` 한 곳. 같은 `metricId`는 전역 동일 문구 |
| 2 | **Progressive Disclosure** | Hover (300ms) → Stage 1 기본 설명 · Click → Stage 2 탭 확장(초/중/전) |
| 3 | **3단계 학습자 레벨** | `beginner` (비유+60자) · `intermediate` (공식+해석) · `expert` (출처+가정+주의) |
| 4 | **Context-aware** | `currentValue` prop → 부호/임계 기반 자동 branch 문구 |
| 5 | **Cross-Reference** | `relatedIds` 배열 → "↗ 풀 덤 효과(4b)와 비교" 링크 자동 |
| 6 | **Beginner Mode 토글** | `uiStore.beginnerMode` → 기본 설명을 hover 없이 인라인 강제 표시 |
| 7 | **기존 자산 호환** | KpiCard/AnalysisTooltip props 불변. 내부 구현만 점진 위임 |
| 8 | **접근성** | ARIA aria-describedby · 키보드 Tab · 모바일 tap-toggle |

---

## 아키텍처

### 컴포넌트 역할 분리

```
glossary.ts (SSoT)
       │
   ┌───┴───┬───────┬──────────┐
   ▼       ▼       ▼          ▼
KpiCard  ChartCard <MetricInfo/>  <GlossaryModal/>  ← Phase 3
(기존)    (기존)   (신규)
                    ├─ variant="inline"  (슬라이더/컬럼 헤더)
                    ├─ variant="compact" (숫자 옆, VerdictInfo 대체)
                    └─ variant="heavy"   (AnalysisTooltip 대체)
```

### 핵심 API — `<MetricInfo>`

```ts
export interface MetricInfoProps {
  id?: MetricId;                            // glossary 참조 (우선)
  variant?: "inline" | "compact" | "heavy"; // default "inline"
  // Override (glossary 미참조용, 레거시 호환)
  title?: string; formula?: string;
  beginner?: string; intermediate?: string; expert?: string;
  note?: string;
  // 맥락
  currentValue?: number;
  relatedIds?: MetricId[];
  side?: "top" | "bottom" | "left" | "right";
}
```

### Glossary 스키마

```ts
export interface MetricEntry {
  id: string;
  name: string;
  category: "overview" | "sales" | "profitability" | "receivables" | "orders" | "profiles";
  unit?: "currency" | "percent" | "number" | "days" | "ratio";
  formula: string;                      // mono font
  beginner: string;                     // 비유 + 60자 이내
  intermediate: string;                 // 공식 해석 2~4줄
  expert: string;                       // 출처·가정·회계 관점
  benchmark?: string;
  commonMistakes?: string[];
  contextBranches?: Array<{ when: (v: number) => boolean; message: string; tone?: "info"|"warning"|"success"|"danger" }>;
  relatedIds?: string[];
  source?: ("100"|"200"|"300"|"400"|"500"|"501"|"600"|"700"|"computed"|"external")[];
  sourceNote?: string;
}
```

파일 분리 (동적 import 가능):
```
src/lib/metrics/
├── glossary.ts              (타입 + re-export + MetricId 유니온)
├── glossary-overview.ts
├── glossary-sales.ts
├── glossary-profitability.ts (최대, ≈50~70 entries)
├── glossary-receivables.ts
├── glossary-orders.ts
└── glossary-profiles.ts
```

---

## Phase별 실행 계획

### Phase 1 — 기반 + 즉시 가치 (1.5~2일, 위험: **낮음**)

**목표:** Step 4a 슬라이더/워터폴/프리셋 툴팁. 공통 인프라 확립.

| 파일 | 액션 | LOC |
|---|---|---|
| `src/components/dashboard/MetricInfo.tsx` | 신규 (3 variant + Stage 1/2 전환) | +180 |
| `src/lib/metrics/glossary.ts` | 신규 (타입 + MetricId 유니온 + re-export) | +60 |
| `src/lib/metrics/glossary-profitability.ts` | 신규 (Step 4a + PricingSim 15 entries) | +350 |
| `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx` | Step 4a 3슬라이더 (line **1929~1953, 2056~2084**) / 워터폴 5단 (**2222~2260**) / 프리셋 4개 (**2117~2123**) MetricInfo 주입. **VerdictInfo 치환은 Phase 3로 이월** (위험 회피) | +40 |

**VerdictInfo는 이 Phase에서 건드리지 않음** (회귀 위험).

### Phase 2 — 확산 + Beginner Mode (2~3일, 위험: **중간**)

**목표:** PricingSim 완전 보강 + 0-KpiCard 탭 3개(RfmTab·O2CFlowTab·RiskTab) 신설 + 초보자 모드.

| 파일 | 액션 | LOC |
|---|---|---|
| `src/app/dashboard/profitability/tabs/PricingSimTab.tsx` | 7슬라이더(**183~196**) / 4프리셋(**171~181**) / 테이블 컬럼(**117~159**) MetricInfo 주입 | +50 |
| `src/app/dashboard/sales/tabs/RfmTab.tsx` | KpiCard 4개 신설 (R/F/M 평균 + 활성 고객) | +120 |
| `src/app/dashboard/orders/tabs/O2CFlowTab.tsx` | KpiCard 3개 신설 | +90 |
| `src/app/dashboard/profitability/tabs/RiskTab.tsx` | KpiCard 3개 신설 | +90 |
| `src/lib/metrics/glossary-sales.ts`, `glossary-orders.ts` | 신규 엔트리 | +400 |
| `src/stores/uiStore.ts` | `beginnerMode` + `tooltipLevel` (localStorage persist) | +20 |
| `src/components/layout/Header.tsx` | GraduationCap 토글 버튼 (DarkMode 왼쪽) | +25 |
| `src/components/dashboard/MetricInfo.tsx` | beginnerMode 반응 로직 | +30 |

### Phase 3 — 고도화 + inline Tooltip 전역 통일 (3일, 위험: **중간**)

**목표:** Glossary 페이지 + **VerdictInfo 전체 범위 치환** + inline Tooltip 패턴 전역 통합 + MD 자동 생성.

| 파일 | 액션 | LOC |
|---|---|---|
| `src/app/dashboard/glossary/page.tsx` | 신규 — 카테고리 그리드 + 검색 + 카테고리 필터 + 관련 지표 네비게이션 | +250 |
| `scripts/gen-glossary-md.mjs` | glossary.ts → `docs/glossary.md` 생성 (npm script `gen:glossary`) | +80 |
| `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx` | VerdictInfo 6회 사용처 → `<MetricInfo variant="compact">` 치환. 로컬 정의(**line 3043~3089**) 삭제 | ±0 |
| **전역 inline Tooltip 스캔** | `rg "from \"@/components/ui/tooltip\"" src/app/dashboard/` → 발견된 사용처 모두 분석. AnalysisTooltip 래퍼로 가려지지 않은 native `<Tooltip>` 인라인 사용은 MetricInfo variant로 통일 | +0 |
| 타깃 예상: MarginTab, ChartCard 내부, 기타 페이지별 수기 툴팁 | grep 결과 기반 일괄 치환 | +150 (치환) |
| `src/components/layout/Sidebar.tsx` | "용어 사전" 메뉴 추가 | +5 |
| `src/components/dashboard/AnalysisTooltip.tsx` | 내부 구현만 `<MetricInfo variant="heavy">`로 위임 (public props 불변) | +0 (refactor) |

**치환 원칙:**
- 동일 지표 ≥ 2회 출현 시 반드시 glossary 엔트리 생성 (SSoT 강제)
- 치환 전후 스크린샷 비교 저장 (`screenshots/pre-phase3/`, `screenshots/post-phase3/`)
- z-index 규칙 통일: `variant="inline"` = z-[60], `variant="compact"|"heavy"` = z-[70]

---

## 재사용 가능한 기존 자산

- **TooltipProvider**: `src/app/layout.tsx:18` 글로벌 — 추가 Provider 불필요 ✓
- **Tooltip wrapper**: `src/components/ui/tooltip.tsx` (Radix) ✓
- **AnalysisTooltip**: `src/components/dashboard/AnalysisTooltip.tsx` — public API 유지, Phase 3+에 내부만 MetricInfo 위임
- **VerdictInfo 레퍼런스 구현**: `OffsetEffectTab.tsx:3043~3089` — MetricInfo 경량 variant 설계 기준
- **423 formula 인라인**: 이번 스프린트 자동 마이그 안 함. Phase 4+에 `scripts/extract-formula.mjs` read-only로 CSV 추출 후 수기 이관

---

## 샘플 컨텐츠 — "필요 단가 인상률" (Stage 2 expert 탭)

```
📐 공식
  ① 신규원가 = 기존원가 + Σ(버킷원가 × 상승률)
  ② 필요매출 = 신규원가 ÷ (1 − 현재마진율)
  ③ 인상률 = (필요매출 − 현재매출) ÷ 현재매출 × 100
  ④ 가중평균 = Σ(품목별 인상률 × 매출비중)

📖 해석 (전문가)
  출처: 501 보고서 7-버킷 원가 구조. 가정:
  (1) 수요 가격탄력성 = 0, (2) 상승률 선형 적용,
  (3) 고정비 총액 불변. 마진 음수 품목은 별도 정책.

⚠️ 흔한 오해
  · 인상률 5% ≠ 매출 5% 증가 (단가만 상승)
  · 원가 인상분을 그대로 더하면 안 됨 (÷(1−마진율))
  · '미인상 시 이익 감소액'과 혼동 금지 (% vs 원)

🔗 관련 지표
  · 미인상 시 이익 감소 ↗
  · 고위험 품목 (>10%) ↗
  · 재료비 비중 ↗
```

**Context Branch 예** (currentValue = 8.2 시):
- `when: v => v > 5 && v <= 10` → "거래처 개별 협상 구간. 거래처별 영향 탭 참조." (warning)

---

## 비유 작성 가이드 (콘텐츠 표준)

**허용:**
- 실생활 소재 (커피/식당/빵집) → 제조업 외부인 이해 가능
- 질문형 종결 ("얼마가 되나요?")
- 60자 이내 + 구체 수치 1개

**금지:**
- 수식 기호(√, Σ) — beginner 레이어 절대 금지 (intermediate부터 OK)
- 영어 약어 (CM, COGS, CVP) — 한국어 풀어 쓰기
- 부정문 시작 ("~가 아닙니다") — 긍정 정의 우선
- 주관 형용사 ("훌륭한") — 수치 기준 대체

---

## 검증 방법

### 기능 검증
1. 비개발자 3명에게 RFM / 필요인상률 / 저가수주 판정 3개만 보여주고 3분 내 정답률 2/3 이상
2. 동일 지표를 2개 탭에서 표시 → 문구 일치 확인 (glossary 강제)
3. Beginner Mode 토글 → 페이지 새로고침 없이 즉시 반영

### 자동화 파이프라인
```bash
npm run build            # tsc --noEmit — MetricId 유니온 검증
npm run lint             # 기존 규칙
npm run test             # vitest — glossary 엔트리 스키마 테스트 신규 추가
                         #   · beginner.length <= 200
                         #   · formula 존재
                         #   · relatedIds 순환 참조 없음
```

### 회귀 방지
- KpiCard 기존 호출부(423): `formula`/`benchmark`/`reason` prop **불변 유지**. `metricId` 미지정 시 100% 기존 동작
- AnalysisTooltip: public props 불변
- VerdictInfo 치환: Phase 3 단일 작업으로 격리, 치환 전후 스크린샷 필수

---

## 리스크 & 대응

| # | 리스크 | 확률 | 영향 | 대응 |
|---|---|---|---|---|
| R1 | Glossary 작성량 폭발 | 중 | 중 | Phase 1은 ≈15 엔트리만. 423 일괄 이관 금지 |
| R2 | Beginner Mode ON 시 카드 높이 증가 → 레이아웃 깨짐 | 중 | 낮 | `grid-cols-N` min-h 동적. 수동 검증 |
| R3 | VerdictInfo 치환 시 시각 회귀 (폰트 크기) | 중 | 중 | Phase 3 단일 작업 격리. 스크린샷 비교 필수 |
| R4 | PM 문구 작성 지연 | 고 | 중 | 1일차 PM과 §비유 가이드 공유 |
| R5 | Radix Tooltip이 `<details>`/recharts Tooltip과 z-index 충돌 | 중 | 중 | 기존 `z-[60]`/`z-[70]` 규칙 재사용 |
| R6 | 모바일 tap 툴팁이 다른 tap으로 안 닫힘 | 중 | 낮 | `open` state 명시 제어 + overlay click close |

---

## 의사결정 확정 (2026-04-22)

| Q | 결정 | 근거 |
|---|---|---|
| **Q1. Beginner Mode 기본값** | **OFF** | 주 사용자가 실무자·경영진(숙련). 교육 세션 시 수동 ON |
| **Q2. Phase 4 포함 여부** | **포함** — 세계 최고 수준 달성 위해 423 formula 일괄 정비 필수 | SSoT 완성이 진정한 세계 최고 수준의 전제 |
| **Q3. Glossary 페이지 URL** | **`/dashboard/glossary`** | 사이드바 일관, 로그인 세션 내 접근 |
| **Q4. VerdictInfo 치환 범위** | **전체 범위** — OffsetEffectTab 6곳 + 대시보드 전역 inline Tooltip 패턴 grep 후 통일 | 일관성 최우선, 기술부채 누적 방지 |
| **Q5. Glossary MD 자동 생성** | **수동 `npm run gen:glossary` + CI `--diff` 검증** | Windows 팀 path issue 회피, PR 시 검증 충분 |

---

## Critical Files

**신규:**
- `src/components/dashboard/MetricInfo.tsx`
- `src/lib/metrics/glossary.ts`
- `src/lib/metrics/glossary-{profitability,sales,orders,...}.ts`
- `scripts/gen-glossary-md.mjs` (Phase 3)

**수정 (Phase 1):**
- `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx` — Step 4a 영역만
  - 1929~1953 (물량/단가 슬라이더)
  - 2056~2084 (원자재/노무/외주 슬라이더)
  - 2117~2123 (프리셋 4개)
  - 2222~2260 (워터폴 5단계)

**수정 (Phase 2):**
- `src/app/dashboard/profitability/tabs/PricingSimTab.tsx` — 117~159, 171~181, 183~196
- `src/app/dashboard/sales/tabs/RfmTab.tsx`
- `src/app/dashboard/orders/tabs/O2CFlowTab.tsx`
- `src/app/dashboard/profitability/tabs/RiskTab.tsx`
- `src/stores/uiStore.ts` (line 8 구조에 `beginnerMode` 추가)
- `src/components/layout/Header.tsx`

**수정 (Phase 3 — 확정 실행):**
- `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx` line 3043~3089 (VerdictInfo 삭제)
- `src/components/layout/Sidebar.tsx` (Glossary 링크)
- `src/components/dashboard/AnalysisTooltip.tsx` (내부 MetricInfo 위임)
- **grep 발견 전역 inline Tooltip 사용처** (치환 대상 Phase 3 착수 시 확정)

**수정 (Phase 4 — 확정 실행):**
- `scripts/extract-formula.mjs` 신규 (AST 스캐너, 423 formula → CSV)
- `docs/formula-inventory.csv` 생성 → PM 검토 후 glossary 추가 작성
- KpiCard 호출부 423곳에 점진적 `metricId` prop 주입 (하루 1 카테고리, 6일 배분)
- `src/components/dashboard/KpiCard.tsx` — `metricId` 지정 시 glossary 우선, 미지정 시 기존 `formula` string fallback 로직 유지

---

## Phase 4 — 423 formula 일괄 정비 + SSoT 완성 (6~9일, 위험: **중간**)

**목표:** 423개 formula 인라인 문자열을 glossary로 점진 이관. KpiCard를 metricId 중심으로 전환. 대시보드 전체 단일 소스 달성.

**실행 순서:**
1. **Day 1**: `scripts/extract-formula.mjs` 작성 (read-only, AST 파싱)
   - `src/app/dashboard/**/*.tsx` 스캔
   - `<KpiCard ... formula="..." benchmark="..." />` 패턴 추출
   - `docs/formula-inventory.csv` 생성 (columns: file, line, kpiTitle, formula, benchmark, description, reason, suggestedMetricId)
2. **Day 2**: PM/분석가가 Excel에서 dedupe → 동일 지표 그룹화 → 최종 문구 1개 선정
3. **Day 3~7**: 6개 카테고리별 glossary 엔트리 보완 (하루 1 카테고리)
   - overview → sales → profitability → receivables → orders → profiles
4. **Day 8**: KpiCard 호출부 423곳에 `metricId="..."` prop 일괄 추가
   - 자동화 스크립트로 파일별 Edit 생성 → PR로 검토 (변경 대량이지만 기계적)
5. **Day 9**: 인라인 `formula/benchmark/description/reason` prop **삭제** (glossary로 완전 전환)
   - 단, 본인 페이지 한 번도 dedupe되지 않은 고유 지표는 prop 유지 (Phase 4 이후 정책)

**검증:**
- CI에서 `node scripts/check-glossary-consistency.mjs` 실행 (metricId 누락·중복·순환참조 검출)
- 회귀 방지: 423 변경 전후 스크린샷 비교 (페이지별 샘플링)
- `npm run gen:glossary` 실행 후 `docs/glossary.md` git diff 없음 검증 (CI)

**리스크:**
- R9: PM 문구 정리 지연 → Day 2 기한 준수 필수. 미완 시 Phase 4 중단, Phase 4-bis로 이월
- R10: 423 일괄 prop 추가 시 TypeScript MetricId 유니온이 500+개로 팽창 → tsc 실측 1~2초 영향. 허용 범위
- R11: 자동 치환 스크립트가 복잡한 JSX 구조(조건부 렌더, 템플릿 리터럴)에서 실패 → 해당 케이스는 수기 처리, 로그로 표시

---

## 구현 타임라인 TL;DR (확정)

**1주차 (Phase 1):**
- Day 1: MetricInfo.tsx + glossary 스켈레톤 + profitability 엔트리 15개
- Day 2: OffsetEffectTab Step 4a 주입 + 커밋

**2주차 (Phase 2):**
- Day 3: PricingSimTab 주입 + glossary 확장 (sales/orders 엔트리)
- Day 4: RfmTab/O2CFlowTab/RiskTab KpiCard 신설
- Day 5: Beginner Mode 토글 + Header 통합

**3주차 (Phase 3):**
- Day 6: Glossary 페이지 + MD 자동 생성
- Day 7: VerdictInfo 6곳 치환 + 전역 inline Tooltip grep 스캔
- Day 8: 발견 사용처 일괄 MetricInfo 통일 + AnalysisTooltip 내부 위임 + 스크린샷 회귀 QA

**4~5주차 (Phase 4):**
- Day 9: `scripts/extract-formula.mjs` + CSV 생성
- Day 10: PM 문구 dedupe
- Day 11~15: 카테고리별 glossary 보완 (6 카테고리)
- Day 16: KpiCard 호출부 `metricId` 일괄 주입
- Day 17: 인라인 prop 삭제 + 회귀 검증
- Day 18: 최종 QA + 배포

**총 투입:** 18 개발일 (≈3.5주)
