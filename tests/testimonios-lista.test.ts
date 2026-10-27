import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import type { Participante, Respuesta } from "@/lib/testimonios/db";
import { leerParticipantes, planificarLista } from "@/lib/testimonios/lista";
import { planRecruce } from "@/lib/testimonios/recruce";

const fila = (o: Record<string, string>) => ({ nombres: "", apellidos: "", celular: "", correo: "", documento: "", ciudad: "", ...o });

describe("leer la lista de participantes", () => {
  it("normaliza documento, correo, celular, nombres y ciudad (con alias)", () => {
    const { filas, errores, avisos } = leerParticipantes([
      fila({ nombres: "MARÍA josé", apellidos: "gómez  ríos", celular: "+57 300-111-2233", correo: " Maria@Gmail.COM ", documento: "1.001", ciudad: "bogota" }),
      fila({ nombres: "Lucía", apellidos: "Paz", celular: "+598 94 123 456", correo: "lucia@gmail.com", documento: "4001", ciudad: "Paysandú" }),
    ]);
    expect(errores).toEqual([]);
    expect(filas[0]).toMatchObject({ documento: "1001", nombres: "María José", apellidos: "Gómez Ríos", nombre: "María José Gómez Ríos", celular: "573001112233", celularClave: "3001112233", correo: "maria@gmail.com", ciudad: "Bogotá D.C.", ciudadOriginal: null });
    expect(filas[1]).toMatchObject({ ciudad: "Uruguay", ciudadOriginal: "Paysandú", celularClave: "94123456" });
    expect(avisos.map((a) => a.mensaje)).toEqual(['Ciudad "Paysandú" se guarda como Uruguay']);
  });
  it("errores por fila: sin documento, sin nombre, sin ciudad, ciudad desconocida, documento repetido", () => {
    const { filas, errores } = leerParticipantes([
      fila({ nombres: "Ana", documento: "", ciudad: "Cali" }),
      fila({ documento: "2", ciudad: "Cali" }),
      fila({ nombres: "Beto", documento: "3", ciudad: "" }),
      fila({ nombres: "Carla", documento: "4", ciudad: "Pasto" }),
      fila({ nombres: "Dora", documento: "5", ciudad: "Cali" }),
      fila({ nombres: "Dora Bis", documento: "5", ciudad: "Cali" }),
    ]);
    expect(filas.map((f) => f.documento)).toEqual(["5"]);
    expect(errores.map((e) => `${e.fila}:${e.mensaje}`)).toEqual([
      "2:Sin número de documento", "3:Sin nombres ni apellidos", "4:Sin ciudad", '5:Ciudad no reconocida: "Pasto"', "7:Documento repetido en el archivo",
    ]);
  });
  it("avisa si no tiene correo ni celular (solo cruzará por documento)", () => {
    const { avisos } = leerParticipantes([fila({ nombres: "Ana", documento: "9", ciudad: "Cali" })]);
    expect(avisos[0].mensaje).toMatch(/solo podrá cruzar por documento/);
  });
});

describe("vista previa contra la lista actual", () => {
  const ahora = new Date();
  const actual = (documento: string, o: Partial<Participante> = {}): Participante => ({
    _id: new ObjectId(), documento, nombres: "Ana", apellidos: "Ruiz", nombre: "Ana Ruiz", celular: "3001112233", celularClave: "3001112233",
    correo: "ana@gmail.com", ciudad: "Cali", ciudadOriginal: null, creadoEn: ahora, actualizadoEn: ahora, ...o,
  });
  it("clasifica nuevos, cambiados, sin cambios y los que ya no están", () => {
    const quedan = actual("1");
    const cambia = actual("2", { nombres: "Beto", nombre: "Beto Ruiz", correo: "beto@gmail.com" });
    const seVa = actual("3", { nombres: "Carla", nombre: "Carla Ruiz" });
    const plan = planificarLista([
      fila({ nombres: "Ana", apellidos: "Ruiz", celular: "3001112233", correo: "ana@gmail.com", documento: "1", ciudad: "Cali" }),
      fila({ nombres: "Beto", apellidos: "Ruiz", celular: "3001112233", correo: "beto.nuevo@gmail.com", documento: "2", ciudad: "Cali" }),
      fila({ nombres: "Dora", apellidos: "Paz", celular: "3005556677", correo: "dora@gmail.com", documento: "4", ciudad: "Medellín" }),
    ], [quedan, cambia, seVa]);
    expect(plan.sinCambios).toBe(1);
    expect(plan.nuevos.map((n) => n.documento)).toEqual(["4"]);
    expect(plan.cambiados).toHaveLength(1);
    expect(plan.cambiados[0].cambios).toEqual([{ campo: "correo", antes: "beto@gmail.com", despues: "beto.nuevo@gmail.com" }]);
    expect(plan.ausentes.map((a) => a.documento)).toEqual(["3"]);
  });
});

describe("re-cruce al cambiar la lista", () => {
  const A = new ObjectId(), B = new ObjectId();
  const r = (cruce: Respuesta["cruce"], o: Partial<Respuesta> = {}): Pick<Respuesta, "_id" | "cruce" | "participanteId" | "cruzadoPor" | "candidatos" | "norm"> => ({
    _id: new ObjectId(), cruce, participanteId: null, norm: { nombre: "", documento: null, correo: null, celular: null, ciudad: "" }, ...o,
  });
  const norm = (documento: string | null, correo: string | null = null) => ({ nombre: "", documento, correo, celular: null, ciudad: "Cali" });
  const lista = [{ id: A.toHexString(), documento: "1001", correo: "ana@gmail.com", celular: null }, { id: B.toHexString(), documento: "1002", correo: "beto@gmail.com", celular: null }];

  it("una respuesta sin dueño se asigna cuando el participante aparece en la lista", () => {
    const sin = r("sin_duenio", { norm: norm("1001") });
    expect(planRecruce([sin], lista)).toEqual([{ id: sin._id, set: { participanteId: A, cruce: "auto", cruzadoPor: "documento", candidatos: undefined } }]);
  });
  it("una respuesta automática queda sin dueño si eliminan al participante", () => {
    const auto = r("auto", { participanteId: A, cruzadoPor: "documento", norm: norm("1001") });
    expect(planRecruce([auto], lista.slice(1))).toEqual([{ id: auto._id, set: { participanteId: null, cruce: "sin_duenio", cruzadoPor: undefined, candidatos: undefined } }]);
  });
  it("las asignaciones manuales y las descartadas se respetan", () => {
    const manual = r("manual", { participanteId: B, cruzadoPor: "manual", norm: norm("1001") }); // el admin la asignó a B aunque el documento es de A
    const descartada = r("descartada", { norm: norm("1001") });
    expect(planRecruce([manual, descartada], lista)).toEqual([]);
  });
  it("una manual cuyo participante fue eliminado se vuelve a cruzar", () => {
    const manual = r("manual", { participanteId: B, cruzadoPor: "manual", norm: norm("1001") });
    expect(planRecruce([manual], lista.slice(0, 1))).toEqual([{ id: manual._id, set: { participanteId: A, cruce: "auto", cruzadoPor: "documento", candidatos: undefined } }]);
  });
  it("si nada cambió, no hay actualizaciones", () => {
    const auto = r("auto", { participanteId: A, cruzadoPor: "documento", norm: norm("1001") });
    expect(planRecruce([auto], lista)).toEqual([]);
  });
});
