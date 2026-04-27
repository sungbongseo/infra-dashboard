"""
D-5 Dry-Run: 실제 100 데이터에서 카니발라이제이션 매트릭스 추출.

목적: case study의 fictional 패턴이 실제 데이터에서 재현되는지 검증.
출력: 익명화 통계 (거래처/품목 코드 마스킹 처리).

컬럼 인덱스 (parser.ts customerItemDetail 기준):
  - 0: No, 3: 영업조직팀, 4: 매출거래처, 5: 품목, 13: 매출연월
  - parsePlanActualDiff(row, N): 계획=N, 실적=N+1, 차이=N+2
  - 매출수량 startIdx=42 → 실적=43
  - 매출액 startIdx=45 → 실적=46
  - 영업이익 startIdx=75 → 실적=76
  - skip rows: 0, 1 (header) → data from row 2 (1-indexed=3)
"""
import openpyxl
from collections import defaultdict
from itertools import combinations
import math

EXCEL_PATH = "기타/업로드자료/100거래처별,품목별 손익.xlsx"

print("=" * 60)
print("D-5 Dry-Run: 실제 100 데이터 카니발 매트릭스 검증")
print("=" * 60)

# 1. 데이터 로드 ────────────────────────────────────────────
print("\n[1] 데이터 로드 중 (forward fill 적용)...")
wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
ws = wb.active

# Forward fill 상태
last_org = ""
last_cust = ""
last_item = ""
last_category = ""
last_month = ""

# customer × item × month → sales/qty/profit
ts_data = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
item_totals = defaultdict(lambda: {"sales": 0, "qty": 0, "profit": 0, "count": 0})
customer_item_pairs = set()
all_months = set()
processed_rows = 0
skipped_rows = 0

for row in ws.iter_rows(min_row=3, values_only=True):  # skip 2 header rows
    if not row or row[0] is None:
        skipped_rows += 1
        continue

    # Forward fill (SAP CO-PA pattern)
    org = row[3] if row[3] else last_org
    cust = row[4] if row[4] else last_cust
    item = row[5] if row[5] else last_item
    category = row[6] if row[6] else last_category
    month_raw = row[13] if row[13] else last_month

    last_org, last_cust, last_item, last_category, last_month = org, cust, item, category, month_raw

    # 데이터 추출 (실적)
    qty = row[43] if row[43] is not None else 0
    sales = row[46] if row[46] is not None else 0
    profit = row[76] if row[76] is not None else 0

    if not cust or not item:
        skipped_rows += 1
        continue

    # 월 정규화 (YYYYMM)
    month_str = str(month_raw).strip()[:6]
    if not month_str.isdigit() or len(month_str) != 6:
        skipped_rows += 1
        continue

    # 합계행 필터 ("합계", "총합계" 등)
    if any(s in str(item) for s in ["합계", "소계", "총계"]):
        skipped_rows += 1
        continue

    # 같은 cust/item/month 데이터 누적 (다중 행 가능)
    if month_str in ts_data[cust][item]:
        ts_data[cust][item][month_str]["sales"] += sales
        ts_data[cust][item][month_str]["qty"] += qty
        ts_data[cust][item][month_str]["profit"] += profit
    else:
        ts_data[cust][item][month_str] = {"sales": sales, "qty": qty, "profit": profit}

    item_totals[item]["sales"] += sales
    item_totals[item]["profit"] += profit
    item_totals[item]["qty"] += qty
    item_totals[item]["count"] += 1
    customer_item_pairs.add((cust, item))
    all_months.add(month_str)
    processed_rows += 1

print(f"  - 처리 행: {processed_rows:,}")
print(f"  - 스킵 행: {skipped_rows:,}")
print(f"  - 거래처 수: {len(ts_data):,}")
print(f"  - 품목 수 (매출 발생): {len(item_totals):,}")
print(f"  - 거래처-품목 페어: {len(customer_item_pairs):,}")
print(f"  - 월 수: {len(all_months)}")

# 2. Top 15 품목 추출 (매출 기준) ───────────────────────────
print("\n[2] Top 15 품목 (매출 기준)")
top_items = sorted([(k, v) for k, v in item_totals.items() if v["sales"] > 0],
                    key=lambda x: x[1]["sales"], reverse=True)[:15]
