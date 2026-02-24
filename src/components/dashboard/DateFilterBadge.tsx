"use client";

interface DateFilterBadgeProps {
  isActive: boolean;
  dateRange?: { from: string; to: string } | null;
}

export function DateFilterBadge({ isActive, dateRange }: DateFilterBadgeProps) {
  if (!isActive || !dateRange) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
      📅 기간 필터: {dateRange.from} ~ {dateRange.to}
    </span>
  );
}
