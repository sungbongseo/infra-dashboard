"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  TrendingUp,
  ShoppingCart,
  PieChart,
  CreditCard,
  Users,
  Database,
  ChevronLeft,
  Building2,
} from "lucide-react";
import { useUIStore } from "@/stores/uiStore";

const navItems = [
  { id: "overview", label: "영업 실적 Overview", icon: LayoutDashboard, href: "/dashboard" },
  { id: "sales", label: "매출 분석", icon: TrendingUp, href: "/dashboard/sales" },
  { id: "orders", label: "수주 분석", icon: ShoppingCart, href: "/dashboard/orders" },
  { id: "profitability", label: "수익성 분석", icon: PieChart, href: "/dashboard/profitability" },
  { id: "receivables", label: "미수금 관리", icon: CreditCard, href: "/dashboard/receivables" },
  { id: "profiles", label: "영업사원 성과", icon: Users, href: "/dashboard/profiles" },
  { id: "data", label: "데이터 관리", icon: Database, href: "/dashboard/data" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, toggleSidebar } = useUIStore();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-300",
        sidebarOpen ? "w-64" : "w-16"
      )}
    >
      <div className="flex h-14 items-center justify-between px-4">
        {sidebarOpen && (
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">인프라 사업본부</span>
          </div>
        )}
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8" aria-label={sidebarOpen ? "사이드바 접기" : "사이드바 펼치기"}>
          <ChevronLeft className={cn("h-4 w-4 transition-transform", !sidebarOpen && "rotate-180")} />
        </Button>
      </div>

      <Separator />

      <ScrollArea className="h-[calc(100vh-3.5rem)]">
        <nav className="flex flex-col gap-1 p-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname?.startsWith(item.href);
            return (
              <Button
                key={item.id}
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "justify-start gap-3 h-10",
                  isActive && "bg-primary/10 text-primary font-medium",
                  !sidebarOpen && "justify-center px-2"
                )}
                onClick={() => router.push(item.href)}
                title={item.label}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </Button>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
