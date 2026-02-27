"use client";

import { ChartCard } from "@/components/dashboard/ChartCard";
import { formatCurrency, formatPercent, CHART_COLORS } from "@/lib/utils";
import type { O2CPipelineResult } from "@/lib/analysis/pipeline";

interface O2CFlowTabProps {
  pipelineStages: O2CPipelineResult["stages"];
  salesToCollectionRate: number;
  prepaymentAmount: number;
  grossCollections: number;
  isDateFiltered?: boolean;
}

export function O2CFlowTab({
  pipelineStages,
  salesToCollectionRate,
  prepaymentAmount,
  grossCollections,
  isDateFiltered,
}: O2CFlowTabProps) {
  return (
    <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
      title="O2C(주문-수금) 플로우 다이어그램"
      formula="수주금액에서 매출전환(전환율%), 수금완료(수금율%), 미수잔액으로 분기"
      description="주문에서 수금까지의 전체 흐름을 시각적으로 표현합니다. 수주가 매출로 전환되고, 매출이 수금 완료와 미수잔액으로 나뉘는 과정을 보여줍니다. 화살표가 굵을수록 해당 경로의 금액 비중이 큽니다."
      benchmark="전환율 80% 이상, 수금율 90% 이상이면 양호한 O2C(주문-수금) 흐름입니다"
      reason="Order-to-Cash 전체 흐름을 시각화하여 단계별 전환 효율과 자금 누수 구간을 한눈에 파악합니다."
    >
      <O2CFlowDiagram
        stages={pipelineStages}
        salesToCollectionRate={salesToCollectionRate}
        prepaymentAmount={prepaymentAmount}
        grossCollections={grossCollections}
      />
    </ChartCard>
  );
}

/* ─── O2C 플로우 다이어그램 컴포넌트 ─── */

interface O2CFlowDiagramProps {
  stages: O2CPipelineResult["stages"];
  salesToCollectionRate: number;
  prepaymentAmount: number;
  grossCollections: number;
}

