// Celular con el indicativo del país según la ciudad del participante. Solo presentación y exportación:
// el dato guardado no cambia. Función pura (la usan la lista, "Copiar lista" y el Excel).

type Pais = { cc: string; nacional: number; grupos: number[] };

const COLOMBIA: Pais = { cc: "57", nacional: 10, grupos: [3, 3, 4] };   // 300 111 2233
const PANAMA: Pais = { cc: "507", nacional: 8, grupos: [4, 4] };        // 6123 4567
const ECUADOR: Pais = { cc: "593", nacional: 9, grupos: [2, 3, 4] };    // 99 123 4567
const URUGUAY: Pais = { cc: "598", nacional: 8, grupos: [2, 3, 3] };    // 99 123 456
const PAISES = [PANAMA, ECUADOR, URUGUAY, COLOMBIA];

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const POR_CIUDAD: Record<string, Pais> = {
  barranquilla: COLOMBIA, "bogota d.c.": COLOMBIA, bogota: COLOMBIA, cali: COLOMBIA, cartagena: COLOMBIA, medellin: COLOMBIA,
  "ciudad de panama": PANAMA, panama: PANAMA,
  guayaquil: ECUADOR, quito: ECUADOR,
  uruguay: URUGUAY, paysandu: URUGUAY, colonia: URUGUAY,
};

export const paisDeCiudad = (ciudad: string | null | undefined): Pais | null => POR_CIUDAD[fold(String(ciudad ?? ""))] ?? null;

function agrupar(n: string, p: Pais | null): string {
  if (!p || n.length !== p.nacional) return n;
  const partes: string[] = [];
  let i = 0;
  for (const g of p.grupos) { partes.push(n.slice(i, i + g)); i += g; }
  return partes.join(" ");
}

/**
 * "+57 300 111 2233", "+507 6123 4567", "+593 99 123 4567", "+598 99 123 456".
 * - Si el número ya trae un indicativo conocido, no se duplica (se respeta aunque sea de otro país).
 * - Se quita el 0 inicial nacional (Ecuador y Uruguay: 099 123 456 → +598 99 123 456).
 * - Ciudad desconocida y sin indicativo: se muestra el número tal cual, agrupado si se puede.
 */
export function celularConIndicativo(celular: string | null | undefined, ciudad: string | null | undefined): string {
  let d = String(celular ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2); // marcación internacional 00…
  const propio = paisDeCiudad(ciudad);

  // ¿Ya trae indicativo? Primero el del país de la ciudad, luego los demás. Debe sobrar un número nacional completo.
  for (const p of propio ? [propio, ...PAISES.filter((x) => x !== propio)] : PAISES) {
    if (!d.startsWith(p.cc)) continue;
    const resto = d.slice(p.cc.length).replace(/^0/, "");
    if (resto.length >= 7 && d.length > p.nacional + 1) return `+${p.cc} ${agrupar(resto, p)}`;
  }
  const nacional = d.replace(/^0/, "");
  return propio ? `+${propio.cc} ${agrupar(nacional, propio)}` : agrupar(nacional, null);
}
