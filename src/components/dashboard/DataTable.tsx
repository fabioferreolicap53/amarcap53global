import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DataRecord {
  id: string;
  [key: string]: string | number;
}

interface Column<T> {
  key: keyof T & string;
  label: string;
  render?: (value: T[keyof T], record: T) => React.ReactNode;
}

interface DataTableProps<T extends DataRecord> {
  columns: Column<T>[];
  data: T[];
  title: string;
  subtitle?: string;
}

export default function DataTable<T extends DataRecord>({
  columns,
  data,
  title,
  subtitle,
}: DataTableProps<T>) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-lg font-semibold text-navy">{title}</h3>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            {columns.map((col) => (
              <TableHead key={col.key}>{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                Nenhum registro encontrado.
              </TableCell>
            </TableRow>
          ) : (
            data.map((record) => (
              <TableRow key={record.id}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {col.render
                      ? col.render(record[col.key], record)
                      : String(record[col.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
