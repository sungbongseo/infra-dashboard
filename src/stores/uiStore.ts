import { create } from "zustand";

export type Tab = "overview" | "sales" | "orders" | "profitability" | "receivables" | "profiles" | "data";

interface UIState {
  activeTab: Tab;
  sidebarOpen: boolean;
  darkMode: boolean;
  setActiveTab: (tab: Tab) => void;
  toggleSidebar: () => void;
  toggleDarkMode: () => void;
  setSidebarOpen: (open: boolean) => void;
  presentationMode: boolean;
  setPresentationMode: (mode: boolean) => void;
  customer360Target: string | null;
  setCustomer360Target: (name: string | null) => void;
  /** 초보자 모드: MetricInfo 툴팁이 항상 펼쳐진 상태로 hover 없이 인라인 노출 */
  beginnerMode: boolean;
  setBeginnerMode: (v: boolean) => void;
  /** 하이드레이션: localStorage에서 beginnerMode 복원 (페이지 마운트 시 1회 호출) */
  hydrateBeginnerMode: () => void;
}

const readBeginnerMode = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("bkit:beginnerMode") === "1";
  } catch {
    return false;
  }
};

const writeBeginnerMode = (v: boolean) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("bkit:beginnerMode", v ? "1" : "0");
  } catch {
    // localStorage unavailable (e.g. Safari private) — 조용히 무시
  }
};

export const useUIStore = create<UIState>((set) => ({
  activeTab: "overview",
  sidebarOpen: true,
  darkMode: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next);
      }
      return { darkMode: next };
    }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  presentationMode: false,
  setPresentationMode: (mode) => set({ presentationMode: mode }),
  customer360Target: null,
  setCustomer360Target: (name) => set({ customer360Target: name }),
  // Beginner Mode — 기본 OFF (사용자 결정 Q1: OFF)
  beginnerMode: false,
  setBeginnerMode: (v) => {
    writeBeginnerMode(v);
    set({ beginnerMode: v });
  },
  hydrateBeginnerMode: () => {
    const stored = readBeginnerMode();
    set({ beginnerMode: stored });
  },
}));
