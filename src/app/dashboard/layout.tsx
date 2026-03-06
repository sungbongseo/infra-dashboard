"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { GlobalFilterBar } from "@/components/dashboard/GlobalFilterBar";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { Customer360Modal } from "@/components/dashboard/Customer360Modal";
import { useUIStore } from "@/stores/uiStore";
import { useDataStore } from "@/stores/dataStore";
import { useMemo } from "react";
import type { ReceivableAgingRecord } from "@/types";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const customer360Target = useUIStore((s) => s.customer360Target);
  const setCustomer360Target = useUIStore((s) => s.setCustomer360Target);
  const hasFiles = useDataStore((s) => s.uploadedFiles.length > 0);
  const salesList = useDataStore((s) => s.salesList);
  const collectionList = useDataStore((s) => s.collectionList);
  const orderList = useDataStore((s) => s.orderList);
  const receivableAging = useDataStore((s) => s.receivableAging);
  const orgCustomerProfit = useDataStore((s) => s.orgCustomerProfit);

  const flatAging = useMemo(() => {
    const all: ReceivableAgingRecord[] = [];
    Array.from(receivableAging.values()).forEach((arr) => all.push(...arr));
    return all;
  }, [receivableAging]);

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
      {customer360Target && (
        <Customer360Modal
          customerName={customer360Target}
          onClose={() => setCustomer360Target(null)}
          salesList={salesList}
          collectionList={collectionList}
          orderList={orderList}
          agingRecords={flatAging}
          orgCustProfit={orgCustomerProfit}
        />
      )}
    </div>
  );
}