print(f"  {'순위':<4} {'품목':<10} {'매출(억)':>10} {'영업이익률':>10} {'레코드':>8}")
for i, (item_code, stats) in enumerate(top_items, 1):
    rev_eok = stats["sales"] / 1e8
    margin = stats["profit"] / stats["sales"] * 100 if stats["sales"] else 0
    masked = str(item_code)[:5] + "**" if len(str(item_code)) > 5 else str(item_code)
    print(f"  #{i:<3} {masked:<10} {rev_eok:>9.1f}억 {margin:>9.1f}% {stats['count']:>8}")

top_15_codes = [item_code for item_code, _ in top_items]

# 3. 영업이익률 분포 ────────────────────────────────────────
print("\n[3] 영업이익률 분포 (case study 36% 가정 vs 실측)")
margins = [s["profit"] / s["sales"] * 100 for s in item_totals.values() if s["sales"] > 0]
margins.sort()
n = len(margins)
print(f"  - 매출 발생 품목 수: {n}")
if n > 0:
    print(f"  - 평균: {sum(margins)/n:.1f}%")
    print(f"  - 중앙값: {margins[n//2]:.1f}%")
    print(f"  - P25: {margins[n//4]:.1f}%")
    print(f"  - P75: {margins[n*3//4]:.1f}%")
    top15_total_rev = sum(s["sales"] for _, s in top_items)
    top15_total_profit = sum(s["profit"] for _, s in top_items)
    top15_margin = top15_total_profit / top15_total_rev * 100 if top15_total_rev else 0
    print(f"  - Top 15 가중평균 영업이익률: {top15_margin:.1f}%")
    print(f"  - Case study 가정: 36%")

# 4. Pearson 상관 매트릭스 (Top 15) ─────────────────────────
print("\n[4] 카니발 매트릭스 추출 중 (Pearson, 거래처별 평균)")

def pearson(a, b):
    n = len(a)
    if n < 2: return 0.0
    mean_a = sum(a) / n
    mean_b = sum(b) / n
    num = sum((a[i] - mean_a) * (b[i] - mean_b) for i in range(n))
    den_a = math.sqrt(sum((x - mean_a) ** 2 for x in a))
    den_b = math.sqrt(sum((x - mean_b) ** 2 for x in b))
    if den_a == 0 or den_b == 0: return 0.0
    return num / (den_a * den_b)

MIN_SAMPLE_MONTHS = 4

pair_corrs = defaultdict(list)
pair_sample_sizes = defaultdict(list)

for cust, item_map in ts_data.items():
    items_with_data = [it for it in item_map.keys() if it in top_15_codes]
    if len(items_with_data) < 2: continue
    for item_a, item_b in combinations(items_with_data, 2):
        months_a = item_map[item_a]
        months_b = item_map[item_b]
        common_months = sorted(set(months_a.keys()) & set(months_b.keys()))
        if len(common_months) < MIN_SAMPLE_MONTHS: continue
        a = [months_a[m]["sales"] for m in common_months]
        b = [months_b[m]["sales"] for m in common_months]
        rho = pearson(a, b)
        pair_corrs[(item_a, item_b)].append(rho)
        pair_sample_sizes[(item_a, item_b)].append(len(common_months))

print(f"  - 분석 대상 페어: {len(pair_corrs)}")

matrix_results = []
for pair, corrs in pair_corrs.items():
    avg_rho = sum(corrs) / len(corrs)
    avg_n = sum(pair_sample_sizes[pair]) / len(pair_sample_sizes[pair])
    matrix_results.append({
        "pair": pair,
        "rho": avg_rho,
        "customer_count": len(corrs),
        "avg_sample_months": avg_n,
    })

# 5. 음의 상관 (잠식 후보) Top 10 ────────────────────────────
print("\n[5] 카니발 후보 (강한 음의 상관) — Top 10")
neg_corr = [r for r in matrix_results if r["rho"] < -0.3]
neg_corr.sort(key=lambda x: x["rho"])
print(f"  - 강한 음의 상관 (ρ < -0.3) 페어 수: {len(neg_corr)}")
print(f"\n  {'A':<10} {'B':<10} {'ρ':>7} {'샘플(M)':>8} {'거래처':>7}")
for r in neg_corr[:10]:
    a_masked = str(r["pair"][0])[:5] + "**"
    b_masked = str(r["pair"][1])[:5] + "**"
    print(f"  {a_masked:<10} {b_masked:<10} {r['rho']:>+7.3f} {r['avg_sample_months']:>7.1f} {r['customer_count']:>7}")

