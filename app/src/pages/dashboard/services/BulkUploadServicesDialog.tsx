import { useRef, useState } from "react";
import type * as XLSXType from "xlsx";
import { toast } from "sonner";
import { UploadCloud, Download } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_CURRENCY } from "@/lib/currency";

// Mismos campos que muestra la vista de Servicios: Nombre, Duración (min),
// Precio y Moneda. Los encabezados se aceptan sin importar mayúsculas/acentos
// para que una planilla exportada de otro sistema también sirva.
const TEMPLATE_HEADERS = ["Nombre", "Duración (min)", "Precio", "Moneda"];

interface ParsedRow {
  rowNumber: number;
  name: string;
  duration_minutes: number;
  price: number | null;
  currency: string;
}

interface RowError {
  rowNumber: number;
  message: string;
}

const DIACRITICS_PATTERN = /[̀-ͯ]/g;

function normalizeHeader(header: string): string {
  return header.toString().trim().toLowerCase().normalize("NFD").replace(DIACRITICS_PATTERN, "");
}

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const index = normalized.indexOf(candidate);
    if (index !== -1) return index;
  }
  return -1;
}

function parseWorkbook(XLSX: typeof XLSXType, buffer: ArrayBuffer, defaultCurrency: string): { rows: ParsedRow[]; errors: RowError[] } {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  if (raw.length === 0) return { rows: [], errors: [] };

  const headers = raw[0].map((h) => String(h ?? ""));
  const nameCol = findColumn(headers, ["nombre", "servicio", "name"]);
  const durationCol = findColumn(headers, ["duracion (min)", "duracion", "duration_minutes", "duration"]);
  const priceCol = findColumn(headers, ["precio", "price"]);
  const currencyCol = findColumn(headers, ["moneda", "currency"]);

  if (nameCol === -1 || durationCol === -1) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, message: 'El archivo debe tener al menos las columnas "Nombre" y "Duración (min)".' }]
    };
  }

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];

  for (let i = 1; i < raw.length; i++) {
    const line = raw[i];
    const rowNumber = i + 1;
    const name = String(line[nameCol] ?? "").trim();
    if (!name) continue;

    const durationRaw = line[durationCol];
    const duration_minutes = Number(durationRaw);
    if (!durationRaw || !Number.isFinite(duration_minutes) || duration_minutes <= 0) {
      errors.push({ rowNumber, message: `"${name}": la duración debe ser un número mayor a 0.` });
      continue;
    }

    let price: number | null = null;
    if (priceCol !== -1 && line[priceCol] !== undefined && line[priceCol] !== "") {
      const priceValue = Number(line[priceCol]);
      if (!Number.isFinite(priceValue) || priceValue < 0) {
        errors.push({ rowNumber, message: `"${name}": el precio debe ser un número mayor o igual a 0.` });
        continue;
      }
      price = priceValue;
    }

    const currency = currencyCol !== -1 ? String(line[currencyCol] ?? "").trim().toUpperCase() : "";

    rows.push({
      rowNumber,
      name,
      duration_minutes: Math.round(duration_minutes),
      price,
      currency: currency || defaultCurrency
    });
  }

  return { rows, errors };
}

export function BulkUploadServicesDialog({
  open,
  onOpenChange,
  organizationId,
  defaultCurrency,
  onUploaded
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  defaultCurrency: string;
  onUploaded: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ rows: ParsedRow[]; errors: RowError[] } | null>(null);

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEADERS,
      ["Corte de cabello", 30, 35000, DEFAULT_CURRENCY],
      ["Manicura", 45, 40000, DEFAULT_CURRENCY]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Servicios");
    XLSX.writeFile(workbook, "plantilla-servicios.xlsx");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const [XLSX, buffer] = await Promise.all([import("xlsx"), file.arrayBuffer()]);
      const parsed = parseWorkbook(XLSX, buffer, defaultCurrency);
      setPreview(parsed);
    } catch {
      toast.error("No se pudo leer el archivo. Verificá que sea un .xlsx válido.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirmUpload() {
    if (!preview || preview.rows.length === 0) return;
    setUploading(true);
    try {
      const { error } = await insforge.database.from("services").insert(
        preview.rows.map((r) => ({
          organization_id: organizationId,
          name: r.name,
          duration_minutes: r.duration_minutes,
          price: r.price,
          currency: r.currency
        }))
      );
      if (error) throw error;
      toast.success(`${preview.rows.length} servicio(s) cargado(s) correctamente.`);
      setPreview(null);
      onOpenChange(false);
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo completar la carga masiva.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPreview(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Carga masiva de servicios</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Subí un archivo .xlsx con las columnas <strong>Nombre</strong>, <strong>Duración (min)</strong>, <strong>Precio</strong> y{" "}
            <strong>Moneda</strong> (las dos últimas son opcionales).
          </p>

          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4" /> Descargar plantilla de ejemplo
          </Button>

          <div className="space-y-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="input-base"
              onChange={handleFileChange}
            />
          </div>

          {preview && preview.errors.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {preview.errors.map((e, i) => (
                <p key={i}>
                  Fila {e.rowNumber}: {e.message}
                </p>
              ))}
            </div>
          )}

          {preview && preview.rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Se van a crear {preview.rows.length} servicio(s):</p>
              <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Duración</th>
                      <th className="px-3 py-2">Precio</th>
                      <th className="px-3 py-2">Moneda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5">{r.duration_minutes} min</td>
                        <td className="px-3 py-1.5">{r.price ?? "—"}</td>
                        <td className="px-3 py-1.5">{r.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" disabled={!preview || preview.rows.length === 0 || uploading} onClick={confirmUpload}>
              <UploadCloud className="h-4 w-4" /> {uploading ? "Cargando..." : "Confirmar carga"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
