import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Ribbon, ChevronDown, ChevronUp, Target, TrendingUp, ListChecks } from "lucide-react";
import EquipeMicroStackedPaginated from "@/components/charts/EquipeMicroStackedPaginated";
import type { MetaBucket, MetaRow } from "@/types/amarcap53";

interface Props {
  rows: MetaRow[];
  selUnidade: string | null;
  selEquipe: string | null;
  selMicroarea: number | null;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

// ── Agregação total/alcançado por dimensão ──
function toBuckets(map: Map<string, MetaBucket>): MetaBucket[] {
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function addMeta(map: Map<string, MetaBucket>, label: string, r: MetaRow) {
  const cur = map.get(label) ?? { label, total: 0, alcancado: 0 };
  cur.total += r.total;
  cur.alcancado += r.alcancado;
  map.set(label, cur);
}

// ── Opção ECharts: colunas EMPILHADAS (Alcançado + A alcançar = Total) ──
function buildStackedOption(data: MetaBucket[], rotate: number) {
  return {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      backgroundColor: "rgba(26,39,68,0.96)",
      borderColor: "transparent",
      textStyle: { color: "#fff", fontFamily: "Inter", fontSize: 12 },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const p = params[0];
        if (!p) return "";
        const item = data[p.dataIndex];
        if (!item) return "";
        const restante = Math.max(item.total - item.alcancado, 0);
        const pct = item.total > 0 ? ((item.alcancado / item.total) * 100).toFixed(1) : "0.0";
        return (
          `<strong>${item.label}</strong><br/>` +
          `<span style="color:#34d399">●</span> Alcançado: <strong>${fmt(item.alcancado)}</strong><br/>` +
          `<span style="color:#f87171">●</span> A alcançar: <strong>${fmt(restante)}</strong><br/>` +
          `Total da lista: <strong>${fmt(item.total)}</strong> <span style="color:#34d399">(${pct}%)</span>`
        );
      },
    },
    legend: {
      top: 0,
      right: 0,
      icon: "roundRect" as const,
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 14,
      textStyle: { fontFamily: "Inter", fontSize: 11, color: "#475569" },
    },
    grid: { left: 6, right: 14, top: 34, bottom: 4, containLabel: true },
    xAxis: {
      type: "category" as const,
      data: data.map((d) => d.label),
      axisLabel: {
        rotate,
        interval: 0,
        fontSize: 11,
        fontFamily: "Inter",
        color: "#64748b",
        overflow: "truncate" as const,
        width: 110,
      },
      axisLine: { lineStyle: { color: "#e5e7eb" } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: { fontSize: 11, fontFamily: "Inter", color: "#64748b" },
      splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" as const } },
    },
    series: [
      {
        name: "Alcançado",
        type: "bar" as const,
        stack: "lista",
        barMaxWidth: 46,
        emphasis: { focus: "series" as const },
        itemStyle: {
          color: {
            type: "linear" as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "#6ee7b7" },
              { offset: 0.45, color: "#10b981" },
              { offset: 1, color: "#047857" },
            ],
          },
          shadowBlur: 14,
          shadowColor: "rgba(16,185,129,0.45)",
          shadowOffsetY: 3,
        },
        label: {
          show: true,
          position: "inside" as const,
          color: "#ecfdf5",
          fontFamily: "Inter",
          fontWeight: "bold" as const,
          fontSize: 13,
          textBorderColor: "rgba(4,120,87,0.92)",
          textBorderWidth: 3,
          textShadowBlur: 9,
          textShadowColor: "rgba(255,255,255,0.65)",
          formatter: (p: { value: number }) => (p.value > 0 ? fmt(p.value) : ""),
        },
        data: data.map((d) => d.alcancado),
        animationDuration: 700,
        animationEasing: "cubicOut" as const,
      },
      {
        name: "A alcançar",
        type: "bar" as const,
        stack: "lista",
        barMaxWidth: 46,
        itemStyle: {
          color: {
            type: "linear" as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "#fecaca" },
              { offset: 1, color: "#ef4444" },
            ],
          },
          borderRadius: [6, 6, 0, 0] as [number, number, number, number],
          decal: {
            symbol: "rect",
            dashArrayX: [1, 0],
            dashArrayY: [2, 5],
            rotation: -Math.PI / 4,
            color: "rgba(127,29,29,0.18)",
          },
          shadowBlur: 10,
          shadowColor: "rgba(239,68,68,0.35)",
          shadowOffsetY: 2,
        },
        label: {
          show: true,
          position: "top" as const,
          color: "#991b1b",
          fontFamily: "Inter",
          fontWeight: "bold" as const,
          fontSize: 11,
          textBorderColor: "rgba(255,255,255,0.9)",
          textBorderWidth: 3,
          formatter: (p: { dataIndex: number }) => fmt(data[p.dataIndex]?.total ?? 0),
        },
        data: data.map((d) => Math.max(d.total - d.alcancado, 0)),
        animationDuration: 700,
        animationEasing: "cubicOut" as const,
      },
    ],
  };
}

