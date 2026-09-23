import { useMemo, useState, useRef, useEffect } from "react";
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
}

function Dropdown({ label, icon: Icon, options, value, placeholder, onSelect, color, count, showSearch }: DropdownProps) {
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
          "flex items-center gap-2.5 rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all",
          "hover:shadow-md active:scale-[0.98]",
          value
            ? "border-current bg-white shadow-sm"
            : "border-dashed border-navy/20 bg-white/80 text-navy/60 hover:border-navy/40",
        )}
        style={value ? { color } : undefined}
      >
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            value ? "text-white" : "bg-navy/5 text-navy/40",
          )}
          style={value ? { backgroundColor: color } : undefined}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="text-left">
          <div className="text-[10px] uppercase tracking-wider opacity-60">{label}</div>
          <div className="max-w-[180px] truncate">{value || placeholder}</div>
        </div>
        {value && (
          <span className="ml-1 rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] font-bold" style={{ color }}>
            {count}
          </span>
        )}
        {value && (
          <X
            className="ml-1 h-3.5 w-3.5 opacity-50 hover:opacity-100"
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
          <div className="absolute left-0 top-full z-50 mt-2 max-h-[380px] w-[300px] overflow-hidden rounded-xl border border-border bg-white shadow-xl">
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

  return (
    <div className="relative rounded-2xl border border-border/60 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-navy to-blue-600">
            <Filter className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-navy">Filtro Cascata</span>
          <span className="text-xs text-muted-foreground">Unidade \u2192 Equipe \u2192 Microárea</span>
        </div>
        {hasFilter && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            <X className="h-3 w-3" />
            Limpar filtros
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
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
        />

        {selectedUnidade && (
          <div className="text-xl font-light text-navy/20">/</div>
        )}

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
        />

        {selectedEquipe && (
          <div className="text-xl font-light text-navy/20">/</div>
        )}

        <Dropdown
          label="Microárea"
          icon={MapPin}
          options={microareas}
          value={selectedMicroarea != null ? String(selectedMicroarea) : null}
          placeholder="Todas"
          onSelect={(v) => onSelectMicroarea(v != null ? Number(v) : null)}
          color="#d97706"
          count={microareas.length}
        />

        {hasFilter && (
          <div className="ml-auto rounded-full bg-navy px-4 py-2 text-sm font-bold text-white shadow-lg">
            {totalRegistros.toLocaleString("pt-BR")} registros
          </div>
        )}
      </div>
    </div>
  );
}
