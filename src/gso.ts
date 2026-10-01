/**
 * 精确 Gram–Schmidt 正交化（在有理数域 Q 上进行，绝不使用浮点）。
 */
import { Frac, ZERO, frac, sub, mul, div, isZero, add } from "./frac";
import { IMat, dot } from "./matrix";

export interface GSO {
  n: number; // 向量个数
  dim: number; // 环境维数
  bstar: Frac[][]; // 正交向量（有理数向量）
  mu: Frac[][]; // mu[i][j]，j<i
  B: Frac[]; // B[i] = <b*_i, b*_i>
  /** 第一个使 b*_i == 0 的下标；不存在为 -1，表示满秩/线性无关 */
  dependentIndex: number;
}

function fdot(a: Frac[], b: Frac[]): Frac {
  let s = ZERO;
  for (let i = 0; i < a.length; i++) s = add(s, mul(a[i], b[i]));
  return s;
}

export function gramSchmidt(basis: IMat): GSO {
  const n = basis.length;
  const dim = n === 0 ? 0 : basis[0].length;
  const bstar: Frac[][] = [];
  const mu: Frac[][] = Array.from({ length: n }, () =>
    new Array(n).fill(ZERO)
  );
  const B: Frac[] = new Array(n).fill(ZERO);
  let dependentIndex = -1;

  for (let i = 0; i < n; i++) {
    // u = b_i（提升为分数）
    const u: Frac[] = basis[i].map((x) => frac(x));
    for (let j = 0; j < i; j++) {
      if (B[j].n === 0n) continue;
      // mu_ij = <b_i, b*_j> / <b*_j,b*_j>
      const bj = bstar[j];
      let inner = ZERO;
      for (let t = 0; t < dim; t++)
        inner = add(inner, mul(frac(basis[i][t]), bj[t]));
      mu[i][j] = div(inner, B[j]);
      for (let t = 0; t < dim; t++)
        u[t] = sub(u[t], mul(mu[i][j], bj[t]));
    }
    bstar.push(u);
    B[i] = fdot(u, u);
    if (dependentIndex === -1 && isZero(B[i])) dependentIndex = i;
  }

  return { n, dim, bstar, mu, B, dependentIndex };
}

/** 工具：整数向量与分数向量内积 */
export function intFracDot(a: bigint[], b: Frac[]): Frac {
  let s = ZERO;
  for (let i = 0; i < a.length; i++) s = add(s, mul(frac(a[i]), b[i]));
  return s;
}

export { dot };
