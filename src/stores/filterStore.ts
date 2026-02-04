import { create } from "zustand";

interface FilterState {
  selectedOrgs: string[];
  selectedPerson: string | null;
  dateRange: { from: string; to: string } | null;
  comparisonRange: { from: string; to: string } | null;
  comparisonPreset: "prev_month" | "prev_quarter" | "prev_year" | "custom" | null;
  searchQuery: string;
  setSelectedOrgs: (orgs: string[]) => void;
  setSelectedPerson: (person: string | null) => void;
  setDateRange: (range: { from: string; to: string } | null) => void;
  setComparisonRange: (range: { from: string; to: string } | null) => void;
  setComparisonPreset: (preset: "prev_month" | "prev_quarter" | "prev_year" | "custom" | null) => void;
  setSearchQuery: (query: string) => void;
  resetFilters: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  selectedOrgs: [],
  selectedPerson: null,
  dateRange: null,
  comparisonRange: null,
  comparisonPreset: null,
  searchQuery: "",
  setSelectedOrgs: (orgs) => set({ selectedOrgs: orgs }),
  setSelectedPerson: (person) => set({ selectedPerson: person }),
  setDateRange: (range) => set({ dateRange: range }),
  setComparisonRange: (range) => set({ comparisonRange: range }),
  setComparisonPreset: (preset) => set({ comparisonPreset: preset }),
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
