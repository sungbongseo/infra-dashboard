import { create } from "zustand";
import { subMonths, subQuarters, subYears, format, parse } from "date-fns";

export type ComparisonPreset = "prev_month" | "prev_quarter" | "prev_year" | "custom" | null;

interface FilterState {
  selectedOrgs: string[];
  selectedPerson: string | null;
  dateRange: { from: string; to: string } | null;
  comparisonRange: { from: string; to: string } | null;
  comparisonPreset: ComparisonPreset;
  searchQuery: string;
  setSelectedOrgs: (orgs: string[]) => void;
  setSelectedPerson: (person: string | null) => void;
  setDateRange: (range: { from: string; to: string } | null) => void;
  setComparisonRange: (range: { from: string; to: string } | null) => void;
  setComparisonPreset: (preset: ComparisonPreset) => void;
  /** 프리셋 선택 시 dateRange 기반으로 comparisonRange 자동 계산 */
  applyComparisonPreset: (preset: ComparisonPreset) => void;
  setSearchQuery: (query: string) => void;
  resetFilters: () => void;
}

/** YYYY-MM 문자열을 Date로 변환 */
function parseYearMonth(ym: string): Date {
  return parse(ym, "yyyy-MM", new Date());
}

/** Date를 YYYY-MM 문자열로 변환 */
function formatYearMonth(d: Date): string {
  return format(d, "yyyy-MM");
}

/** 비교기간 자동 산출 */
export function calcComparisonRange(
  dateRange: { from: string; to: string },
  preset: ComparisonPreset
): { from: string; to: string } | null {
  if (!preset || preset === "custom" || !dateRange.from || !dateRange.to) return null;

  const fromDate = parseYearMonth(dateRange.from);
  const toDate = parseYearMonth(dateRange.to);

  switch (preset) {
    case "prev_month": {
      return {
        from: formatYearMonth(subMonths(fromDate, 1)),
        to: formatYearMonth(subMonths(toDate, 1)),
      };
    }
    case "prev_quarter": {
      return {
        from: formatYearMonth(subQuarters(fromDate, 1)),
        to: formatYearMonth(subQuarters(toDate, 1)),
      };
    }
    case "prev_year": {
      return {
        from: formatYearMonth(subYears(fromDate, 1)),
        to: formatYearMonth(subYears(toDate, 1)),
      };
    }
    default:
      return null;
  }
}

export const useFilterStore = create<FilterState>((set, get) => ({
  selectedOrgs: [],
  selectedPerson: null,
  dateRange: null,
  comparisonRange: null,
  comparisonPreset: null,
  searchQuery: "",
  setSelectedOrgs: (orgs) => set({ selectedOrgs: orgs }),
  setSelectedPerson: (person) => set({ selectedPerson: person }),
  setDateRange: (range) => {
    const state = get();
    // 날짜 변경 시 기존 프리셋으로 비교기간 재계산
    if (range && state.comparisonPreset && state.comparisonPreset !== "custom") {
      const compRange = calcComparisonRange(range, state.comparisonPreset);
      set({ dateRange: range, comparisonRange: compRange });
    } else {
      set({ dateRange: range });
    }
  },
  setComparisonRange: (range) => set({ comparisonRange: range }),
  setComparisonPreset: (preset) => set({ comparisonPreset: preset }),
  applyComparisonPreset: (preset) => {
    const state = get();
    if (!preset) {
      set({ comparisonPreset: null, comparisonRange: null });
      return;
    }
    if (preset === "custom") {
      set({ comparisonPreset: "custom" });
      return;
    }
    if (state.dateRange && state.dateRange.from && state.dateRange.to) {
      const compRange = calcComparisonRange(state.dateRange, preset);
      set({ comparisonPreset: preset, comparisonRange: compRange });
    } else {
      set({ comparisonPreset: preset });
    }
  },
  setSearchQuery: (query) => set({ searchQuery: query }),
  resetFilters: () =>
    set({
      selectedOrgs: [],
      selectedPerson: null,
      dateRange: null,
      comparisonRange: null,
      comparisonPreset: null,
      searchQuery: "",
    }),
}));
