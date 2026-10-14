import { useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, ChevronDown, ChevronUp, History } from "lucide-react";
import type { TimelineUnidadeRow } from "@/types/amarcap53";

interface Props {
  rows: TimelineUnidadeRow[];
  /** "rose" = Outubro Rosa (padrão). "neutral" = versão sem tema de campanha. */
  variant?: "rose" | "neutral";
  /** Unidade selecionada no filtro em cascata (destaca a linha dela). */
  selUnidade?: string | null;
  /** Data mínima (ISO yyyy-mm-dd): descarta ocorrências anteriores. */
  windowStart?: string;
  /** Exibe apenas as N últimas ocorrências (momentos de atualização). */
  maxPoints?: number;
}

type Mode = "accum" | "daily" | "both";

const fmt = (n: number) => n.toLocaleString("pt-BR");

// Quantas unidades exibir por padrão (além do total).
const TOP_N = 6;

const ROSE_PALETTE = [
  "#e11d48", "#db2777", "#c026d3", "#a21caf", "#ec4899", "#f43f5e",
  "#9f1239", "#fb7185", "#f472b6", "#e879f9", "#be123c", "#d946ef",
];
const NEUTRAL_PALETTE = [
  "#1d4ed8", "#2563eb", "#3b82f6", "#0284c7", "#0ea5e9", "#0891b2",
  "#0d9488", "#14b8a6", "#4f46e5", "#6366f1", "#7c3aed", "#8b5cf6",
];

const TOTAL_COLOR = "#059669";
const TOTAL_ACC = "Total acumulado";
const OTHERS_NAME = "Demais unidades";
const OTHERS_COLOR = "#94a3b8";

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "accum", label: "Acumulado", hint: "Só o acumulado (linhas)" },
  { key: "daily", label: "Diário", hint: "Só o incremento de cada dia" },
  { key: "both", label: "Ambos", hint: "Barras do dia + linha acumulada" },
];

const fmtDate = (iso: string) => {
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
};

