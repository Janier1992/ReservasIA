import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slug";

describe("cn", () => {
  it("combina nombres de clases y resuelve conflictos de tailwind", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm", undefined, false, "font-bold")).toBe("text-sm font-bold");
  });
});

describe("slugify", () => {
  it("pasa a minúsculas, quita tildes y reemplaza los caracteres no alfanuméricos", () => {
    const slug = slugify("La Buena Mesa Café & Bar");
    expect(slug).toMatch(/^la-buena-mesa-cafe-bar-[a-z0-9]{4}$/);
  });

  it("nunca deja guiones al principio ni al final de la base", () => {
    const slug = slugify("---Barbería---");
    expect(slug.startsWith("-")).toBe(false);
  });
});
