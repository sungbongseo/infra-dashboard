"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAlertStore } from "@/stores/alertStore";
import type { Alert } from "@/stores/alertStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import * as Popover from "@radix-ui/react-popover";
import {
  Bell,
  AlertTriangle,
  AlertOctagon,
  X,
  CheckCircle,
  Info,
  ExternalLink,
} from "lucide-react";

function SeverityIcon({ severity }: { severity: "warning" | "critical" }) {
  if (severity === "critical") {
    return <AlertOctagon className="h-4 w-4 shrink-0 text-red-500" />;
  }
  return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
}

function AlertItem({
  alert,
  onDismiss,
  onNavigate,
}: {
  alert: Alert;
  onDismiss: (id: string) => void;
  onNavigate: (deepLink: string) => void;
}) {
  const unit = alert.metric === "dso" ? "일" : "%";
  const isCustomerAlert = !!alert.customerCode;
  const hasDeepLink = !!alert.deepLink;

  // 거래처 알림은 메시지에 모든 정보가 이미 포함됨 (NLG 자동 생성)
  const handleClick = (e: React.MouseEvent) => {
    if (hasDeepLink) {
      e.stopPropagation();
      onNavigate(alert.deepLink!);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`flex items-start gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors ${
        alert.severity === "critical"
          ? "bg-red-50 dark:bg-red-950/30"
          : "bg-amber-50 dark:bg-amber-950/30"
      } ${hasDeepLink ? "cursor-pointer hover:ring-1 hover:ring-violet-400" : ""}`}
      title={hasDeepLink ? "클릭하여 협상 우선순위 탭으로 이동" : undefined}
    >
      <SeverityIcon severity={alert.severity} />
      <div className="flex-1 min-w-0">
        {isCustomerAlert ? (
          // 거래처 알림: NLG 자동 생성 메시지 그대로 표시
          <>
            <p className="font-medium text-xs leading-snug truncate">
              {alert.message}
            </p>
            {alert.category && (
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <span>점수 {alert.currentValue.toFixed(0)} · {alert.category}</span>
                {hasDeepLink && <ExternalLink className="h-2.5 w-2.5" />}
              </p>
            )}
          </>
        ) : (
          // KPI/DSO 알림: 기존 형태
          <>
            <p className="font-medium text-xs leading-snug">{alert.ruleName}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              현재 {isFinite(alert.currentValue) ? alert.currentValue.toFixed(1) : "-"}
              {unit} / 기준 {alert.threshold}{unit}
            </p>
          </>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(alert.id); }}
        className="shrink-0 rounded-sm p-0.5 hover:bg-accent transition-colors"
        aria-label="경고 닫기"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

export function AlertPanel() {
  const router = useRouter();
  const alerts = useAlertStore((s) => s.alerts);
  const skippedMetrics = useAlertStore((s) => s.skippedMetrics);
  const dismissAlert = useAlertStore((s) => s.dismissAlert);
  const dismissAll = useAlertStore((s) => s.dismissAll);

  const handleNavigate = (deepLink: string) => {
    router.push(deepLink);
  };

  const activeAlerts = useMemo(
    () => alerts.filter((a) => !a.dismissed),
    [alerts]
  );

  const sortedAlerts = useMemo(
    () =>
      [...activeAlerts].sort((a, b) => {
        if (a.severity === "critical" && b.severity !== "critical") return -1;
        if (a.severity !== "critical" && b.severity === "critical") return 1;
        return b.timestamp.getTime() - a.timestamp.getTime();
      }),
    [activeAlerts]
  );

  const activeCount = activeAlerts.length;
  const hasSkipped = skippedMetrics.length > 0;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {activeCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-[16px] flex items-center justify-center px-1 text-[10px] leading-none"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-80 rounded-lg border bg-popover shadow-md animate-in fade-in-0 zoom-in-95"
          sideOffset={5}
          align="end"
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">경고 알림</span>
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={dismissAll}
              >
                모두 읽음
              </Button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {sortedAlerts.length === 0 && !hasSkipped ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mb-2 text-emerald-500" />
                <p className="text-sm font-medium">경고 없음</p>
                <p className="text-xs mt-1">모든 지표가 정상 범위입니다</p>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {sortedAlerts.map((alert) => (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    onDismiss={dismissAlert}
                    onNavigate={handleNavigate}
                  />
                ))}
                {hasSkipped && (
                  <div className="rounded-md px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Info className="h-4 w-4 shrink-0 text-slate-500" />
                      <p className="font-medium text-xs text-slate-600 dark:text-slate-400">미평가 지표</p>
                    </div>
                    <div className="space-y-1 ml-6">
                      {skippedMetrics.map((s) => (
                        <p key={s.metric} className="text-[11px] text-muted-foreground">
                          {s.label}: {s.reason}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
