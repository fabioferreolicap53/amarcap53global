import { useState, useMemo, useEffect } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
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
import { pb } from "@/services";
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

/** Lê a data salva: localStorage → cookie → sessionStorage.
 *  Camadas extras cobrem ambientes onde localStorage é bloqueado
 *  (iframe sandbox) ou limpo a cada reload. */
function readLastUpdate(): string {
  try {
    const v = localStorage.getItem(LAST_UPDATE_KEY);
    if (v) return v;
  } catch {
    /* storage indisponível */
  }
  try {
    const m = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${LAST_UPDATE_KEY}=([^;]*)`),
    );
    if (m?.[1] != null) return decodeURIComponent(m[1]);
  } catch {
    /* sem acesso a cookie */
  }
  try {
    return sessionStorage.getItem(LAST_UPDATE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Grava a data em todas as camadas disponíveis. */
function writeLastUpdate(value: string): void {
  try {
    if (value) localStorage.setItem(LAST_UPDATE_KEY, value);
    else localStorage.removeItem(LAST_UPDATE_KEY);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = value
      ? `${LAST_UPDATE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`
      : `${LAST_UPDATE_KEY}=; path=/; max-age=0`;
  } catch {
    /* ignore */
  }
  try {
    if (value) sessionStorage.setItem(LAST_UPDATE_KEY, value);
    else sessionStorage.removeItem(LAST_UPDATE_KEY);
  } catch {
    /* ignore */
  }
}

// ── Persistência no servidor (PocketBase) ──
// A data é gravada numa coleção de configuração, por isso passa a valer para
// todos os dispositivos/navegadores — não depende mais do armazenamento local.
const CONFIG_COLLECTION = "amarcap53global_config";
const LAST_UPDATE_SETTING = "last_update";

interface ConfigRecord {
  id: string;
  created: string;
  updated: string;
  collectionId: string;
  collectionName: string;
  key: string;
  value: string;
}

/** Lê a data gravada no servidor. */
async function fetchLastUpdateRemote(): Promise<string | null> {
  const res = await pb.getList<ConfigRecord>(CONFIG_COLLECTION, {
    filter: `key="${LAST_UPDATE_SETTING}"`,
    perPage: 1,
  });
  return res.items[0]?.value || null;
}

/** Grava a data no servidor, criando o registro na primeira vez.
 *  Faz uma segunda tentativa para cobrir falhas transitórias de rede. */
async function saveLastUpdateRemote(value: string): Promise<void> {
  const attempt = async () => {
    const res = await pb.getList<ConfigRecord>(CONFIG_COLLECTION, {
      filter: `key="${LAST_UPDATE_SETTING}"`,
      perPage: 1,
    });
    const existing = res.items[0];
    if (existing) {
      if (existing.value !== value) {
        await pb.update<ConfigRecord>(CONFIG_COLLECTION, existing.id, { value });
      }
    } else if (value) {
      await pb.create<ConfigRecord>(CONFIG_COLLECTION, { key: LAST_UPDATE_SETTING, value });
    }
  };

  try {
    await attempt();
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
    await attempt();
  }
}

export default function EstatisticasGlobais() {
  const { loading, error, getStats, outubroRosaRows, filterData, refetch } = useEstatisticas();
  const [activeTab, setActiveTab] = useState<EstatisticasTab>("outubro_rosa");
  const [selUnidade, setSelUnidade] = useState<string | null>(null);
  const [selEquipe, setSelEquipe] = useState<string | null>(null);
  const [selMicroarea, setSelMicroarea] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>(() => readLastUpdate());

  const handleLastUpdate = (value: string) => {
    setLastUpdate(value);
    writeLastUpdate(value);
    // Persiste no servidor → visível em qualquer dispositivo/navegador
    saveLastUpdateRemote(value).catch((err) => {
      console.warn("[lastUpdate] não foi possível gravar no servidor:", err);
    });
  };

  // Carrega a data do servidor ao abrir (sobrepõe o cache local quando existir)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchLastUpdateRemote();
        if (cancelled) return;
        if (remote) {
          setLastUpdate(remote);
          writeLastUpdate(remote); // mantém os caches locais alinhados
        } else {
          // Servidor ainda sem registro: semeia com o valor local, se houver
          const local = readLastUpdate();
          if (local) await saveLastUpdateRemote(local);
        }
      } catch (err) {
        /* offline/sem credenciais: segue com o valor local */
        console.warn("[lastUpdate] leitura do servidor indisponível:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

      <main className="mx-auto max-w-[1400px] space-y-4 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-6">
        {/* ── Page Header ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-navy sm:text-3xl">
              ESTATÍSTICAS GLOBAIS
            </h1>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Análise quantitativa dos testes DNA-HPV por equipe, unidade e microárea.
            </p>
          </div>
          <div className="relative flex w-full flex-col overflow-hidden rounded-2xl border border-navy-100 bg-gradient-to-br from-white via-white to-navy-50/70 shadow-sm transition-shadow hover:shadow-md sm:w-auto sm:flex-row sm:items-stretch">
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />

            {/* ── Segmento: última atualização do banco ── */}
            <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 sm:gap-3 sm:px-3 sm:py-2">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-navy to-navy-700 text-white shadow-md shadow-navy-200 sm:h-9 sm:w-9">
                <Database className="h-4 w-4" />
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
              </div>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="db-last-update"
                  className="block text-[10px] font-bold uppercase tracking-wider text-navy/60"
                >
                  Última atualização do banco
                </label>

                {showPwd && !unlocked ? (
                  <div className="flex min-w-0 items-center gap-1.5">
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
                        "min-w-0 w-full rounded-md border bg-white/80 px-2 py-0.5 text-xs font-semibold text-navy outline-none transition-colors focus:ring-2 sm:w-[7.5rem]",
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
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      id="db-last-update"
                      type="date"
                      value={lastUpdate}
                      disabled={!unlocked}
                      onChange={(e) => handleLastUpdate(e.target.value)}
                      className={cn(
                        "min-w-0 w-full rounded-md bg-transparent text-sm font-semibold text-navy outline-none [color-scheme:light] focus-visible:ring-2 focus-visible:ring-navy-200 sm:w-[9.5rem]",
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
                  "flex-1 rounded-md px-2.5 py-2.5 text-center transition-all sm:px-4 sm:py-3 sm:text-left",
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
                    "mt-0.5 hidden text-xs sm:block",
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
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-navy/40">
                Desenvolvido por Fabio Ferreira de Oliveira · DAPS/CAP5.3
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
          <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
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

      <Footer />
    </div>
  );
}
