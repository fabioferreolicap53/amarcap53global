import { BarChart3 } from "lucide-react";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-navy-100 bg-navy shadow-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6">
        {/* Logo / Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/15">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">
            Amarcap<span className="font-light opacity-80">53</span>
          </span>
        </div>

        {/* Crédito do desenvolvedor — discreto */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold tracking-wide text-white/70 ring-1 ring-white/10">
            FF
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-[9px] uppercase tracking-[0.18em] text-white/35">
              Desenvolvido por
            </span>
            <span className="text-[11px] font-medium text-white/70">
              Fabio Ferreira de Oliveira
              <span className="text-white/30"> · DAPS/CAP5.3</span>
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}
