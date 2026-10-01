/** 整数矩阵 / 向量工具（BigInt） */

export type IVec = bigint[];
export type IMat = bigint[][];

/** 向量解析：十进制字符串 -> bigint 向量 */
export function parseVec(row: string[]): IVec {
  return row.map((x) => {
    const t = x.trim();
    if (!/^[+-]?[0-9]+$/.test(t))
      throw new Error(`不是合法十进制整数: "${x}"`);
    return BigInt(t);
  });
}

export function vecToStr(v: IVec): string[] {
  return v.map((x) => x.toString());
}

export function matToStr(m: IMat): string[][] {
  return m.map(vecToStr);
}

/** 单位矩阵 */
export function identity(n: number): IMat {
  const m: IMat = Array.from({ length: n }, () => new Array(n).fill(0n));
  for (let i = 0; i < n; i++) m[i][i] = 1n;
  return m;
}

/** 整数矩阵乘整数矩阵 */
export function matMul(a: IMat, b: IMat): IMat {
  const r = a.length;
  const k = b.length;
  const c = k === 0 ? 0 : b[0].length;
  const out: IMat = Array.from({ length: r }, () => new Array(c).fill(0n));
  for (let i = 0; i < r; i++)
    for (let t = 0; t < k; t++) {
      const av = a[i][t];
      if (av === 0n) continue;
      for (let j = 0; j < c; j++) out[i][j] += av * b[t][j];
    }
  return out;
}

/** 整数矩阵乘整数向量（矩阵每行与向量内积） */
export function matVec(a: IMat, v: IVec): IVec {
  const k = a.length;
  const c = k === 0 ? 0 : a[0].length;
  const out: IVec = new Array(c).fill(0n);
  for (let j = 0; j < c; j++)
    for (let i = 0; i < k; i++) out[j] += a[i][j] * v[i];
  return out;
}

/** 向量相加 / 缩放（整数） */
export function vecAdd(a: IVec, b: IVec): IVec {
  return a.map((x, i) => x + b[i]);
}
export function vecSub(a: IVec, b: IVec): IVec {
  return a.map((x, i) => x - b[i]);
}
export function vecScale(a: IVec, s: bigint): IVec {
  return a.map((x) => x * s);
}

/** 整数内积 */
export function dot(a: IVec, b: IVec): bigint {
  let s = 0n;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** 整数平方范数 */
export function normSqInt(a: IVec): bigint {
  return dot(a, a);
}

/** 交换矩阵两行（原地） */
export function swapRows(m: IMat, i: number, j: number): void {
  const t = m[i];
  m[i] = m[j];
  m[j] = t;
}

/**
 * 小整数矩阵行列式（Bareiss / 分数消去，精确）。
 * 供证书独立核验单模性使用。
 */
export function determinant(m: IMat): bigint {
  const n = m.length;
  if (n === 0) return 1n;
  if (m.some((r) => r.length !== n)) throw new Error("行列式需要方阵");
  // 复制为 Frac 矩阵做高斯消元
  const a = m.map((r) => r.map((x) => ({ n: x, d: 1n })));
  let sign = 1n;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    while (pivot < n && a[pivot][col].n === 0n) pivot++;
    if (pivot === n) return 0n;
    if (pivot !== col) {
      const t = a[pivot];
      a[pivot] = a[col];
      a[col] = t;
      sign = -sign;
    }
    for (let row = col + 1; row < n; row++) {
      if (a[row][col].n === 0n) continue;
      for (let j = col + 1; j < n; j++) {
        // a[row][j] = a[row][j] - a[row][col]/a[col][col] * a[col][j]
        const num =
          a[row][j].n * a[col][col].n * a[row][col].d * a[col][j].d -
          a[row][col].n * a[col][j].n * a[row][j].d * a[col][col].d;
        const den =
          a[col][col].n * a[row][j].d * a[row][col].d * a[col][j].d;
        let nn = num;
        let dd = den;
        if (dd < 0n) {
          nn = -nn;
          dd = -dd;
        }
        a[row][j] = { n: nn, d: dd };
      }
      a[row][col] = { n: 0n, d: 1n };
    }
  }
  let det = sign;
  for (let i = 0; i < n; i++) {
    const f = a[i][i];
    det = (det * f.n) / f.d;
  }
  return det;
}

/** 十进制位数（不含符号） */
export function decimalDigits(v: bigint): number {
  const s = v < 0n ? (-v).toString() : v.toString();
  return s.length;
}

/** 矩阵中最大十进制位数 */
export function maxDigits(m: IMat): number {
  let mx = 0;
  for (const row of m) for (const x of row) mx = Math.max(mx, decimalDigits(x));
  return mx;
}
