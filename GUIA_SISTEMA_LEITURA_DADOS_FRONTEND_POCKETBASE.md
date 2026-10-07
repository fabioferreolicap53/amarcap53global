# GUIA — Sistema de Leitura de Dados para o Frontend (PocketBase)

> **Objetivo:** documentar, de ponta a ponta, o sistema de **leitura/consulta de dados no frontend** da coleção `amarcap53_pacientes` (React + TypeScript + PocketBase), validado em produção com **~130.000 pacientes** e **~5.000 acompanhamentos**, para que você possa **replicar o mesmo padrão em outros projetos futuros**.
>
> **Escopo:** apenas *leitura* de dados (listagem, busca, filtros, paginação, cache, índices). Escrita/importação/exclusão têm guias próprios (`GUIA_SISTEMA_IMPORTACAO_DADOS_POCKETBASE.md`, `GUIA_SISTEMA_EXCLUSAO_DADOS_POCKETBASE.md`).
>
> **Stack de referência:** React 19 + TypeScript + Vite + Tailwind CSS v4 + PocketBase JS SDK + Cloudflare Pages.
>
> **Servidor de referência:** VM Oracle Cloud com **1 GB de RAM** rodando PocketBase (limitado — por isso toda a arquitetura evita `getFullList` pesado).

---

## ÍNDICE

