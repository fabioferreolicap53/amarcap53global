import { useState, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import type { BucketCount } from "@/types/amarcap53";

interface Props {
  data: BucketCount[];
}

interface EquipeGroup {
  equipe: string;
  total: number;
  micros: { micro: string; count: number }[];
}

const PALETTE = [
  "#1a2744", "#2563eb", "#059669", "#d97706", "#dc2626",
  "#7c3aed", "#0891b2", "#db2777", "#4f46e5", "#16a34a",
  "#ea580c", "#ca8a04", "#0d9488", "#9333ea", "#c2410c",
];

function parseEquipes(data: BucketCount[]): EquipeGroup[] {
  const map = new Map<string, EquipeGroup>();
  for (const item of data) {
    const parts = item.label.split(" / Microárea ");
    const equipe = parts[0]?.trim() || "Sem equipe";
    const micro = parts[1]?.trim() || "?";
    if (!map.has(equipe)) {
      map.set(equipe, { equipe, total: 0, micros: [] });
    }
    const g = map.get(equipe)!;
    g.total += item.count;
    g.micros.push({ micro, count: item.count });
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => b.total - a.total);
  for (const g of groups) {
    g.micros.sort((a, b) => b.count - a.count);
  }
  return groups;
}

function buildOption(group: EquipeGroup, color: string) {
  const micros = group.micros.slice(0, 25);
  return {
    grid: { left: 4, right: 36, top: 4, bottom: 4, containLabel: true },
    xAxis: { type: "value" as const, show: false },
    yAxis: {
      type: "category" as const,
      data: micros.map((m) => `M.${m.micro}`),
      inverse: true,
      axisLabel: {
        fontSize: 11,
        fontFamily: "Inter",
        fontWeight: "bold" as const,
        color: "#334155",
        width: 60,
        overflow: "truncate" as const,
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar" as const,
        data: micros.map((m) => ({
          value: m.count,
          itemStyle: {
            color: {
              type: "linear" as const,
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color },
                { offset: 1, color: color + "99" },
              ],
            },
            borderRadius: [0, 5, 5, 0] as [number, number, number, number],
          },
        })),
        barMaxWidth: 24,
        label: {
          show: true,
          position: "right" as const,
          fontSize: 11,
          fontFamily: "Inter",
          fontWeight: "bold" as const,
          color: "#475569",
          formatter: (p: { value: number }) => p.value.toLocaleString("pt-BR"),
        },
        animationDuration: 500,
        animationEasing: "cubicOut" as const,
      },
    ],
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      backgroundColor: "rgba(26,39,68,0.95)",
      borderColor: "transparent",
      textStyle: { color: "#fff", fontFamily: "Inter", fontSize: 13 },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const p = params[0];
        if (!p) return "";
        return `<strong style="color:#60a5fa">${group.equipe}</strong><br/>Microárea ${p.name.replace("M.", "")}<br/><strong>${p.value.toLocaleString("pt-BR")}</strong> pacientes`;
      },
    },
  };
}

export default function EquipeMicroPaginated({ data }: Props) {
  const [page, setPage] = useState(0);

  const equipes = useMemo(() => parseEquipes(data), [data]);
  const isSingleMode = equipes.length <= 1;
  const COLS = 3;
  const ROWS = 2;
  const itemsPerPage = isSingleMode ? 1 : COLS * ROWS;
  const totalPages = Math.ceil(equipes.length / itemsPerPage);
  const visible = equipes.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

  const charts = useMemo(() => {
    return visible.map((group, gi) => {
      const colorIdx = (page * itemsPerPage + gi) % PALETTE.length;
      return {
        equipe: group.equipe,
        total: group.total,
        microCount: group.micros.length,
        option: buildOption(group, PALETTE[colorIdx]),
        color: PALETTE[colorIdx],
      };
    });
  }, [visible, page, itemsPerPage, isSingleMode]);

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardHeader className="border-b border-border/40 bg-gradient-to-r from-navy-50/50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-navy to-blue-600 shadow-md">
              <MapPin className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-navy">
                Equipe + Microárea
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {equipes.length} equipe{equipes.length !== 1 ? "s" : ""} \u2022 {data.length} combinação{data.length !== 1 ? "ões" : ""}
                {!isSingleMode && " \u2022 6 por página"}
              </p>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-8 w-8 p-0 border-navy-200 text-navy hover:bg-navy-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-navy tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="h-8 w-8 p-0 border-navy-200 text-navy hover:bg-navy-50"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Grid de equipes — 3 colunas */}
        <div className={`grid ${isSingleMode ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"} divide-y md:divide-y-0 md:divide-x divide-border/40`}>
          {charts.map((item) => {
            const chartHeight = Math.max(item.microCount * 26 + 16, 120);
            return (
              <div key={item.equipe} className="flex flex-col gap-2 p-5">
                {/* Header da equipe */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full shadow-sm ring-2 ring-white"
                      style={{ backgroundColor: item.color }}
                    />
                    <h3 className="text-sm font-bold text-navy leading-tight">{item.equipe}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
                      style={{ backgroundColor: item.color }}
                    >
                      {item.total.toLocaleString("pt-BR")}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {item.microCount} microárea{item.microCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                {/* Gráfico */}
                <div style={{ height: chartHeight }}>
                  <ReactECharts option={item.option} style={{ height: "100%", width: "100%" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Dots de paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 border-t border-border/40 bg-navy-50/30 py-3">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === page
                    ? "bg-navy w-7"
                    : "bg-navy/20 hover:bg-navy/40 w-2"
                }`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
