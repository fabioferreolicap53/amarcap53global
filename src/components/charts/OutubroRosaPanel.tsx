import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Ribbon, ChevronDown, ChevronUp, Target, TrendingUp, ListChecks, Trophy, Crown, Medal, Award, Percent } from "lucide-react";
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
          `<span style="color:#34d399">●</span> Alcançada(s): <strong>${fmt(item.alcancado)}</strong><br/>` +
          `<span style="color:#f87171">●</span> Mulheres em atraso: <strong>${fmt(restante)}</strong><br/>` +
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
        name: "Alcançada(s)",
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
          color: "#ffffff",
          fontFamily: "Inter",
          fontWeight: "bold" as const,
          fontSize: 16,
          textBorderColor: "rgba(4,120,87,1)",
          textBorderWidth: 4,
          textShadowBlur: 12,
          textShadowColor: "rgba(0,0,0,0.45)",
          formatter: (p: { value: number }) => (p.value > 0 ? fmt(p.value) : ""),
        },
        data: data.map((d) => d.alcancado),
        animationDuration: 700,
        animationEasing: "cubicOut" as const,
      },
      {
        name: "Mulheres em atraso",
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
              <span className="text-sm font-extrabold text-emerald-600 drop-shadow-sm">
                {fmt(grandAlc)}
              </span>{" "}
              de {fmt(grandTotal)} alcançada(s)
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

// ── Opção ECharts: barras HORIZONTAIS de ranking (mulheres alcançadas no Outubro Rosa) ──
const rankGradient = (from: string, to: string) => ({
  type: "linear" as const,
  x: 0, y: 0, x2: 1, y2: 0,
  colorStops: [
    { offset: 0, color: from },
    { offset: 1, color: to },
  ],
});

const MEDALS = ["🥇", "🥈", "🥉"];
const RANK_LABEL_COLORS = ["#b45309", "#64748b", "#c2410c"];

const RANK_COLORS = [
  rankGradient("#fde68a", "#f59e0b"), // 🥇 ouro
  rankGradient("#e2e8f0", "#94a3b8"), // 🥈 prata
  rankGradient("#fed7aa", "#ea580c"), // 🥉 bronze
];

function buildRankingOption(data: MetaBucket[]) {
  const labels = data.map((d, i) => `${i < 3 ? MEDALS[i] + " " : ""}${i + 1}º  ${d.label}`);
  return {
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      backgroundColor: "rgba(26,39,68,0.96)",
      borderColor: "transparent",
      textStyle: { color: "#fff", fontFamily: "Inter", fontSize: 12 },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const idx = params[0]?.dataIndex ?? -1;
        const item = data[idx];
        if (!item) return "";
        const pct = item.total > 0 ? ((item.alcancado / item.total) * 100).toFixed(1) : "0.0";
        const rank = `${idx < 3 ? MEDALS[idx] + " " : ""}${idx + 1}º lugar`;
        return (
          `<strong>${item.label}</strong> <span style="opacity:.7">• ${rank}</span><br/>` +
          `<span style="color:#f9a8d4">●</span> Mulheres alcançadas no Outubro Rosa: <strong>${fmt(item.alcancado)}</strong><br/>` +
          `Total da lista: ${fmt(item.total)} <span style="color:#34d399">(${pct}%)</span>`
        );
      },
    },
    grid: { left: 8, right: 68, top: 8, bottom: 4, containLabel: true },
    xAxis: {
      type: "value" as const,
      axisLabel: { fontSize: 10, fontFamily: "Inter", color: "#94a3b8" },
      splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" as const } },
    },
    yAxis: {
      type: "category" as const,
      data: labels,
      inverse: true,
      axisLabel: {
        fontSize: 11,
        fontFamily: "Inter",
        fontWeight: "bold" as const,
        width: 185,
        overflow: "truncate" as const,
        color: (_value: string, index: number) =>
          index < 3 ? RANK_LABEL_COLORS[index] : "#334155",
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar" as const,
        barMaxWidth: 16,
        data: data.map((d, i) => ({
          value: d.alcancado,
          itemStyle: {
            ...(i < 3
              ? RANK_COLORS[i]
              : rankGradient("#6ee7b7", "#047857")),
            borderRadius: [0, 9, 9, 0] as [number, number, number, number],
            shadowBlur: 12,
            shadowColor:
              i === 0 ? "rgba(245,158,11,0.5)" : i === 1 ? "rgba(148,163,184,0.45)" : i === 2 ? "rgba(234,88,12,0.45)" : "rgba(16,185,129,0.35)",
            shadowOffsetY: 3,
          },
        })),
        label: {
          show: true,
          position: "right" as const,
          fontFamily: "Inter",
          fontWeight: "bold" as const,
          fontSize: 11,
          color: (p: { dataIndex: number }) =>
            p.dataIndex < 3 ? RANK_LABEL_COLORS[p.dataIndex] : "#047857",
          textBorderColor: "rgba(255,255,255,0.9)",
          textBorderWidth: 3,
          formatter: (p: { value: number }) => fmt(p.value),
        },
        animationDuration: 850,
        animationEasing: "cubicOut" as const,
      },
    ],
  };
}