1. [Visão geral da arquitetura](#1-visão-geral-da-arquitetura)
2. [Regra de ouro: nunca baixar a coleção inteira](#2-regra-de-ouro-nunca-baixar-a-coleção-inteira)
3. [Instância do PocketBase + interceptor de sessão](#3-instância-do-pocketbase--interceptor-de-sessão)
4. [Helpers de normalização e filtros regionais](#4-helpers-de-normalização-e-filtros-regionais)
5. [Schema da coleção e tipagem TypeScript](#5-schema-da-coleção-e-tipagem-typescript)
6. [Índices obrigatórios (migrations + SQL)](#6-índices-obrigatórios-migrations--sql)
7. [Arquitetura de filtros em camadas](#7-arquitetura-de-filtros-em-camadas)
8. [Filtros server-side compostos (status, SIM/NÃO, grupo, busca)](#8-filtros-server-side-compostos-status-simnão-grupo-busca)
9. [Cross-collection filter + limite de cláusulas OR](#9-cross-collection-filter--limite-de-cláusulas-or)
10. [Busca ativa — filtro client-side com `Set`](#10-busca-ativa--filtro-client-side-com-set)
11. [Acompanhamentos em paralelo + contadores](#11-acompanhamentos-em-paralelo--contadores)
12. [Race guards e estados de carregamento](#12-race-guards-e-estados-de-carregamento)
13. [Cache local (localStorage) e `pendingFilter`](#13-cache-local-localstorage-e-pendingfilter)
14. [Debounce da busca](#14-debounce-da-busca)
15. [Regra de negócio: `determinarAlerta`](#15-regra-de-negócio-determinaralerta)
16. [Paginação e reset de página](#16-paginação-e-reset-de-página)
17. [Métricas de performance (LIKE vs índice)](#17-métricas-de-performance-like-vs-índice)
18. [Checklist de implementação em novo projeto](#18-checklist-de-implementação-em-novo-projeto)
19. [Erros comuns e como evitar](#19-erros-comuns-e-como-evitar)

---

## 1. Visão geral da arquitetura

O sistema é um fluxo de **3 camadas de filtro** que monta **UMA string de filtro** do PocketBase, sempre paginada no servidor, com **até 3 consultas**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        fetchPacientes() (useEffect)                 │
│                                                                     │
│  CAMADA 1 — Role-based scope (usuário)                              │
│    Admin         → sem restrição regional                           │
│    unidade       → unidade = [user.unidade_saude]                    │
│    equipe        → unidade + equipe                                 │
│    microarea     → unidade + equipe + microarea                     │
│                                                                     │
│  CAMADA 2 — UI filters (o que o usuário escolheu na tela)           │
│    unidade / equipe / microarea / grupo / status / exames SIM-NÃO    │
│                                                                     │
│  CAMADA 3 — Search (nome ou CNS) + filtros cross-collection         │
│    searchTerm → nome ~ x || cns ~ x                                 │
│    filtros de acompanhamento → cruza amarcap53_acompanhamentos       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              filterParts.join(' && ')  →  options.filter
                              │
                              ▼
   ┌──────────────────────┴───────────────────────┐
   ▼                                               ▼
[Q1] getList(pagina, pageSize, options)     [Q2] getFullList(acompanhamentos)
     → 10-500 registros por vez                    filtrado por paciente dos
     → totalItems real do servidor                 ids da página atual
                                                   → countMap + lastAcompMap
```

**Princípios-chave:**

| Princípio | Motivo |
|---|---|
| Sempre **paginado** (`getList`) na coleção grande | Servidor de 1 GB não aguenta `getFullList` em 130K |
| Filtro regional por **igualdade normalizada** (`=`) | Usa índice B-tree (~60ms) em vez de LIKE (~6-16s) |
| Cross-collection por **relação aninhada** (`paciente.campo`) sempre que possível | Evita baixar todos os IDs de pacientes |
| Conjuntos grandes de IDs → **client-side com `Set`** | O OR de centenas de `id = "..."` estoura o limite → HTTP 400 |
| **Race guards** (`cancelled`, `fetchVersionRef`) | Evita que fetch antigo sobrescreva/feche loading do novo |
| **Cache localStorage** com TTL | Primeira renderização instantânea e menos carga no servidor |
| **Debounce** na busca | Não dispara request por tecla digitada |

---

## 2. Regra de ouro: nunca baixar a coleção inteira

**Sintoma do anti-padrão:** a tela demora, a lista aparece "zerada" ou o servidor devolve **500 / timeout**.

**Causa:** chamar `pb.collection('...').getFullList()` numa coleção de dezenas/centenas de milhares e **filtrar no client**. Um servidor com 1 GB de RAM não consegue materializar tudo isso em memória.

**Regra:**

- Coleção grande (a "principal", ex. `amarcap53_pacientes`) → **somente `getList(pagina, pageSize, options)`**.
- Coleções pequenas/médias (ex. `amarcap53_acompanhamentos` com ~5K) → `getFullList` é aceitável, **desde que com `filter`** restringindo o resultado.
- Se precisar filtrar a coleção grande por um conjunto de IDs de outra coleção → use **relação aninhada** (`paciente.campo`) ou **client-side com `Set`** (nunca OR gigante de `id =`).

---

## 3. Instância do PocketBase + interceptor de sessão

**Arquivo:** `src/lib/pocketbase.ts`

```ts
/// <reference types="vite/client" />
import PocketBase from 'pocketbase';

// URL configurável por ambiente (.env → VITE_POCKETBASE_URL)
const pocketbaseUrl = import.meta.env.VITE_POCKETBASE_URL || 'https://SEU-DOMINIO';
export const pb = new PocketBase(pocketbaseUrl);

// (1) Desativa auto-cancelamento de requisições duplicadas.
// Recomendado em React: o StrictMode monta efeitos 2x em dev e o SDK
// cancelaria a segunda request pensando ser duplicata.
pb.autoCancellation(false);

// (2) Interceptor global de resposta.
// Se a sessão expirou/é inválida (401, ou 400 no /auth-refresh), limpa o
// authStore. Sem isso, as telas continuam montadas exibindo listas vazias
// ("sistema zerado") em vez de mandar o usuário para o login.
pb.afterSend = (response, data) => {
  const url = response.url || '';
  const isAuthFailure =
    response.status === 401 ||
    (response.status === 400 && url.indexOf('/auth-refresh') !== -1);

  if (isAuthFailure && pb.authStore.token) {
    console.warn('[pb] Sessão expirada ou inválida. Redirecionando para o login.');
    pb.authStore.clear(); // o AuthContext observa isso e desmonta as telas
  }

  return data;
};
```

**Variáveis de ambiente (`.env`):**

```env
VITE_POCKETBASE_URL=https://centraldedados.dev.br
```

> **Importantíssimo:** `pb.autoCancellation(false)` **não** basta para evitar races dentro da tela. Sempre passe `requestKey: null` nas opções de cada request para desativar o dedupe por chave (senão duas queries com o mesmo filtro podem ser canceladas entre si).
>
> O `AuthContext` deve assinar `pb.authStore.onChange(...)`. Quando o interceptor faz `authStore.clear()`, o contexto percebe o `token` vazio e desmonta as telas protegidas (voltando ao login).

---

## 4. Helpers de normalização e filtros regionais

**Arquivo:** `src/lib/equipeAliases.ts` — este é o **coração da performance regional**.

### 4.1 O problema que ele resolve

- O banco guarda `unidade`/`equipe` **normalizadas sem acento** e com o mesmo texto da UI (inclui sufixo `"AP 53"`). Ex.: UI `"PARQUE SÃO PAULO"` ↔ banco `"SAO PAULO"`.
- `unidade ~ "X%Y%"` vira `LIKE '%X%Y%'` no SQLite → **FULL SCAN** em 130K (~6-16s).
- Igualdade exata (`unidade = "X"`) → **índice B-tree** (~60ms).

### 4.2 Código completo (copiar/colar)

```ts
// ---------- Normalização de texto ----------

export const stripAccents = (v: unknown): string =>
  String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Chave canônica: sem acento, MAIÚSCULO, espaços simples
export const normalizeEquipeKey = (v: unknown): string =>
  stripAccents(v).toUpperCase().replace(/\s+/g, ' ').trim();

// Escapa valor para dentro de uma string do filtro PocketBase
const escapeFilterValue = (v: string): string =>
  v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// ---------- Aliases de equipe ----------
// Chave = nome normalizado. Valor = nomes equivalentes que existem no banco.
const EQUIPE_ALIASES: Record<string, string[]> = {
  'PARQUE SAO PAULO': ['SAO PAULO'],
  // Adicione aqui todos os pares UI ↔ banco do seu projeto
};

export const getEquipeAliases = (equipe: unknown): string[] => {
  const key = normalizeEquipeKey(equipe);
  if (!key) return [];
  const aliases = EQUIPE_ALIASES[key] || [];
  const all = [String(equipe ?? ''), key, ...aliases];
  const seen = new Set<string>();
  return all.filter((v) => {
    const t = normalizeEquipeKey(v);
    if (!t || seen.has(t)) return false;
    seen.add(t);
    return true;
  });
};

// ---------- Igualdade normalizada (USA ÍNDICE) ----------

// Equipe: gera `equipe = "TOPAZIO"` (e variantes de alias).
// `prefix` permite relação aninhada, ex. "paciente." → `paciente.equipe = "..."`.
export const buildEquipeDbEqualityClause = (values: string[], prefix = ''): string => {
  const clauses = new Set<string>();
  values.forEach((v) => {
    getEquipeAliases(v).forEach((alias) => {
      const norm = normalizeEquipeKey(alias);
      if (norm) clauses.add(`${prefix}equipe = "${escapeFilterValue(norm)}"`);
    });
  });
  const parts = [...clauses];
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `(${parts.join(' || ')})`;
};

// Unidade: mesma ideia, usa índice idx_regional.
export const buildUnidadeDbEqualityClause = (values: string[], prefix = ''): string => {
  const parts = [...new Set(
    values
      .map((v) => normalizeEquipeKey(v))
      .filter(Boolean)
      .map((norm) => `${prefix}unidade = "${escapeFilterValue(norm)}"`)
  )];
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `(${parts.join(' || ')})`;
};

// ---------- Cláusula regional completa ----------
// Junta unidade + equipe + microarea com `&&`.
// Aceita listas (filtros UI) OU valores unitários (escopo do usuário).
// `prefix` reaproveita a MESMA cláusula em coleções que referenciam o paciente:
//   prefix: 'paciente.'  →  filtra amarcap53_acompanhamentos pela região do
//   paciente SEM baixar todos os IDs de pacientes antes.
export const buildRegionalPatientFilter = (opts: {
  unidades?: string[];
  equipes?: string[];
  microareas?: (string | number)[];
  prefix?: string;
}): string => {
  const prefix = opts.prefix || '';
  const clauses: string[] = [];
  if (opts.unidades && opts.unidades.length > 0) {
    const c = buildUnidadeDbEqualityClause(opts.unidades, prefix);
    if (c) clauses.push(c);
  }
  if (opts.equipes && opts.equipes.length > 0) {
    const c = buildEquipeDbEqualityClause(opts.equipes, prefix);
    if (c) clauses.push(c);
  }
  if (opts.microareas && opts.microareas.length > 0) {
    const ma = opts.microareas
      .map((m) => Number(m))
      .filter((n) => Number.isFinite(n))
      .map((n) => `${prefix}microarea = ${n}`);
    if (ma.length > 0) clauses.push(`(${ma.join(' || ')})`);
  }
  return clauses.join(' && ');
};
```

### 4.3 Exemplo de saída

```ts
buildRegionalPatientFilter({
  unidades: ['SMS CF EDSON ABDALLA SAAD AP 53'],
  equipes: ['TOPÁZIO'],
  microareas: [3],
});
// → 'unidade = "SMS CF EDSON ABDALLA SAAD AP 53" && equipe = "TOPAZIO" && (microarea = 3)'

buildRegionalPatientFilter({
  unidades: ['SMS CF EDSON ABDALLA SAAD AP 53'],
  prefix: 'paciente.',
});
// → 'paciente.unidade = "SMS CF EDSON ABDALLA SAAD AP 53"'
```

### 4.4 Abreviação de unidade para exibição (opcional)

Para telas estreitas (mobile/tablet), remova prefixos/sufixos repetidos do banco (`SMS`, `AP 53`) sem tocar no valor de filtro:

```ts
const UNIDADE_CURTAS: Record<string, string> = {
  'SMS CF EDSON ABDALLA SAAD AP 53': 'CF EDSON ABDALLA SAAD',
  // ...
};

export const getShortUnidade = (unidade: unknown): string => {
  const raw = String(unidade ?? '').trim();
  if (!raw || raw === '--') return raw || '--';
  const normalized = normalizeEquipeKey(raw);
  if (UNIDADE_CURTAS[normalized]) return UNIDADE_CURTAS[normalized];
  return normalized.replace(/^SMS\s+/, '').replace(/\s+AP\s+53$/, '').trim() || raw;
};
```

---

## 5. Schema da coleção e tipagem TypeScript

Coleção de referência: **`amarcap53_pacientes`** (tipo `base`, ~130K registros).

| Campo | Tipo PocketBase | Uso no frontend |
|---|---|---|
| `nome` | `text` | exibição, busca (`~`), ordenação |
| `cns` | `text` | exibição, busca (`~`), vínculo com acompanhamentos |
| `data_nascimento` | `date` | cálculo de idade |
| `dna_hpv_pep` | `date` | status PEP_MOLECULAR (editável) |
| `dna_hpv_gal` | `date` | status COLETA_MOLECULAR |
| `cito_pep` | `date` | status PEP_CITO |
| `cito_lab` | `date` | status COLETA_CITO |
| `unidade` | `text` | escopo regional |
| `equipe` | `text` | escopo regional |
| `microarea` | `number` | escopo regional |
| `idade` | `number` | ordenação |
| `grupo` | `text` | filtro |
| `unidade_solicitante` | `text` | exibição |
| `alertas_rastreamento` | `text` | exibição |

**Regras de acesso (listRule/viewRule):** mínimo `@request.auth.id != ""` (exige login). Se o escopo regional for aplicado só no front, considere reforçar na rule do servidor usando `@request.auth.unidade_saude` etc. — mas atenções: o *front* aqui é quem garante o recorte por role.

**Tipagem da interface no frontend:**

```ts
interface Paciente {
  id: string;
  unidade?: string;
  equipe?: string;
  microarea?: number;
  nome: string;
  cns: string;
  data_nascimento: string;
  idade: number;
  grupo: string;
  cito_lab?: string;      // data
  cito_pep?: string;      // data
  dna_hpv_gal?: string;   // data
  dna_hpv_pep?: string;   // data (editável)
  unidade_solicitante?: string;
  alertas_rastreamento?: string;
  alertas?: string;               // calculado no client
  total_acompanhamentos?: number; // calculado no client
  isFavorite?: boolean;
  lastAcomp?: any;                // último acompanhamento
}
```

> **Por que normalizar no client:** `getList` devolve `RecordModel` cru (`any`). Faz-se o *map* para `Paciente`, aplicando defaults (`|| '--'`), formato de data e campos calculados (`idade`, `alertas`, `total_acompanhamentos`, `lastAcomp`).

---

## 6. Índices obrigatórios (migrations + SQL)

Sem índice, todo filtro por igualdade vira full scan → a tela "trava". **Crie os índices antes de subir filtros para produção.**

### 6.1 Índices na coleção principal (`amarcap53_pacientes`)

| Nome | Campos | Cobre qual filtro |
|---|---|---|
| `idx_rastreamento` | `dna_hpv_pep, dna_hpv_gal, cito_pep, cito_lab` | filtros de status de exame |
| `idx_regional` | `unidade, equipe, microarea` | escopo regional (role + UI) |
| `idx_nome` | `nome` | ordenação + `nome ~ x` |
| `idx_cns` | `cns` | busca por CNS, relink |
| `idx_grupo` | `grupo` | filtro de grupo |
| `idx_regional_rastreamento` | `unidade, equipe, dna_hpv_pep, dna_hpv_gal, cito_pep, cito_lab` | regional + status combinados |

Na coleção de acompanhamentos (`amarcap53_acompanhamentos`):

| Nome | Campos | Cobre |
|---|---|---|
| `idx_acomp_paciente` | `paciente` (relação) | `paciente = "id"` / `paciente.campo` |
| `idx_acomp_cns` | `cns` | cruzamento por CNS |
| `idx_pacientes_cns` | `cns` (em pacientes, se não tiver `idx_cns`) | relink |

### 6.2 Migration PocketBase (idempotente)

**Arquivo:** `pb_migrations/<timestamp>_create_indexes.js`

```js
/**
 * @param {import('pocketbase').PocketBase} pb
 */
export async function up(pb) {
  const collection = await pb.collections.getOne('amarcap53_pacientes');

  const existingIndexes = (collection.indexes || []).map(idx => idx.name);

  const newIndexes = [
    { name: 'idx_rastreamento',          fields: ['dna_hpv_pep', 'dna_hpv_gal', 'cito_pep', 'cito_lab'] },
    { name: 'idx_regional',              fields: ['unidade', 'equipe', 'microarea'] },
    { name: 'idx_nome',                  fields: ['nome'] },
    { name: 'idx_cns',                   fields: ['cns'] },
    { name: 'idx_grupo',                 fields: ['grupo'] },
    { name: 'idx_regional_rastreamento', fields: ['unidade', 'equipe', 'dna_hpv_pep', 'dna_hpv_gal', 'cito_pep', 'cito_lab'] },
  ];

  const indexesToAdd = newIndexes.filter(idx => !existingIndexes.includes(idx.name));

  if (indexesToAdd.length > 0) {
    await pb.collections.update('amarcap53_pacientes', {
      indexes: [...(collection.indexes || []), ...indexesToAdd],
    });
    console.log(`[migration] ${indexesToAdd.length} indexes criados: ${indexesToAdd.map(i => i.name).join(', ')}`);
  } else {
    console.log('[migration] todos os índices já existem');
  }
}
```

> **Formato de índice no PocketBase (objeto):** `{ name, fields, unique?, where?, type? }`. O PocketBase gera o `CREATE INDEX ... (campos)` internamente. Se você usar **SQL cru** (formato string), o formato é `CREATE INDEX \`nome\` ON \`colecao\` (\`campo\`)`.

### 6.3 Script avulso (criar via API autenticada)

Quando não quiser rodar migration, use um script com superusuário:

**Arquivo:** `scripts/create-indexes.js`

```js
#!/usr/bin/env node
import PocketBase from 'pocketbase';

const PB_URL = 'https://SEU-DOMINIO';

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error('Uso: node scripts/create-indexes.js <email> <senha>');
    process.exit(1);
  }

  const pb = new PocketBase(PB_URL);
  await pb.collection('_superusers').authWithPassword(email, password);
  const token = pb.authStore.token;

  async function ensureIndex(collectionName, indexSql, checkStr) {
    const col = await pb.collections.getOne(collectionName);
    const existing = col.indexes || [];
    const exists = existing.some(i => typeof i === 'string' && i.includes(checkStr));
    if (exists) { console.log(`  ✓ ${checkStr} já existe`); return; }

    const resp = await fetch(`${PB_URL}/api/collections/${collectionName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify({ indexes: [...existing, indexSql] }),
    });
    const r = await resp.json();
    if (!resp.ok) console.error(`  ✗ Erro: ${r.message}`);
    else console.log(`  ✓ Criado`);
  }

  console.log('\n--- amarcap53_pacientes ---');
  await ensureIndex('amarcap53_pacientes',
    "CREATE INDEX `idx_cns` ON `amarcap53_pacientes` (`cns`)", 'cns');

  console.log('\n--- amarcap53_acompanhamentos ---');
  await ensureIndex('amarcap53_acompanhamentos',
    "CREATE INDEX `idx_acomp_paciente` ON `amarcap53_acompanhamentos` (`paciente`)", 'paciente');

  console.log('\nConcluído.');
}

main().catch(err => { console.error('Erro:', err?.message || err); process.exit(1); });
```

Uso:

```bash
node scripts/create-indexes.js admin@exemplo.com "SUA_SENHA"
```

### 6.4 Como verificar se o índice foi usado

No console admin do PocketBase (ou SQLite CLI):

```sql
-- Listar índices da tabela
SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'amarcap53_pacientes';

-- Confirmar plano de execução (deve dizer "USING INDEX ...", não "SCAN")
EXPLAIN QUERY PLAN
SELECT * FROM amarcap53_pacientes WHERE unidade = 'SMS CF EDSON ABDALLA SAAD AP 53';
```

---

## 7. Arquitetura de filtros em camadas

Todo o filtro é montado num **array `filterParts`** e unido no final. A ordem importa pouco para o SQL, mas ajuda na legibilidade e no debug.

```ts
const filterParts: string[] = [];

// ───────── CAMADA 1 — Escopo por role do usuário ─────────
if (!isAdmin && user) {
  const roleFilter = buildRegionalPatientFilter({
    unidades: [user.unidade_saude],
    equipes: user.role === 'unidade' ? [] : [user.equipe],
    microareas: user.role === 'microarea' ? [user.microarea] : [],
  });
  if (roleFilter) filterParts.push(roleFilter);
}
```

| `user.role` | Filtro aplicado |
|---|---|
| `admin` | *(sem restrição regional)* |
| `unidade` | `unidade = [user.unidade_saude]` |
| `equipe` | `unidade = [...] && equipe = [...]` |
| `microarea` | `unidade = [...] && equipe = [...] && microarea = N` |

```ts
// ───────── CAMADA 2 — Filtros de UI (regionais por igualdade) ─────────
const uiRegionalFilter = buildRegionalPatientFilter({
  unidades: filterUnidade,
  equipes: filterEquipe,
  microareas: filterMicroarea,
});
if (uiRegionalFilter) filterParts.push(uiRegionalFilter);
```

Se você tiver um filtro regional **composto** (regionais + status etc.), use um padrão de "filtros compostos" (seção 8).

```ts
// ───────── CAMADA 3 — Busca textual + filtros cross-collection ─────────
// (detalhados nas seções 8 e 9)

// Search server-side (mantém paginado mesmo em 130K)
if (searchTerm) {
  const safeSearch = searchTerm.replace(/"/g, '\\"');
  filterParts.push(`(nome ~ "${safeSearch}" || cns ~ "${safeSearch}")`);
}
```

```ts
// Finalização
const effectivePage = searchTerm ? 1 : currentPage; // busca sempre volta à pág. 1
const finalFilter = filterParts.join(' && ').trim();
const options: any = {
  sort: (sortField === 'idade' || sortField === 'alertas')
    ? 'nome'
    : (sortDir === 'desc' ? '-' + sortField : sortField),
};
if (finalFilter) options.filter = finalFilter;
```

**Observações críticas:**

- Ordenação por campos **calculados no client** (`idade`, `alertas`) não existe no PocketBase → cai para `nome`.
- `sort` decrescente = prefixo `-` (ex.: `-created`).
- Sempre adicione `requestKey: null` nas opções de linha (ver seção 3).

---

## 8. Filtros server-side compostos (status, SIM/NÃO, grupo, busca)

### 8.1 Filtro de grupo

```ts
if (filterGrupo.length > 0) {
  filterParts.push(
    `(${filterGrupo.map(g => `grupo = "${g.trim().replace(/\s+/g, ' ')}"`).join(' || ')})`
  );
}
```

### 8.2 Filtro de status de rastreamento (lógica de alerta)

Os campos `dna_hpv_pep`, `dna_hpv_gal`, `cito_pep`, `cito_lab` definem o **status**. A regra usa **exclusão em cascata** — cada status só conta quando os campos de maior prioridade estão vazios:

| Status | Campo "dono" | Condição server-side |
|---|---|---|
| `PEP_MOLECULAR` | `dna_hpv_pep` | `dna_hpv_pep != ""` |
| `COLETA_MOLECULAR` | `dna_hpv_gal` | `dna_hpv_gal != "" && dna_hpv_pep = ""` |
| `PEP_CITO` | `cito_pep` | `cito_pep != "" && dna_hpv_gal = "" && dna_hpv_pep = ""` |
| `COLETA_CITO` | `cito_lab` | `cito_lab != "" && cito_pep = "" && dna_hpv_gal = "" && dna_hpv_pep = ""` |
| `NAO_IDENTIFICADO` | nenhum | todos os 4 vazios/nulos |

```ts
if (filterStatus.length > 0) {
  const statusClauses: string[] = [];

  if (filterStatus.includes('PEP_MOLECULAR')) {
    statusClauses.push('dna_hpv_pep != ""');
  }
  if (filterStatus.includes('COLETA_MOLECULAR')) {
    statusClauses.push('dna_hpv_gal != "" && dna_hpv_pep = ""');
  }
  if (filterStatus.includes('PEP_CITO')) {
    statusClauses.push('cito_pep != "" && dna_hpv_gal = "" && dna_hpv_pep = ""');
  }
  if (filterStatus.includes('COLETA_CITO')) {
    statusClauses.push('cito_lab != "" && cito_pep = "" && dna_hpv_gal = "" && dna_hpv_pep = ""');
  }
  if (filterStatus.includes('NAO_IDENTIFICADO')) {
    statusClauses.push(
      '(dna_hpv_pep = null || dna_hpv_pep = "") && ' +
      '(dna_hpv_gal = null || dna_hpv_gal = "") && ' +
      '(cito_pep = null || cito_pep = "") && ' +
      '(cito_lab = null || cito_lab = "")'
    );
  }

  if (statusClauses.length > 0) {
    filterParts.push(`(${statusClauses.join(' || ')})`);
  }
}
```

> **Atenção:** o PocketBase trata campo `date` vazio como `""` **ou** `null` dependendo da versão/importação. Por isso a checagem de "vazio" em `NAO_IDENTIFICADO` testa **os dois** (`= null || = ""`). Nos demais, `!= ""` é suficiente porque data preenchida nunca é nula.

### 8.3 Filtros SIM/NÃO de exames

```ts
const simNaoFilter = (field: string, val: string) => {
  if (!val) return null;
  if (val === 'SIM') return `${field} != ""`;
  if (val === 'NÃO') return `${field} = ""`;
  return null;
};

[
  simNaoFilter('dna_hpv_pep', filterDnaHpvPep),
  simNaoFilter('cito_lab',   filterCitoLab),
  simNaoFilter('cito_pep',   filterCitoPep),
  simNaoFilter('dna_hpv_gal', filterDnaHpvGal),
].forEach(f => { if (f) filterParts.push(f); });
```

### 8.4 Filtros de valores com aliases (`buildSelectFilter`)

Quando o banco guarda **variações** do mesmo valor (ex.: `"1 - BUSCA ATIVA..."` vs `"BUSCA ATIVA..."` vs com/sem acento), use uma tabela de opções com aliases e gere um OR de todas as variantes (+ variante sem acento):

```ts
// src/constants/followUpOptions.ts (trecho)
export const buildSelectFilter = (
  fieldName: string,
  selectedValues: string[],
  options: SelectOption[],
  operator: '=' | '~' = '='
) => {
  const clauses = selectedValues.flatMap(value =>
    getSelectAliases(value, options).flatMap(alias => {
      const escaped = `${fieldName} ${operator} "${escapeFilterValue(alias)}"`;
      const stripped = normalizeAccents(alias);
      if (stripped !== alias) {
        return [escaped, `${fieldName} ${operator} "${escapeFilterValue(stripped)}"`];
      }
      return [escaped];
    })
  );
  return clauses.length > 0 ? `(${Array.from(new Set(clauses)).join(' || ')})` : '';
};
```

Uso:

```ts
if (filterTipoBusca.length > 0) {
  acompFilters.push(buildSelectFilter('tipo_busca', filterTipoBusca, TIPO_BUSCA_OPTIONS));
}
```

---

## 9. Cross-collection filter + limite de cláusulas OR

### 9.1 O cenário

Você quer listar **pacientes** mas filtrando por um campo que só existe em **acompanhamentos** (ex.: `tipo_busca`, `situacao_pos_busca`, `data_busca`, `entraves_identificados`).

### 9.2 Estratégia (a que funciona em escala)

1. Busca os acompanhamentos que casam o filtro (`getFullList` — coleção pequena).
2. Extrai os `paciente` (IDs) únicos.
3. **Cruza com o escopo regional** buscando só os IDs de pacientes da região (`fields: 'id'`) e filtrando via `Set`.
4. Aplica `id = "..." || id = "..."` na coleção de pacientes — **limitado a 150 IDs**.
5. Se nenhum ID sobrou, força resultado vazio com `id = "none"`.

```ts
const hasAcompFilter =
  filterTipoBusca.length > 0 || filterTipoContato.length > 0 ||
  filterSituacao.length > 0 || filterEntraves.length > 0 ||
  filterDataInicio || filterDataFim;

if (hasAcompFilter) {
  const acompFilters: string[] = [];

  if (filterTipoBusca.length > 0) {
    acompFilters.push(buildSelectFilter('tipo_busca', filterTipoBusca, TIPO_BUSCA_OPTIONS));
  }
  if (filterTipoContato.length > 0) {
    acompFilters.push(buildSelectFilter('tipo_contato', filterTipoContato, TIPO_CONTATO_OPTIONS));
  }
  if (filterSituacao.length > 0) {
    acompFilters.push(buildSelectFilter('situacao_pos_busca', filterSituacao, SITUACAO_POS_BUSCA_OPTIONS));
  }
  if (filterEntraves.length > 0) {
    // '~' (contains) precisa de escape de parênteses, que são sintaxe de grupo no filtro
    const escapedEntraves = filterEntraves.map(v => v.replace(/[()]/g, '\\$&'));
    acompFilters.push(`(${escapedEntraves.map(v => `entraves_identificados ~ "${v}"`).join(' || ')})`);
  }
  if (filterDataInicio) acompFilters.push(`data_busca >= "${filterDataInicio}"`);
  if (filterDataFim)    acompFilters.push(`data_busca <= "${filterDataFim} 23:59:59"`);

  let patientIds: string[] = [];
  try {
    // 1) acompanhamentos que casam
    const acompRecords = await pb.collection('amarcap53_acompanhamentos').getFullList({
      filter: acompFilters.length > 0 ? acompFilters.join(' && ') : undefined,
      fields: 'paciente',
      batch: 500,
      requestKey: null,
    });
    let acompPacIds = Array.from(new Set(acompRecords.map(r => r.paciente).filter(Boolean)));

    // 2) cruza com escopo regional (só IDs, via relação direta nos pacientes)
    if (patientRegionFilterParts.length > 0) {
      const regionPatients = await pb.collection('amarcap53_pacientes').getFullList({
        filter: patientRegionFilterParts.join(' && '),
        fields: 'id',
        batch: 500,
        requestKey: null,
      });
      const regionSet = new Set(regionPatients.map(p => p.id).filter(Boolean));
      acompPacIds = acompPacIds.filter(id => regionSet.has(id));
    }

    patientIds = acompPacIds;
  } catch { /* ignora — segue sem filtro de acompanhamento */ }

  if (patientIds.length > 0) {
    // 3) LIMITE DE CLÁUSULAS: PocketBase estoura (HTTP 400) com OR gigante.
    //    Limite prático seguro: ~150 ids.
    const safeIds = patientIds.slice(0, 150);
    filterParts.push(`(${safeIds.map(id => `id = "${id}"`).join(' || ')})`);
  } else if (acompFilters.length > 0) {
    // 4) nenhum resultado → força vazio
    filterParts.push('id = "none"');
  }
}
```

### 9.3 Alternativa preferível: relação aninhada

Sempre que a coleção filha **tiver relação** com o paciente, prefira filtrar a filha pela região do paciente **direto no servidor** — sem baixar IDs:

```ts
// Em vez de baixar pacientes e cruzar, filtra a confirmação pela região:
const acompRegionFilter = buildRegionalPatientFilter({
  unidades: [user.unidade_saude],
  equipes: [user.equipe],
  prefix: 'paciente.', // → paciente.unidade = "..." && paciente.equipe = "..."
});
// Filtro resultante: `paciente.unidade = "..." && paciente.equipe = "..."`
pb.collection('amarcap53_acompanhamentos').getList(1, 50, {
  filter: acompRegionFilter, requestKey: null,
});
```

**Regras para escolher:**

| Situação | Melhor abordagem |
|---|---|
| Coleção filha tem campo de relação com o paciente | **Relação aninhada** (`paciente.campo`) — 1 query |
| Coleção filha só tem CNS (texto), sem relação | Baixar IDs + `Set` client-side / OR limitado |
| Poucos IDs (< ~150) | OR de `id = "..."` |
| Muitos IDs (> ~150) | `Set` client-side ou `getList` paginado + filtro local |

---

## 10. Busca ativa — filtro client-side com `Set`

Quando o filtro exige separar pacientes **COM** vs **SEM** acompanhamento, o OR/AND de centenas de IDs estoura o limite. Solução: baixar **todos** os pacientes que casam os demais filtros (paginado, 500/vez), montar um `Set` de IDs com acompanhamento, e filtrar + paginar no client.

```ts
// 1) Monta o Set de IDs com "busca ativa" (exclui o sentinela de "sem busca ativa")
let buscaAtivaSet: Set<string> | null = null;
if (filterBuscaAtiva !== null) {
  try {
    const acompOpts: any = { fields: 'paciente,tipo_busca', requestKey: null, batch: 500 };
    const dateParts: string[] = [];
    dateParts.push(`tipo_busca != "SEM BUSCA ATIVA (CONTATO OPORTUNIZADO NO ACOLHIMENTO)"`);
    if (filterDataInicio) dateParts.push(`data_busca >= "${filterDataInicio}"`);
    if (filterDataFim)    dateParts.push(`data_busca <= "${filterDataFim} 23:59:59"`);
    acompOpts.filter = dateParts.join(' && ');

    const allAcomp = await pb.collection('amarcap53_acompanhamentos').getFullList(acompOpts);
    buscaAtivaSet = new Set(allAcomp.map((a: any) => a.paciente).filter(Boolean));
  } catch (err) {
    console.error('[PATS] Erro ao buscar acompanhamentos:', err);
  }
}
buscaAtivaSetRef.current = buscaAtivaSet; // ref para impressão/CSV

// 2) Se o filtro está ativo: baixa TODOS os pacientes (paginado) e filtra local
let pageRecords: any[] | null = null;
let filteredTotal = 0;

if (buscaAtivaSet !== null) {
  const allRecords: any[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await pb.collection('amarcap53_pacientes').getList(page, 500, {
      ...options, perPage: 500, skipTotal: false, requestKey: null, batch: 500,
    });
    if (cancelled) return;
    allRecords.push(...res.items);
    totalPages = res.totalPages;
    page++;
  } while (page <= totalPages);

  const filtered = allRecords.filter((r: any) => {
    const has = buscaAtivaSet!.has(r.id);
    return filterBuscaAtiva === true ? has : !has;
  });
  filteredTotal = filtered.length;

  const start = (searchTerm ? 1 : currentPage - 1) * pageSize;
  pageRecords = filtered.slice(start, start + pageSize);
}
```

> **Trade-off:** baixar tudo é pesado, mas é **a única forma** de filtrar por presença/ausência de relação sem estourar o limite de cláusulas. É acionado **só** quando o usuário liga esse filtro.

---

## 11. Acompanhamentos em paralelo + contadores

Depois de ter os pacientes **da página atual** (10-500 ids), busque em **uma única query** os acompanhamentos desses pacientes para montar contador + último registro.

```ts
const resultList = await (pageRecords !== null
  ? Promise.resolve({ items: pageRecords, totalItems: filteredTotal })
  : pb.collection('amarcap53_pacientes').getList(effectivePage, pageSize, options));

const allRecords = resultList.items;
const patientIds = allRecords.map(r => r.id).filter(Boolean);

let acompResults: any[] = [];
if (patientIds.length > 0) {
  try {
    const raw: any = await pb.collection('amarcap53_acompanhamentos').getFullList({
      // Limite de ~200 ids no OR (seguro: menos que o limite de 150-que-estoura é
      // 150 apenas quando as cláusulas são `id =`, aqui é `paciente =`; ajuste conforme teste)
      filter: `(${patientIds.slice(0, 200).map(id => `paciente = "${id}"`).join(' || ')})`,
      sort: '-created',
      fields: 'id,paciente,situacao_pos_busca,data_busca,data_do_agendamento',
      requestKey: null,
    });
    acompResults = Array.isArray(raw) ? raw : (raw?.items ?? []);
  } catch { acompResults = []; }
}

// Contadores: total de acompanhamentos + último (mais recente)
const countMap = new Map<string, number>();
const lastAcompMap = new Map<string, any>();
acompResults.forEach((r: any) => {
  countMap.set(r.paciente, (countMap.get(r.paciente) || 0) + 1);
  if (!lastAcompMap.has(r.paciente)) lastAcompMap.set(r.paciente, r);
});

const pacientesFormatados = allRecords.map(record => {
  const p: Paciente = {
    id: record.id,
    unidade: record.unidade || '--',
    equipe: record.equipe || '--',
    microarea: Number(record.microarea) || 0,
    nome: record.nome || '--',
    cns: record.cns || '--',
    data_nascimento: record.data_nascimento || '--',
    idade: Number(record.idade) || calcularIdade(record.data_nascimento),
    grupo: record.grupo || '--',
    cito_lab: record.cito_lab || '--',
    cito_pep: record.cito_pep || '--',
    dna_hpv_gal: record.dna_hpv_gal || '--',
    dna_hpv_pep: formatarData(record.dna_hpv_pep) || '--',
    unidade_solicitante: record.unidade_solicitante || '--',
    alertas_rastreamento: record.alertas_rastreamento || '--',
    total_acompanhamentos: countMap.get(record.id) || 0,
    isFavorite: favorites.includes(record.id),
    lastAcomp: lastAcompMap.get(record.id) || null,
  };
  p.alertas = determinarAlerta(p);
  return p;
});
```

**Helpers de data/idade usados no map:**

```ts
const calcularIdade = (dataNascimento: string) => {
  if (!dataNascimento) return 0;
  let dataFormatada = dataNascimento;
  if (dataNascimento.includes('/')) {
    const [dia, mes, ano] = dataNascimento.split('/');
    dataFormatada = `${ano}-${mes}-${dia}`;
  }
  const hoje = new Date();
  const nascimento = new Date(dataFormatada);
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const m = hoje.getMonth() - nascimento.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) idade--;
  return isNaN(idade) ? 0 : idade;
};

const formatarData = (dataStr: string | undefined) => {
  if (!dataStr || dataStr === '--') return '--';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) return dataStr;
  let dateOnly = dataStr;
  if (dateOnly.includes(' ')) dateOnly = dateOnly.split(' ')[0];
  if (dateOnly.includes('T')) dateOnly = dateOnly.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}/.test(dateOnly)) {
    const [ano, mes, dia] = dateOnly.split('-');
    return `${dia}/${mes}/${ano}`;
  }
  return dateOnly;
};
```

---

## 12. Race guards e estados de carregamento

Sem proteção, um fetch antigo (lento) pode resolver **depois** de um novo e: (a) sobrescrever dados corretos, (b) desligar o `isLoading` no meio do novo fetch.

### 12.1 Refs e flags

```ts
const fetchVersionRef = useRef(0);   // versão incremental do fetch
const loadedOnceRef  = useRef(false); // já carregou ao menos 1x (evita "flash" de vazio)
const filterStringRef = useRef('');   // último filtro aplicado (para impressão/CSV)
```

### 12.2 Padrão no `useEffect`

```ts
useEffect(() => {
  let cancelled = false;

  const fetchPacientes = async () => {
    if (!user) return;
    if (!filtersReady) return; // espera os filtros iniciais

    const version = ++fetchVersionRef.current;
    try {
      setIsLoading(true);
      // ... monta filters / faz as queries ...

      if (cancelled) return;            // efeito desmontado → aborta
      setPacientes(pacientesFormatados);
      setTotalItems(resultList.totalItems);
      setLoadError(false);
      setPatCache({ pacientes: pacientesFormatados, totalItems: resultList.totalItems });
    } catch (error) {
      console.error('Erro ao buscar pacientes:', error);
      // só marca erro se NÃO foi cancelado e ainda é a versão atual
      if (!cancelled && fetchVersionRef.current === version) setLoadError(true);
    } finally {
      setIsFilterLoading(false);
      setSortLoading(false);
      setIsSearchLoading(false);
      // só fecha loading se continua sendo o fetch mais recente
      if (!cancelled && fetchVersionRef.current === version) {
        setIsLoading(false);
        loadedOnceRef.current = true;
      }
    }
  };

  fetchPacientes();
  return () => { cancelled = true; };
}, [user?.id, user?.role, user?.unidade_saude, user?.equipe, user?.microarea,
    currentPage, isAdmin, debouncedSearchTerm, filterStatus, filterGrupo,
    filterTipoBusca, filterTipoContato, filterSituacao, filterEntraves,
    filterDataInicio, filterDataFim, filterUnidade, filterEquipe, filterMicroarea,
    filterDnaHpvPep, filterCitoLab, filterCitoPep, filterDnaHpvGal,
    filterBuscaAtiva, filterVersion, filtersReady, sortField, sortDir]);
```

### 12.3 Regras

- **Dois guardas**: `cancelled` (efeito desmontado/reativado) **e** `fetchVersionRef` (fetch antigo). Use os dois.
- **Abortar cedo**: coloque `if (cancelled) return;` logo após cada `await`.
- **Nunca** feche o `isLoading` sem checar `fetchVersionRef.current === version`.
- Toda lista que carrega deve ter **três estados de UI**: `isLoading` → `loadError` → vazio ("Nenhum registro encontrado"). Sem o ramo `isLoading`, a tabela "pisca" como zerada.

---

## 13. Cache local (localStorage) e `pendingFilter`

### 13.1 Cache de pacientes com TTL

Primeira renderização instantânea (usa cache) e refetch em background. Chave **por usuário**.

```ts
const PAT_CACHE_KEY = `patients_cache_${user?.id}`;
const PAT_CACHE_TTL = 5 * 60 * 1000; // 5 min

const getPatCache = () => {
  try {
    const raw = localStorage.getItem(PAT_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (Date.now() - c.ts > PAT_CACHE_TTL) return null; // expirado
    return c.data;
  } catch { return null; }
};

const setPatCache = (data: any) => {
  try { localStorage.setItem(PAT_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
};
```

Uso como **initial state** (evita tela em branco no primeiro paint):

```ts
const _patInit = getPatCache();

const [pacientes, setPacientes] = useState<Paciente[]>(_patInit?.pacientes ?? []);
const [totalItems, setTotalItems] = useState(_patInit?.totalItems ?? 0);
```

> **Cuidado:** se houver um `pendingFilter` (ver 13.2), **não** use o cache como estado inicial da lista (senão mostra dados antigos antes do filtro). Veja o padrão `_pfHasFilter` abaixo.

### 13.2 Passagem de filtro entre telas (`pendingFilter`)

Para "clicar num card do Dashboard e abrir Pacientes já filtrado", grave um payload no `localStorage` e leia-o **uma vez** (leitura **atômica**: lê e remove na mesma operação) ao montar a tela de destino.

```ts
// Dashboard: ao clicar no card
localStorage.setItem('dashboard:pendingFilter', JSON.stringify({
  filterStatus: ['PEP_MOLECULAR'], filterGrupo: [], buscaAtiva: true, /* ... */
}));

// PatientsScreen: lê e REMOVE (atômico)
const _pfData = (() => {
  try {
    const raw = localStorage.getItem('dashboard:pendingFilter');
    if (raw) {
      localStorage.removeItem('dashboard:pendingFilter');
      return JSON.parse(raw);
    }
  } catch {}
  return null;
})();
const _pfHasFilter = !!_pfData;

const _initFilterGrupo: string[] = _pfData?.filterGrupo ?? [];
const _initFilterStatus: string[] = _pfData?.filterStatus ?? [];
const _initFilterBuscaAtiva: boolean | null = _pfData?.buscaAtiva ?? null;
// ... demais filtros ...

// Aplica direto nos initial states → sem race condition de "aplicar depois"
const [pacientes, setPacientes] = useState<Paciente[]>(_pfHasFilter ? [] : (_patInit?.pacientes ?? []));
const [totalItems, setTotalItems] = useState(_pfHasFilter ? 0 : (_patInit?.totalItems ?? 0));
```

**Por que ler nos initial states e não num `useEffect`:** aplicar filtros via effect gera uma janela onde o fetch roda com filtro antigo e some com o filtro novo (race). Inicializando os estados já com o filtro, o **primeiro** fetch sai correto.

### 13.3 `filtersReady`

Garanta que os filtros iniciais estejam aplicados antes do primeiro fetch (útil quando parte dos filtros vem de contexto/URL):

```ts
const [filtersReady, setFiltersReady] = useState(false);
// em algum ponto de inicialização: setFiltersReady(true);
// e no fetch: if (!filtersReady) return;
```

---

## 14. Debounce da busca

**Arquivo:** `src/hooks/useDebounce.ts`

```ts
import { useState, useEffect } from 'react';

/**
 * Debounce um valor. Retorna o valor atualizado apenas após `delay` ms sem mudanças.
 * Ex: useDebounce(searchTerm, 400) → só atualiza 400ms após o usuário parar de digitar.
 */
export function useDebounce<T>(value: T, delay: number = 400): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}
```

Uso na tela:

```ts
const [searchTerm, setSearchTerm] = useState('');
const debouncedSearchTerm = useDebounce(searchTerm, 400);

// o useEffect do fetch depende de `debouncedSearchTerm`, NÃO de `searchTerm`

// indicador de loading da busca: ativa imediatamente (UX), mas o fetch é debounced
useEffect(() => {
  if (searchTerm) setIsSearchLoading(true);
}, [searchTerm]);
```

> **Regra:** dependa sempre de `debouncedSearchTerm` no `useEffect` do fetch. `searchTerm` só para UI (mostrar spinner na hora). Quando há busca, force página 1 (`effectivePage = searchTerm ? 1 : currentPage`).

---

## 15. Regra de negócio: `determinarAlerta`

Mantém **a mesma ordem de prioridade** do filtro server-side (seção 8.2), mas em JS, para pintar o badge do paciente. Ordem: PEP_MOLECULAR → COLETA_MOLECULAR → PEP_CITO → COLETA_CITO → NAO_IDENTIFICADO.

```ts
const determinarAlerta = (p: any) => {
  // 1. Resultado DNA-HPV registrado no PEP (campo editável)
  if (p.dna_hpv_pep && p.dna_hpv_pep !== '--' && p.dna_hpv_pep !== '') return 'PEP_MOLECULAR';
  // 2. Teste molecular DNA-HPV solicitado (GAL/MEDIREC)
  if (p.dna_hpv_gal && p.dna_hpv_gal !== '--' && p.dna_hpv_gal !== '') return 'COLETA_MOLECULAR';
  // 3. Resultado de cito registrado no PEP
  if (p.cito_pep && p.cito_pep !== '--' && p.cito_pep !== '') return 'PEP_CITO';
  // 4. Coleta de cito laboratório
  if (p.cito_lab && p.cito_lab !== '--' && p.cito_lab !== '') return 'COLETA_CITO';
  // 5. Nada identificado
  return 'NAO_IDENTIFICADO';
};
```

> **Manutenção:** mantenha a **mesma ordem** aqui e no filtro server-side. Se divergirem, o filtro mostra um conjunto e o badge pinta outro.

---

## 16. Paginação e reset de página

```ts
const pageSize = 10;
const [currentPage, setCurrentPage] = useState(1);
const [totalItems, setTotalItems] = useState(0);
```

**Regra 1 — resetar página 1 quando filtros mudam** (evita cair em página inexistente → lista vazia):

```ts
useEffect(() => {
  setCurrentPage(1);
}, [searchTerm, filterStatus, filterGrupo, filterTipoBusca, filterTipoContato,
    filterSituacao, filterEntraves, filterDataInicio, filterDataFim, filterUnidade,
    filterEquipe, filterMicroarea, filterDnaHpvPep, filterCitoLab, filterCitoPep,
    filterDnaHpvGal, filterBuscaAtiva]);
```

**Regra 2 — reset ao trocar ordenação:**

```ts
useEffect(() => { setCurrentPage(1); }, [sortField, sortDir]);
```

**Regra 3 — busca sempre pág. 1:**

```ts
const effectivePage = searchTerm ? 1 : currentPage;
```

**Regra 4 — filtros que exigem `filterVersion`:** ao clicar "Aplicar filtros", incremente um contador para forçar novo fetch mesmo que os valores não mudem:

```ts
const [filterVersion, setFilterVersion] = useState(0);
// botão aplicar: () => setFilterVersion(v => v + 1)
// e inclua filterVersion nas dependências do useEffect de fetch
```

---

## 17. Métricas de performance (LIKE vs índice)

Medições reais do projeto na coleção `amarcap53_pacientes` (~129K registros):

| Filtro | SQL gerado | Tempo |
|---|---|---|
| `unidade ~ "X%Y%"` (LIKE) | `LIKE '%X%Y%'` → **FULL SCAN** | **6–16 s** |
| `unidade = "X"` (igualdade, `idx_regional`) | índice B-tree | **~60 ms** |
| `id = "..."` (OR ≤ 150) | índice PK | rápido |
| `id = "..."` (OR > ~150) | — | **HTTP 400** (limite de cláusulas) |

**Conclusões práticas:**

1. Substitua todo `~ "X%Y%"` por **igualdade normalizada** (`=`) sempre que possível — via `buildRegionalPatientFilter`.
2. `~` (contains) é aceitável **só** na busca textual (`nome`/`cns`) e desde que paginada — com ~130K, é a exceção tolerada.
3. Nunca monte OR de `id = "..."` com centenas de IDs — estoura o limite do PocketBase (HTTP 400). Teto seguro: **~150**.
4. `getFullList` em coleção grande → risco de **500/timeout** com 1 GB de RAM.

---

## 18. Checklist de implementação em novo projeto

Marque na ordem, em cada projeto futuro:

**Infra / PocketBase**
- [ ] Instalar PocketBase e criar a coleção principal (ex.: `<projeto>_pacientes`).
- [ ] Definir schema com os campos de região (`unidade`, `equipe`, `microarea`), exames (`*_pep`, `*_lab`) e identificadores (`nome`, `cns`).
- [ ] Criar as **migrations de índice** (seção 6) — `idx_regional`, `idx_rastreamento`, `idx_nome`, `idx_cns`, `idx_grupo`, `idx_regional_rastreamento`.
- [ ] Criar índices na coleção de acompanhamentos: `idx_acomp_paciente` (relação), `idx_acomp_cns`.
- [ ] Confirmar com `EXPLAIN QUERY PLAN` que o índice está sendo usado.
- [ ] Configurar `listRule`/`viewRule` (`@request.auth.id != ""` no mínimo).

**Frontend**
- [ ] Configurar `.env` com `VITE_POCKETBASE_URL`.
- [ ] Criar `src/lib/pocketbase.ts` com `pb.autoCancellation(false)` + `afterSend` (interceptor de sessão).
- [ ] Garantir que o `AuthContext` escuta `pb.authStore.onChange` e desmonta telas no `clear()`.
- [ ] Copiar `src/lib/equipeAliases.ts` (normalização + `buildRegionalPatientFilter`).
- [ ] Preencher `EQUIPE_ALIASES` com os pares UI ↔ banco do projeto.
- [ ] Copiar `src/constants/followUpOptions.ts` (aliases de opções + `buildSelectFilter`) se houver selects.
- [ ] Copiar `src/hooks/useDebounce.ts`.
- [ ] Ler os **pendingFilters** entre telas nos initial states (não em `useEffect`).

**Tela de listagem**
- [ ] Montar `filterParts` nas 3 camadas (role → UI → search/cross-collection).
- [ ] Aplicar `requestKey: null` em toda chamada.
- [ ] `getList(página, pageSize, options)` na coleção grande (nunca `getFullList`).
- [ ] Buscar acompanhamentos da página com `fields` enxutos + contadores (`countMap`/`lastAcompMap`).
- [ ] Implementar race guards (`cancelled` + `fetchVersionRef`).
- [ ] Três estados de UI: `isLoading` → `loadError` → vazio.
- [ ] Cache localStorage com TTL por usuário.
- [ ] Reset de página nos filtros e na ordenação.
- [ ] Filtros com conjuntos grandes → client-side com `Set`; OR de IDs ≤ 150.
- [ ] Preferir relação aninhada (`paciente.campo`) para recortes regionais em coleções filhas.

---

## 19. Erros comuns e como evitar

| Sintoma | Causa provável | Correção |
|---|---|---|
| Lista "zerada" logo ao abrir | Faltou ramo `isLoading` na UI (cai direto em "vazio") | Adicionar 3 estados (`isLoading`/`loadError`/vazio) |
| 500/timeout ao abrir | `getFullList` na coleção grande (1 GB RAM) | Trocar por `getList` paginado |
| 400 Bad Request ao filtrar | OR gigante de `id = "..."` (> ~150) | Client-side com `Set` ou relação aninhada |
| Filtro demora 6-16s | `~ "X%Y%"` (LIKE) sem índice | Igualdade normalizada (`buildRegionalPatientFilter`) |
| Loading "pisca" e lista some | Fetch antigo fecha o loading do novo | `cancelled` + `fetchVersionRef` |
| Primeira carga mostra dados antigos | Cache usado mesmo com filtro pendente | `_pfHasFilter` desliga o cache como initial state |
| Filtro aplicado "atrasado" | pendingFilter aplicado em `useEffect` | Aplicar nos **initial states** |
| Busca dispara request por tecla | Falta debounce | `useDebounce(searchTerm, 400)` |
| Duas queries se cancelam | `autoCancellation` ligado / sem `requestKey: null` | `pb.autoCancellation(false)` + `requestKey: null` |
| Sessão expira e tela fica vazia | Sem interceptor de sessão | `afterSend` limpa `authStore` no 401/auth-refresh |
| Filtro mostra conjunto ≠ badge | Ordem de prioridade divergente | Alinhar `determinarAlerta` com o filtro server-side |
| Célula com texto gigante (mobile) | Exibir unidade completa | `getShortUnidade` |

---

### Anexos — arquivos-modelo para copiar

| Função | Arquivo de referência |
|---|---|
| Instância `pb` + interceptor | [src/lib/pocketbase.ts](file:///c:/projetos_devs/amarcap53/src/lib/pocketbase.ts) |
| Normalização + filtros regionais | [src/lib/equipeAliases.ts](file:///c:/projetos_devs/amarcap53/src/lib/equipeAliases.ts) |
| Opções com aliases + `buildSelectFilter` | [src/constants/followUpOptions.ts](file:///c:/projetos_devs/amarcap53/src/constants/followUpOptions.ts) |
| Hook de debounce | [src/hooks/useDebounce.ts](file:///c:/projetos_devs/amarcap53/src/hooks/useDebounce.ts) |
| Tela de leitura completa (3 camadas + race guards + cache) | [src/screens/PatientsScreen.tsx](file:///c:/projetos_devs/amarcap53/src/screens/PatientsScreen.tsx) |
| Migration de índices | [1750648800_create_indexes.js](file:///c:/projetos_devs/amarcap53/pb_migrations/1750648800_create_indexes.js) |
| Script de índices via API | [scripts/create-indexes.js](file:///c:/projetos_devs/amarcap53/scripts/create-indexes.js) |
