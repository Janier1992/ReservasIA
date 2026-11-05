import { describe, expect, it } from "vitest";

/**
 * Cifrado de las copias de seguridad semanales (scripts/backup-crypto.mjs):
 * el repositorio es público, así que la copia tiene que ser ilegible sin la
 * frase y detectar cualquier alteración.
 */
const { encryptBackup, decryptBackup } = (await import("../../scripts/backup-crypto.mjs")) as {
  encryptBackup: (plaintext: string, passphrase: string) => Buffer;
  decryptBackup: (file: Buffer, passphrase: string) => string;
};

const PASSPHRASE = "una-frase-de-prueba-bien-larga";
const SQL = "CREATE TABLE customers (id uuid, name text);\nINSERT INTO customers VALUES ('1', 'Ana Gómez — 300 123 4567');\n";

describe("copias de seguridad cifradas", () => {
  it("se recupera exactamente el mismo SQL con la frase correcta", () => {
    expect(decryptBackup(encryptBackup(SQL, PASSPHRASE), PASSPHRASE)).toBe(SQL);
  });

  it("el archivo no deja ver los datos de los clientes", () => {
    const file = encryptBackup(SQL, PASSPHRASE).toString("latin1");
    expect(file).not.toContain("Ana");
    expect(file).not.toContain("CREATE TABLE");
  });

  it("dos copias del mismo contenido no son iguales (sal e iv aleatorios)", () => {
    expect(encryptBackup(SQL, PASSPHRASE).equals(encryptBackup(SQL, PASSPHRASE))).toBe(false);
  });

  it("con otra frase falla en vez de devolver basura", () => {
    expect(() => decryptBackup(encryptBackup(SQL, PASSPHRASE), "otra-frase-cualquiera-larga")).toThrow(/frase/);
  });

  it("detecta un archivo alterado", () => {
    const file = encryptBackup(SQL, PASSPHRASE);
    file[file.length - 1] ^= 1;
    expect(() => decryptBackup(file, PASSPHRASE)).toThrow(/dañado/);
  });

  it("rechaza frases cortas y archivos que no son copias", () => {
    expect(() => encryptBackup(SQL, "corta")).toThrow(/16/);
    expect(() => decryptBackup(Buffer.from("hola"), PASSPHRASE)).toThrow(/no es una copia/);
  });
});
