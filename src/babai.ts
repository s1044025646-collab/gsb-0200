/**
 * Babai 最近平面（Nearest Plane）近似最近点，系数全部用精确有理数求得。
 * 结果只是近似，不保证是整个格的全局最近点。
 */
import { Frac, ZERO, frac, sub, add, mul, roundNearest } from "./frac";
import { IMat, IVec, normSqInt, vecSub } from "./matrix";
import { gramSchmidt } from "./gso";

export interface BabaiResult {
  ok: boolean;
  error?: string;
  coeffsReduced: bigint[];
  coeffsOriginal: bigint[];
  latticePoint: IVec;
  residual: IVec;
  distSq: bigint;
  distDecimal: string;
  ties: number[];
}

function failBabai(error: string): BabaiResult {
  return {
    ok: false,
    error,
    coeffsReduced: [],
    coeffsOriginal: [],
    latticePoint: [],
    residual: [],
    distSq: 0n,
    distDecimal: "",
    ties: [],
  };
}

function floorSqrt(v: bigint): bigint {
  if (v < 2n) return v;
  let x = 1n << BigInt(v.toString().length);
  while (true) {
    const y = (x + v / x) / 2n;
    if (y >= x) return x;
    x = y;
  }
}

/** sqrt(distSq) 的十进制展示（仅人类阅读，不参与任何判定） */
function sqrtDecimal(v: bigint, digits = 30): string {
  if (v === 0n) return "0";
  const root = floorSqrt(v);
  let rem = v - root * root;
  let w = root;
  let f = "";
  for (let i = 0; i < digits && rem > 0n; i++) {
    rem *= 100n;
    let d = 9n;
    while ((20n * w + d) * d > rem && d > 0n) d--;
    rem -= (20n * w + d) * d;
    w = w * 10n + d;
    f += d.toString();
  }
  return root.toString() + (f ? "." + f : "");
}

export function babaiNearestPlane(
  reducedBasis: IMat,
  target: IVec,
  U: IMat
): BabaiResult {
  const n = reducedBasis.length;
  if (n === 0) return failBabai("基为空");
  if (target.length !== reducedBasis[0].length)
    return failBabai("目标向量维数与基不一致");

  const g = gramSchmidt(reducedBasis);
  if (g.dependentIndex !== -1)
    return failBabai("基线性相关，无法运行最近平面");

  let residual: Frac[] = target.map((x) => frac(x));
  const coeffs = new Array<bigint>(n).fill(0n);
  const ties: number[] = [];

  for (let i = n - 1; i >= 0; i--) {
    let inner = ZERO;
    for (let t = 0; t < g.dim; t++)
      inner = add(inner, mul(residual[t], g.bstar[i][t]));
    const c: Frac = { n: inner.n * g.B[i].d, d: inner.d * g.B[i].n };
    const { q, tie } = roundNearest(c);
    coeffs[i] = q;
    if (tie) ties.push(i);
    for (let t = 0; t < g.dim; t++)
      residual[t] = sub(residual[t], mul(frac(q), g.bstar[i][t]));
  }

  const point: IVec = new Array(reducedBasis[0].length).fill(0n);
  for (let i = 0; i < n; i++)
    for (let t = 0; t < point.length; t++)
      point[t] += coeffs[i] * reducedBasis[i][t];

  // 行向量约定 B'=U B，c' 为行向量：c'B' = (c'U) B
  const coeffsOrig: IVec = new Array(n).fill(0n);
  for (let j = 0; j < n; j++) {
    let s = 0n;
    for (let i = 0; i < n; i++) s += coeffs[i] * U[i][j];
    coeffsOrig[j] = s;
  }

  const diff = vecSub(target, point);
  const distSq = normSqInt(diff);

  return {
    ok: true,
    coeffsReduced: coeffs,
    coeffsOriginal: coeffsOrig,
    latticePoint: point,
    residual: diff,
    distSq,
    distDecimal: sqrtDecimal(distSq),
    ties,
  };
}

export interface BoxResult {
  ok: boolean;
  error?: string;
  radius: bigint;
  explored: number;
  bestCoeffsReduced: bigint[];
  bestPoint: IVec;
  bestDistSq: bigint;
  note: string;
}

/**
 * 有限系数盒穷举：以给定中心（通常是 Babai 系数）为中心，
 * c_i ∈ [center_i - radius, center_i + radius] 枚举约简基组合。
 * 盒内最优不代表整个格的全局最近点。
 */
export function enumerateBox(
  reducedBasis: IMat,
  target: IVec,
  center: bigint[],
  radius: bigint,
  maxExplored = 2_000_000
): BoxResult {
  const n = reducedBasis.length;
  const empty = (error: string): BoxResult => ({
    ok: false,
    error,
    radius,
    explored: 0,
    bestCoeffsReduced: [],
    bestPoint: [],
    bestDistSq: 0n,
    note: "",
  });
  if (radius < 0n) return empty("半径必须非负");
  const total = (2n * radius + 1n) ** BigInt(n);
  if (total > BigInt(maxExplored))
    return empty(
      `盒内格点数量 ${total} 超过枚举上限 ${maxExplored}；请缩小半径`
    );

  const dim = reducedBasis[0].length;
  let bestDistSq = -1n;
  let bestPoint: IVec = [];
  let bestCoeffs: bigint[] = [];
  let explored = 0;

  const cur = center.map((c) => c - radius);
  while (true) {
    const point: IVec = new Array(dim).fill(0n);
    for (let i = 0; i < n; i++)
      for (let t = 0; t < dim; t++) point[t] += cur[i] * reducedBasis[i][t];
    const d2 = normSqInt(vecSub(target, point));
    if (bestDistSq === -1n || d2 < bestDistSq) {
      bestDistSq = d2;
      bestPoint = point;
      bestCoeffs = cur.slice();
    }
    explored++;

    let carry = 0;
    while (carry < n) {
      cur[carry] += 1n;
      if (cur[carry] <= center[carry] + radius) break;
      cur[carry] = center[carry] - radius;
      carry++;
    }
    if (carry === n) break;
  }

  return {
    ok: true,
    radius,
    explored,
    bestCoeffsReduced: bestCoeffs,
    bestPoint,
    bestDistSq,
    note:
      "盒内最优仅在有限系数盒内成立，不代表整个格的全局最近点（盒外未被搜索）。",
  };
}
