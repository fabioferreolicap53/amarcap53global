import { useState, useMemo, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import type { MetaBucket } from "@/types/amarcap53";

interface Props {
  data: MetaBucket[];
}

interface MicroStat {
  micro: string;
  total: number;
  alcancado: number;
}

interface EquipeGroup {
  equipe: string;
  total: number;
  alcancado: number;
  micros: MicroStat[];
}

// Paleta rosa/outubro — cada equipe tem sua cor de destaque.
const ROSE_PALETTE = [
  "#e11d48", "#be123c", "#9f1239", "#db2777", "#c026d3", "#ec4899",
  "#f43f5e", "#d946ef", "#a21caf", "#fb7185", "#f472b6", "#e879f9",
];

function parseEquipes(data: MetaBucket[]): EquipeGroup[] {
  const map = new Map<string, EquipeGroup>();
  for (const item of data) {
    const parts = item.label.split(" / Microárea ");
    const equipe = parts[0]?.trim() || "Sem equipe";
    const micro = parts[1]?.trim() || "?";
    if (!map.has(equipe)) {
      map.set(equipe, { equipe, total: 0, alcancado: 0, micros: [] });
    }
    const g = map.get(equipe)!;
    g.total += item.total;
    g.alcancado += item.alcancado;
    g.micros.push({ micro, total: item.total, alcancado: item.alcancado });
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => b.total - a.total);
  for (const g of groups) {
    g.micros.sort((a, b) => b.total - a.total);
  }
  return groups;
}

// ── Barra HORIZONTAL empilhada: Alcançado + A alcançar = Total ──
function buildOption(group: EquipeGroup, color: string) {
  const micros = group.micros.slice(0, 25);
  const maxTotal = micros.reduce((m, x) => Math.max(m, x.total), 0);
  const xMax = Math.ceil(Math.max(maxTotal, 1) * 1.18);

  return {
    grid: { left: 4, right: 44, top: 4, bottom: 4, containLabel: true },
    xAxis: { type: "value" as const, show: false, max: xMax },
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
        name: "Alcançado",
        type: "bar" as const,
        stack: "lista",
        barMaxWidth: 22,
        emphasis: { focus: "series" as const },
        itemStyle: {
          color: {
            type: "linear" as const,
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: "#6ee7b7" },
              { offset: 0.45, color: "#10b981" },
              { offset: 1, color: "#047857" },
            ],
          },
          shadowBlur: 12,
          shadowColor: "rgba(16,185,129,0.45)",
          shadowOffsetY: 2,
        },
        label: {
          show: true,
          position: "inside" as const,
          color: "#ecfdf5",
          fontFamily: "Inter",
          fontWeight: "bold" as const,
          fontSize: 12,
          textBorderColor: "rgba(4,120,87,0.92)",
          textBorderWidth: 3,
          textShadowBlur: 8,
          textShadowColor: "rgba(255,255,255,0.65)",
          formatter: (p: { value: number }) => (p.value > 0 ? p.value.toLocaleString("pt-BR") : ""),
        },
        data: micros.map((m) => m.alcancado),
        animationDuration: 600,
        animationEasing: "cubicOut" as const,
      },
      {
        name: "A alcançar",
        type: "bar" as const,
        stack: "lista",
        barMaxWidth: 22,
        itemStyle: {
          color: {
            type: "linear" as const,
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: "#fecaca" },
              { offset: 0.55, color: "#f87171" },
              { offset: 1, color: "#ef4444" },
            ],
          },
          borderRadius: [0, 6, 6, 0] as [number, number, number, number],
          decal: {
            symbol: "rect",
            dashArrayX: [1, 0],
            dashArrayY: [2, 4],
            rotation: -Math.PI / 4,
            color: "rgba(127,29,29,0.18)",
          },
          shadowBlur: 10,
          shadowColor: "rgba(239,68,68,0.35)",
          shadowOffsetY: 2,
        },
        label: {
          show: true,
          position: "right" as const,
          color: "#991b1b",
          fontFamily: "Inter",
          fontWeight: "bold" as const,
          fontSize: 11,
          formatter: (p: { dataIndex: number }) =>
            micros[p.dataIndex]?.total.toLocaleString("pt-BR") ?? "",
        },
        data: micros.map((m) => Math.max(m.total - m.alcancado, 0)),
        animationDuration: 600,
        animationEasing: "cubicOut" as const,
      },
    ],
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      backgroundColor: "rgba(26,39,68,0.96)",
      borderColor: "transparent",
      textStyle: { color: "#fff", fontFamily: "Inter", fontSize: 12 },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const p = params[0];
        if (!p) return "";
        const m = micros[p.dataIndex];
        if (!m) return "";
        const restante = Math.max(m.total - m.alcancado, 0);
        const pct = m.total > 0 ? ((m.alcancado / m.total) * 100).toFixed(1) : "0.0";
        return (
          `<strong style="color:${color}">${group.equipe}</strong><br/>Microárea ${m.micro}<br/>` +
          `<span style="color:#34d399">●</span> Alcançado: <strong>${m.alcancado.toLocaleString("pt-BR")}</strong><br/>` +
          `<span style="color:#f87171">●</span> A alcançar: <strong>${restante.toLocaleString("pt-BR")}</strong><br/>` +
          `Total: <strong>${m.total.toLocaleString("pt-BR")}</strong> (${pct}%)`
        );
      },
    },
  };
}

