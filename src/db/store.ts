import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface BasisRecord {
  id: number;
  name: string | null;
  dim: number;
  m: number;
  basis_json: string;
  created_at: string;
}

export interface ReductionRecord {
  id: number;
  basis_id: number;
  basis_version: string;
  delta_num: string;
  delta_den: string;
  max_iterations: number;
  max_bits: number;
  status: string;
  iterations: number;
  swaps: number;
  reduced_json: string;
  u_json: string;
  steps_json: string;
  cert_json: string;
  created_at: string;
}

export interface TargetRecord {
  id: number;
  basis_id: number;
  target_json: string;
  created_at: string;
}

export interface BabaiRecord {
  id: number;
  reduction_id: number;
  target_id: number;
  coeffs_reduced_json: string;
  coeffs_original_json: string;
  point_json: string;
  dist2_num: string;
  dist2_den: string;
  box_radius: number | null;
  box_json: string | null;
  created_at: string;
}

export class Store {
  db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        dim INTEGER NOT NULL,
        m INTEGER NOT NULL,
        basis_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reductions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        basis_id INTEGER NOT NULL REFERENCES bases(id),
        basis_version TEXT NOT NULL,
        delta_num TEXT NOT NULL,
        delta_den TEXT NOT NULL,
        max_iterations INTEGER NOT NULL,
        max_bits INTEGER NOT NULL,
        status TEXT NOT NULL,
        iterations INTEGER NOT NULL,
        swaps INTEGER NOT NULL,
        reduced_json TEXT NOT NULL,
        u_json TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        cert_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        basis_id INTEGER NOT NULL REFERENCES bases(id),
        target_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS babai_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reduction_id INTEGER NOT NULL REFERENCES reductions(id),
        target_id INTEGER NOT NULL REFERENCES targets(id),
        coeffs_reduced_json TEXT NOT NULL,
        coeffs_original_json TEXT NOT NULL,
        point_json TEXT NOT NULL,
        dist2_num TEXT NOT NULL,
        dist2_den TEXT NOT NULL,
        box_radius INTEGER,
        box_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.setMeta("cert_schema_version", "lll-cert-v1");
  }

  setMeta(key: string, value: string) {
    this.db
      .prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(key, value);
  }
  getMeta(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM meta WHERE key=?").get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  insertBasis(name: string | null, dim: number, m: number, basisJson: string, createdAt: string): number {
    const r = this.db
      .prepare("INSERT INTO bases(name,dim,m,basis_json,created_at) VALUES(?,?,?,?,?)")
      .run(name, dim, m, basisJson, createdAt);
    return Number(r.lastInsertRowid);
  }
  getBasis(id: number): BasisRecord | undefined {
    return this.db.prepare("SELECT * FROM bases WHERE id=?").get(id) as BasisRecord | undefined;
  }
  listBases(): BasisRecord[] {
    return this.db.prepare("SELECT * FROM bases ORDER BY id").all() as unknown as BasisRecord[];
  }

  insertReduction(rec: Omit<ReductionRecord, "id">): number {
    const r = this.db
      .prepare(`INSERT INTO reductions
        (basis_id,basis_version,delta_num,delta_den,max_iterations,max_bits,status,
         iterations,swaps,reduced_json,u_json,steps_json,cert_json,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        rec.basis_id, rec.basis_version, rec.delta_num, rec.delta_den,
        rec.max_iterations, rec.max_bits, rec.status, rec.iterations, rec.swaps,
        rec.reduced_json, rec.u_json, rec.steps_json, rec.cert_json, rec.created_at,
      );
    return Number(r.lastInsertRowid);
  }
  getReduction(id: number): ReductionRecord | undefined {
    return this.db.prepare("SELECT * FROM reductions WHERE id=?").get(id) as ReductionRecord | undefined;
  }
  listReductions(basisId?: number): ReductionRecord[] {
    if (basisId !== undefined) {
      return this.db
        .prepare("SELECT * FROM reductions WHERE basis_id=? ORDER BY id")
        .all(basisId) as unknown as ReductionRecord[];
    }
    return this.db.prepare("SELECT * FROM reductions ORDER BY id").all() as unknown as ReductionRecord[];
  }

  insertTarget(basisId: number, targetJson: string, createdAt: string): number {
    const r = this.db
      .prepare("INSERT INTO targets(basis_id,target_json,created_at) VALUES(?,?,?)")
      .run(basisId, targetJson, createdAt);
    return Number(r.lastInsertRowid);
  }
  getTarget(id: number): TargetRecord | undefined {
    return this.db.prepare("SELECT * FROM targets WHERE id=?").get(id) as TargetRecord | undefined;
  }

  insertBabai(rec: Omit<BabaiRecord, "id">): number {
    const r = this.db
      .prepare(`INSERT INTO babai_runs
        (reduction_id,target_id,coeffs_reduced_json,coeffs_original_json,point_json,
         dist2_num,dist2_den,box_radius,box_json,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(
        rec.reduction_id, rec.target_id, rec.coeffs_reduced_json, rec.coeffs_original_json,
        rec.point_json, rec.dist2_num, rec.dist2_den, rec.box_radius, rec.box_json, rec.created_at,
      );
    return Number(r.lastInsertRowid);
  }
  getBabai(id: number): BabaiRecord | undefined {
    return this.db.prepare("SELECT * FROM babai_runs WHERE id=?").get(id) as BabaiRecord | undefined;
  }

  close() {
    this.db.close();
  }
}
