import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";

export interface MetricData {
  title: string;
  value: string;
  change: number;
  icon: LucideIcon;
}

interface MetricCardsProps {
  metrics: MetricData[];
}

function formatChange(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

export default function MetricCards({ metrics }: MetricCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        const isPositive = metric.change >= 0;

        return (
          <Card key={metric.title} className="transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.title}
              </CardTitle>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-navy-50">
                <Icon className="h-4 w-4 text-navy" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-navy">{metric.value}</div>
              <div className="mt-1 flex items-center gap-1 text-xs">
                {isPositive ? (
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span
                  className={cn(
                    "font-medium",
                    isPositive ? "text-emerald-600" : "text-red-500",
                  )}
                >
                  {formatChange(metric.change)}
                </span>
                <span className="text-muted-foreground">vs. mês anterior</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
