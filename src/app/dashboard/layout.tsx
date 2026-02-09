"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { GlobalFilterBar } from "@/components/dashboard/GlobalFilterBar";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { useUIStore } from "@/stores/uiStore";
import { useDataStore } from "@/stores/dataStore";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const hasFiles = useDataStore((s) => s.uploadedFiles.length > 0);

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="transition-all duration-300" style={{ marginLeft: sidebarOpen ? 256 : 64 }}>
        <Header />
        {hasFiles && <GlobalFilterBar />}
        <main className="p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
