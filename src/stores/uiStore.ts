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
}

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
}));
