import { Activity } from "lucide-react";

const AUTHOR = "Fabio Ferreira de Oliveira";
const UNIT = "DAPS/CAP5.3";
const YEAR = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className="mt-8 border-t border-navy-100/70 bg-white/60 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-3 px-4 py-5 text-center sm:flex-row sm:px-6 sm:text-left">
        {/* Assinatura do produto */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy/[0.04] ring-1 ring-navy/10">
            <Activity className="h-3.5 w-3.5 text-navy/55" />
          </span>
          <span className="text-xs font-semibold tracking-tight text-navy/70">
            Amarcap53 <span className="font-normal text-navy/40">· Painel Global</span>
          </span>
        </div>

        {/* Crédito discreto */}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="uppercase tracking-[0.16em] text-navy/35">Desenvolvido por </span>
          <span className="font-semibold text-navy/70">{AUTHOR}</span>
          <span className="text-navy/25"> · </span>
          <span className="font-medium text-navy/50">{UNIT}</span>
          <span className="text-navy/25"> · </span>
          <span className="text-navy/40">© {YEAR}</span>
        </p>
      </div>
    </footer>
  );
}
