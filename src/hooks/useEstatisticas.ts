import { useState, useEffect, useCallback } from "react";
import type { BucketCount, EstatisticasData, FilterData } from "@/types/amarcap53";

// Views no PocketBase. Só estas 3 são consultadas: as demais dimensões são
// agregadas no cliente a partir delas. Cada view faz GROUP BY na tabela
// inteira (129k linhas), então consultar menos views = carregamento viável.
const VIEW_TOTAL_UE_MICRO = "v_total_unidade_equipe_micro";
const VIEW_SEMCITO_EQ_MICRO = "v_semcito_equipe_micro";
const VIEW_SEMCITO_UNIDADE = "v_semcito_unidade";

interface ViewRecord {
  id: string;
  total: number;
}

interface ViewUnidadeEquipeMicroRecord extends ViewRecord {
  unidade: string;
  equipe: string;
  microarea: number;
}

interface ViewEquipeMicroRecord extends ViewRecord {
  equipe: string;
  microarea: number;
}

interface ViewUnidadeRecord extends ViewRecord {
  unidade: string;
}

const CACHE_KEY = "amarcap53_views_v12";
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

/** Busca uma view com paginação automática. Lança erro se não conseguir carregar nada. */
async function fetchView<T extends ViewRecord>(
  apiBase: string,
  headers: Record<string, string>,
  viewName: string,
): Promise<T[]> {
  const all: T[] = [];
  const perPage = 1000; // PocketBase aceita; 1 request cobre todas as views
  let page = 1;

  for (;;) {
    let data: { items: T[]; totalItems: number } | null = null;

    // 3 tentativas por página
    for (let attempt = 1; attempt <= 3 && !data; attempt++) {
      try {
        const resp = await fetch(
          `${apiBase}/api/collections/${viewName}/records?page=${page}&perPage=${perPage}`,
          { headers, signal: AbortSignal.timeout(45000) },
        );
        if (resp.ok) {
          data = await resp.json() as { items: T[]; totalItems: number };
        } else if (attempt < 3) {
          await sleep(500 * attempt);
        }
      } catch {
        if (attempt < 3) await sleep(500 * attempt);
      }
    }

    if (!data) {
      // Nada carregado: falha real (não devolve vazio silenciosamente)
      if (all.length === 0) throw new Error(`Falha ao carregar ${viewName}`);
      return all;
    }

    all.push(...data.items);
    if (all.length >= data.totalItems || data.items.length < perPage) return all;
    page++;
  }
}

