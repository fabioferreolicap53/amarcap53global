const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";
const POCKETBASE_LOGIN = import.meta.env.VITE_POCKETBASE_LOGIN || "";
const POCKETBASE_PASSWORD = import.meta.env.VITE_POCKETBASE_PASSWORD || "";

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
    if (!this.authPromise) {
      this.authPromise = this.authenticate();
    }
    await this.authPromise;
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
    await this.ensureAuth();
    const perPage = Math.min(params.perPage ?? 30, 300);
    const page = params.page ?? 1;
    const basePath = `${this.baseUrl}/api/collections/${collection}/records`;
    const url = this.buildUrl(basePath, { ...params, page, perPage });

    const response = await fetch(url, {
      method: "GET",
      headers: this.authHeaders(),
    });

    if (response.status === 401) {
      this.token = null;
      this.authPromise = null;
      await this.ensureAuth();
      const retry = await fetch(url, {
        method: "GET",
        headers: this.authHeaders(),
      });
      if (!retry.ok) {
        throw new Error(`PocketBase error: ${retry.status} ${retry.statusText}`);
      }
      return retry.json() as Promise<PocketBaseResponse<T>>;
    }

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
    await this.ensureAuth();
    const basePath = `${this.baseUrl}/api/collections/${collection}/records/${id}`;
    const url = this.buildUrl(basePath, params);

    const response = await fetch(url, {
      method: "GET",
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`PocketBase error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async create<T extends PocketBaseRecord>(
    collection: string,
    data: Partial<Omit<T, "id" | "created" | "updated" | "collectionId" | "collectionName">>,
  ): Promise<T> {
    await this.ensureAuth();
    const url = `${this.baseUrl}/api/collections/${collection}/records`;

    const response = await fetch(url, {
      method: "POST",
      headers: this.authHeaders(),
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
    await this.ensureAuth();
    const url = `${this.baseUrl}/api/collections/${collection}/records/${id}`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: this.authHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`PocketBase error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async delete(collection: string, id: string): Promise<boolean> {
    await this.ensureAuth();
    const url = `${this.baseUrl}/api/collections/${collection}/records/${id}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.authHeaders(),
    });

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
