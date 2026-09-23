import { useState, useEffect, useCallback } from "react";
import type { EstatisticasData, FilterData } from "@/types/amarcap53";

// Views criadas no PocketBase — queries agregadas no servidor
const VIEW_TOTAL_EQUIPE = "v_total_equipe";
const VIEW_TOTAL_UNIDADE = "v_total_unidade";
const VIEW_TOTAL_EQUIPE_MICRO = "v_total_equipe_micro";
const VIEW_SEMCITO_EQUIPE = "v_semcito_equipe";
const VIEW_SEMCITO_UNIDADE = "v_semcito_unidade";
const VIEW_SEMCITO_EQUIPE_MICRO = "v_semcito_equipe_micro";
const VIEW_TOTAL_UNIDADE_EQUIPE = "v_total_unidade_equipe";
const VIEW_TOTAL_UNIDADE_EQUIPE_MICRO = "v_total_unidade_equipe_micro";

interface ViewRecord {
  id: string;
  total: number;
}

interface ViewEquipeRecord extends ViewRecord {
  equipe: string;
}

interface ViewUnidadeRecord extends ViewRecord {
  unidade: string;
}

interface ViewEquipeMicroRecord extends ViewRecord {
  equipe: string;
  microarea: number;
}

interface ViewUnidadeEquipeRecord extends ViewRecord {
  unidade: string;
  equipe: string;
}

interface ViewUnidadeEquipeMicroRecord extends ViewRecord {
  unidade: string;
  equipe: string;
  microarea: number;
}

const CACHE_KEY = "amarcap53_views_v10";
const CACHE_TTL = 30 * 60 * 1000; // 30 min

interface CacheEntry {
  total: EstatisticasData;
  semCito: EstatisticasData;
  filterData: FilterData;
  timestamp: number;
}

function loadCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function saveCache(data: CacheEntry): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch {
    // ignora quota
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Busca uma view com paginação automática */
async function fetchView<T extends ViewRecord>(
  apiBase: string,
  headers: Record<string, string>,
  viewName: string,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  const perPage = 300;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(
        `${apiBase}/api/collections/${viewName}/records?page=${page}&perPage=${perPage}`,
        { headers, signal: AbortSignal.timeout(15000) },
      );
      if (resp.ok) {
        const data = await resp.json() as { items: T[]; totalItems: number };
        all.push(...data.items);
        if (all.length >= data.totalItems || data.items.length < perPage) return all;
        page++;
        attempt = 0;
        continue;
      }
      if (attempt < 3) await sleep(500 * attempt);
    } catch {
      if (attempt < 3) await sleep(500 * attempt);
    }
  }
  return all; // retorna o que conseguiu
}