export default function EquipeMicroStackedPaginated({ data }: Props) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [data]);

  const equipes = useMemo(() => parseEquipes(data), [data]);
  const isSingleMode = equipes.length <= 1;
  const COLS = 3;
  const ROWS = 3;
  const itemsPerPage = isSingleMode ? 1 : COLS * ROWS;
  const totalPages = Math.ceil(equipes.length / itemsPerPage);
  const visible = equipes.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

  const charts = useMemo(
    () =>
      visible.map((group, gi) => {
        const colorIdx = (page * itemsPerPage + gi) % ROSE_PALETTE.length;
        return {
          equipe: group.equipe,
          total: group.total,
          alcancado: group.alcancado,
          microCount: group.micros.length,
          option: buildOption(group, ROSE_PALETTE[colorIdx]!),
          color: ROSE_PALETTE[colorIdx],
        };
      }),
    [visible, page, itemsPerPage],
  );

  return (
    <Card className="overflow-hidden border-rose-100 shadow-sm">
      <CardHeader className="border-b border-rose-100/70 bg-gradient-to-r from-rose-50 to-transparent">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 shadow-md shadow-rose-200">
              <MapPin className="h-4 w-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-navy">
                Gestão de lista por Equipe + Microárea
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {equipes.length} equipe{equipes.length !== 1 ? "s" : ""} • {data.length} combinaç
                {data.length !== 1 ? "ões" : "ão"}
                {!isSingleMode && ` • ${itemsPerPage} por página`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Legenda do empilhamento */}
            <div className="hidden items-center gap-3 rounded-full border border-rose-200 bg-white/70 px-3 py-1.5 sm:flex">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                <span className="h-3 w-3 rounded-sm bg-gradient-to-r from-emerald-400 to-emerald-600 shadow-sm shadow-emerald-300/70" />
                Alcançado
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-red-500">
                <span className="h-3 w-3 rounded-sm bg-gradient-to-r from-red-300 to-red-500 shadow-sm shadow-red-300/70" />
                A alcançar
              </span>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="h-8 w-8 border-rose-200 p-0 text-rose-600 hover:bg-rose-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium tabular-nums text-navy">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="h-8 w-8 border-rose-200 p-0 text-rose-600 hover:bg-rose-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div
          className={`grid ${
            isSingleMode ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
          } divide-y divide-rose-100/60 md:divide-y-0 md:divide-x`}
        >
          {charts.map((item) => {
            const chartHeight = Math.max(item.microCount * 26 + 16, 120);
            const pct = item.total > 0 ? (item.alcancado / item.total) * 100 : 0;
            return (
              <div key={item.equipe} className="flex flex-col gap-2 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full shadow-sm ring-2 ring-white"
                      style={{ backgroundColor: item.color }}
                    />
                    <h3 className="text-sm font-bold leading-tight text-navy">{item.equipe}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm shadow-emerald-300/70">
                      {item.alcancado.toLocaleString("pt-BR")}
                    </span>
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
                      style={{ backgroundColor: item.color }}
                    >
                      {item.total.toLocaleString("pt-BR")}
                    </span>
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div style={{ height: chartHeight }}>
                  <ReactECharts option={item.option} style={{ height: "100%", width: "100%" }} />
                </div>
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 border-t border-rose-100/60 bg-rose-50/40 py-3">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === page ? "w-7 bg-rose-500" : "w-2 bg-rose-200 hover:bg-rose-300"
                }`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
