const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";
const POCKETBASE_LOGIN = import.meta.env.VITE_POCKETBASE_LOGIN || "";
const POCKETBASE_PASSWORD = import.meta.env.VITE_POCKETBASE_PASSWORD || "";

// Cache de token compartilhado com o hook useEstatisticas (MESMA chave e shape).
// Assim, quem autentica primeiro serve o token para o outro — evitando uma
// segunda autenticação (round-trip) no mesmo carregamento de página.
const AUTH_CACHE_KEY = "amarcap53_pb_auth";
const AUTH_TTL_MS = 25 * 60 * 1000; // 25 min

function readCachedToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; expires?: number };
    if (parsed?.token && parsed?.expires && Date.now() < parsed.expires) {
      return parsed.token;
    }
  } catch { /* storage indisponível */ }
  return null;
}

function writeCachedToken(token: string): void {
  try {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ token, expires: Date.now() + AUTH_TTL_MS }));
  } catch { /* quota/indisponível */ }
}

function clearCachedToken(): void {
  try { localStorage.removeItem(AUTH_CACHE_KEY); } catch { /* ignore */ }
}

interface PocketBaseResponse<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

interface PocketBaseRecord {
  id: string;
  created: string;
  updated: string;
  collectionId: string;
  collectionName: string;
}

interface AuthResponse {
  token: string;
  record: {
    id: string;
    collectionId: string;
    collectionName: string;
    [key: string]: string;
  };
}

export interface QueryParams {
  page?: number;
  perPage?: number;
  sort?: string;
  filter?: string;
  fields?: string;
  expand?: string;
  requestKey?: string | null;
}

class PocketBaseClient {
  private baseUrl: string;
  private token: string | null = null;
  private authPromise: Promise<void> | null = null;

  constructor(url: string) {
    this.baseUrl = url;
  }

  private async ensureAuth(): Promise<void> {
    if (this.token) return;
    // Reaproveita o token já autenticado (ex.: pelo useEstatisticas) antes de
    // disparar uma nova autenticação.
    const cached = readCachedToken();
    if (cached) {
      this.token = cached;
      return;
    }
    if (!this.authPromise) {
      this.authPromise = this.authenticate().catch((err) => {
        this.authPromise = null; // permite nova tentativa após falha
        throw err;
      });
    }
    await this.authPromise;
  }

  /** Limpa o token (memória + cache compartilhado) para forçar re-auth. */
  private resetAuth(): void {
    this.token = null;
    this.authPromise = null;
    clearCachedToken();
  }

  /** Executa a request autenticada; em 401 re-autentica UMA vez e repete. */
  private async fetchWithAuth(url: string, init: RequestInit): Promise<Response> {
    await this.ensureAuth();
    const doFetch = () =>
      fetch(url, {
        ...init,
        headers: { ...((init.headers as Record<string, string>) ?? {}), ...this.authHeaders() },
      });

    let response = await doFetch();
    if (response.status === 401) {
      this.resetAuth();
      await this.ensureAuth();
      response = await doFetch();
    }
    return response;
  }

