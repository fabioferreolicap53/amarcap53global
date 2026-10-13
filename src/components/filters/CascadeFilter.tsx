import { useMemo, useState, useRef, useEffect, Fragment } from "react";
import { Building2, Users, MapPin, X, Filter, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterData } from "@/types/amarcap53";

interface Props {
  filterData: FilterData;
  selectedUnidade: string | null;
  selectedEquipe: string | null;
  selectedMicroarea: number | null;
  onSelectUnidade: (u: string | null) => void;
  onSelectEquipe: (e: string | null) => void;
  onSelectMicroarea: (m: number | null) => void;
}

interface DropdownProps {
  label: string;
  icon: React.ElementType;
  options: string[];
  value: string | null;
  placeholder: string;
  onSelect: (v: string | null) => void;
  color: string;
  count?: number;
  showSearch?: boolean;
  step?: number;
}

/** Mensagem de apoio do header por progresso (0 = nada escolhido … 3 = completo) */
const DICAS: { strong: string; rest: string }[] = [
  {
    strong: "Comece pela Unidade",
    rest: "— clique no passo 1 abaixo e cards + gráficos atualizam na hora.",
  },
  {
    strong: "Unidade selecionada ✓",
    rest: "— agora escolha a Equipe (passo 2) para refinar o recorte.",
  },
  {
    strong: "Equipe selecionada ✓",
    rest: "— última etapa: Microárea (passo 3). Prefere ver tudo? Deixe “Todas”.",
  },
  {
    strong: "Filtro completo ✓",
    rest: "— 3 de 3 etapas ativas. “Limpar filtros” volta ao início.",
  },
];

