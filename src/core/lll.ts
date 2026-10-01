import { Rat, rat } from "./rat";
import { GSResult, gramSchmidt } from "./gs";
import {
  IVec, IMat, identityMat, imatMul, inorm2, intDet,
} from "./vec";

export interface LLLParams {
  deltaNum: bigint; // delta = num/den
  deltaDen: bigint;
  maxIterations: number; // 主循环（k 推进/交换）预算
  maxBits: number;       // 中间整数与输出元素十进制位数上限
}

export const DEFAULT_PARAMS: LLLParams = {
  deltaNum: 3n,
  deltaDen: 4n,
  maxIterations: 100000,
  maxBits: 10000,
};

// 合法 LLL delta 区间：1/4 < delta < 1（经典 LLL 多项式收敛条件）。
export function validateDelta(num: bigint, den: bigint): void {
  if (den <= 0n) throw new Error("delta 分母必须为正");
  const d = Rat.make(num, den);
  if (!(d.gt(rat(1, 4)) && d.lt(Rat.ONE))) {
    throw new Error("delta 必须满足 1/4 < delta < 1");
  }
}

export interface LLLStep {
  type: "size" | "swap";
  k: number;
  j?: number;
  q?: string;
}

export type LLLStatus =
  | "reduced"
  | "dependent_input"
  | "zero_vector"
  | "iteration_budget_exhausted"
  | "bit_budget_exhausted";

export interface LLLResult {
  status: LLLStatus;
  basis: IMat;          // B'（当前基；中断时为部分约简结果）
  U: IMat;              // 始终满足 basis = U * B0
  delta: { num: string; den: string };
  iterations: number;
  swaps: number;
  steps: LLLStep[];
  gs: GSResult;         // 最终状态的 GS（用于证书）
  message: string;
}

function maxDecimalBits(m: IMat): number {
  let mx = 0;
  for (const row of m) for (const x of row) {
    const s = x < 0n ? -x : x;
    const len = s.toString(10).length;
    if (len > mx) mx = len;
  }
  return mx;
}

export interface InputCheck {
  ok: boolean;
  reason?: "zero_vector" | "dependent_input" | "bad_shape";
  index?: number;
}

export function checkInput(B0: IMat): InputCheck {
  const n = B0.length;
  if (n === 0) return { ok: false, reason: "bad_shape" };
  const dim = B0[0].length;
  if (dim === 0) return { ok: false, reason: "bad_shape" };
  for (let i = 0; i < n; i++) {
    if (B0[i].length !== dim) return { ok: false, reason: "bad_shape", index: i };
    if (inorm2(B0[i]) === 0n) return { ok: false, reason: "zero_vector", index: i };
  }
  const gs = gramSchmidt(B0);
  if (gs.dependent) {
    return { ok: false, reason: "dependent_input", index: gs.zeroIndex };
  }
  return { ok: true };
}

