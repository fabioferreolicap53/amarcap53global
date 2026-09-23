import { useState, useMemo } from "react";
import Header from "@/components/layout/Header";
import SummaryCard from "@/components/charts/SummaryCard";
import ExpandableBarChart from "@/components/charts/ExpandableBarChart";
import EquipeMicroPaginated from "@/components/charts/EquipeMicroPaginated";
import CascadeFilter from "@/components/filters/CascadeFilter";
import { useEstatisticas } from "@/hooks/useEstatisticas";
import {
  BarChart3,
  Building2,
  Users,
  MapPin,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EstatisticasTab, EstatisticasData, BucketCount } from "@/types/amarcap53";

const TABS: { key: EstatisticasTab; label: string; description: string }[] = [
  {
    key: "total",
    label: "Total DNA-HPV",
    description: "Todos os testes DNA-HPV registrados",
  },
  {
    key: "sem_cito",
    label: "Sem Cito / Registros Pendentes",
    description: "Testes DNA-HPV sem informação de citopatologia",
  },
];

export default function EstatisticasGlobais() {
  const { loading, error, getStats, filterData, refetch } = useEstatisticas();
  const [activeTab, setActiveTab] = useState<EstatisticasTab>("total");
  const [selUnidade, setSelUnidade] = useState<string | null>(null);
  const [selEquipe, setSelEquipe] = useState<string | null>(null);
  const [selMicroarea, setSelMicroarea] = useState<number | null>(null);

  const rawStats = getStats(activeTab);
  const tabLabel = TABS.find((t) => t.key === activeTab)?.label ?? "";

  const stats = useMemo<EstatisticasData>(() => {
    if (!selUnidade) return rawStats;

    const { totais } = filterData;
    const prefix = selUnidade;

    // Filtrar porEquipe da view raw (match por label = unidade nos totais)
    // Na verdade precisamos re-agregar do filterData totais
    const equipeMap = new Map<string, number>();
    const microList: BucketCount[] = [];
    let totalGeral = 0;

    if (selEquipe) {
      // Unidade + Equipe: listar microáreas
      if (selMicroarea != null) {
        // Tudo filtrado — retorna só 1 registro
        const key = `${prefix}|${selEquipe}|${selMicroarea}`;
        const v = totais[key] ?? 0;
        return {
          totalGeral: v,
          porEquipe: [{ label: selEquipe, count: v }],
          porUnidade: [{ label: prefix, count: v }],
          porEquipeMicroarea: [{ label: `${selEquipe} / Microárea ${selMicroarea}`, count: v }],
        };
      }
      // Unidade + Equipe (todas microáreas)
      const keyEq = `${prefix}|${selEquipe}`;
      const totalEq = totais[keyEq] ?? 0;
      for (const [k, v] of Object.entries(totais)) {
        const parts = k.split("|");
        if (parts[0] === prefix && parts[1] === selEquipe && parts.length === 3) {
          microList.push({ label: `${selEquipe} / Microárea ${parts[2]}`, count: v });
          totalGeral += v;
        }
      }
      microList.sort((a, b) => b.count - a.count);
      return {
        totalGeral: totalGeral || totalEq,
        porEquipe: [{ label: selEquipe, count: totalEq }],
        porUnidade: [{ label: prefix, count: totalEq }],
        porEquipeMicroarea: microList,
      };
    }

    // Só Unidade: listar equipes
    for (const [k, v] of Object.entries(totais)) {
      const parts = k.split("|");
      if (parts[0] === prefix && parts.length === 2) {
        equipeMap.set(parts[1], v);
        totalGeral += v;
      }
    }
    const equipes = Array.from(equipeMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    // Microárea para todas as equipes da unidade
    for (const [k, v] of Object.entries(totais)) {
      const parts = k.split("|");
      if (parts[0] === prefix && parts.length === 3) {
        microList.push({ label: `${parts[1]} / Microárea ${parts[2]}`, count: v });
      }
    }
    microList.sort((a, b) => b.count - a.count);

    return {
      totalGeral,
      porEquipe: equipes,
      porUnidade: [{ label: prefix, count: totalGeral }],
      porEquipeMicroarea: microList,
    };
  }, [rawStats, selUnidade, selEquipe, selMicroarea, filterData]);

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <Header />

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
        {/* ── Page Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
              ESTATÍSTICAS GLOBAIS
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Análise quantitativa dos testes DNA-HPV por equipe, unidade e microárea.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={loading}
            className="w-fit gap-1.5 border-navy-200 text-navy hover:bg-navy-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Atualizar dados
          </Button>
        </div>

        {/* ── Tab Navigation ── */}
        <div className="flex gap-1 rounded-lg border border-border bg-white p-1 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 rounded-md px-4 py-3 text-left transition-all",
                activeTab === tab.key
                  ? "bg-navy text-white shadow-md"
                  : "text-muted-foreground hover:bg-navy-50 hover:text-navy",
              )}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span
                className={cn(
                  "mt-0.5 block text-xs",
                  activeTab === tab.key ? "text-white/70" : "text-muted-foreground/60",
                )}
              >
                {tab.description}
              </span>
            </button>
          ))}
        </div>

        {/* ── Cascade Filter ── */}
        {!loading && (
          <CascadeFilter
            filterData={filterData}
            selectedUnidade={selUnidade}
            selectedEquipe={selEquipe}
            selectedMicroarea={selMicroarea}
            onSelectUnidade={setSelUnidade}
            onSelectEquipe={setSelEquipe}
            onSelectMicroarea={setSelMicroarea}
          />
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="ml-auto text-red-700 hover:bg-red-100"
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex h-48 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-navy" />
              <span className="text-sm text-muted-foreground">
                Carregando dados do servidor...
              </span>

            </div>
          </div>
        )}

        {/* ── Summary Cards ── */}
        {!loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="Total DNA-HPV"
              value={stats.totalGeral}
              icon={BarChart3}
              subtitle={tabLabel}
            />
            <SummaryCard
              title="Equipes"
              value={stats.porEquipe.length}
              icon={Users}
              subtitle={`${stats.porEquipe.length} equipe(s) distinta(s)`}
              color="emerald"
            />
            <SummaryCard
              title="Unidades"
              value={stats.porUnidade.length}
              icon={Building2}
              subtitle={`${stats.porUnidade.length} unidade(s) distinta(s)`}
              color="amber"
            />
            <SummaryCard
              title="Combinações Equipe/Microárea"
              value={stats.porEquipeMicroarea.length}
              icon={MapPin}
              subtitle="Dimensões distintas"
              color="rose"
            />
          </div>
        )}

        {/* ── Charts Grid ── */}
        {!loading && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ExpandableBarChart
              title="Testes DNA-HPV por Unidade"
              subtitle={`Mostrando até 15 de ${stats.porUnidade.length} unidades`}
              data={stats.porUnidade}
              defaultShow={15}
              height={460}
            />
            <ExpandableBarChart
              title="Testes DNA-HPV por Equipe"
              subtitle={`Mostrando até 15 de ${stats.porEquipe.length} equipes`}
              data={stats.porEquipe}
              defaultShow={15}
              height={460}
            />
          </div>
        )}

        {!loading && (
          <EquipeMicroPaginated
            data={stats.porEquipeMicroarea}
          />
        )}
      </main>
    </div>
  );
}
