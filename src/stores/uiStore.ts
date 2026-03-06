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
  presentationMode: false,
  setPresentationMode: (mode) => set({ presentationMode: mode }),
  customer360Target: null,
  setCustomer360Target: (name) => set({ customer360Target: name }),
}));
