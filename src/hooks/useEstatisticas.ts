import { useState, useEffect, useCallback } from "react";
import type { BucketCount, EstatisticasData, EstatisticasTab, FilterData } from "@/types/amarcap53";

// UMA única view consolidada: devolve `total` E `semcito` agrupados por
// unidade+equipe+microárea. Todas as dimensões exibidas no frontend são
// derivadas destas mesmas linhas no cliente — 1 request no lugar de 3.
// A view é servida pelo covering index idx_am53_ue_micro_rast e a leitura
// usa skipTotal=1 (evita o COUNT(*) duplicado que o PocketBase faria).
const VIEW_CONSOLIDADO = "v_am53_consolidado";
// Mesma estrutura do consolidado, filtrada no servidor por dna_hpv_gal de out/2026.
const VIEW_OUTUBRO_ROSA = "v_am53_outubro_rosa";

interface ViewConsolidadoRecord {
  id: string;
  unidade: string;
  equipe: string;
  microarea: number;
  total: number;
  semcito: number;
}

const CACHE_KEY = "amarcap53_views_v14";
const CACHE_TTL = 30 * 60 * 1000; // 30 min

interface CacheEntry {
  total: EstatisticasData;
  semCito: EstatisticasData;
  outubroRosa: EstatisticasData;
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
async function fetchAllViews(): Promise<{ total: EstatisticasData; semCito: EstatisticasData; outubroRosa: EstatisticasData; filterData: FilterData }> {
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

  const load = (t: string, viewName: string) =>
    fetchView<ViewConsolidadoRecord>(apiBase, { Authorization: t }, viewName);

  let rows: ViewConsolidadoRecord[] = [];
  let octRows: ViewConsolidadoRecord[] = [];
  try {
    [rows, octRows] = await Promise.all([
      load(token, VIEW_CONSOLIDADO),
      load(token, VIEW_OUTUBRO_ROSA),
    ]);
  } catch {
    // token provavelmente expirado (401) — tenta re-auth abaixo
  }

  // Se a view voltou vazia/erro, o token pode ter expirado → re-auth
  if (rows.length === 0) {
    try { localStorage.removeItem(AUTH_CACHE_KEY); } catch { /* ignore */ }
    try {
      const token2 = await authRequest(apiBase, login, password);
      cacheToken(token2);
      rows = await load(token2, VIEW_CONSOLIDADO);
      octRows = await load(token2, VIEW_OUTUBRO_ROSA);
    } catch {
      // sem token válido: propaga para a UI (não cai no cache vazio)
      throw new Error("Falha ao autenticar no servidor de dados");
    }
  }

  // ── Todas as dimensões derivam das MESMAS linhas ──
  const unidadesSet = new Set<string>();
  const equipesMap = new Map<string, Set<string>>();
  const microMap = new Map<string, Set<number>>();
  const totais: Record<string, number> = {};

  for (const r of rows) {
    const u = r.unidade || "Não informado";
    const e = r.equipe || "Não informado";
    const m = r.microarea;

    unidadesSet.add(u);
    if (!equipesMap.has(u)) equipesMap.set(u, new Set());
    equipesMap.get(u)!.add(e);
    const key = `${u}|${e}`;
    if (!microMap.has(key)) microMap.set(key, new Set());
    microMap.get(key)!.add(m);
    totais[key] = (totais[key] ?? 0) + r.total;
    totais[`${key}|${m}`] = r.total;
  }

  // Agrega as dimensões exibidas a partir de uma coluna da view.
  function aggregate(src: ViewConsolidadoRecord[], field: "total" | "semcito"): EstatisticasData {
    const porUnidade = new Map<string, number>();
    const porEquipe = new Map<string, number>();
    const porEqMicro = new Map<string, number>();
    let geral = 0;

    for (const r of src) {
      const u = r.unidade || "Não informado";
      const e = r.equipe || "Não informado";
      const v = r[field];
      addTo(porUnidade, u, v);
      addTo(porEquipe, e, v);
      addTo(porEqMicro, `${e} / Microárea ${r.microarea}`, v);
      geral += v;
    }

    return {
      totalGeral: geral,
      porEquipe: toBuckets(porEquipe),
      porUnidade: toBuckets(porUnidade),
      porEquipeMicroarea: toBuckets(porEqMicro),
    };
  }

  const total = aggregate(rows, "total");
  const semCito = aggregate(rows, "semcito");
  // Outubro Rosa: cópia do "Sem Cito", porém da view restrita a out/2026.
  const outubroRosa = aggregate(octRows, "semcito");

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

  return { total, semCito, outubroRosa, filterData };
}

export function useEstatisticas() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalStats, setTotalStats] = useState<EstatisticasData | null>(null);
  const [semCitoStats, setSemCitoStats] = useState<EstatisticasData | null>(null);
  const [outubroRosaStats, setOutubroRosaStats] = useState<EstatisticasData | null>(null);
  const [filterData, setFilterData] = useState<FilterData | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);

    if (!forceRefresh) {
      const cached = loadCache();
      if (cached) {
        setTotalStats(cached.total);
        setSemCitoStats(cached.semCito);
        setOutubroRosaStats(cached.outubroRosa);
        setFilterData(cached.filterData);
        setLoading(false);
        return;
      }
    }

    try {
      const { total, semCito, outubroRosa, filterData: fd } = await fetchAllViews();
      setTotalStats(total);
      setSemCitoStats(semCito);
      setOutubroRosaStats(outubroRosa);
      setFilterData(fd);
      saveCache({ total, semCito, outubroRosa, filterData: fd, timestamp: Date.now() });
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
    (type: EstatisticasTab): EstatisticasData => {
      const empty: EstatisticasData = { totalGeral: 0, porEquipe: [], porUnidade: [], porEquipeMicroarea: [] };
      if (type === "total") return totalStats ?? empty;
      if (type === "outubro_rosa") return outubroRosaStats ?? empty;
      return semCitoStats ?? empty;
    },
    [totalStats, semCitoStats, outubroRosaStats],
  );

  const emptyFilter: FilterData = { unidades: [], equipes: {}, microareas: {}, totais: {} };

  return { loading, error, getStats, filterData: filterData ?? emptyFilter, refetch: () => fetchData(true) };
}
