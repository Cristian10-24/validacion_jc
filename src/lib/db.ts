import { MongoClient, type Db } from "mongodb";
import type { ChangeLog, Student, User } from "./types";

declare global {
  // Se reutiliza entre recargas en desarrollo y entre invocaciones en Vercel.
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _indexesReady: Promise<void> | undefined;
}

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Falta la variable de entorno MONGODB_URI");
  globalThis._mongoClientPromise ??= new MongoClient(uri, { maxPoolSize: 10 }).connect();
  return globalThis._mongoClientPromise;
}

/** Única base que usa la app. El cluster puede tener otras bases: nunca se tocan. */
export function dbName(): string {
  return process.env.MONGODB_DB || "validacion_jc";
}

/** Host sin credenciales, para mostrar en los scripts. */
export function dbHost(): string {
  return (process.env.MONGODB_URI ?? "").replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, "").split(/[/?]/)[0];
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  const db = client.db(dbName());
  globalThis._indexesReady ??= ensureIndexes(db);
  await globalThis._indexesReady;
  return db;
}

export async function collections() {
  const db = await getDb();
  return {
    students: db.collection<Student>("students"),
    users: db.collection<User>("users"),
    changeLog: db.collection<ChangeLog>("changeLog"),
  };
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("students").createIndex({ documento: 1 }, { unique: true }),
    db.collection("students").createIndex({ ciudad: 1, estado: 1 }),
    db.collection("students").createIndex({ correoNorm: 1 }),
    db.collection("users").createIndex({ usuario: 1 }, { unique: true }),
    db.collection("changeLog").createIndex({ studentId: 1, fecha: -1 }),
  ]);
}

/** Para scripts: cierra la conexión al terminar. */
export async function closeDb() {
  if (globalThis._mongoClientPromise) await (await globalThis._mongoClientPromise).close();
}
