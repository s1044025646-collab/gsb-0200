/**
 * 精确 LLL 约简（BigInt 基 + Q 上 Gram–Schmidt）。
 * 同步维护整数变换矩阵 U，使 B' = U B。
 */
import {
  Frac,
  ZERO,
  frac,
  abs,
  gt,
  lte,
  add,
  mul,
  sub,
  roundNearest,
} from "./frac";
import {
  IMat,
  IVec,
  identity,
  swapRows,
  maxDigits,
  vecToStr,
  matToStr,
} from "./matrix";
import { GSO, gramSchmidt } from "./gso";

/** 公开上限 */
export const LIMITS = {
  MAX_BASIS_VECTORS: 16,
  MAX_AMBIENT_DIM: 64,
  MAX_INTEGER_DIGITS: 60,
  DEFAULT_DELTA: frac(3n, 4n),
  DEFAULT_ITERATION_BUDGET: 200000,
  DEFAULT_DIGIT_BUDGET: 100000,
};

export interface ReducedParams {
  deltaNum: string;
  deltaDen: string;
}

export interface StepRecord {
  index: number;
  type: "size-reduce" | "swap" | "check";
  detail: string;
}

export type LllStatus =
  | "reduced"
  | "zero-vector"
  | "dependent"
  | "digit-budget-exhausted"
  | "iteration-budget-exhausted"
  | "invalid-input";

export interface LllResult {
  status: LllStatus;
  reduced: boolean; // 仅当全部尺寸约简与 Lovász 条件独立核验通过才为 true
  basisPrime: IMat; // B'
  U: IMat; // U，B' = U B
  original: IMat;
  delta: Frac;
  iterations: number;
  swaps: number;
  sizeReductions: number;
  maxDigitsSeen: number;
  dependentIndex: number;
  steps: StepRecord[];
  message: string;
}

/** delta 必须落在区间 (1/4, 1)，用精确分数比较 */
export function validateDelta(delta: Frac): string | null {
  if (lte(delta, frac(1n, 4n)))
    return "delta 必须严格大于 1/4（当前 " + delta.n + "/" + delta.d + "）";
  if (!(delta.n < delta.d))
    return "delta 必须严格小于 1（当前 " + delta.n + "/" + delta.d + "）";
  return null;
}

function validateInput(basis: IMat): string | null {
  if (basis.length === 0) return "基不能为空";
  if (basis.length > LIMITS.MAX_BASIS_VECTORS)
    return `基向量数量 ${basis.length} 超过上限 ${LIMITS.MAX_BASIS_VECTORS}`;
  const dim = basis[0].length;
  if (dim === 0) return "环境维数不能为 0";
  if (dim > LIMITS.MAX_AMBIENT_DIM)
    return `环境维数 ${dim} 超过上限 ${LIMITS.MAX_AMBIENT_DIM}`;
  for (const row of basis) {
    if (row.length !== dim) return "所有基向量必须具有相同长度";
    for (const x of row) {
      const digits = (x < 0n ? -x : x).toString().length;
      if (digits > LIMITS.MAX_INTEGER_DIGITS)
        return `整数 ${x} 位数 ${digits} 超过上限 ${LIMITS.MAX_INTEGER_DIGITS}`;
    }
  }
  for (let i = 0; i < basis.length; i++) {
    if (basis[i].every((x) => x === 0n))
      return `第 ${i} 个基向量为零向量`;
  }
  return null;
}

/** Lovász 条件：B[k] >= (delta - mu[k][k-1]^2) * B[k-1] */
function lovaszHolds(g: GSO, k: number, delta: Frac): boolean {
  const mu = g.mu[k][k - 1];
  const rhs = mul(sub(delta, mul(mu, mu)), g.B[k - 1]);
  return !gt(rhs, g.B[k]); // B[k] >= rhs
}

