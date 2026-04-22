"use client";

/**
 * AnalysisTooltip — KpiCard/ChartCard 헤더용 heavy tooltip.
 *
 * v2 (Phase 3): 내부를 MetricInfo variant="heavy"로 위임.
 * Public API(title/formula/description/benchmark/reason)는 그대로 유지해 423 인라인
 * 호출부가 깨지지 않도록 보장. 새 코드는 <MetricInfo id="..." variant="heavy"> 권장.
 */

import { MetricInfo } from "./MetricInfo";

interface AnalysisTooltipProps {
  title: string;
  formula?: string;
  description?: string;
  benchmark?: string;
  reason?: string;
}

export function AnalysisTooltip({ title, formula, description, benchmark, reason }: AnalysisTooltipProps) {
  const hasContent = formula || description || benchmark || reason;

  // note 필드에 reason을 노출 (AnalysisTooltip 기존 "분석 필요 이유"와 의미적 연결)
  // benchmark는 intermediate 본문 하단에 이어 붙여 MetricInfo에 전달
  const combinedIntermediate = [description, benchmark ? `\n\n📏 분석 기준: ${benchmark}` : ""].filter(Boolean).join("");

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-semibold">{title}</span>
      {hasContent && (
        <MetricInfo
          variant="heavy"
          title={title}
          formula={formula}
          intermediate={combinedIntermediate || undefined}
          note={reason}
        />
      )}
    </div>
  );
}
