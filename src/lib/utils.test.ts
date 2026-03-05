import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  calcChangeRate,
  getChangeArrow,
  extractMonth,
  filterByOrg,
  filterByDateRange,
  filterOrgProfitLeafOnly,
} from "./utils";

// ─── formatCurrency ──────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats plain numbers with Korean locale", () => {
    expect(formatCurrency(1234567)).toBe("1,234,567");
  });

  it("returns '-' for NaN and Infinity", () => {
    expect(formatCurrency(NaN)).toBe("-");
    expect(formatCurrency(Infinity)).toBe("-");
    expect(formatCurrency(-Infinity)).toBe("-");
  });

  it("compact: converts to 억 for >= 1e8", () => {
    expect(formatCurrency(5e8, true)).toBe("5.0억");
    expect(formatCurrency(1.23e8, true)).toBe("1.2억");
  });

  it("compact: converts to 만 for >= 1e4", () => {
    expect(formatCurrency(50000, true)).toBe("5만");
    expect(formatCurrency(123456, true)).toBe("12만");
  });

  it("compact: small numbers stay as-is", () => {
    expect(formatCurrency(999, true)).toBe("999");
  });

  it("handles negative values in compact mode", () => {
    expect(formatCurrency(-3e8, true)).toBe("-3.0억");
    expect(formatCurrency(-50000, true)).toBe("-5만");
  });

  it("rounds to nearest integer in non-compact mode", () => {
    expect(formatCurrency(1234.56)).toBe("1,235");
  });
});

// ─── formatPercent ───────────────────────────────────────────

describe("formatPercent", () => {
  it("formats percentage with default 1 decimal", () => {
    expect(formatPercent(12.345)).toBe("12.3%");
  });

  it("custom decimal places", () => {
    expect(formatPercent(12.345, 2)).toBe("12.35%");
    expect(formatPercent(100, 0)).toBe("100%");
  });

  it("returns '-' for non-finite values", () => {
    expect(formatPercent(NaN)).toBe("-");
    expect(formatPercent(Infinity)).toBe("-");
  });
});

// ─── formatNumber ────────────────────────────────────────────

describe("formatNumber", () => {
  it("formats with Korean locale separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("returns '-' for NaN", () => {
    expect(formatNumber(NaN)).toBe("-");
  });
});

// ─── calcChangeRate ──────────────────────────────────────────

describe("calcChangeRate", () => {
  it("calculates percentage change", () => {
    expect(calcChangeRate(120, 100)).toBe(20);
  });

  it("handles previous = 0", () => {
    expect(calcChangeRate(100, 0)).toBe(100);
    expect(calcChangeRate(0, 0)).toBe(0);
  });

  it("handles negative previous (uses Math.abs)", () => {
    expect(calcChangeRate(-50, -100)).toBe(50);
  });
});

// ─── getChangeArrow ──────────────────────────────────────────

describe("getChangeArrow", () => {
  it("returns correct arrows", () => {
    expect(getChangeArrow(5)).toBe("▲");
    expect(getChangeArrow(-3)).toBe("▼");
    expect(getChangeArrow(0)).toBe("—");
  });
});

// ─── extractMonth ────────────────────────────────────────────

describe("extractMonth", () => {
  it("handles YYYY-MM-DD format", () => {
    expect(extractMonth("2024-01-15")).toBe("2024-01");
    expect(extractMonth("2024-12-31")).toBe("2024-12");
  });

  it("handles YYYY/MM/DD format", () => {
    expect(extractMonth("2024/1/15")).toBe("2024-01");
    expect(extractMonth("2024/12/31")).toBe("2024-12");
  });

  it("handles YYYYMMDD 8-digit format", () => {
    expect(extractMonth("20240115")).toBe("2024-01");
  });

  it("handles YYYYMM 6-digit format", () => {
    expect(extractMonth("202401")).toBe("2024-01");
  });

  it("handles Excel serial numbers", () => {
    // 45292 = 2024-01-01 in Excel serial
    const result = extractMonth("45292");
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });

  it("returns empty string for invalid input", () => {
    expect(extractMonth("")).toBe("");
    expect(extractMonth("abc")).toBe("");
  });
});

// ─── filterByOrg ─────────────────────────────────────────────

describe("filterByOrg", () => {
  const data = [
    { 영업조직: "팀A", value: 1 },
    { 영업조직: "팀B", value: 2 },
    { 영업조직: "팀C", value: 3 },
  ];

  it("returns all data when orgNames is empty", () => {
    expect(filterByOrg(data, new Set())).toHaveLength(3);
  });

  it("filters by matching org names", () => {
    const result = filterByOrg(data, new Set(["팀A", "팀C"]));
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(1);
    expect(result[1].value).toBe(3);
  });

  it("supports custom field name", () => {
    const data2 = [
      { 영업조직팀: "조직1", v: 10 },
      { 영업조직팀: "조직2", v: 20 },
    ];
    const result = filterByOrg(data2, new Set(["조직2"]), "영업조직팀");
    expect(result).toHaveLength(1);
    expect(result[0].v).toBe(20);
  });
});

// ─── filterByDateRange ───────────────────────────────────────

describe("filterByDateRange", () => {
  const data = [
    { 매출일: "2024-01-15", v: 1 },
    { 매출일: "2024-03-10", v: 2 },
    { 매출일: "2024-06-20", v: 3 },
  ];

  it("returns all data when dateRange is null", () => {
    expect(filterByDateRange(data, null, "매출일")).toHaveLength(3);
  });

  it("filters within date range (inclusive)", () => {
    const result = filterByDateRange(data, { from: "2024-01", to: "2024-03" }, "매출일");
    expect(result).toHaveLength(2);
  });

  it("excludes rows with unparseable dates", () => {
    const data2 = [{ 매출일: "invalid", v: 1 }, { 매출일: "2024-01-01", v: 2 }];
    const result = filterByDateRange(data2, { from: "2024-01", to: "2024-12" }, "매출일");
    expect(result).toHaveLength(1);
  });
});

// ─── filterOrgProfitLeafOnly ─────────────────────────────────

describe("filterOrgProfitLeafOnly", () => {
  it("removes subtotal rows where team equals hq or div", () => {
    const data = [
      { 영업조직팀: "본부A", 판매사업본부: "본부A", 판매사업부: "" },
      { 영업조직팀: "팀1", 판매사업본부: "본부A", 판매사업부: "사업부X" },
    ];
    const result = filterOrgProfitLeafOnly(data);
    expect(result).toHaveLength(1);
    expect(result[0].영업조직팀).toBe("팀1");
  });

  it("removes rows containing 합계 or 소계", () => {
    const data = [
      { 영업조직팀: "합계", 판매사업본부: "", 판매사업부: "" },
      { 영업조직팀: "소계행", 판매사업본부: "", 판매사업부: "" },
      { 영업조직팀: "일반팀", 판매사업본부: "", 판매사업부: "" },
    ];
    const result = filterOrgProfitLeafOnly(data);
    expect(result).toHaveLength(1);
    expect(result[0].영업조직팀).toBe("일반팀");
  });

  it("removes rows with empty team name", () => {
    const data = [
      { 영업조직팀: "", 판매사업본부: "", 판매사업부: "" },
      { 영업조직팀: "팀A", 판매사업본부: "", 판매사업부: "" },
    ];
    expect(filterOrgProfitLeafOnly(data)).toHaveLength(1);
  });
});