function shortName(u: string, max = 24): string {
  const s = u.replace(/^SMS\s+/i, "").replace(/\s+AP\s+53$/i, "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

interface UnitSeries {
  name: string;
  color: string;
  cum: number[];
  daily: number[];
}

function buildOption(
  dates: string[],
  pack: {
    totalCum: number[];
    totalDaily: number[];
    units: UnitSeries[];
    mode: Mode;
    singleFocus: boolean;
    /** Nome da série atualmente sob o cursor (destacada no tooltip). */
    getHovered: () => string | null;
  },
) {
  const { totalCum, totalDaily, units, mode, singleFocus, getHovered } = pack;
  const showBars = mode !== "accum";
  const showAccumLine = mode !== "daily";
  const bothAxes = mode === "both";

  const bars = units.map((u) => ({
    name: u.name,
    type: "bar" as const,
    stack: "dia",
    yAxisIndex: 0,
    data: u.daily,
    barMaxWidth: 26,
    itemStyle: { color: u.color, opacity: bothAxes ? 0.55 : 0.92, borderRadius: [2, 2, 0, 0] },
    emphasis: { focus: "series" as const },
  }));

  // Linhas acumuladas por unidade: no modo "accum" todas; no "both" só quando
  // há uma única unidade em foco (detalhe), sobre o eixo acumulado (tracejada).
  const showUnitLines = mode === "accum" || (mode === "both" && singleFocus);
  const lineUnits = units.filter((u) => u.name !== OTHERS_NAME);
  const unitLines = showUnitLines
    ? lineUnits.map((u) => ({
        name: u.name,
        type: "line" as const,
        smooth: true,
        symbol: "circle" as const,
        symbolSize: mode === "accum" ? 4 : 5,
        yAxisIndex: bothAxes ? 1 : 0,
        z: 5,
        data: u.cum,
        lineStyle: {
          width: mode === "accum" ? 1.8 : 2.2,
          color: u.color,
          opacity: 0.95,
          type: bothAxes ? ("dashed" as const) : ("solid" as const),
        },
        itemStyle: { color: u.color, borderColor: "#fff", borderWidth: 1 },
        label:
          bothAxes && singleFocus
            ? {
                show: true,
                position: "bottom" as const,
                distance: 4,
                fontSize: 10,
                fontWeight: "600" as const,
                fontFamily: "Inter",
                color: u.color,
                formatter: (p: { dataIndex: number; value: number }) =>
                  p.dataIndex === dates.length - 1 ? fmt(p.value) : "",
              }
            : undefined,
        emphasis: { focus: "series" as const },
      }))
    : [];

  const accumSeries = showAccumLine
    ? [
        {
          name: TOTAL_ACC,
          type: "line" as const,
          smooth: true,
          symbol: "circle" as const,
          symbolSize: 7,
          yAxisIndex: bothAxes ? 1 : 0,
          z: 6,
          data: totalCum,
          lineStyle: {
            width: 3.4,
            color: TOTAL_COLOR,
            shadowBlur: 12,
            shadowColor: "rgba(5,150,105,0.30)",
            shadowOffsetY: 3,
          },
          itemStyle: { color: TOTAL_COLOR, borderColor: "#fff", borderWidth: 1.5 },
          areaStyle:
            mode === "accum"
              ? {
                  color: {
                    type: "linear" as const,
                    x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                      { offset: 0, color: "rgba(16,185,129,0.32)" },
                      { offset: 1, color: "rgba(16,185,129,0.02)" },
                    ],
                  },
                }
              : undefined,
          label: {
            show: true,
            position: "top" as const,
            distance: 6,
            fontSize: 11,
            fontWeight: "bold" as const,
            fontFamily: "Inter",
            color: TOTAL_COLOR,
            formatter: (p: { dataIndex: number; value: number }) =>
              p.dataIndex === dates.length - 1 ? fmt(p.value) : "",
          },
        },
      ]
    : [];

  const legendData = Array.from(
    new Set([...units.map((u) => u.name), ...(showAccumLine ? [TOTAL_ACC] : [])]),
  );

  const yAxis = bothAxes
    ? [
        {
          type: "value" as const,
          name: "diário",
          nameTextStyle: { fontSize: 10, color: "#94a3b8", fontFamily: "Inter" },
          axisLabel: { fontSize: 11, fontFamily: "Inter", color: "#94a3b8" },
          splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" as const } },
        },
        {
          type: "value" as const,
          name: "acumulado",
          nameTextStyle: { fontSize: 10, color: TOTAL_COLOR, fontFamily: "Inter" },
          position: "right" as const,
          axisLabel: { fontSize: 11, fontFamily: "Inter", color: TOTAL_COLOR },
          splitLine: { show: false },
        },
      ]
    : [
        {
          type: "value" as const,
          axisLabel: { fontSize: 11, fontFamily: "Inter", color: "#94a3b8" },
          splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" as const } },
        },
      ];

  return {
    animationDuration: 800,
    animationEasing: "cubicOut" as const,
    tooltip: {
      trigger: "axis" as const,
      // Confina dentro da área do gráfico: evita o tooltip "vazar" para fora do
      // card no mobile (onde o container é estreito).
      confine: true,
      // Translúcido de propósito: deixa o gráfico visível por trás do tooltip.
      backgroundColor: "rgba(26,39,68,0.62)",
      borderColor: "rgba(255,255,255,0.22)",
      borderWidth: 1,
      padding: [6, 10],
      extraCssText:
        "backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);" +
        "box-shadow:0 8px 24px rgba(2,6,23,0.30);border-radius:9px;" +
        "max-width:min(72vw,250px);white-space:normal;line-height:1.28;word-break:break-word;",
      textStyle: { color: "#fff", fontFamily: "Inter", fontSize: 11 },
      formatter: (params: Array<{ seriesName: string; seriesType: string; value: number; color: string; axisValue: string; dataIndex: number }>) => {
        if (!params?.length) return "";
        const idx = params[0]!.dataIndex;
        const hovered = getHovered();
        const hoveringTotal = hovered === TOTAL_ACC;
        // No modo "accum" listamos as linhas (acumulado por unidade); nos demais,
        // as barras (incremento do dia). Assim bar+linha não duplicam o mesmo valor.
        const wantType = mode === "accum" ? "line" : "bar";
        const rows = [...params]
          .filter((p) => p.seriesName !== TOTAL_ACC && p.seriesType === wantType && Number(p.value) > 0)
          .sort((a, b) => Number(b.value) - Number(a.value))
          .map((p) => {
            const isHl = hovered === p.seriesName;
            const dim = hovered && !hoveringTotal && !isHl;
            const rowStyle = isHl
              ? `background:linear-gradient(90deg, ${p.color}3d, ${p.color}08);` +
                `box-shadow:inset 3px 0 0 ${p.color};border-radius:5px;padding:1px 5px;margin:1px -2px;`
              : "padding:1px 5px;margin:1px -2px;";
            const valueStyle = isHl
              ? `color:#fff;font-weight:800;font-size:12px;`
              : "opacity:.92;";
            return `<div style="${rowStyle}${dim ? "opacity:.38;" : ""}">` +
              `<span style="color:${p.color}">●</span> ${shortName(p.seriesName, 15)}: ` +
              `<strong style="${valueStyle}">${fmt(Number(p.value))}</strong></div>`;
          })
          .join("");
        const head = `<div style="font-weight:700;margin-bottom:3px">${params[0]!.axisValue}</div>`;
        const accumStyle = hoveringTotal
          ? "background:linear-gradient(90deg, rgba(5,150,105,.35), transparent);box-shadow:inset 3px 0 0 #059669;border-radius:5px;padding:1px 6px;"
          : "";
        const foot =
          `<div style="margin-top:4px;border-top:1px solid rgba(255,255,255,.18);padding-top:4px">` +
          `Dia: <strong style="color:#6ee7b7">+${fmt(totalDaily[idx] ?? 0)}</strong> · ` +
          `<span style="${accumStyle}">Acum: <strong>${fmt(totalCum[idx] ?? 0)}</strong></span></div>`;
        return `${head}${rows}${foot}`;
      },
    },
    legend: {
      type: "scroll" as const,
      bottom: 0,
      icon: "roundRect" as const,
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 12,
      textStyle: { fontSize: 10, fontFamily: "Inter", color: "#475569" },
      formatter: (name: string) => (name === TOTAL_ACC ? "ACUMULADO" : shortName(name, 18)),
      data: legendData,
    },
    grid: { left: 8, right: bothAxes ? 36 : 20, top: 22, bottom: 44, containLabel: true },
    xAxis: {
      type: "category" as const,
      boundaryGap: showBars,
      data: dates.map(fmtDate),
      axisLabel: { fontSize: 11, fontFamily: "Inter", color: "#64748b" },
      axisLine: { lineStyle: { color: "#e2e8f0" } },
      axisTick: { show: false },
    },
    yAxis,
    series: [...bars, ...unitLines, ...accumSeries],
  };
}

export default function TimelineUnidadesChart({
  rows,
  variant = "rose",
  selUnidade = null,
  windowStart,
  maxPoints,
}: Props) {
  const [expandedUnits, setExpandedUnits] = useState(false);
  const [showAllTime, setShowAllTime] = useState(false);
  const [mode, setMode] = useState<Mode>("both");
  // Série sob o cursor — usada para destacar a unidade no tooltip sem re-render
  // (evita reiniciar a animação do gráfico a cada movimento do mouse).
  const hoveredRef = useRef<string | null>(null);
  const getHovered = useRef(() => hoveredRef.current).current;

  // Recorte temporal fixo (ex.: Outubro Rosa = out/2026) + filtro de cascata
  // (etapa "Unidade"). O acumulado é recalculado sobre as linhas já recortadas
  // para casar com os tiles e com a unidade selecionada.
  const scoped = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!windowStart || r.data_ref >= windowStart) &&
          (!selUnidade || r.unidade === selUnidade),
      ),
    [rows, windowStart, selUnidade],
  );

  // Séries por unidade: acumulada (cum) e incremento diário (daily).
  const { allDates, totalCum, totalDaily, ranked } = useMemo(() => {
    const dates = Array.from(new Set(scoped.map((r) => r.data_ref))).sort();
    const dailyMap = new Map<string, Map<string, number>>();
    for (const r of scoped) {
      let m = dailyMap.get(r.unidade);
      if (!m) {
        m = new Map<string, number>();
        dailyMap.set(r.unidade, m);
      }
      m.set(r.data_ref, (m.get(r.data_ref) ?? 0) + r.alcancado);
    }

    const units = Array.from(dailyMap.entries()).map(([unidade, m]) => {
      const daily: number[] = [];
      const cum: number[] = [];
      let acc = 0;
      for (const d of dates) {
        const v = m.get(d) ?? 0;
        daily.push(v);
        acc += v;
        cum.push(acc);
      }
      return { unidade, daily, cum, final: acc };
    });

    const totalDaily = dates.map((_, i) => units.reduce((s, u) => s + (u.daily[i] ?? 0), 0));
    const totalCum = dates.map((_, i) => units.reduce((s, u) => s + (u.cum[i] ?? 0), 0));
    units.sort((a, b) => b.final - a.final);

    return { allDates: dates, totalCum, totalDaily, ranked: units };
  }, [scoped]);

  // Recorte de exibição: só as últimas N ocorrências (ou o histórico inteiro).
  const limit = maxPoints && !showAllTime ? maxPoints : allDates.length;
  const startIdx = Math.max(0, allDates.length - limit);
  const dates = allDates.slice(startIdx);
  const totalCumV = totalCum.slice(startIdx);
  const totalDailyV = totalDaily.slice(startIdx);

  const isNeutral = variant === "neutral";
  const palette = isNeutral ? NEUTRAL_PALETTE : ROSE_PALETTE;

  const selected = selUnidade ? ranked.find((r) => r.unidade === selUnidade) : undefined;
  const shownRanked = selUnidade
    ? selected
      ? [selected]
      : []
    : ranked.slice(0, expandedUnits ? ranked.length : TOP_N);

  // Monta as séries das unidades + "Demais unidades" (para o empilhado fechar
  // no total consolidado quando há unidades ocultas).
  const units: UnitSeries[] = shownRanked.map((r, i) => ({
    name: r.unidade,
    color: palette[(selUnidade ? 0 : i) % palette.length]!,
    cum: r.cum.slice(startIdx),
    daily: r.daily.slice(startIdx),
  }));

  if (shownRanked.length > 0 && shownRanked.length < ranked.length) {
    const othersDaily = dates.map((_, i) => {
      const shownSum = shownRanked.reduce((s, u) => s + (u.daily[startIdx + i] ?? 0), 0);
      return (totalDailyV[i] ?? 0) - shownSum;
    });
    if (othersDaily.some((v) => v > 0)) {
      units.push({
        name: OTHERS_NAME,
        color: OTHERS_COLOR,
        cum: [],
        daily: othersDaily,
      });
    }
  }

  // Foco em uma única unidade real (seleção no filtro) — habilita a linha
  // acumulada dela no modo "Ambos".
  const singleFocus = shownRanked.length === 1;

  const option = useMemo(
    () =>
      dates.length
        ? buildOption(dates, { totalCum: totalCumV, totalDaily: totalDailyV, units, mode, singleFocus, getHovered })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dates, totalCumV, totalDailyV, units, mode, singleFocus],
  );

  // Rastreia a série sob o cursor para o destaque no tooltip.
  const onEvents = useMemo(
    () => ({
      mouseover: (p: { seriesName?: string }) => {
        hoveredRef.current = p?.seriesName ?? null;
      },
      mouseout: () => {
        hoveredRef.current = null;
      },
      globalout: () => {
        hoveredRef.current = null;
      },
    }),
    [],
  );

  const cardBorder = isNeutral ? "border-slate-200" : "border-rose-100";
  const headerCls = isNeutral
    ? "border-slate-200/70 bg-gradient-to-r from-slate-50 to-transparent"
    : "border-rose-100/70 bg-gradient-to-r from-rose-50 to-transparent";
  const iconCls = isNeutral
    ? "from-blue-500 to-indigo-600 shadow-blue-200"
    : "from-rose-500 to-pink-600 shadow-rose-200";
  const btnCls = isNeutral
    ? "border-slate-200 text-slate-600 hover:bg-slate-50"
    : "border-rose-200 text-rose-600 hover:bg-rose-50";
  const segWrap = isNeutral ? "border-slate-200 bg-slate-100/70" : "border-rose-200 bg-rose-50";
  const segActive = isNeutral ? "bg-blue-600 text-white shadow-sm" : "bg-rose-600 text-white shadow-sm";
  const segIdle = isNeutral ? "text-slate-500 hover:text-slate-800" : "text-rose-500 hover:text-rose-700";

  const totalFinal = totalCum[totalCum.length - 1] ?? 0;
  const dailyTotal = totalDaily[totalDaily.length - 1] ?? 0;
  const canExpandUnits = !selUnidade && ranked.length > TOP_N;
  const canExpandTime = !!maxPoints && allDates.length > maxPoints;

  const periodLabel = dates.length
    ? `${fmtDate(dates[0]!)} → ${fmtDate(dates[dates.length - 1]!)}`
    : "";
  const occurrencesLabel =
    maxPoints && !showAllTime && allDates.length > maxPoints
      ? `últimas ${dates.length} de ${allDates.length} atualizações`
      : `${allDates.length} atualizações`;

  return (
    <Card className={`overflow-hidden ${cardBorder} shadow-sm`}>
      <CardHeader className={`border-b ${headerCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${iconCls} shadow-md`}>
              <Activity className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold text-navy">
                Evolução por unidade — mulheres alcançadas
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Incremento diário (barras) + acumulado (linha) • momentos de atualização do banco
              </p>
              {periodLabel && (
                <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  isNeutral ? "bg-slate-100 text-slate-500" : "bg-rose-50 text-rose-500"
                }`}>
                  <History className="h-3 w-3" />
                  {periodLabel} • {occurrencesLabel}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex items-center gap-0.5 rounded-lg border p-0.5 ${segWrap}`}>
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  title={m.hint}
                  onClick={() => setMode(m.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    mode === m.key ? segActive : segIdle
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="hidden items-end gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-1.5 sm:flex">
              <div className="flex flex-col items-end leading-none">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                  Acumulado
                </span>
                <span className="text-lg font-extrabold tabular-nums text-emerald-600">
                  {fmt(totalFinal)}
                </span>
              </div>
              <div className="flex flex-col items-end border-l border-slate-200 pl-2 leading-none">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                  Último dia
                </span>
                <span className="text-sm font-bold tabular-nums text-slate-600">
                  +{fmt(dailyTotal)}
                </span>
              </div>
            </div>

            {canExpandTime && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllTime((v) => !v)}
                className={`gap-1.5 ${btnCls}`}
              >
                <History className="h-3.5 w-3.5" />
                {showAllTime ? `Últimas ${maxPoints}` : "Histórico completo"}
              </Button>
            )}
            {canExpandUnits && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpandedUnits((v) => !v)}
                className={`gap-1.5 ${btnCls}`}
              >
                {expandedUnits ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Ver menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Ver todas as {ranked.length}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4">
        {option ? (
          <div className="h-[300px] w-full sm:h-[360px]">
            <ReactECharts option={option} style={{ height: "100%", width: "100%" }} notMerge onEvents={onEvents} />
          </div>
        ) : (
          <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
            Sem dados de evolução para o período.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