// ── Card de ranking ──
function RankingChart({
  title,
  subtitle,
  data,
  limit,
  height = 340,
  icon: Icon = Trophy,
  iconClass = "from-amber-400 to-orange-500 shadow-amber-200/70",
}: {
  title: string;
  subtitle: string;
  data: MetaBucket[];
  limit: number;
  height?: number;
  icon?: React.ElementType;
  iconClass?: string;
}) {
  const ranked = useMemo(
    () =>
      data
        .filter((d) => d.alcancado > 0)
        .sort((a, b) => b.alcancado - a.alcancado)
        .slice(0, limit),
    [data, limit],
  );

  const option = useMemo(() => buildRankingOption(ranked), [ranked]);
  const totalAlc = ranked.reduce((s, d) => s + d.alcancado, 0);
  const totalLista = ranked.reduce((s, d) => s + d.total, 0);
  const pctRank = totalLista > 0 ? (totalAlc / totalLista) * 100 : 0;

  return (
    <Card className="overflow-hidden border-rose-100 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="border-b border-rose-100/70 bg-gradient-to-r from-rose-50 via-amber-50/40 to-transparent pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${iconClass} shadow-md`}
            >
              <Icon className="h-4 w-4 text-white" />
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-sm font-semibold text-navy">{title}</CardTitle>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1 text-[11px] font-bold text-white shadow-sm shadow-emerald-300/70">
              {fmt(totalAlc)} alcançadas
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-500/80">
              {pctRank.toFixed(1)}% do ranking
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        {ranked.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
            Nenhuma mulher alcançada no Outubro Rosa para o filtro selecionado.
          </div>
        ) : (
          <ReactECharts option={option} notMerge style={{ height }} />
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

  const heroTiles = [
    {
      label: "Mulheres em atraso em 1 de outubro",
      value: fmt(totalGeral),
      icon: ListChecks,
      tone: "default" as const,
    },
    {
      label: "Mulheres alcançadas no Outubro Rosa",
      value: fmt(alcancadoGeral),
      icon: TrendingUp,
      tone: "highlight" as const,
    },
    {
      label: "Mulheres em atraso atualmente",
      value: fmt(restante),
      icon: Target,
      tone: "default" as const,
    },
    {
      label: "% de mulheres alcançadas no Outubro Rosa",
      value: `${pct.toFixed(1)}%`,
      icon: Percent,
      tone: "accent" as const,
    },
  ];

  const toneClasses: Record<(typeof heroTiles)[number]["tone"], string> = {
    default: "bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur-sm",
    highlight:
      "bg-gradient-to-br from-emerald-300/35 via-emerald-400/15 to-transparent ring-2 ring-emerald-200/60 shadow-[0_0_34px_rgba(110,231,183,0.45)] backdrop-blur-sm",
    accent:
      "bg-gradient-to-br from-amber-200/30 via-amber-300/10 to-transparent ring-1 ring-inset ring-amber-200/50 backdrop-blur-sm",
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Hero: progresso da campanha ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-4 text-white shadow-[0_20px_50px_-18px_rgba(159,18,57,0.75)] ring-1 ring-white/15 sm:p-6"
        style={{
          backgroundImage: "linear-gradient(130deg, #7a1039 0%, #be123c 48%, #fb7185 100%)",
        }}
      >
        {/* Brilhos e textura premium */}
        <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-pink-300/25 blur-3xl" />
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
        <Ribbon className="pointer-events-none absolute -right-6 -top-8 h-44 w-44 text-white/10" />

        <div className="relative">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-rose-300 text-rose-900 shadow-lg shadow-rose-900/30 ring-1 ring-white/40">
                <Ribbon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-100/90">
                  Campanha
                </p>
                <h2 className="bg-gradient-to-r from-white via-amber-50 to-white bg-clip-text text-lg font-extrabold leading-tight text-transparent sm:text-xl">
                  Outubro Rosa 2026
                </h2>
                <p className="text-xs text-white/75">
                  Gestão de lista • {porUnidade.length} unidade{porUnidade.length !== 1 ? "s" : ""} •{" "}
                  {porEquipe.length} equipe{porEquipe.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>

          {/* Tiles de indicadores */}
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:grid-cols-4 sm:gap-3">
            {heroTiles.map((s) => (
              <div
                key={s.label}
                className={`relative flex flex-col justify-between gap-1 overflow-hidden rounded-2xl px-4 py-3 ${toneClasses[s.tone]}`}
              >
                {s.tone === "highlight" && (
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-100 to-transparent" />
                )}
                {s.tone === "accent" && (
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-100 to-transparent" />
                )}
                <div className="flex items-start gap-1.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/85">
                  <s.icon
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      s.tone === "highlight"
                        ? "text-emerald-100"
                        : s.tone === "accent"
                          ? "text-amber-100"
                          : ""
                    }`}
                  />
                  <span>{s.label}</span>
                </div>
                <p
                  className={`mt-1 font-extrabold tabular-nums ${
                    s.tone === "highlight"
                      ? "text-3xl text-white drop-shadow-[0_2px_14px_rgba(6,95,70,0.7)]"
                      : "text-2xl"
                  }`}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Progresso da campanha */}
          <div className="mt-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-100/80">
                  Progresso da campanha
                </p>
              </div>
              <div className="text-right leading-none">
                <span className="text-lg font-extrabold tabular-nums drop-shadow-sm">
                  {fmt(alcancadoGeral)}
                </span>
                <span className="text-xs font-medium text-white/70"> / {fmt(totalGeral)}</span>
              </div>
            </div>
            <div className="relative mt-2 h-3 w-full overflow-hidden rounded-full bg-black/25 ring-1 ring-inset ring-white/15">
              {[25, 50, 75].map((m) => (
                <span
                  key={m}
                  className="absolute top-0 h-full w-px bg-white/20"
                  style={{ left: `${m}%` }}
                />
              ))}
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-emerald-300 via-emerald-400 to-amber-300 shadow-[0_0_16px_rgba(110,231,183,0.85)] transition-all duration-700"
                style={{ width: `${Math.min(pct, 100)}%` }}
              >
                <span className="absolute inset-y-0 right-0 w-6 rounded-full bg-white/40 blur-[6px]" />
              </div>
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

      {/* ── Rankings — mulheres alcançadas no Outubro Rosa ── */}
      <section className="space-y-4 rounded-2xl border border-rose-100 bg-gradient-to-b from-rose-50/50 via-white to-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 shadow-md shadow-rose-200/70">
            <Trophy className="h-5 w-5 text-white" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold tracking-wide text-navy sm:text-base">
              Rankings — mulheres alcançadas no Outubro Rosa
            </h3>
            <p className="text-xs text-muted-foreground">
              Os pódios da campanha 🥇🥈🥉 • Top 10 unidades • Top 20 equipes • Top 30 equipes + microáreas
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
          <RankingChart
            title="Top 10 unidades — mulheres alcançadas no Outubro Rosa"
            subtitle={`${porUnidade.length} unidade(s) • ranking por mulheres alcançadas`}
            data={porUnidade}
            limit={10}
            height={340}
            icon={Crown}
            iconClass="from-amber-400 to-yellow-500 shadow-amber-200/70"
          />
          <RankingChart
            title="Top 20 equipes — mulheres alcançadas no Outubro Rosa"
            subtitle={`${porEquipe.length} equipe(s) • ranking por mulheres alcançadas`}
            data={porEquipe}
            limit={20}
            height={340}
            icon={Medal}
            iconClass="from-emerald-400 to-teal-500 shadow-emerald-200/70"
          />
        </div>

        <RankingChart
          title="Top 30 equipes + microáreas — mulheres alcançadas no Outubro Rosa"
          subtitle={`${porEquipeMicroarea.length} combinação(ões) • ranking por mulheres alcançadas`}
          data={porEquipeMicroarea}
          limit={30}
          height={640}
          icon={Award}
          iconClass="from-rose-400 to-pink-500 shadow-rose-200/70"
        />
      </section>
    </div>
  );
}