function Dropdown({ label, icon: Icon, options, value, placeholder, onSelect, color, count, showSearch, step }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && showSearch && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, showSearch]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-sm font-medium transition-all sm:w-auto sm:px-4 sm:py-2.5",
          "hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]",
          value
            ? "border-current bg-white shadow-sm"
            : "border-dashed border-navy/20 bg-white/80 text-navy/60 hover:border-navy/50 hover:bg-white",
        )}
        style={value ? { color } : undefined}
      >
        {step != null && (
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
              !value && "bg-navy/10 text-navy/50 group-hover:bg-navy/20",
            )}
            style={value ? { backgroundColor: `${color}22`, color } : undefined}
          >
            {step}
          </span>
        )}
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            value ? "text-white" : "bg-navy/5 text-navy/40",
          )}
          style={value ? { backgroundColor: color } : undefined}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[10px] uppercase tracking-wider opacity-60">{label}</div>
          {/* Mobile: quebra em até 2 linhas; desktop: trunca em 180px */}
          <div className="max-w-full break-words line-clamp-2 sm:line-clamp-1 sm:max-w-[180px] sm:truncate">
            {value || placeholder}
          </div>
        </div>
        {value && (
          <span className="ml-1 shrink-0 rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] font-bold" style={{ color }}>
            {count}
          </span>
        )}
        {value && (
          <X
            className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(null);
            }}
          />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 max-h-[380px] w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-white shadow-xl">
            {showSearch && (
              <div className="sticky top-0 border-b border-border/40 bg-white px-3 py-2">
                <div className="flex items-center gap-2 rounded-lg bg-navy-50/60 px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-navy/40" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Buscar em ${options.length}...`}
                    className="w-full bg-transparent text-sm text-navy outline-none placeholder:text-navy/30"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="text-navy/30 hover:text-navy/60">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="sticky top-0 border-b border-border/50 bg-navy-50/80 px-3 py-2 text-xs font-semibold text-navy/70">
              {label} ({showSearch ? `${filtered.length}/${options.length}` : options.length})
            </div>
            <div className="max-h-[280px] overflow-auto p-1">
              <button
                onClick={() => { onSelect(null); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  !value ? "bg-navy/5 font-semibold text-navy" : "text-muted-foreground hover:bg-navy-50",
                )}
              >
                Todas
              </button>
              {filtered.length === 0 && search && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  Nenhum resultado para "{search}"
                </div>
              )}
              {filtered.map((opt) => (
                <button
                  key={opt}
                  onClick={() => { onSelect(opt); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    value === opt ? "bg-navy/5 font-semibold text-navy" : "hover:bg-navy-50",
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color, opacity: value === opt ? 1 : 0.4 }}
                  />
                  <span className="truncate">{opt}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function CascadeFilter({
  filterData,
  selectedUnidade,
  selectedEquipe,
  selectedMicroarea,
  onSelectUnidade,
  onSelectEquipe,
  onSelectMicroarea,
}: Props) {
  const equipes = useMemo(() => {
    if (!selectedUnidade) return [];
    return filterData.equipes[selectedUnidade] ?? [];
  }, [filterData, selectedUnidade]);

  const microareas = useMemo(() => {
    if (!selectedUnidade || !selectedEquipe) return [];
    const key = `${selectedUnidade}|${selectedEquipe}`;
    return (filterData.microareas[key] ?? []).map(String);
  }, [filterData, selectedUnidade, selectedEquipe]);

  const totalRegistros = useMemo(() => {
    if (selectedUnidade && selectedEquipe && selectedMicroarea != null) {
      const key = `${selectedUnidade}|${selectedEquipe}|${selectedMicroarea}`;
      return filterData.totais[key] ?? 0;
    }
    if (selectedUnidade && selectedEquipe) {
      const key = `${selectedUnidade}|${selectedEquipe}`;
      return filterData.totais[key] ?? 0;
    }
    if (selectedUnidade) {
      return Object.entries(filterData.totais)
        .filter(([k]) => k.startsWith(selectedUnidade + "|") && k.split("|").length === 2)
        .reduce((s, [, v]) => s + v, 0);
    }
    return 0;
  }, [filterData, selectedUnidade, selectedEquipe, selectedMicroarea]);

  const hasFilter = selectedUnidade || selectedEquipe || selectedMicroarea != null;

  const clearAll = () => {
    onSelectUnidade(null);
    onSelectEquipe(null);
    onSelectMicroarea(null);
  };

  // Cobertura total do banco — exibida no header como contexto
  const totals = useMemo(() => {
    let equipes = 0;
    let micros = 0;
    for (const eqs of Object.values(filterData.equipes)) equipes += eqs.length;
    for (const ms of Object.values(filterData.microareas)) micros += ms.length;
    return { unidades: filterData.unidades.length, equipes, micros };
  }, [filterData]);

  // 0 = nada escolhido … 3 = trilha completa
  const progress = selectedMicroarea != null ? 3 : selectedEquipe ? 2 : selectedUnidade ? 1 : 0;

  const steps = [
    { n: 1, label: "Unidade", done: !!selectedUnidade, active: progress === 0 },
    { n: 2, label: "Equipe", done: !!selectedEquipe, active: progress === 1 },
    { n: 3, label: "Microárea", done: selectedMicroarea != null, active: progress === 2 },
  ];

  // Dica muda conforme o avanço — sempre aponta o próximo passo
  const dica = DICAS[progress] ?? DICAS[0]!;
  const trilhaCompleta = progress === 3;

  return (
    <div className="relative rounded-2xl border border-navy/15 bg-gradient-to-b from-white via-white to-navy-50/70 shadow-[0_10px_40px_-18px_rgba(15,42,84,0.35)]">
      {/* Brilho decorativo (recortado só aqui — não corta os dropdowns) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute -top-28 left-1/2 h-56 w-[480px] -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500/20 via-navy/15 to-pink-400/20 blur-3xl" />
      </div>

      {/* Header — destaque + trilha dos 3 passos (coluna central, linhas compactas) */}
      <div className="relative overflow-hidden border-b border-navy/10 bg-gradient-to-r from-navy-50/80 via-white to-blue-50/60 px-4 pb-3 pt-3 text-center sm:px-6 sm:pb-3.5 sm:pt-4">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />
        <span className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full bg-blue-400/20 blur-2xl" />
        <span className="pointer-events-none absolute -right-14 -bottom-24 h-44 w-44 rounded-full bg-emerald-300/15 blur-2xl" />

        <div className="relative mx-auto flex max-w-xl flex-col items-center gap-1.5">
          {/* Linha 1 — ícone + nome + badge, tudo no centro óptico */}
          <div className="flex items-center justify-center gap-2.5">
            {/* Ícone com anel pulsante enquanto nada filtrado → puxa o olhar */}
            <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-navy to-blue-600 shadow-md shadow-navy/30 sm:h-9 sm:w-9">
              {!hasFilter && (
                <span className="absolute -inset-1 animate-pulse rounded-xl ring-2 ring-blue-400/60" />
              )}
              <Filter className="relative h-4 w-4 text-white" />
            </span>
            <h2 className="text-sm font-bold tracking-wide text-navy sm:text-base">
              Filtro Cascata
            </h2>
            <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-navy/60">
              3 níveis
            </span>
          </div>

          {/* Linha 2 — cobertura total do banco */}
          <p className="text-[11px] leading-none text-muted-foreground tabular-nums">
            {totals.unidades} unidades • {totals.equipes} equipes • {totals.micros} microáreas
          </p>

          {/* Linha 3 — trilha visual: feito, onde está, o que falta */}
          <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1.5">
            {steps.map((s, i) => (
              <Fragment key={s.label}>
                {i > 0 && <span className="text-xs text-navy/30">→</span>}
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all",
                    s.done && "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm",
                    !s.done && s.active && "animate-pulse border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-500/40",
                    !s.done && !s.active && "border-navy/15 bg-white/70 text-navy/45",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                      s.done
                        ? "bg-emerald-500 text-white"
                        : s.active
                          ? "bg-white/25 text-white"
                          : "bg-navy/10 text-navy/50",
                    )}
                  >
                    {s.done ? "✓" : s.n}
                  </span>
                  {s.label}
                </span>
              </Fragment>
            ))}
          </div>

          {/* Linha 4 — dica contextual (largura limitada → quebra simétrica) */}
          <p className="max-w-lg text-xs leading-snug text-muted-foreground">
            <span
              className={cn(
                "font-semibold",
                trilhaCompleta ? "text-emerald-600" : "text-navy",
              )}
            >
              {dica.strong}
            </span>{" "}
            {dica.rest}
          </p>
        </div>

        {hasFilter && (
          <button
            onClick={clearAll}
            className="absolute right-3 top-2.5 flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 ring-1 ring-inset ring-red-200 transition-all hover:-translate-y-0.5 hover:bg-red-100 hover:shadow-md sm:right-4 sm:top-3.5 sm:px-3"
          >
            <X className="h-3 w-3" />
            <span className="hidden sm:inline">Limpar filtros</span>
          </button>
        )}
      </div>

      {/* Filters — pilha no mobile, linha no desktop */}
      <div className="relative grid grid-cols-1 gap-2.5 px-4 py-4 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-3 sm:px-5 sm:py-5">
        <Dropdown
          label="Unidade"
          icon={Building2}
          options={filterData.unidades}
          value={selectedUnidade}
          placeholder="Todas as unidades"
          onSelect={(v) => {
            onSelectUnidade(v);
            onSelectEquipe(null);
            onSelectMicroarea(null);
          }}
          color="#2563eb"
          showSearch
          step={1}
        />

        <div className="hidden text-lg font-light text-navy/25 sm:block">→</div>

        <Dropdown
          label="Equipe"
          icon={Users}
          options={equipes}
          value={selectedEquipe}
          placeholder="Todas as equipes"
          onSelect={(v) => {
            onSelectEquipe(v);
            onSelectMicroarea(null);
          }}
          color="#059669"
          count={equipes.length}
          step={2}
        />

        <div className="hidden text-lg font-light text-navy/25 sm:block">→</div>

        <Dropdown
          label="Microárea"
          icon={MapPin}
          options={microareas}
          value={selectedMicroarea != null ? String(selectedMicroarea) : null}
          placeholder="Todas"
          onSelect={(v) => onSelectMicroarea(v != null ? Number(v) : null)}
          color="#d97706"
          count={microareas.length}
          step={3}
        />
      </div>

      {/* Contador — centralizado */}
      {hasFilter && (
        <div className="relative flex justify-center px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-navy to-blue-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-navy/30">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            {totalRegistros.toLocaleString("pt-BR")} registros encontrados
          </div>
        </div>
      )}
    </div>
  );
}
