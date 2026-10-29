/** Doble de librerías externas (openai, googleapis): si una función la usa en un test, falla a la vista. */
function unexpected(): never {
  throw new Error("Una librería externa se usó en un test de permisos.");
}
const proxy: unknown = new Proxy(unexpected, { get: () => proxy, apply: unexpected, construct: unexpected });
export default proxy;
export const google = proxy;
