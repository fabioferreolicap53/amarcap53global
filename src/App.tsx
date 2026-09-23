import { Suspense } from "react";
import { RefreshCw } from "lucide-react";
import EstatisticasGlobais from "@/pages/EstatisticasGlobais";

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6f9]">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw className="h-8 w-8 animate-spin text-navy" />
        <span className="text-sm text-muted-foreground">Carregando...</span>
      </div>
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
