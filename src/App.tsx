import { Suspense } from "react";
import { RefreshCw } from "lucide-react";
import EstatisticasGlobais from "@/pages/EstatisticasGlobais";

function LoadingFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#f4f6f9]">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw className="h-8 w-8 animate-spin text-navy" />
        <span className="text-sm text-muted-foreground">Carregando...</span>
      </div>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-navy/45">
        Desenvolvido por Fabio Ferreira de Oliveira · DAPS/CAP5.3
      </p>
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EstatisticasGlobais />
    </Suspense>
  );
}

export default App;
