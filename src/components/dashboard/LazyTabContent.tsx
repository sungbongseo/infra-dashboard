"use client";

import { useState, useEffect } from "react";
import { KpiSkeleton } from "@/components/dashboard/LoadingSkeleton";

interface LazyTabContentProps {
  value: string;
  activeTab: string;
  children: React.ReactNode;
}

/**
 * 탭이 최초 선택될 때만 마운트하는 lazy wrapper.
 * 한번 마운트되면 탭 전환 시에도 유지 (리렌더링만 발생).
 */
export function LazyTabContent({ value, activeTab, children }: LazyTabContentProps) {
  const [mounted, setMounted] = useState(activeTab === value);

  useEffect(() => {
    if (activeTab === value && !mounted) {
      setMounted(true);
    }
  }, [activeTab, value, mounted]);

  if (!mounted) {
    return activeTab === value ? <KpiSkeleton /> : null;
  }

  return <>{children}</>;
}