/** Busca todas as views de uma vez */
async function fetchAllViews(): Promise<{ total: EstatisticasData; semCito: EstatisticasData; filterData: FilterData }> {
  const apiBase = import.meta.env.DEV ? "" : import.meta.env.VITE_POCKETBASE_URL;
  const login = import.meta.env.VITE_POCKETBASE_LOGIN;
  const password = import.meta.env.VITE_POCKETBASE_PASSWORD;

  // Auth com cache no localStorage
  const AUTH_CACHE_KEY = "amarcap53_pb_auth";
  let token = "";
  try {
    const cached = JSON.parse(localStorage.getItem(AUTH_CACHE_KEY) || "null");
    if (cached?.token && cached?.expires && Date.now() < cached.expires) {
      token = cached.token;
    }
  } catch { /* ignore */ }

  if (!token) {
    const authResp = await fetch(`${apiBase}/api/collections/_superusers/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: login, password }),
    });
    if (!authResp.ok) throw new Error(`Auth failed: ${authResp.status}`);
    const authData = await authResp.json() as { token: string };
    token = authData.token;
    try {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ token, expires: Date.now() + 25 * 60 * 1000 }));
    } catch { /* ignore */ }
  }
  const headers = { Authorization: token };

  // Buscar views com retry em auth
  async function fetchAll(headers: Record<string, string>) {
    return Promise.all([
      fetchView<ViewEquipeRecord>(apiBase, headers, VIEW_TOTAL_EQUIPE),
      fetchView<ViewUnidadeRecord>(apiBase, headers, VIEW_TOTAL_UNIDADE),
      fetchView<ViewEquipeMicroRecord>(apiBase, headers, VIEW_TOTAL_EQUIPE_MICRO),
      fetchView<ViewEquipeRecord>(apiBase, headers, VIEW_SEMCITO_EQUIPE),
      fetchView<ViewUnidadeRecord>(apiBase, headers, VIEW_SEMCITO_UNIDADE),
      fetchView<ViewEquipeMicroRecord>(apiBase, headers, VIEW_SEMCITO_EQUIPE_MICRO),
      fetchView<ViewUnidadeEquipeRecord>(apiBase, headers, VIEW_TOTAL_UNIDADE_EQUIPE),
      fetchView<ViewUnidadeEquipeMicroRecord>(apiBase, headers, VIEW_TOTAL_UNIDADE_EQUIPE_MICRO),
    ]);
  }

  let result = await fetchAll(headers);

  // Se primeira view retornou vazio, token pode ter expirado → re-auth
  if (result[0].length === 0) {
    try { localStorage.removeItem(AUTH_CACHE_KEY); } catch { /* ignore */ }
    const authResp2 = await fetch(`${apiBase}/api/collections/_superusers/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: login, password }),
    });
    if (authResp2.ok) {
      const authData2 = await authResp2.json() as { token: string };
      const headers2 = { Authorization: authData2.token };
      try {
        localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ token: authData2.token, expires: Date.now() + 25 * 60 * 1000 }));
      } catch { /* ignore */ }
      result = await fetchAll(headers2);
    }
  }

  const [eq, un, em, ceq, cun, cem, ue, uem] = result;

  // Mapear para formato BucketCount
  const total: EstatisticasData = {
    totalGeral: eq.reduce((s, r) => s + r.total, 0),
    porEquipe: eq.map((r) => ({ label: r.equipe || "Não informado", count: r.total })),
    porUnidade: un.map((r) => ({ label: r.unidade || "Não informado", count: r.total })),
    porEquipeMicroarea: em.map((r) => ({
      label: `${r.equipe || "Sem equipe"} / Microárea ${r.microarea}`,
      count: r.total,
    })),
  };

  const semCito: EstatisticasData = {
    totalGeral: ceq.reduce((s, r) => s + r.total, 0),
    porEquipe: ceq.map((r) => ({ label: r.equipe || "Não informado", count: r.total })),
    porUnidade: cun.map((r) => ({ label: r.unidade || "Não informado", count: r.total })),
    porEquipeMicroarea: cem.map((r) => ({
      label: `${r.equipe || "Sem equipe"} / Microárea ${r.microarea}`,
      count: r.total,
    })),
  };

  // Construir filterData a partir das views ue + uem
  const unidadesSet = new Set<string>();
  const equipesMap = new Map<string, Set<string>>();
  const microMap = new Map<string, Set<number>>();
  const totais: Record<string, number> = {};

  for (const r of ue) {
    const u = r.unidade || "Não informado";
    const e = r.equipe || "Não informado";
    unidadesSet.add(u);
    if (!equipesMap.has(u)) equipesMap.set(u, new Set());
    equipesMap.get(u)!.add(e);
    totais[`${u}|${e}`] = (totais[`${u}|${e}`] || 0) + r.total;
  }

  for (const r of uem) {
    const u = r.unidade || "Não informado";
    const e = r.equipe || "Não informado";
    const key = `${u}|${e}`;
    if (!microMap.has(key)) microMap.set(key, new Set());
    microMap.get(key)!.add(r.microarea);
    totais[`${u}|${e}|${r.microarea}`] = r.total;
  }

  const filterData: FilterData = {
    unidades: Array.from(unidadesSet).sort(),
    equipes: Object.fromEntries(
      Array.from(equipesMap.entries()).map(([k, v]) => [k, Array.from(v).sort()])
    ),
    microareas: Object.fromEntries(
      Array.from(microMap.entries()).map(([k, v]) => [k, Array.from(v).sort((a, b) => a - b)])
    ),
    totais,
  };

  return { total, semCito, filterData };
}

export function useEstatisticas() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalStats, setTotalStats] = useState<EstatisticasData | null>(null);
  const [semCitoStats, setSemCitoStats] = useState<EstatisticasData | null>(null);
  const [filterData, setFilterData] = useState<FilterData | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);

    if (!forceRefresh) {
      const cached = loadCache();
      if (cached) {
        setTotalStats(cached.total);
        setSemCitoStats(cached.semCito);
        setFilterData(cached.filterData);
        setLoading(false);
        return;
      }
    }

    try {
      const { total, semCito, filterData: fd } = await fetchAllViews();
      setTotalStats(total);
      setSemCitoStats(semCito);
      setFilterData(fd);
      saveCache({ total, semCito, filterData: fd, timestamp: Date.now() });
    } catch (err) {
      console.error("[useEstatisticas] Error:", err);
      setError(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getStats = useCallback(
    (type: "total" | "sem_cito"): EstatisticasData => {
      if (type === "total") {
        return totalStats ?? { totalGeral: 0, porEquipe: [], porUnidade: [], porEquipeMicroarea: [] };
      }
      return semCitoStats ?? { totalGeral: 0, porEquipe: [], porUnidade: [], porEquipeMicroarea: [] };
    },
    [totalStats, semCitoStats],
  );

  const emptyFilter: FilterData = { unidades: [], equipes: {}, microareas: {}, totais: {} };

  return { loading, error, getStats, filterData: filterData ?? emptyFilter, refetch: () => fetchData(true) };
}