export function lllReduce(
  inputBasis: IMat,
  options: {
    delta?: Frac;
    iterationBudget?: number;
    digitBudget?: number;
    recordSteps?: boolean;
  } = {}
): LllResult {
  const delta = options.delta ?? LIMITS.DEFAULT_DELTA;
  const iterationBudget =
    options.iterationBudget ?? LIMITS.DEFAULT_ITERATION_BUDGET;
  const digitBudget = options.digitBudget ?? LIMITS.DEFAULT_DIGIT_BUDGET;
  const recordSteps = options.recordSteps ?? true;

  const original = inputBasis.map((r) => r.slice());
  const base: LllResult = {
    status: "invalid-input",
    reduced: false,
    basisPrime: inputBasis,
    U: identity(inputBasis.length),
    original,
    delta,
    iterations: 0,
    swaps: 0,
    sizeReductions: 0,
    maxDigitsSeen: 0,
    dependentIndex: -1,
    steps: [],
    message: "",
  };

  const dErr = validateDelta(delta);
  if (dErr) {
    base.message = dErr;
    return base;
  }
  const err = validateInput(inputBasis);
  if (err) {
    base.status = err.includes("零向量") ? "zero-vector" : "invalid-input";
    base.message = err;
    return base;
  }

  const n = inputBasis.length;
  const B = inputBasis.map((r) => r.slice());
  const U = identity(n);
  const steps: StepRecord[] = [];
  let iterations = 0;
  let swaps = 0;
  let sizeReductions = 0;
  let maxDigitsSeen = maxDigits(B);
  let stepIndex = 0;

  const fail = (
    status: LllStatus,
    message: string,
    dep: number
  ): LllResult => ({
    status,
    reduced: false, // 关键：预算中断绝不冒充已约简
    basisPrime: B,
    U,
    original,
    delta,
    iterations,
    swaps,
    sizeReductions,
    maxDigitsSeen,
    dependentIndex: dep,
    steps,
    message,
  });

  let k = 1;
  while (k < n) {
    if (iterations++ >= iterationBudget)
      return fail(
        "iteration-budget-exhausted",
        `迭代预算 ${iterationBudget} 耗尽，停在 k=${k}，结果未完成约简`,
        -1
      );

    // 每轮重算 GSO（维数小，保证 mu/B 始终精确一致）
    const g = gramSchmidt(B);
    if (g.dependentIndex !== -1)
      return fail(
        "dependent",
        `检测到线性相关：第 ${g.dependentIndex} 个正交分量为零`,
        g.dependentIndex
      );

    // 尺寸约简 B[k]（对 j = k-1 .. 0）
    for (let j = k - 1; j >= 0; j--) {
      if (gt(abs(g.mu[k][j]), frac(1n, 2n))) {
        const { q, tie } = roundNearest(g.mu[k][j]);
        if (q !== 0n) {
          for (let t = 0; t < B[k].length; t++) B[k][t] -= q * B[j][t];
          for (let t = 0; t < n; t++) U[k][t] -= q * U[j][t];
          sizeReductions++;
          maxDigitsSeen = Math.max(maxDigitsSeen, maxDigits(B));
          if (maxDigitsSeen > digitBudget)
            return fail(
              "digit-budget-exhausted",
              `位数预算 ${digitBudget} 耗尽（中间整数膨胀），结果未完成约简`,
              -1
            );
          if (recordSteps)
            steps.push({
              index: stepIndex++,
              type: "size-reduce",
              detail: `k=${k},j=${j}, 减去 ${q}*B[${j}]${tie ? "（半整数平局，向远离0）" : ""}`,
            });
          // 基已变：重算 GSO 以保证后续判定精确
          const g2 = gramSchmidt(B);
          if (g2.dependentIndex !== -1)
            return fail(
              "dependent",
              `检测到线性相关：第 ${g2.dependentIndex} 个正交分量为零`,
              g2.dependentIndex
            );
          g.mu = g2.mu;
          g.B = g2.B;
          g.bstar = g2.bstar;
        }
      }
    }

    // Lovász 条件
    if (lovaszHolds(g, k, delta)) {
      if (recordSteps)
        steps.push({ index: stepIndex++, type: "check", detail: `k=${k} Lovász 成立` });
      k++;
    } else {
      swapRows(B, k, k - 1);
      swapRows(U, k, k - 1);
      swaps++;
      if (recordSteps)
        steps.push({ index: stepIndex++, type: "swap", detail: `交换 B[${k}] 与 B[${k - 1}]` });
      if (k > 1) k--;
    }
  }

  const finalG = gramSchmidt(B);
  if (finalG.dependentIndex !== -1)
    return fail(
      "dependent",
      `检测到线性相关：第 ${finalG.dependentIndex} 个正交分量为零`,
      finalG.dependentIndex
    );

  return {
    status: "reduced",
    reduced: true,
    basisPrime: B,
    U,
    original,
    delta,
    iterations,
    swaps,
    sizeReductions,
    maxDigitsSeen,
    dependentIndex: -1,
    steps,
    message: `LLL 约简完成（delta=${delta.n}/${delta.d}），共 ${swaps} 次交换、${sizeReductions} 次尺寸约简`,
  };
}

export function serializeResult(r: LllResult): Record<string, unknown> {
  return {
    status: r.status,
    reduced: r.reduced,
    basis_prime: matToStr(r.basisPrime),
    U: matToStr(r.U),
    original: matToStr(r.original),
    delta_num: r.delta.n.toString(),
    delta_den: r.delta.d.toString(),
    iterations: r.iterations,
    swaps: r.swaps,
    size_reductions: r.sizeReductions,
    max_digits_seen: r.maxDigitsSeen,
    dependent_index: r.dependentIndex,
    message: r.message,
    steps: r.steps,
  };
}
