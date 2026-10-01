import { Rat, rat } from "./rat";

// 整数向量（BigInt）与整数矩阵工具；以及有理数向量用于 Gram-Schmidt。
export type IVec = bigint[];
export type IMat = bigint[][];
export type RVec = Rat[];
export type RMat = Rat[][];

export function parseIVec(rows: readonly (string | number)[] | string): IVec {
  let arr: unknown[];
  if (typeof rows === "string") arr = JSON.parse(rows);
  else arr = rows as unknown[];
  if (!Array.isArray(arr)) throw new Error("向量必须是数组");
  return (arr as (string | number)[]).map((x) => {
    const s = typeof x === "number" ? x.toString() : String(x);
    return Rat.fromDecimal(s).n;
  });
}

export function ivecToStrings(v: IVec): string[] {
  return v.map((x) => x.toString(10));
}

export function parseIMat(m: readonly (readonly (string | number)[])[] | string): IMat {
  let arr: unknown;
  if (typeof m === "string") arr = JSON.parse(m);
  else arr = m;
  if (!Array.isArray(arr)) throw new Error("矩阵必须是数组的数组");
  return (arr as unknown[]).map((r, i) => {
    if (!Array.isArray(r)) throw new Error(`第 ${i} 行不是数组`);
    return parseIVec(r as (string | number)[]);
  });
}

export function imatToStrings(m: IMat): string[][] {
  return m.map(ivecToStrings);
}

export function idot(a: IVec, b: IVec): bigint {
  if (a.length !== b.length) throw new Error("整数向量点积维度不一致");
  let s = 0n;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function inorm2(a: IVec): bigint {
  return idot(a, a);
}

export function iadd(a: IVec, b: IVec): IVec {
  return a.map((x, i) => x + b[i]);
}
export function isub(a: IVec, b: IVec): IVec {
  return a.map((x, i) => x - b[i]);
}
export function iscale(a: IVec, k: bigint): IVec {
  return a.map((x) => x * k);
}

// C = A B，A 为 r x p，B 为 p x c
export function imatMul(A: IMat, B: IMat): IMat {
  const r = A.length;
  const p = B.length;
  if (r === 0) return [];
  if (A[0].length !== p) throw new Error("矩阵乘法维度不匹配");
  const c = p === 0 ? 0 : B[0].length;
  const out: IMat = [];
  for (let i = 0; i < r; i++) {
    const row: IVec = new Array(c).fill(0n);
    for (let k = 0; k < p; k++) {
      const aik = A[i][k];
      for (let j = 0; j < c; j++) row[j] += aik * B[k][j];
    }
    out.push(row);
  }
  return out;
}

export function identityMat(n: number): IMat {
  const m: IMat = [];
  for (let i = 0; i < n; i++) {
    const row: IVec = new Array(n).fill(0n);
    row[i] = 1n;
    m.push(row);
  }
  return m;
}

// 精确整数行列式（带分数消元会失真，这里用 Bareiss 精确算法）。
export function intDet(m: IMat): bigint {
  const n = m.length;
  if (n === 0) return 1n;
  if (m.some((r) => r.length !== n)) throw new Error("行列式需要方阵");
  const a: bigint[][] = m.map((r) => r.slice());
  let sign = 1n;
  let prev = 1n;
  for (let k = 0; k < n - 1; k++) {
    let piv = -1;
    for (let i = k; i < n; i++) if (a[i][k] !== 0n) { piv = i; break; }
    if (piv === -1) return 0n;
    if (piv !== k) {
      const t = a[k]; a[k] = a[piv]; a[piv] = t;
      sign = -sign;
    }
    for (let i = k + 1; i < n; i++) {
      for (let j = k + 1; j < n; j++) {
        const num = a[i][j] * a[k][k] - a[i][k] * a[k][j];
        if (num % prev !== 0n) throw new Error("Bareiss 除法异常");
        a[i][j] = num / prev;
      }
      a[i][k] = 0n;
    }
    prev = a[k][k];
    if (prev === 0n) return 0n;
  }
  return sign * a[n - 1][n - 1];
}

// ---- 有理数向量 ----
export function rdot(a: RVec, b: RVec): Rat {
  let s = Rat.ZERO;
  for (let i = 0; i < a.length; i++) s = s.add(a[i].mul(b[i]));
  return s;
}
export function rscale(a: RVec, k: Rat): RVec {
  return a.map((x) => x.mul(k));
}
export function rsub(a: RVec, b: RVec): RVec {
  return a.map((x, i) => x.sub(b[i]));
}
export function rfromI(v: IVec): RVec {
  return v.map((x) => rat(x));
}
export function rnorm2(a: RVec): Rat {
  return rdot(a, a);
}
