import { describe, expect, it } from "vitest";
import { csvCell } from "./csv.js";

describe("csvCell", () => {
  it("entrecomilla y escapa comillas dobles", () => {
    expect(csvCell('Ana "La Voz"')).toBe('"Ana ""La Voz"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
  });

  it("serializa fechas en ISO", () => {
    expect(csvCell(new Date("2026-10-17T12:00:00.000Z"))).toBe('"2026-10-17T12:00:00.000Z"');
  });

  it("neutraliza celdas que empiezan por =, +, -, @, tab o CR", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+573001234567")).toBe("\"'+573001234567\"");
    expect(csvCell("-1")).toBe("\"'-1\"");
    expect(csvCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
    expect(csvCell("\t=cmd")).toBe("\"'\t=cmd\"");
    expect(csvCell("\r=cmd")).toBe("\"'\r=cmd\"");
  });

  it("no altera texto normal ni emails", () => {
    expect(csvCell("fan@example.com")).toBe('"fan@example.com"');
    expect(csvCell("Hola mundo")).toBe('"Hola mundo"');
  });
});
