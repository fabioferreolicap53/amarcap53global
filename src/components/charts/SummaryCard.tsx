import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SummaryCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  subtitle?: string;
  color?: string;
}

export default function SummaryCard({
  title,
  value,
  icon: Icon,
  subtitle,
  color = "navy",
}: SummaryCardProps) {
  return (
    <Card className={cn("border-border/60 shadow-sm transition-shadow hover:shadow-md")}>
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
            color === "navy" && "bg-navy-50 text-navy",
            color === "emerald" && "bg-emerald-50 text-emerald-600",
            color === "amber" && "bg-amber-50 text-amber-600",
            color === "rose" && "bg-rose-50 text-rose-500",
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-navy">
            {value.toLocaleString("pt-BR")}
          </p>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