# 6. 신뢰도 분포 ────────────────────────────────────────────
print("\n[6] 신뢰도 분포 (샘플 월 기반)")
high = sum(1 for r in matrix_results if r["avg_sample_months"] >= 12)
medium = sum(1 for r in matrix_results if 8 <= r["avg_sample_months"] < 12)
low = sum(1 for r in matrix_results if 4 <= r["avg_sample_months"] < 8)
total = max(len(matrix_results), 1)
print(f"  - high (12M+):      {high} ({high/total*100:.1f}%)")
print(f"  - medium (8~11M):   {medium} ({medium/total*100:.1f}%)")
print(f"  - low (4~7M):       {low} ({low/total*100:.1f}%)")

# 7. 상관계수 분포 ──────────────────────────────────────────
print("\n[7] 상관계수 분포 (전체 페어)")
strong_neg = sum(1 for r in matrix_results if r["rho"] <= -0.3)
weak_neg = sum(1 for r in matrix_results if -0.3 < r["rho"] < 0)
neutral = sum(1 for r in matrix_results if 0 <= r["rho"] < 0.3)
positive = sum(1 for r in matrix_results if r["rho"] >= 0.3)
print(f"  - 강한 음의 상관 (잠식): {strong_neg} ({strong_neg/total*100:.1f}%)")
print(f"  - 약한 음의 상관:        {weak_neg} ({weak_neg/total*100:.1f}%)")
print(f"  - 중립:                  {neutral} ({neutral/total*100:.1f}%)")
print(f"  - 양의 상관 (보완재):    {positive} ({positive/total*100:.1f}%)")

# 8. 시계열 범위 ────────────────────────────────────────────
print("\n[8] 월 데이터 범위")
sorted_months = sorted([m for m in all_months if m.isdigit() and len(m) == 6])
print(f"  - 월 수: {len(sorted_months)}")
print(f"  - 첫 월: {sorted_months[0] if sorted_months else 'N/A'}")
print(f"  - 마지막 월: {sorted_months[-1] if sorted_months else 'N/A'}")

# 9. Case Study 비교 ────────────────────────────────────────
print("\n" + "=" * 60)
print("[9] CASE STUDY 패턴 vs 실측 데이터 비교 (최종 판정)")
print("=" * 60)

cs_margin = 36
real_margin = top15_margin if n > 0 else 0
margin_match = "🟢 일치" if abs(real_margin - cs_margin) < 8 else "🟡 차이 있음 (재계산 필요)"

cs_period = 14
real_period = len(sorted_months)
period_match = "🟢 적정" if real_period >= 12 else "🟡 부족"

cs_cannibal_exists = True
real_cannibal_exists = strong_neg >= 3
cannibal_match = "🟢 패턴 존재" if real_cannibal_exists else "🟡 패턴 약함"

confidence_high_med = high + medium
confidence_match = "🟢 충분" if confidence_high_med >= total * 0.5 else "🟡 부족"

print(f"""
| 항목 | Case Study | 실측 | 판정 |
|------|-----------|------|------|
| 시계열 길이 | {cs_period}M 가정 | {real_period}M | {period_match} |
| Top 15 영업이익률 | {cs_margin}% | {real_margin:.1f}% | {margin_match} |
| 잠식 후보 (ρ<-0.3) | 패턴 존재 가정 | {strong_neg}개 페어 | {cannibal_match} |
| 신뢰도 high+medium | medium 다수 가정 | {confidence_high_med}/{total} ({confidence_high_med/total*100:.0f}%) | {confidence_match} |
""")

# 종합 판정
all_pass = all([
    real_period >= 12,
    abs(real_margin - cs_margin) < 8,
    real_cannibal_exists,
    confidence_high_med >= total * 0.5,
])

if all_pass:
    print("🟢 전체 패턴 일치 — case study 자산 그대로 시연 가능")
else:
    print("🟡 일부 패턴 불일치 — case study 미세 조정 권장:")
    if abs(real_margin - cs_margin) >= 8:
        print(f"   - 영업이익률 가정을 36% → {real_margin:.0f}%로 갱신")
    if not real_cannibal_exists:
        print(f"   - 잠식 후보 부족 — 다른 거래처 선정 또는 분석 윈도우 변경 권장")
    if real_period < 12:
        print(f"   - 시계열 부족 — 추가 데이터 누적 필요")

print("\nDry-Run 완료")
