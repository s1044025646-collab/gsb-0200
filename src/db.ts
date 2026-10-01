/**
 * SQLite 持久化（使用 Node 内置 node:sqlite，无需原生编译）。
 * 管理：格基、约简参数/结果、目标点与 Babai 结果、证书版本。
 */
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { CERTIFICATE_VERSION } from "./verify";

export interface BasisRow {
  id: number;
  name: string;
  dim: number;
  nvec: number;
  basis_json: string;
  created_at: string;
}

export interface ReductionRow {
  id: number;
  basis_id: number;
  status: string;
  reduced: number;
  delta_num: string;
  delta_den: string;
  result_json: string;
  cert_version: string;
  created_at: string;
}

export interface TargetRow {
  id: number;
  basis_id: number;
  reduction_id: number | null;
  target_json: string;
  babai_json: string | null;
  box_json: string | null;
  created_at: string;
}

export class Store {
  db: DatabaseSync;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, "lll.db");
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        dim INTEGER NOT NULL,
        nvec INTEGER NOT NULL,
        basis_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reductions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        basis_id INTEGER NOT NULL REFERENCES bases(id),
        status TEXT NOT NULL,
        reduced INTEGER NOT NULL,
        delta_num TEXT NOT NULL,
        delta_den TEXT NOT NULL,
        result_json TEXT NOT NULL,
        cert_version TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        basis_id INTEGER NOT NULL REFERENCES bases(id),
        reduction_id INTEGER REFERENCES reductions(id),
        target_json TEXT NOT NULL,
        babai_json TEXT,
        box_json TEXT,
        created_at TEXT NOT NULL
      );
    `);
    const ins = this.db.prepare(
      "INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)"
    );
    ins.run("certificate_version", CERTIFICATE_VERSION);
    ins.run("created_at_utc", new Date().toISOString());
  }

  getMeta(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM meta WHERE key=?").get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  insertBasis(
    name: string,
    dim: number,
    nvec: number,
    basisJson: string
  ): number {
    const r = this.db
      .prepare(
        "INSERT INTO bases(name,dim,nvec,basis_json,created_at) VALUES(?,?,?,?,?)"
      )
      .run(name, dim, nvec, basisJson, new Date().toISOString());
    return Number(r.lastInsertRowid);
  }

  getBasis(id: number): BasisRow | undefined {
    return this.db.prepare("SELECT * FROM bases WHERE id=?").get(id) as
      | BasisRow
      | undefined;
  }

  listBases(): BasisRow[] {
    return this.db
      .prepare("SELECT * FROM bases ORDER BY id")
      .all() as unknown as BasisRow[];
  }

  insertReduction(
    basisId: number,
    status: string,
    reduced: boolean,
    deltaNum: string,
    deltaDen: string,
    resultJson: string
  ): number {
    const r = this.db
      .prepare(
        `INSERT INTO reductions(basis_id,status,reduced,delta_num,delta_den,result_json,cert_version,created_at)
         VALUES(?,?,?,?,?,?,?,?)`
      )
      .run(
        basisId,
        status,
        reduced ? 1 : 0,
        deltaNum,
        deltaDen,
        resultJson,
        CERTIFICATE_VERSION,
        new Date().toISOString()
      );
    return Number(r.lastInsertRowid);
  }

  getReduction(id: number): ReductionRow | undefined {
    return this.db.prepare("SELECT * FROM reductions WHERE id=?").get(id) as
      | ReductionRow
      | undefined;
  }

  listReductions(basisId?: number): ReductionRow[] {
    if (basisId === undefined)
      return this.db
        .prepare("SELECT * FROM reductions ORDER BY id")
        .all() as unknown as ReductionRow[];
    return this.db
      .prepare("SELECT * FROM reductions WHERE basis_id=? ORDER BY id")
      .all(basisId) as unknown as ReductionRow[];
  }

  insertTarget(
    basisId: number,
    reductionId: number | null,
    targetJson: string
  ): number {
    const r = this.db
      .prepare(
        "INSERT INTO targets(basis_id,reduction_id,target_json,created_at) VALUES(?,?,?,?)"
      )
      .run(basisId, reductionId, targetJson, new Date().toISOString());
    return Number(r.lastInsertRowid);
  }

  updateTargetBabai(id: number, babaiJson: string): void {
    this.db.prepare("UPDATE targets SET babai_json=? WHERE id=?").run(
      babaiJson,
      id
    );
  }

  updateTargetBox(id: number, boxJson: string): void {
    this.db.prepare("UPDATE targets SET box_json=? WHERE id=?").run(
      boxJson,
      id
    );
  }

  getTarget(id: number): TargetRow | undefined {
    return this.db.prepare("SELECT * FROM targets WHERE id=?").get(id) as
      | TargetRow
      | undefined;
  }

  listTargets(): TargetRow[] {
    return this.db
      .prepare("SELECT * FROM targets ORDER BY id")
      .all() as unknown as TargetRow[];
  }

  close(): void {
    this.db.close();
  }
}

