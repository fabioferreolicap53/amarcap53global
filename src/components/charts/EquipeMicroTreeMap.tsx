import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import type { BucketCount } from "@/types/amarcap53";

interface EquipeMicroTreeMapProps {
  data: BucketCount[];
  height?: number;
}

// Paleta bold por equipe — cada equipe ganha uma cor distinta
const TEAM_COLORS = [
  "#1a2744", "#2563eb", "#dc2626", "#059669", "#d97706",
  "#7c3aed", "#db2777", "#0891b2", "#ea580c", "#4f46e5",
  "#16a34a", "#ca8a04", "#9333ea", "#e11d48", "#0d9488",
  "#c2410c", "#6d28d9", "#be185d", "#0e7490", "#b45309",
];

interface TeamNode {
  name: string;
  value: number;
  children: MicroNode[];
  itemStyle?: { color: string };
}

interface MicroNode {
  name: string;
  value: number;
  equipe: string;
  itemStyle?: { color: string; borderColor: string; borderWidth: number };
  label?: { show: boolean; fontSize: number; color: string; fontFamily: string; fontWeight: string; textShadowColor: string; textShadowBlur: number; formatter: string };
}

/** Cores variadas dentro de uma equipe */
function microColors(baseHex: string): string[] {
  const r = parseInt(baseHex.slice(1, 3), 16);
  const g = parseInt(baseHex.slice(3, 5), 16);
  const b = parseInt(baseHex.slice(5, 7), 16);

  return [
    baseHex,
    `rgb(${Math.min(r + 30, 255)},${Math.min(g + 30, 255)},${Math.min(b + 30, 255)})`,
    `rgb(${Math.max(r - 20, 0)},${Math.max(g - 20, 0)},${Math.min(b + 40, 255)})`,
    `rgb(${Math.min(r + 15, 255)},${Math.max(g - 15, 0)},${Math.max(b - 15, 0)})`,
    `rgb(${Math.max(r, 80)},${Math.min(g + 45, 255)},${Math.max(b, 60)})`,
    `rgb(${Math.min(r + 50, 255)},${Math.max(g, 60)},${Math.min(b + 20, 255)})`,
  ];
}

