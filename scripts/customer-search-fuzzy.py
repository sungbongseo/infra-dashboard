"""
모든 사무소에서 '대성', '건진' 부분 일치 거래처 찾기.
"""
import openpyxl

DATA_DIR = "기타/업로드자료"
KEYWORDS = ["대성", "건진", "Daesung", "Geonjin", "DS", "GJ"]  # 가능한 변형

aging_files = [
    "건자재_미수채권연령.xlsx",
    "광주사무소_미수채권연령.xlsx",
    "대구사무소_미수채권연령.xlsx",
    "대전사무소_미수채권연령.xlsx",
    "부산지점_미수채권연령.xlsx",
    "전략구매혁신팀_미수채권연령.xlsx",
    "해외사업팀_미수채권연령.xlsx",
]

print("거래처명 fuzzy 검색 — 키워드:", KEYWORDS)
print("=" * 75)

found_total = []
all_customers = set()

for f in aging_files:
    path = f"{DATA_DIR}/{f}"
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.active

        office_customers = []
        for row in ws.iter_rows(min_row=3, values_only=True):
            if not row or len(row) < 5:
                continue
            cust_name = row[4]
            if cust_name is None:
                continue
            cust_str = str(cust_name).strip()
            if not cust_str:
                continue

            all_customers.add(cust_str)

            # 키워드 매칭 (대소문자 무시)
            for kw in KEYWORDS:
                if kw.lower() in cust_str.lower():
                    office_customers.append({
                        "office": f.replace("_미수채권연령.xlsx", ""),
                        "code": row[3],
                        "name": cust_str,
                        "person": row[2],
                        "ledger_total": row[29] if len(row) > 29 else 0,
                        "credit_limit": row[30] if len(row) > 30 else 0,
                        "match_kw": kw,
                    })
                    break

        if office_customers:
            print(f"\n📂 {f}: {len(office_customers)}건")
            for c in office_customers:
                ledger = float(c['ledger_total'] or 0)
                credit = float(c['credit_limit'] or 0)
                print(f"   - [{c['code']}] {c['name']}  (담당: {c['person']}, 미수: {ledger:,.0f}, 한도: {credit:,.0f})")
                found_total.append(c)
        wb.close()
    except Exception as e:
        print(f"⚠ {f}: {e}")

print(f"\n총 매칭: {len(found_total)}건")
print(f"전체 거래처 수: {len(all_customers)}")

# 만약 매칭 0건이면 "케미칼" or "이엔씨" 같은 산업 키워드도 시도
if len(found_total) == 0:
    print("\n🔍 산업 키워드 대안 검색: '이엔씨', '케미칼'")
    for cust in sorted(all_customers):
        if "이엔씨" in cust or "케미칼" in cust or "ENC" in cust.upper():
            print(f"   유사: {cust}")