// 行向量版 LLL（基向量为行，B' = U B）。
export function lllReduce(B0: IMat, params: LLLParams = DEFAULT_PARAMS): LLLResult {
  validateDelta(params.deltaNum, params.deltaDen);
  const n = B0.length;
  const B: IMat = B0.map((r) => r.slice());
  const U: IMat = identityMat(n);
  const steps: LLLStep[] = [];
  const delta = Rat.make(params.deltaNum, params.deltaDen);

  const input = checkInput(B0);
  const baseMessage =
    input.reason === "zero_vector"
      ? `第 ${input.index} 个基向量为零向量`
      : input.reason === "dependent_input"
      ? `输入线性相关（第 ${input.index} 个 Gram-Schmidt 向量为零）`
      : input.reason === "bad_shape"
      ? "基矩阵形状非法"
      : "";
  if (!input.ok && input.reason !== "dependent_input") {
    return {
      status: input.reason === "zero_vector" ? "zero_vector" : "dependent_input",
      basis: B, U,
      delta: { num: params.deltaNum.toString(), den: params.deltaDen.toString() },
      iterations: 0, swaps: 0, steps,
      gs: gramSchmidt(B), message: baseMessage,
    };
  }

  let k = 1;
  let iterations = 0;
  let swaps = 0;

  // 行操作：B_i <- B_i - q B_j，对应 U_i <- U_i - q U_j。
  function sizeReduce(i: number, j: number, q: bigint) {
    for (let t = 0; t < B[i].length; t++) B[i][t] -= q * B[j][t];
    for (let t = 0; t < n; t++) U[i][t] -= q * U[j][t];
    steps.push({ type: "size", k: i, j, q: q.toString() });
  }

  function swapRows(i: number) {
    const tb = B[i]; B[i] = B[i - 1]; B[i - 1] = tb;
    const tu = U[i]; U[i] = U[i - 1]; U[i - 1] = tu;
    swaps++;
    steps.push({ type: "swap", k: i });
  }

  while (k < n) {
    if (iterations >= params.maxIterations) {
      return finish("iteration_budget_exhausted",
        `迭代预算 ${params.maxIterations} 耗尽，约简未完成；当前结果为部分约简，不得视为 LLL 约简基`);
    }
    iterations++;

    // 小维数下每轮从整数基精确重算 GS，避免增量更新累积误差，保证判定始终精确。
    const gs = gramSchmidt(B);

    // 尺寸约简 k-1
    const muKKm = gs.mu[k][k - 1];
    const q = muKKm.nearestIntHalfAway();
    if (q !== 0n) {
      sizeReduce(k, k - 1, q);
      if (maxDecimalBits(B) > params.maxBits || maxDecimalBits(U) > params.maxBits) {
        return finish("bit_budget_exhausted",
          `整数位数预算 ${params.maxBits} 位耗尽，约简未完成`);
      }
    }

    // 用尺寸约简后的精确 GS 重算，再检查 Lovasz：
    //   B2[k] + mu^2 B2[k-1] >= delta * B2[k-1]
    const gsNow = gramSchmidt(B);
    const muNow = gsNow.mu[k][k - 1];
    const lhs = gsNow.B2[k].add(muNow.mul(muNow).mul(gsNow.B2[k - 1]));
    const rhs = delta.mul(gsNow.B2[k - 1]);
    if (lhs.gte(rhs)) {
      // 对 j = k-2 .. 0 尺寸约简
      for (let j = k - 2; j >= 0; j--) {
        const qj = gramSchmidt(B).mu[k][j].nearestIntHalfAway();
        if (qj !== 0n) {
          sizeReduce(k, j, qj);
          if (maxDecimalBits(B) > params.maxBits || maxDecimalBits(U) > params.maxBits) {
            return finish("bit_budget_exhausted",
              `整数位数预算 ${params.maxBits} 位耗尽，约简未完成`);
          }
        }
      }
      k++;
    } else {
      swapRows(k);
      k = Math.max(k - 1, 1);
    }
  }

  const finalGS = gramSchmidt(B);
  if (finalGS.dependent) {
    return finish("dependent_input",
      `约简过程中检测到线性相关（第 ${finalGS.zeroIndex} 个正交向量为零）`);
  }
  return finish("reduced", "LLL 约简完成，尺寸约简与全部 Lovasz 不等式均满足");

  function finish(status: LLLStatus, message: string): LLLResult {
    return {
      status, basis: B, U,
      delta: { num: params.deltaNum.toString(), den: params.deltaDen.toString() },
      iterations, swaps, steps, gs: gramSchmidt(B), message,
    };
  }
}

// 独立条件核验（不依赖约简过程记录）：尺寸约简 |mu_ij| <= 1/2，Lovasz。
export interface ConditionReport {
  sizeReduced: boolean;
  lovaszAll: boolean;
  violations: string[];
}

export function checkLLLConditions(
  basis: IMat,
  deltaNum: bigint,
  deltaDen: bigint,
): ConditionReport {
  validateDelta(deltaNum, deltaDen);
  const delta = Rat.make(deltaNum, deltaDen);
  const gs = gramSchmidt(basis);
  const violations: string[] = [];
  if (gs.dependent) {
    violations.push(`线性相关：第 ${gs.zeroIndex} 个 Gram-Schmidt 向量为零`);
    return { sizeReduced: false, lovaszAll: false, violations };
  }
  let sizeReduced = true;
  for (let i = 0; i < basis.length; i++) {
    for (let j = 0; j < i; j++) {
      if (gs.mu[i][j].abs().gt(rat(1, 2))) {
        sizeReduced = false;
        violations.push(`尺寸约简失败：|mu[${i}][${j}]| = ${render(gs.mu[i][j])} > 1/2`);
      }
    }
  }
  let lovaszAll = true;
  for (let k = 1; k < basis.length; k++) {
    const m = gs.mu[k][k - 1];
    const lhs = gs.B2[k].add(m.mul(m).mul(gs.B2[k - 1]));
    const rhs = delta.mul(gs.B2[k - 1]);
    if (lhs.lt(rhs)) {
      lovaszAll = false;
      violations.push(`Lovasz 失败于 k=${k}：${render(lhs)} < ${render(rhs)}`);
    }
  }
  return { sizeReduced, lovaszAll, violations };
}

function render(r: Rat): string {
  return r.d === 1n ? r.n.toString() : `${r.n.toString()}/${r.d.toString()}`;
}

// 供测试/证据使用：核验 B' = U B0 与 det(U) = ±1（独立整数乘法）。
export function verifyTransform(Bprime: IMat, U: IMat, B0: IMat) {
  const UB = imatMul(U, B0);
  let transformOk = UB.length === Bprime.length;
  if (transformOk) {
    for (let i = 0; i < UB.length; i++) {
      if (UB[i].length !== Bprime[i].length || UB[i].some((x, j) => x !== Bprime[i][j])) {
        transformOk = false;
        break;
      }
    }
  }
  return { transformOk, UB, detU: determinantOf(U) };
}

function determinantOf(m: IMat): bigint {
  return intDet(m);
}