/** Autentica como superuser e retorna o token */
async function authRequest(apiBase: string, login: string, password: string): Promise<string> {
  let resp: Response;
  try {
    resp = await fetch(`${apiBase}/api/collections/_superusers/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: login, password }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Sem conexão com o servidor de dados");
  }
  if (!resp.ok) throw new Error(`Auth failed: ${resp.status}`);
  const data = await resp.json() as { token: string };
  return data.token;
}

const AUTH_CACHE_KEY = "amarcap53_pb_auth";

function cacheToken(token: string): void {
  try {
    localStorage.setItem(
      AUTH_CACHE_KEY,
      JSON.stringify({ token, expires: Date.now() + 25 * 60 * 1000 }),
    );
  } catch { /* ignore */ }
}

function addTo(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

function toBuckets(map: Map<string, number>): BucketCount[] {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

interface ViewBundle {
  uem: ViewUnidadeEquipeMicroRecord[];
  cem: ViewEquipeMicroRecord[];
  cun: ViewUnidadeRecord[];
}

/** Busca as views. Sequencial de propósito: em paralelo o SQLite entra em
 *  lock e o PocketBase responde 400 nas views mais pesadas. */
async function fetchAllViews(): Promise<{ total: EstatisticasData; semCito: EstatisticasData; filterData: FilterData }> {
  const apiBase = import.meta.env.VITE_POCKETBASE_URL;
  const login = import.meta.env.VITE_POCKETBASE_LOGIN;
  const password = import.meta.env.VITE_POCKETBASE_PASSWORD;

  // Auth com cache no localStorage
  let token = "";
  try {
    const cached = JSON.parse(localStorage.getItem(AUTH_CACHE_KEY) || "null");
    if (cached?.token && cached?.expires && Date.now() < cached.expires) {
      token = cached.token;
    }
  } catch { /* ignore */ }

  if (!token) {
    token = await authRequest(apiBase, login, password);
    cacheToken(token);
  }

  async function load(t: string): Promise<ViewBundle> {
    const headers = { Authorization: t };
    const uem = await fetchView<ViewUnidadeEquipeMicroRecord>(apiBase, headers, VIEW_TOTAL_UE_MICRO);
    const cem = await fetchView<ViewEquipeMicroRecord>(apiBase, headers, VIEW_SEMCITO_EQ_MICRO);
    const cun = await fetchView<ViewUnidadeRecord>(apiBase, headers, VIEW_SEMCITO_UNIDADE);
    return { uem, cem, cun };
  }

  let bundle = await load(token);

  // Se a view principal voltou vazia, o token pode ter expirado → re-auth
  if (bundle.uem.length === 0) {
    try { localStorage.removeItem(AUTH_CACHE_KEY); } catch { /* ignore */ }
    try {
      const token2 = await authRequest(apiBase, login, password);
      cacheToken(token2);
      bundle = await load(token2);
    } catch {
      // mantém o resultado parcial já obtido
    }
  }

  const { uem, cem, cun } = bundle;

  // ── TOTAL: todas as dimensões derivadas de v_total_unidade_equipe_micro ──
  const totalUnidade = new Map<string, number>();
  const totalEquipe = new Map<string, number>();
  const totalEqMicro = new Map<string, number>();

  // filterData (cascata unidade → equipe → microárea)
  const unidadesSet = new Set<string>();
  const equipesMap = new Map<string, Set<string>>();
  const microMap = new Map<string, Set<number>>();
  const totais: Record<string, number> = {};

  for (const r of uem) {
    const u = r.unidade || "Não informado";
    const e = r.equipe || "Não informado";
    addTo(totalUnidade, u, r.total);
    addTo(totalEquipe, e, r.total);
    addTo(totalEqMicro, `${e} / Microárea ${r.microarea}`, r.total);

    unidadesSet.add(u);
    if (!equipesMap.has(u)) equipesMap.set(u, new Set());
    equipesMap.get(u)!.add(e);
    const key = `${u}|${e}`;
    if (!microMap.has(key)) microMap.set(key, new Set());
    microMap.get(key)!.add(r.microarea);
    totais[key] = (totais[key] ?? 0) + r.total;
    totais[`${key}|${r.microarea}`] = r.total;
  }

  // ── SEM CITO ──
  const citoEquipe = new Map<string, number>();
  const citoEqMicro = new Map<string, number>();
  for (const r of cem) {
    const e = r.equipe || "Não informado";
    addTo(citoEquipe, e, r.total);
    addTo(citoEqMicro, `${e} / Microárea ${r.microarea}`, r.total);
  }
  const citoUnidade = new Map<string, number>();
  for (const r of cun) {
    addTo(citoUnidade, r.unidade || "Não informado", r.total);
  }

  const total: EstatisticasData = {
    totalGeral: uem.reduce((s, r) => s + r.total, 0),
    porEquipe: toBuckets(totalEquipe),
    porUnidade: toBuckets(totalUnidade),
    porEquipeMicroarea: toBuckets(totalEqMicro),
  };

  const semCito: EstatisticasData = {
    totalGeral: cem.reduce((s, r) => s + r.total, 0),
    porEquipe: toBuckets(citoEquipe),
    porUnidade: toBuckets(citoUnidade),
    porEquipeMicroarea: toBuckets(citoEqMicro),
  };

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
