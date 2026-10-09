import { useState, useMemo } from "react";
import Header from "@/components/layout/Header";
import SummaryCard from "@/components/charts/SummaryCard";
import ExpandableBarChart from "@/components/charts/ExpandableBarChart";
import EquipeMicroPaginated from "@/components/charts/EquipeMicroPaginated";
import OutubroRosaPanel from "@/components/charts/OutubroRosaPanel";
import CascadeFilter from "@/components/filters/CascadeFilter";
import { useEstatisticas } from "@/hooks/useEstatisticas";
import {
  BarChart3,
  Building2,
  Users,
  MapPin,
  AlertTriangle,
  RefreshCw,
  Ribbon,
  Database,
  Lock,
  Unlock,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EstatisticasTab, EstatisticasData, BucketCount } from "@/types/amarcap53";

const TABS: { key: EstatisticasTab; label: string; description: string }[] = [
  {
    key: "sem_cito",
    label: "Sem Cito / Registros Pendentes",
    description: "Gestão de lista",
  },
  {
    key: "total",
    label: "Total DNA-HPV",
    description: "Todos os testes DNA-HPV registrados",
  },
  {
    key: "outubro_rosa",
    label: "Outubro Rosa 2026",
    description: "Gestão de lista",
  },
];

const LAST_UPDATE_KEY = "amarcap53_last_update";
const DB_EDIT_PASSWORD = "dapsmulher";

