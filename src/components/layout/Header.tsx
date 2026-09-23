import { BarChart3 } from "lucide-react";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-navy-100 bg-navy shadow-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center px-4 sm:px-6">
        {/* Logo / Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/15">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">
            Amarcap<span className="font-light opacity-80">53</span>
          </span>
        </div>
      </div>
    </header>
  );
}