  private async authenticate(): Promise<void> {
    if (!POCKETBASE_LOGIN || !POCKETBASE_PASSWORD) {
      throw new Error("PocketBase credentials not configured in .env");
    }

    const url = `${this.baseUrl}/api/collections/_superusers/auth-with-password`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identity: POCKETBASE_LOGIN,
        password: POCKETBASE_PASSWORD,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`PocketBase auth failed: ${response.status} ${JSON.stringify(error)}`);
    }

    const data = (await response.json()) as AuthResponse;
    this.token = data.token;
    writeCachedToken(data.token);
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      headers["Authorization"] = this.token;
    }
    return headers;
  }

  private buildUrl(basePath: string, params: QueryParams): string {
    const searchParams = new URLSearchParams();

    if (params.page && params.page > 1) searchParams.set("page", String(params.page));
    if (params.perPage) searchParams.set("perPage", String(params.perPage));
    if (params.sort) searchParams.set("sort", params.sort);
    if (params.filter) searchParams.set("filter", params.filter);
    if (params.fields) searchParams.set("fields", params.fields);
    if (params.expand) searchParams.set("expand", params.expand);

    const qs = searchParams.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  async getList<T extends PocketBaseRecord>(
    collection: string,
    params: QueryParams = {},
  ): Promise<PocketBaseResponse<T>> {
    const perPage = Math.min(params.perPage ?? 30, 300);
    const page = params.page ?? 1;
    const basePath = `${this.baseUrl}/api/collections/${collection}/records`;
    const url = this.buildUrl(basePath, { ...params, page, perPage });

    const response = await this.fetchWithAuth(url, { method: "GET" });

    if (!response.ok) {
      const body = await response.text().catch(() => "no body");
      console.error(`[PocketBase] ${response.status} on ${url}`, body);
      throw new Error(`PocketBase error: ${response.status} ${response.statusText} — ${body}`);
    }

    return response.json() as Promise<PocketBaseResponse<T>>;
  }

  async getOne<T extends PocketBaseRecord>(
    collection: string,
    id: string,
    params: { expand?: string; fields?: string } = {},
  ): Promise<T> {
    const basePath = `${this.baseUrl}/api/collections/${collection}/records/${id}`;
    const url = this.buildUrl(basePath, params);

    const response = await this.fetchWithAuth(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`PocketBase error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async create<T extends PocketBaseRecord>(
    collection: string,
    data: Partial<Omit<T, "id" | "created" | "updated" | "collectionId" | "collectionName">>,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/collections/${collection}/records`;

    const response = await this.fetchWithAuth(url, {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`PocketBase error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async update<T extends PocketBaseRecord>(
    collection: string,
    id: string,
    data: Partial<Omit<T, "id" | "created" | "updated" | "collectionId" | "collectionName">>,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/collections/${collection}/records/${id}`;

    const response = await this.fetchWithAuth(url, {
      method: "PATCH",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`PocketBase error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async delete(collection: string, id: string): Promise<boolean> {
    const url = `${this.baseUrl}/api/collections/${collection}/records/${id}`;

    const response = await this.fetchWithAuth(url, { method: "DELETE" });

    if (!response.ok) {
      throw new Error(`PocketBase error: ${response.status} ${response.statusText}`);
    }

    return true;
  }

  /**
   * Busca todos os registros com requests paralelos em batches.
   */
  async getFullList<T extends PocketBaseRecord>(
    collection: string,
    params: Omit<QueryParams, "page" | "perPage"> & {
      batchSize?: number;
      concurrency?: number;
    } = {},
  ): Promise<T[]> {
    await this.ensureAuth();

    const batchSize = params.batchSize ?? 300;
    const concurrency = params.concurrency ?? 10;

    // Extrair apenas campos válidos de query
    const { batchSize: _bs, concurrency: _cc, ...validParams } = params;

    // Primeiro request
    const firstPage = await this.getList<T>(collection, { ...validParams, page: 1, perPage: batchSize });
    const totalPages = firstPage.totalPages;

    if (totalPages <= 1) return firstPage.items;

    const allItems: T[] = [...firstPage.items];

    const remainingPages: number[] = [];
    for (let p = 2; p <= totalPages; p++) {
      remainingPages.push(p);
    }

    for (let i = 0; i < remainingPages.length; i += concurrency) {
      const chunk = remainingPages.slice(i, i + concurrency);
      const results = await Promise.all(
        chunk.map((p) =>
          this.getList<T>(collection, { ...validParams, page: p, perPage: batchSize }),
        ),
      );
      for (const result of results) {
        allItems.push(...result.items);
      }
    }

    return allItems;
  }
}

export const pb = new PocketBaseClient(POCKETBASE_URL);
