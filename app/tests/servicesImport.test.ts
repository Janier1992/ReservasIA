import { describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import { readSheet } from "read-excel-file/node";
import { TEMPLATE_HEADERS, parseServiceRows } from "@/lib/servicesImport";

describe("parseServiceRows", () => {
  it("parses valid rows and falls back to the business currency", () => {
    const result = parseServiceRows(
      [
        ["Nombre", "Duración (min)", "Precio", "Moneda"],
        ["Lavado general", 60, 35000, "cop"],
        ["Lavado de motor", "30", null, null]
      ],
      "COP"
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 2, name: "Lavado general", duration_minutes: 60, price: 35000, currency: "COP" },
      { rowNumber: 3, name: "Lavado de motor", duration_minutes: 30, price: null, currency: "COP" }
    ]);
  });

  it("accepts headers without accents or in English", () => {
    const result = parseServiceRows([["SERVICIO", "duracion", "price"], ["Corte", 30, 20000]], "USD");
    expect(result.rows[0]).toMatchObject({ name: "Corte", duration_minutes: 30, price: 20000, currency: "USD" });
  });

  it("reports invalid rows with the row number the user sees, skipping blank rows", () => {
    const result = parseServiceRows(
      [["Nombre", "Duración (min)", "Precio"], [null, null, null], ["Corte", 0, 1000], ["Tinte", 90, -5]],
      "COP"
    );
    expect(result.rows).toEqual([]);
    expect(result.errors.map((e) => e.rowNumber)).toEqual([3, 4]);
  });

  it("requires the name and duration columns", () => {
    expect(parseServiceRows([["Precio"], [1000]], "COP").errors[0].message).toContain('"Nombre"');
  });
});

describe("Excel round trip", () => {
  it("reads back the downloadable template with the new Excel libraries", async () => {
    const buffer = await writeXlsxFile(
      [TEMPLATE_HEADERS, ["Corte de cabello", 30, 35000, "COP"], ["Manicura", 45, 40000, "COP"]],
      { sheet: "Servicios" }
    ).toBuffer();
    const result = parseServiceRows(await readSheet(buffer), "COP");
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => [r.name, r.duration_minutes, r.price])).toEqual([
      ["Corte de cabello", 30, 35000],
      ["Manicura", 45, 40000]
    ]);
  });
});