export default function EquipeMicroTreeMap({
  data,
  height = 560,
}: EquipeMicroTreeMapProps) {
  const treeData = useMemo(() => {
    // Agrupar por equipe
    const teamMap = new Map<string, TeamNode>();
    const teamOrder: string[] = [];

    for (const item of data) {
      const parts = item.label.split(" / Microárea ");
      const equipe = parts[0]?.trim() || "Sem equipe";

      if (!teamMap.has(equipe)) {
        teamMap.set(equipe, { name: equipe, value: 0, children: [] });
        teamOrder.push(equipe);
      }
      const team = teamMap.get(equipe)!;
      team.value += item.count;
    }

    // Ordenar equipes por total desc
    teamOrder.sort((a, b) => {
      const va = teamMap.get(a)!.value;
      const vb = teamMap.get(b)!.value;
      return vb - va;
    });

    // Preencher microáreas
    for (const item of data) {
      const parts = item.label.split(" / Microárea ");
      const equipe = parts[0]?.trim() || "Sem equipe";
      const micro = parts[1]?.trim() || "?";
      const team = teamMap.get(equipe)!;

      team.children.push({
        name: `M.${micro}`,
        value: item.count,
        equipe,
      });
    }

    // Ordenar microáreas dentro de cada equipe por valor desc
    for (const team of teamMap.values()) {
      team.children.sort((a, b) => b.value - a.value);
    }

    // Aplicar cores
    const result: TeamNode[] = [];
    teamOrder.forEach((equipe, teamIdx) => {
      const team = teamMap.get(equipe)!;
      const baseColor = TEAM_COLORS[teamIdx % TEAM_COLORS.length]!;
      const microPalette = microColors(baseColor);

      team.itemStyle = { color: baseColor };
      team.children = team.children.map((m, i) => ({
        ...m,
        itemStyle: {
          color: microPalette[i % microPalette.length]!,
          borderColor: "rgba(255,255,255,0.85)",
          borderWidth: 2,
        },
        label: {
          show: m.value > 5,
          fontSize: m.value > 300 ? 15 : m.value > 100 ? 12 : m.value > 40 ? 10 : 8,
          color: "#fff",
          fontFamily: "Inter",
          fontWeight: "bold" as const,
          textShadowColor: "rgba(0,0,0,0.5)",
          textShadowBlur: 3,
          formatter: `${m.name}  ${m.value.toLocaleString("pt-BR")}`,
        },
      }));
      result.push(team);
    });

    return result;
  }, [data]);

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "item" as const,
        backgroundColor: "rgba(26,39,68,0.95)",
        borderColor: "rgba(255,255,255,0.1)",
        textStyle: { color: "#fff", fontFamily: "Inter", fontSize: 13 },
        formatter: (params: { name: string; value: number; treePathInfo?: Array<{ name: string }> }) => {
          const path = (params as { treePathInfo?: Array<{ name: string }> }).treePathInfo ?? [];
          if (path.length >= 3) {
            const equipe = path[1]?.name ?? "";
            return `<div style="padding:4px 2px">
              <div style="font-size:15px;font-weight:bold;color:#60a5fa;margin-bottom:4px">${equipe}</div>
              <div style="font-size:13px;color:#94a3b8;margin-bottom:6px">Microárea ${params.name}</div>
              <div style="font-size:18px;font-weight:bold;color:#fff">${params.value.toLocaleString("pt-BR")} <span style="font-size:12px;color:#94a3b8;font-weight:normal">pacientes</span></div>
            </div>`;
          }
          if (path.length === 2) {
            return `<div style="padding:4px 2px">
              <div style="font-size:15px;font-weight:bold;color:#60a5fa;margin-bottom:4px">${params.name}</div>
              <div style="font-size:18px;font-weight:bold;color:#fff">${params.value.toLocaleString("pt-BR")} <span style="font-size:12px;color:#94a3b8;font-weight:normal">pacientes</span></div>
              <div style="font-size:11px;color:#64748b;margin-top:4px">Clique para detalhar microáreas</div>
            </div>`;
          }
          return `<strong>${params.name}</strong><br/>Total: ${params.value.toLocaleString("pt-BR")}`;
        },
      },
      series: [
        {
          type: "treemap" as const,
          data: treeData,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          roam: false,
          nodeClick: "zoomToNode" as const,
          visibleMin: 10,
          breadcrumb: {
            show: true,
            top: 8,
            left: 16,
            height: 28,
            itemStyle: {
              color: "#1a2744",
              borderColor: "transparent",
            },
            textStyle: { color: "#fff", fontFamily: "Inter", fontSize: 12 },
            emphasis: {
              itemStyle: { color: "#2563eb" },
            },
          },
          levels: [
            {
              // Level 0 — Equipes (blocos grandes)
              itemStyle: {
                borderColor: "#fff",
                borderWidth: 4,
                gapWidth: 4,
              },
              upperLabel: {
                show: true,
                height: 32,
                color: "#fff",
                fontWeight: "bold" as const,
                fontSize: 14,
                fontFamily: "Inter",
                textShadowColor: "rgba(0,0,0,0.4)",
                textShadowBlur: 2,
                backgroundColor: "transparent",
                formatter: (params: { name: string; value: number }) =>
                  `${params.name}  \u2022  ${params.value.toLocaleString("pt-BR")}`,
              },
            },
            {
              // Level 1 — Microáreas
              itemStyle: {
                borderColor: "rgba(255,255,255,0.85)",
                borderWidth: 2,
                gapWidth: 2,
              },
              colorSaturation: [0.5, 0.9],
            },
          ],
          animationDuration: 1000,
          animationEasing: "cubicOut" as const,
        },
      ],
    }),
    [treeData],
  );

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="border-b border-border/40 bg-gradient-to-r from-navy-50/50 to-transparent pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-navy to-blue-600 shadow-md">
              <MapPin className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-navy">
                Equipe + Microárea — Visão Completa
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {data.length} combinações \u2022 Clique para explorar cada equipe
              </p>
            </div>
          </div>
          <span className="rounded-full bg-navy px-3 py-1 text-xs font-bold text-white">
            {data.length > 0 ? data.reduce((s, d) => s + d.count, 0).toLocaleString("pt-BR") : 0}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <ReactECharts option={option} style={{ height }} />
      </CardContent>
    </Card>
  );
}