// ── Gráfico empilhado reutilizável ──
function StackedMetaChart({
  title,
  data,
  defaultShow = 15,
  height = 340,
  rotate = 0,
}: {
  title: string;
  data: MetaBucket[];
  defaultShow?: number;
  height?: number;
  rotate?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? data : data.slice(0, defaultShow);
  const hasMore = data.length > defaultShow;

  const option = useMemo(() => buildStackedOption(visible, rotate), [visible, rotate]);

  const grandTotal = data.reduce((s, d) => s + d.total, 0);
  const grandAlc = data.reduce((s, d) => s + d.alcancado, 0);

  return (
    <Card className="overflow-hidden border-rose-100 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="border-b border-rose-100/70 bg-gradient-to-r from-rose-50 to-transparent pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold text-navy">{title}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data.length} grupo{data.length !== 1 ? "s" : ""} •{" "}
              <span className="font-bold text-emerald-600">{fmt(grandAlc)}</span> de {fmt(grandTotal)}{" "}
              alcançados
            </p>
          </div>
          <span className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-sm shadow-emerald-300/70">
            {grandTotal > 0 ? ((grandAlc / grandTotal) * 100).toFixed(1) : "0.0"}%
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        {data.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Nenhum registro para o filtro selecionado.
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
                  className="gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50"
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

export default function OutubroRosaPanel({ rows, selUnidade, selEquipe, selMicroarea }: Props) {
  const { porUnidade, porEquipe, porEquipeMicroarea, totalGeral, alcancadoGeral } = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (selUnidade && r.unidade !== selUnidade) return false;
      if (selEquipe && r.equipe !== selEquipe) return false;
      if (selMicroarea != null && r.microarea !== selMicroarea) return false;
      return true;
    });

    const uMap = new Map<string, MetaBucket>();
    const eMap = new Map<string, MetaBucket>();
    const emMap = new Map<string, MetaBucket>();
    let total = 0;
    let alcancado = 0;

    for (const r of filtered) {
      addMeta(uMap, r.unidade, r);
      addMeta(eMap, r.equipe, r);
      addMeta(emMap, `${r.equipe} / Microárea ${r.microarea}`, r);
      total += r.total;
      alcancado += r.alcancado;
    }

    return {
      porUnidade: toBuckets(uMap),
      porEquipe: toBuckets(eMap),
      porEquipeMicroarea: toBuckets(emMap),
      totalGeral: total,
      alcancadoGeral: alcancado,
    };
  }, [rows, selUnidade, selEquipe, selMicroarea]);

  const restante = Math.max(totalGeral - alcancadoGeral, 0);
  const pct = totalGeral > 0 ? (alcancadoGeral / totalGeral) * 100 : 0;

  const heroStats = [
    { label: "Mulheres em atraso em 1 de outubro", value: totalGeral, icon: ListChecks, emphasis: false },
    { label: "Mulheres alcançadas no Outubro Rosa", value: alcancadoGeral, icon: TrendingUp, emphasis: true },
    { label: "Mulheres em atraso", value: restante, icon: Target, emphasis: false },
  ];

  return (
    <div className="space-y-6">
      {/* ── Hero: progresso da campanha ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-600 via-rose-500 to-pink-500 p-6 text-white shadow-lg shadow-rose-200/60">
        <Ribbon className="pointer-events-none absolute -right-6 -top-8 h-44 w-44 text-white/10" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
              <Ribbon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold leading-tight">Outubro Rosa 2026</h2>
              <p className="text-xs text-white/80">
                Gestão de lista • {porUnidade.length} unidade{porUnidade.length !== 1 ? "s" : ""} •{" "}
                {porEquipe.length} equipe{porEquipe.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {heroStats.map((s) => (
              <div
                key={s.label}
                className={
                  s.emphasis
                    ? "relative flex flex-col justify-between gap-1 rounded-xl bg-gradient-to-br from-emerald-400/35 to-emerald-300/10 px-4 py-3 ring-2 ring-emerald-200/70 shadow-[0_0_26px_rgba(110,231,183,0.5)] backdrop-blur-sm"
                    : "flex flex-col justify-between gap-1 rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm"
                }
              >
                <div className="flex items-start gap-1.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/85">
                  <s.icon
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${s.emphasis ? "text-emerald-100" : ""}`}
                  />
                  <span>{s.label}</span>
                </div>
                <p
                  className={`mt-1 font-bold tabular-nums ${
                    s.emphasis
                      ? "text-3xl text-white drop-shadow-[0_2px_12px_rgba(6,95,70,0.65)]"
                      : "text-2xl"
                  }`}
                >
                  {fmt(s.value)}
                </p>
              </div>
            ))}
            <div className="flex flex-col justify-between gap-1 rounded-xl bg-white/25 px-4 py-3 ring-1 ring-emerald-200/50 backdrop-blur-sm">
              <div className="flex items-start gap-1.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/80">
                <Target className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>% de mulheres alcançadas no Outubro Rosa</span>
              </div>
              <p className="mt-1 text-2xl font-bold tabular-nums">{pct.toFixed(1)}%</p>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs font-medium text-white/90">
              <span>Progresso da campanha</span>
              <span className="tabular-nums">
                {fmt(alcancadoGeral)} / {fmt(totalGeral)}
              </span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] transition-all duration-700"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Colunas empilhadas: Total / Alcançado / A alcançar ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <StackedMetaChart title="Gestão de lista por Unidade" data={porUnidade} defaultShow={15} />
        <StackedMetaChart title="Gestão de lista por Equipe" data={porEquipe} defaultShow={15} />
      </div>

      <EquipeMicroStackedPaginated data={porEquipeMicroarea} />
    </div>
  );
}
