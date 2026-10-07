import { useState, useEffect, useCallback } from "react";
import type { BucketCount, EstatisticasData, FilterData } from "@/types/amarcap53";

// UMA única view consolidada: devolve `total` E `semcito` agrupados por
// unidade+equipe+microárea. Todas as dimensões exibidas no frontend são
// derivadas destas mesmas linhas no cliente — 1 request no lugar de 3.
// A view é servida pelo covering index idx_am53_ue_micro_rast e a leitura
// usa skipTotal=1 (evita o COUNT(*) duplicado que o PocketBase faria).
const VIEW_CONSOLIDADO = "v_am53_consolidado";

interface ViewConsolidadoRecord {
  id: string;
  unidade: string;
  equipe: string;
  microarea: number;
  total: number;
  semcito: number;
}

const CACHE_KEY = "amarcap53_views_v13";
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
async function fetchView<T extends { id: string }>(
  apiBase: string,
  headers: Record<string, string>,
  viewName: string,
): Promise<T[]> {
  const all: T[] = [];
  const perPage = 1000; // 1 request cobre a view inteira (656 linhas)
  let page = 1;

  for (;;) {
    let data: { items: T[] } | null = null;

    // 3 tentativas por página
    for (let attempt = 1; attempt <= 3 && !data; attempt++) {
      try {
        // skipTotal=1: pula o COUNT(*) da view (que roda o GROUP BY 2×) —
        // ~50% mais rápido. Página cheia => continua; página incompleta => fim.
        const resp = await fetch(
          `${apiBase}/api/collections/${viewName}/records?page=${page}&perPage=${perPage}&skipTotal=1`,
          { headers, signal: AbortSignal.timeout(45000) },
        );
        if (resp.ok) {
          data = await resp.json() as { items: T[] };
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
    if (data.items.length < perPage) return all;
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

/** Busca a view consolidada. Um único request devolve total + semcito por
 *  unidade/equipe/microárea; todas as dimensões são derivadas destas linhas. */
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

  const load = (t: string) =>
    fetchView<ViewConsolidadoRecord>(apiBase, { Authorization: t }, VIEW_CONSOLIDADO);

  let rows: ViewConsolidadoRecord[] = [];
  try {
    rows = await load(token);
  } catch {
    // token provavelmente expirado (401) — tenta re-auth abaixo
  }

  // Se a view voltou vazia/erro, o token pode ter expirado → re-auth
  if (rows.length === 0) {
    try { localStorage.removeItem(AUTH_CACHE_KEY); } catch { /* ignore */ }
    try {
      const token2 = await authRequest(apiBase, login, password);
      cacheToken(token2);
      rows = await load(token2);
    } catch {
      // sem token válido: propaga para a UI (não cai no cache vazio)
      throw new Error("Falha ao autenticar no servidor de dados");
    }
  }

  // ── Todas as dimensões derivam das MESMAS linhas ──
  const totalUnidade = new Map<string, number>();
  const totalEquipe = new Map<string, number>();
  const totalEqMicro = new Map<string, number>();
  const citoUnidade = new Map<string, number>();
  const citoEquipe = new Map<string, number>();
  const citoEqMicro = new Map<string, number>();

  // filterData (cascata unidade → equipe → microárea)
  const unidadesSet = new Set<string>();
  const equipesMap = new Map<string, Set<string>>();
  const microMap = new Map<string, Set<number>>();
  const totais: Record<string, number> = {};

  let totalGeral = 0;
  let semCitoGeral = 0;

  for (const r of rows) {
    const u = r.unidade || "Não informado";
    const e = r.equipe || "Não informado";
    const m = r.microarea;
    const label = `${e} / Microárea ${m}`;

    addTo(totalUnidade, u, r.total);
    addTo(totalEquipe, e, r.total);
    addTo(totalEqMicro, label, r.total);
    addTo(citoUnidade, u, r.semcito);
    addTo(citoEquipe, e, r.semcito);
    addTo(citoEqMicro, label, r.semcito);
    totalGeral += r.total;
    semCitoGeral += r.semcito;

    unidadesSet.add(u);
    if (!equipesMap.has(u)) equipesMap.set(u, new Set());
    equipesMap.get(u)!.add(e);
    const key = `${u}|${e}`;
    if (!microMap.has(key)) microMap.set(key, new Set());
    microMap.get(key)!.add(m);
    totais[key] = (totais[key] ?? 0) + r.total;
    totais[`${key}|${m}`] = r.total;
  }

  const total: EstatisticasData = {
    totalGeral,
    porEquipe: toBuckets(totalEquipe),
    porUnidade: toBuckets(totalUnidade),
    porEquipeMicroarea: toBuckets(totalEqMicro),
  };

  const semCito: EstatisticasData = {
    totalGeral: semCitoGeral,
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