function O2CFlowDiagram({ stages, salesToCollectionRate, prepaymentAmount, grossCollections }: O2CFlowDiagramProps) {
  const orderStage = stages.find((s) => s.stage === "수주");
  const salesStage = stages.find((s) => s.stage === "매출전환");
  const collectionStage = stages.find((s) => s.stage === "수금완료");
  const outstandingStage = stages.find((s) => s.stage === "미수잔액");

  if (!orderStage || !salesStage || !collectionStage || !outstandingStage) return null;

  const orderAmt = orderStage.amount;
  const salesAmt = salesStage.amount;
  const collAmt = collectionStage.amount;
  const outAmt = outstandingStage.amount;

  const convRate = salesStage.percentage;
  const collRate = salesToCollectionRate;
  const outRate = salesAmt > 0 ? (outAmt / salesAmt) * 100 : 0;

  // 화살표 굵기 계산 (최소 4, 최대 28)
  const maxAmt = Math.max(orderAmt, 1);
  const arrowW = (amt: number) => Math.max(4, Math.min(28, (amt / maxAmt) * 28));

  // 상태 색상
  const colors = {
    order: CHART_COLORS[0],
    sales: CHART_COLORS[1],
    collection: CHART_COLORS[2],
    outstanding: CHART_COLORS[4],
  };

  // 건전성 배지 색상
  const healthColor = (rate: number, threshold: number) =>
    rate >= threshold ? "hsl(142.1, 76.2%, 36.3%)" : rate >= threshold * 0.8 ? "hsl(38, 92%, 50%)" : "hsl(0, 84.2%, 60.2%)";

  return (
    <div className="py-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: "수주", amount: orderAmt, rate: null, color: colors.order, sub: null },
          { label: "매출전환", amount: salesAmt, rate: convRate, color: colors.sales, sub: null },
          { label: "수금완료 (순수)", amount: collAmt, rate: collRate, color: colors.collection, sub: null },
          { label: "선수금", amount: prepaymentAmount, rate: null, color: CHART_COLORS[3], sub: `총수금 ${formatCurrency(grossCollections, true)}` },
          { label: "미수잔액", amount: outAmt, rate: outRate, color: colors.outstanding, sub: null },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border p-3 text-center"
            style={{ borderLeftWidth: 4, borderLeftColor: item.color }}
          >
            <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
            <div className="text-sm font-bold">{formatCurrency(item.amount, true)}</div>
            {item.rate !== null && (
              <div className="text-xs mt-0.5" style={{ color: item.label === "미수잔액" ? healthColor(100 - item.rate, 80) : healthColor(item.rate, item.label === "수금완료 (순수)" ? 90 : 80) }}>
                {item.rate.toFixed(1)}%
              </div>
            )}
            {item.sub && (
              <div className="text-[10px] mt-0.5 text-muted-foreground">{item.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* SVG 플로우 다이어그램 */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox="0 0 820 360"
          className="w-full min-w-[600px]"
          style={{ maxHeight: 400 }}
          role="img"
          aria-label="O2C 플로우 다이어그램: 수주에서 매출전환, 수금완료, 미수잔액으로의 흐름"
        >
          <defs>
            {/* 화살표 마커 */}
            <marker id="arrowGreen" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <path d="M0,0 L10,4 L0,8 Z" fill={colors.sales} />
            </marker>
            <marker id="arrowPurple" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <path d="M0,0 L10,4 L0,8 Z" fill={colors.collection} />
            </marker>
            <marker id="arrowRed" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <path d="M0,0 L10,4 L0,8 Z" fill={colors.outstanding} />
            </marker>

            {/* 그라데이션 */}
            <linearGradient id="flowGrad1" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={colors.order} stopOpacity="0.6" />
              <stop offset="100%" stopColor={colors.sales} stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="flowGrad2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={colors.sales} stopOpacity="0.6" />
              <stop offset="100%" stopColor={colors.collection} stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="flowGrad3" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.sales} stopOpacity="0.5" />
              <stop offset="100%" stopColor={colors.outstanding} stopOpacity="0.5" />
            </linearGradient>

            {/* 박스 그림자 */}
            <filter id="boxShadow" x="-5%" y="-5%" width="110%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" />
            </filter>
          </defs>

          {/* ─── 연결 화살표 (배경에 먼저 렌더) ─── */}

          {/* 수주 → 매출전환: 수평 흐름 */}
          <path
            d="M200,120 L310,120"
            fill="none"
            stroke="url(#flowGrad1)"
            strokeWidth={arrowW(salesAmt)}
            strokeLinecap="round"
            opacity="0.7"
          />
          <path
            d="M200,120 L308,120"
            fill="none"
            stroke={colors.sales}
            strokeWidth="2"
            markerEnd="url(#arrowGreen)"
            opacity="0.9"
          />

          {/* 매출전환 → 수금완료: 우상 흐름 */}
          <path
            d={`M510,105 C560,105 570,75 620,75`}
            fill="none"
            stroke="url(#flowGrad2)"
            strokeWidth={arrowW(collAmt)}
            strokeLinecap="round"
            opacity="0.7"
          />
          <path
            d={`M510,105 C560,105 570,75 618,75`}
            fill="none"
            stroke={colors.collection}
            strokeWidth="2"
            markerEnd="url(#arrowPurple)"
            opacity="0.9"
          />

          {/* 매출전환 → 미수잔액: 우하 분기 */}
          <path
            d={`M510,140 C560,140 570,255 620,255`}
            fill="none"
            stroke="url(#flowGrad3)"
            strokeWidth={arrowW(outAmt)}
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d={`M510,140 C560,140 570,255 618,255`}
            fill="none"
            stroke={colors.outstanding}
            strokeWidth="2"
            markerEnd="url(#arrowRed)"
            opacity="0.9"
            strokeDasharray="6 3"
          />

          {/* ─── 전환율 라벨 (화살표 위) ─── */}

          {/* 수주→매출 전환율 */}
          <rect x="222" y="88" width="66" height="22" rx="11" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
          <text x="255" y="103" textAnchor="middle" className="text-[11px] font-semibold" fill={colors.sales}>
            {formatPercent(convRate, 1)}
          </text>

          {/* 매출→수금 수금율 */}
          <rect x="536" y="58" width="66" height="22" rx="11" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
          <text x="569" y="73" textAnchor="middle" className="text-[11px] font-semibold" fill={colors.collection}>
            {formatPercent(collRate, 1)}
          </text>

          {/* 미수 비율 */}
          <rect x="536" y="225" width="66" height="22" rx="11" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
          <text x="569" y="240" textAnchor="middle" className="text-[11px] font-semibold" fill={colors.outstanding}>
            {formatPercent(outRate, 1)}
          </text>

          {/* ─── 노드 박스 ─── */}

          {/* 수주 */}
          <g filter="url(#boxShadow)">
            <rect x="20" y="80" width="180" height="80" rx="14" fill="hsl(var(--card))" stroke={colors.order} strokeWidth="2.5" />
            <rect x="20" y="80" width="180" height="28" rx="14" fill={colors.order} opacity="0.12" />
            <rect x="20" y="80" width="180" height="28" rx="14" fill="none" stroke={colors.order} strokeWidth="2.5" />
            <text x="110" y="100" textAnchor="middle" className="text-xs font-bold" fill={colors.order}>수주</text>
            <text x="110" y="128" textAnchor="middle" className="text-sm font-bold" fill="hsl(var(--foreground))">
              {formatCurrency(orderAmt, true)}
            </text>
            <text x="110" y="148" textAnchor="middle" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              {orderStage.count.toLocaleString()}건 · 100%
            </text>
          </g>

          {/* 매출전환 */}
          <g filter="url(#boxShadow)">
            <rect x="310" y="80" width="200" height="80" rx="14" fill="hsl(var(--card))" stroke={colors.sales} strokeWidth="2.5" />
            <rect x="310" y="80" width="200" height="28" rx="14" fill={colors.sales} opacity="0.12" />
            <rect x="310" y="80" width="200" height="28" rx="14" fill="none" stroke={colors.sales} strokeWidth="2.5" />
            <text x="410" y="100" textAnchor="middle" className="text-xs font-bold" fill={colors.sales}>매출전환</text>
            <text x="410" y="128" textAnchor="middle" className="text-sm font-bold" fill="hsl(var(--foreground))">
              {formatCurrency(salesAmt, true)}
            </text>
            <text x="410" y="148" textAnchor="middle" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              {salesStage.count.toLocaleString()}건 · 수주대비 {formatPercent(convRate, 1)}
            </text>
          </g>

          {/* 수금완료 (순수) */}
          <g filter="url(#boxShadow)">
            <rect x="620" y="30" width="180" height="92" rx="14" fill="hsl(var(--card))" stroke={colors.collection} strokeWidth="2.5" />
            <rect x="620" y="30" width="180" height="26" rx="14" fill={colors.collection} opacity="0.12" />
            <rect x="620" y="30" width="180" height="26" rx="14" fill="none" stroke={colors.collection} strokeWidth="2.5" />
            <text x="710" y="48" textAnchor="middle" className="text-xs font-bold" fill={colors.collection}>순수 수금</text>
            <text x="710" y="74" textAnchor="middle" className="text-sm font-bold" fill="hsl(var(--foreground))">
              {formatCurrency(collAmt, true)}
            </text>
            <text x="710" y="92" textAnchor="middle" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              {collectionStage.count.toLocaleString()}건 · 매출대비 {formatPercent(collRate, 1)}
            </text>
            <text x="710" y="108" textAnchor="middle" className="text-[9px]" fill="hsl(var(--muted-foreground))">
              선수금 {formatCurrency(prepaymentAmount, true)} 별도
            </text>
          </g>

          {/* 미수잔액 */}
          <g filter="url(#boxShadow)">
            <rect x="620" y="220" width="180" height="76" rx="14" fill="hsl(var(--card))" stroke={colors.outstanding} strokeWidth="2" strokeDasharray="6 3" />
            <rect x="620" y="220" width="180" height="26" rx="14" fill={colors.outstanding} opacity="0.10" />
            <rect x="620" y="220" width="180" height="26" rx="14" fill="none" stroke={colors.outstanding} strokeWidth="2" strokeDasharray="6 3" />
            <text x="710" y="238" textAnchor="middle" className="text-xs font-bold" fill={colors.outstanding}>미수잔액</text>
            <text x="710" y="264" textAnchor="middle" className="text-sm font-bold" fill="hsl(var(--foreground))">
              {formatCurrency(outAmt, true)}
            </text>
            <text x="710" y="284" textAnchor="middle" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              매출대비 {formatPercent(outRate, 1)}
            </text>
          </g>

          {/* ─── 흐름 방향 라벨 ─── */}
          <text x="255" y="140" textAnchor="middle" className="text-[9px]" fill="hsl(var(--muted-foreground))">전환</text>
          <text x="569" y="42" textAnchor="middle" className="text-[9px]" fill="hsl(var(--muted-foreground))">순수수금</text>
          <text x="569" y="270" textAnchor="middle" className="text-[9px]" fill="hsl(var(--muted-foreground))">미수</text>

          {/* ─── 건전성 요약 ─── */}
          <g>
            <rect x="20" y="200" width="280" height="140" rx="12" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.9" />
            <text x="36" y="222" className="text-[11px] font-semibold" fill="hsl(var(--foreground))">O2C 건전성 요약</text>

            {/* 수주→매출 전환율 */}
            <circle cx="42" cy="245" r="5" fill={healthColor(convRate, 80)} />
            <text x="54" y="249" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              수주-매출 전환율: {formatPercent(convRate, 1)}
            </text>
            <text x="240" y="249" className="text-[10px] font-medium" fill={healthColor(convRate, 80)}>
              {convRate >= 80 ? "양호" : convRate >= 64 ? "주의" : "위험"}
            </text>

            {/* 매출→수금 순수수금율 */}
            <circle cx="42" cy="268" r="5" fill={healthColor(collRate, 90)} />
            <text x="54" y="272" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              순수 수금율: {formatPercent(collRate, 1)} (선수금 제외)
            </text>
            <text x="240" y="272" className="text-[10px] font-medium" fill={healthColor(collRate, 90)}>
              {collRate >= 90 ? "양호" : collRate >= 72 ? "주의" : "위험"}
            </text>

            {/* 선수금 정보 */}
            <circle cx="42" cy="291" r="5" fill={CHART_COLORS[3]} />
            <text x="54" y="295" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              선수금: {formatCurrency(prepaymentAmount, true)}
            </text>
            <text x="240" y="295" className="text-[10px] font-medium" fill="hsl(var(--muted-foreground))">
              별도 관리
            </text>

            {/* 미수 비율 */}
            <circle cx="42" cy="314" r="5" fill={healthColor(100 - outRate, 80)} />
            <text x="54" y="318" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              미수잔액 비중: {formatPercent(outRate, 1)}
            </text>
            <text x="240" y="318" className="text-[10px] font-medium" fill={healthColor(100 - outRate, 80)}>
              {outRate <= 20 ? "양호" : outRate <= 35 ? "주의" : "위험"}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
