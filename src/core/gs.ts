import { Rat } from "./rat";
import { IVec, RVec, rdot, rfromI, rscale, rsub, rnorm2 } from "./vec";

// Gram-Schmidt 结果：
// bstar[i] 正交向量（有理数），mu[i][j] = <b_i,b*_j>/<b*_j,b*_j>（j<i），
// B2[j] = ||b*_j||^2（正有理数，若为零则输入线性相关）。
export interface GSResult {
  bstar: RVec[];
  mu: Rat[][];
  B2: Rat[];
  dependent: boolean;
  zeroIndex: number; // 首个使 b*_i = 0 的下标，-1 表示线性无关
}

export function gramSchmidt(basis: IVec[]): GSResult {
  const n = basis.length;
  const bstar: RVec[] = [];
  const mu: Rat[][] = [];
  const B2: Rat[] = [];
  let zeroIndex = -1;

  for (let i = 0; i < n; i++) {
    let vi = rfromI(basis[i]);
    const row: Rat[] = new Array(i).fill(Rat.ZERO);
    for (let j = 0; j < i; j++) {
      if (B2[j].isZero()) continue;
      const c = rdot(rfromI(basis[i]), bstar[j]).div(B2[j]);
      row[j] = c;
      vi = rsub(vi, rscale(bstar[j], c));
    }
    const norm = rnorm2(vi);
    bstar.push(vi);
    mu.push(row);
    B2.push(norm);
    if (norm.isZero() && zeroIndex === -1) zeroIndex = i;
  }
  return { bstar, mu, B2, dependent: zeroIndex !== -1, zeroIndex };
}
