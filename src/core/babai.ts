import { Rat } from "./rat";
import { gramSchmidt } from "./gs";
import {
  IVec, IMat, RVec, imatMul, rdot, rfromI, rscale, rsub, rnorm2,
} from "./vec";

export interface BabaiResult {
  reducedCoeffs: string[];      // 相对于约简基 B' 的整数系数
  point: IVec;                  // 格点（整数向量）
  distanceSqRat: { num: string; den: string }; // 精确平方距离
  distanceApprox: number;       // 仅展示用近似距离
  residual: RVec;
  note: string;
}

// Babai 最近平面（贪心）。要求 basis 已 LLL 约简（调用方负责）。
// 平局规则与 LLL 一致：半整数远离零。
export function babaiNearestPlane(basis: IMat, target: IVec): BabaiResult {
  const n = basis.length;
  const dim = target.length;
  const gs = gramSchmidt(basis);
  if (gs.dependent) throw new Error("基线性相关，无法执行 Babai");

  const coeffs: bigint[] = new Array(n).fill(0n);
  let y: RVec = rfromI(target);
  const point: IVec = new Array(dim).fill(0n);

  for (let i = n - 1; i >= 0; i--) {
    const ci = rdot(y, gs.bstar[i]).div(gs.B2[i]);
    const mi = ci.nearestIntHalfAway();
    coeffs[i] = mi;
    y = rsub(y, rscale(rfromI(basis[i]), Rat.make(mi)));
    for (let t = 0; t < dim; t++) point[t] += mi * basis[i][t];
  }

  const dist2 = rnorm2(y);
  return {
    reducedCoeffs: coeffs.map((x) => x.toString()),
    point,
    distanceSqRat: { num: dist2.n.toString(), den: dist2.d.toString() },
    distanceApprox: Math.sqrt(dist2.toNumberApprox()),
    residual: y,
    note: "Babai 最近平面为近似结果，不保证是整个格上的全局最近点。",
  };
}

// 将约简基系数映射回原始基系数：point = c B' = (c U) B0。
export function mapCoeffsToOriginal(coeffs: bigint[], U: IMat): bigint[] {
  const row: IMat = [coeffs];
  const mapped = imatMul(row, U);
  return mapped[0];
}

export interface BoxResult {
  radius: number;
  combos: number;
  bestCoeffs: string[];
  bestPoint: IVec;
  bestDistanceSqRat: { num: string; den: string };
  bestDistanceApprox: number;
  babaiIsBoxOptimal: boolean;
  note: string;
}

// 在约简基系数盒 [-R,R]^n 内穷举（确定性，按字典序）。
// 仅为有限对照，盒内最优不等于全格精确最近点。
export function enumerateBox(
  basis: IMat,
  target: IVec,
  radius: number,
  babai: BabaiResult,
): BoxResult {
  if (!Number.isInteger(radius) || radius < 0) {
    throw new Error("系数盒半径必须是非负整数");
  }
  const n = basis.length;
  const dim = target.length;
  const combos = Math.pow(2 * radius + 1, n);
  if (!Number.isFinite(combos)) throw new Error("系数盒过大");

  let bestD2: Rat | null = null;
  let bestCoeffs: bigint[] = [];
  let bestPoint: IVec = [];
  const c = new Array<bigint>(n).fill(-BigInt(radius));

  const total = BigInt(combos);
  for (let count = 0n; count < total; count++) {
    const p: IVec = new Array(dim).fill(0n);
    for (let i = 0; i < n; i++)
      for (let t = 0; t < dim; t++) p[t] += c[i] * basis[i][t];
    let d2 = Rat.ZERO;
    for (let t = 0; t < dim; t++) {
      const diff = Rat.make(BigInt(target[t]) - p[t]);
      d2 = d2.add(diff.mul(diff));
    }
    if (bestD2 === null || d2.lt(bestD2)) {
      bestD2 = d2;
      bestCoeffs = c.slice();
      bestPoint = p.slice();
    }
    // 字典序加一
    for (let i = n - 1; i >= 0; i--) {
      c[i] += 1n;
      if (c[i] <= BigInt(radius)) break;
      c[i] = -BigInt(radius);
    }
  }

  const bd2 = bestD2 as Rat;
  const babaiD2 = Rat.make(BigInt(babai.distanceSqRat.num), BigInt(babai.distanceSqRat.den));
  return {
    radius,
    combos,
    bestCoeffs: bestCoeffs.map((x) => x.toString()),
    bestPoint,
    bestDistanceSqRat: { num: bd2.n.toString(), den: bd2.d.toString() },
    bestDistanceApprox: Math.sqrt(bd2.toNumberApprox()),
    babaiIsBoxOptimal: babaiD2.eq(bd2),
    note: "盒内穷举仅覆盖有限系数范围，盒内最优不代表整个格的精确最近点。",
  };
}
