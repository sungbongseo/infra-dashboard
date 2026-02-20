"use client";

import { ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";

interface ChartContainerProps {
  children: React.ReactNode;
  height?: string;
  minHeight?: number;
}

/**
 * 차트 래퍼 컴포넌트 - ResponsiveContainer + 반응형 높이 + 입장 애니메이션
 * 사용: <ChartContainer><BarChart>...</BarChart></ChartContainer>
 */
export function ChartContainer({
  children,
  height = "h-64 md:h-80",
  minHeight = 250,
}: ChartContainerProps) {
  return (
    <motion.div
      className={height}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <ResponsiveContainer width="100%" height="100%" minHeight={minHeight}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </motion.div>
  );
}
