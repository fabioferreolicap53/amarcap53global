import { useState, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { BucketCount } from "@/types/amarcap53";

interface ExpandableBarChartProps {
  title: string;
  subtitle?: string;
  data: BucketCount[];
  defaultShow?: number;
  height?: number;
}

const NAVY_PALETTE = [
  "#1a2744", "#2d4a95", "#3557a0", "#3b61a8", "#5979b5",
  "#7791c2", "#9eb1d4", "#c5d0e6", "#4a90c4", "#2b7cba",
];

export default function ExpandableBarChart({
  title,
  subtitle,
  data,
  defaultShow = 15,
  height = 420,
}: ExpandableBarChartProps) {
  const [showAll, setShowAll] = useState(false);

  const visibleData = useMemo(() => {
    return showAll ? data : data.slice(0, defaultShow);
  }, [data, showAll, defaultShow]);

  const hasMore = data.length > defaultShow;

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        backgroundColor: "#fff",
        borderColor: "#e5e7eb",
        textStyle: { color: "#1a2744", fontFamily: "Inter" },
        formatter: (params: Array<{ name: string; value: number }>) => {
          const item = params[0];
          if (!item) return "";
          return `<strong>${item.name}</strong><br/>Testes DNA-HPV: <strong>${item.value.toLocaleString("pt-BR")}</strong>`;
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: data.length > 8 ? "12%" : "3%",
        top: "8%",
        containLabel: true,
      },
      xAxis: {
        type: "category" as const,
        data: visibleData.map((d) => d.label),
        axisLabel: {
          rotate: visibleData.length > 6 ? 45 : 0,
          fontSize: 11,
          color: "#64748b",
          fontFamily: "Inter",
          interval: 0,
          overflow: "truncate" as const,
          width: 100,
        },
        axisLine: { lineStyle: { color: "#e5e7eb" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value" as const,
        axisLabel: {
          fontSize: 11,
          color: "#64748b",
          fontFamily: "Inter",
        },
        splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" as const } },
      },
      series: [
        {
          type: "bar" as const,
          data: visibleData.map((d, i) => ({
            value: d.count,
            itemStyle: {
              color: {
                type: "linear" as const,
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: NAVY_PALETTE[i % NAVY_PALETTE.length] },
                  { offset: 1, color: NAVY_PALETTE[(i + 2) % NAVY_PALETTE.length] + "99" },
                ],
              },
              borderRadius: [4, 4, 0, 0] as [number, number, number, number],
            },
          })),
          barMaxWidth: 48,
          animationDuration: 800,
          animationEasing: "cubicOut" as const,
        },
      ],
    }),
    [visibleData, data.length],
  );

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="border-b border-border/40 bg-gradient-to-r from-navy-50/50 to-transparent pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-navy">
              {title}
            </CardTitle>
            {subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-navy px-3 py-1 text-xs font-bold text-white">
              {data.length > 0 ? data.reduce((s, d) => s + d.count, 0).toLocaleString("pt-BR") : 0}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-4">
        {data.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Nenhum dado disponível para esta dimensão.
          </div>
        ) : (
          <>
            <ReactECharts option={option} style={{ height }} />
            {hasMore && (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAll(!showAll)}
                  className="gap-1.5 border-navy-200 text-navy hover:bg-navy-50"
                >
                  {showAll ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Mostrar menos ({defaultShow})
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Mostrar todos ({data.length})
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