export default function EstatisticasGlobais() {
  const { loading, error, getStats, outubroRosaRows, filterData, refetch } = useEstatisticas();
  const [activeTab, setActiveTab] = useState<EstatisticasTab>("outubro_rosa");
  const [selUnidade, setSelUnidade] = useState<string | null>(null);
  const [selEquipe, setSelEquipe] = useState<string | null>(null);
  const [selMicroarea, setSelMicroarea] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_UPDATE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const handleLastUpdate = (value: string) => {
    setLastUpdate(value);
    try {
      if (value) localStorage.setItem(LAST_UPDATE_KEY, value);
      else localStorage.removeItem(LAST_UPDATE_KEY);
    } catch {
      /* ignore */
    }
  };

  // ── Proteção por senha para inserir/alterar a data ──
  const [unlocked, setUnlocked] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState(false);

  const submitDbPassword = () => {
    if (pwd === DB_EDIT_PASSWORD) {
      setUnlocked(true);
      setShowPwd(false);
      setPwd("");
      setPwdError(false);
    } else {
      setPwdError(true);
    }
  };

  const cancelDbPassword = () => {
    setShowPwd(false);
    setPwd("");
    setPwdError(false);
  };

  const updateHint = useMemo(() => {
    if (!lastUpdate) return null;
    const d = new Date(`${lastUpdate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diffDays < 0) return { text: "Agendado", className: "bg-sky-100 text-sky-700 ring-1 ring-sky-200" };
    if (diffDays === 0) return { text: "Hoje", className: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" };
    if (diffDays <= 7)
      return {
        text: `Há ${diffDays} dia${diffDays > 1 ? "s" : ""}`,
        className: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
      };
    if (diffDays <= 30)
      return {
        text: `Há ${diffDays} dias`,
        className: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
      };
    return {
      text: `Há ${diffDays} dias`,
      className: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
    };
  }, [lastUpdate]);

  const isOutubro = activeTab === "outubro_rosa";
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
          microList.push({ label: `${selEquipe} / Microárea ${parts[2]!}`, count: v });
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
        equipeMap.set(parts[1]!, v);
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
        microList.push({ label: `${parts[1]!} / Microárea ${parts[2]!}`, count: v });
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
          <div className="relative flex flex-col overflow-hidden rounded-2xl border border-navy-100 bg-gradient-to-br from-white via-white to-navy-50/70 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-stretch">
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />

            {/* ── Segmento: última atualização do banco ── */}
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-navy to-navy-700 text-white shadow-md shadow-navy-200">
                <Database className="h-4 w-4" />
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="db-last-update"
                  className="block text-[10px] font-bold uppercase tracking-wider text-navy/60"
                >
                  Última atualização do banco
                </label>

                {showPwd && !unlocked ? (
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-navy/50" />
                    <input
                      type="password"
                      autoFocus
                      value={pwd}
                      onChange={(e) => {
                        setPwd(e.target.value);
                        setPwdError(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitDbPassword();
                        if (e.key === "Escape") cancelDbPassword();
                      }}
                      placeholder="Senha"
                      className={cn(
                        "w-[7.5rem] rounded-md border bg-white/80 px-2 py-0.5 text-xs font-semibold text-navy outline-none transition-colors focus:ring-2",
                        pwdError
                          ? "border-rose-300 ring-1 ring-rose-200"
                          : "border-navy-200 focus:ring-navy-200",
                      )}
                    />
                    <button
                      type="button"
                      onClick={submitDbPassword}
                      title="Confirmar"
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 text-white shadow-sm transition-colors hover:bg-emerald-600"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelDbPassword}
                      title="Cancelar"
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-navy-100 text-navy transition-colors hover:bg-navy-200"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      id="db-last-update"
                      type="date"
                      value={lastUpdate}
                      disabled={!unlocked}
                      onChange={(e) => handleLastUpdate(e.target.value)}
                      className={cn(
                        "w-[9.5rem] rounded-md bg-transparent text-sm font-semibold text-navy outline-none [color-scheme:light] focus-visible:ring-2 focus-visible:ring-navy-200",
                        unlocked ? "cursor-pointer" : "cursor-not-allowed opacity-55",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (unlocked) {
                          setUnlocked(false);
                          setShowPwd(false);
                          setPwd("");
                          setPwdError(false);
                        } else {
                          setShowPwd(true);
                        }
                      }}
                      title={unlocked ? "Bloquear edição" : "Inserir senha para editar"}
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
                        unlocked
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "bg-navy-100 text-navy/70 hover:bg-navy-200",
                      )}
                    >
                      {unlocked ? (
                        <Unlock className="h-3.5 w-3.5" />
                      ) : (
                        <Lock className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {updateHint && (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm",
                          updateHint.className,
                        )}
                      >
                        {updateHint.text}
                      </span>
                    )}
                  </div>
                )}

                {pwdError && (
                  <p className="mt-0.5 text-[9px] font-semibold text-rose-600">Senha incorreta</p>
                )}
              </div>
            </div>

            {/* ── Divisor ── */}
            <div className="mx-3 h-px bg-gradient-to-r from-transparent via-navy-200/80 to-transparent sm:mx-0 sm:my-2.5 sm:h-auto sm:w-px sm:bg-gradient-to-b" />

            {/* ── Segmento: ação de atualizar ── */}
            <button
              type="button"
              onClick={() => refetch()}
              disabled={loading}
              className="group flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-navy outline-none transition-colors hover:bg-gradient-to-br hover:from-navy-50 hover:to-emerald-50/60 focus-visible:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4 text-navy transition-transform group-hover:rotate-90",
                  loading && "animate-spin",
                )}
              />
              Atualizar dados
            </button>
          </div>
        </div>

        {/* ── Tab Navigation ── */}
        <div className="flex gap-1 rounded-lg border border-border bg-white p-1 shadow-sm">
          {TABS.map((tab) => {
            const isRosa = tab.key === "outubro_rosa";
            const active = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex-1 rounded-md px-4 py-3 text-left transition-all",
                  active && isRosa &&
                    "bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md shadow-rose-300/70",
                  active && !isRosa && "bg-navy text-white shadow-md",
                  !active && isRosa &&
                    "bg-rose-50/70 text-rose-700 ring-1 ring-inset ring-rose-200/80 hover:bg-rose-100 hover:text-rose-800",
                  !active && !isRosa &&
                    "text-muted-foreground hover:bg-navy-50 hover:text-navy",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {isRosa && (
                    <Ribbon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-white" : "text-rose-500",
                      )}
                    />
                  )}
                  {tab.label}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-xs",
                    active
                      ? isRosa ? "text-white/80" : "text-white/70"
                      : isRosa ? "text-rose-500/80" : "text-muted-foreground/60",
                  )}
                >
                  {tab.description}
                </span>
              </button>
            );
          })}
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

        {/* ── Outubro Rosa 2026 — Gestão de lista (gráficos empilhados) ── */}
        {!loading && isOutubro && (
          <OutubroRosaPanel
            rows={outubroRosaRows}
            selUnidade={selUnidade}
            selEquipe={selEquipe}
            selMicroarea={selMicroarea}
          />
        )}

        {/* ── Summary Cards ── */}
        {!loading && !isOutubro && (
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
        {!loading && !isOutubro && (
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

        {!loading && !isOutubro && (
          <EquipeMicroPaginated
            data={stats.porEquipeMicroarea}
          />
        )}
      </main>
    </div>
  );
}
