"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useUIStore } from "@/stores/uiStore";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="transition-all duration-300" style={{ marginLeft: sidebarOpen ? 256 : 64 }}>
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
