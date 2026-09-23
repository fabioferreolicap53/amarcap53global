import Header from "@/components/layout/Header";
import MetricCards, { type MetricData } from "@/components/dashboard/MetricCards";
import DataTable, { type DataRecord } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  Users,
  ShoppingCart,
  Activity,
} from "lucide-react";

/* ── Dados mockados (substituir por chamada PocketBase) ── */

const metrics: MetricData[] = [
  {
    title: "Receita Total",
    value: "R$ 284.520,00",
    change: 12.5,
    icon: DollarSign,
  },
  {
    title: "Clientes Ativos",
    value: "1.847",
    change: 8.2,
    icon: Users,
  },
  {
    title: "Pedidos do Mês",
    value: "3.412",
    change: -2.4,
    icon: ShoppingCart,
  },
  {
    title: "Ticket Médio",
    value: "R$ 83,40",
    change: 4.1,
    icon: Activity,
  },
];

interface Order extends DataRecord {
  cliente: string;
  pedido: string;
  valor: string;
  status: "Concluído" | "Em andamento" | "Pendente" | "Cancelado";
  data: string;
}

const orders: Order[] = [
  {
    id: "1",
    cliente: "Grupo Meridional S.A.",
    pedido: "#PED-4821",
    valor: "R$ 12.450,00",
    status: "Concluído",
    data: "22/09/2026",
  },
  {
    id: "2",
    cliente: "Construtora Alvorada Ltda.",
    pedido: "#PED-4822",
    valor: "R$ 8.320,00",
    status: "Em andamento",
    data: "21/09/2026",
  },
  {
    id: "3",
    cliente: "Distribuidora Sul Paulista",
    pedido: "#PED-4823",
    valor: "R$ 23.100,00",
    status: "Pendente",
    data: "21/09/2026",
  },
  {
    id: "4",
    cliente: "Indústria Campos do Vale",
    pedido: "#PED-4824",
    valor: "R$ 5.780,00",
    status: "Concluído",
    data: "20/09/2026",
  },
  {
    id: "5",
    cliente: "Transportadora Rio Dourado",
    pedido: "#PED-4825",
    valor: "R$ 41.200,00",
    status: "Cancelado",
    data: "20/09/2026",
  },
  {
    id: "6",
    cliente: "Rede FarmaCentral",
    pedido: "#PED-4826",
    valor: "R$ 9.850,00",
    status: "Concluído",
    data: "19/09/2026",
  },
  {
    id: "7",
    cliente: "Agropecuária Boa Vista",
    pedido: "#PED-4827",
    valor: "R$ 15.600,00",
    status: "Em andamento",
    data: "19/09/2026",
  },
];

function statusVariant(status: Order["status"]): "success" | "warning" | "default" | "destructive" {
  switch (status) {
    case "Concluído":
      return "success";
    case "Em andamento":
      return "warning";
    case "Pendente":
      return "default";
    case "Cancelado":
      return "destructive";
  }
}

const columns = [
  { key: "cliente" as const, label: "Cliente" },
  { key: "pedido" as const, label: "Pedido" },
  { key: "valor" as const, label: "Valor" },
  {
    key: "status" as const,
    label: "Status",
    render: (value: string | number) => (
      <Badge variant={statusVariant(value as Order["status"])}>
        {String(value)}
      </Badge>
    ),
  },
  { key: "data" as const, label: "Data" },
];

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <Header />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {/* Page Title */}
        <div>
          <h1 className="text-2xl font-bold text-navy">Painel de Controle</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral das operações e indicadores do sistema.
          </p>
        </div>

        {/* Metric Cards */}
        <MetricCards metrics={metrics} />

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={orders}
          title="Pedidos Recentes"
          subtitle="Últimos 7 registros do sistema."
        />
      </main>
    </div>
  );
}
