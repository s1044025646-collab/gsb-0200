/** 业务编排：导入基 -> 约简 -> 证书/核验 -> Babai/盒对照 */
import { Store } from "./db";
import { frac } from "./frac";
import {
  IMat,
  IVec,
  parseVec,
  vecToStr,
  matToStr,
  matVec,
} from "./matrix";
import {
  lllReduce,
  LllResult,
  LIMITS,
  validateDelta,
} from "./lll";
import {
  babaiNearestPlane,
  enumerateBox,
  BabaiResult,
  BoxResult,
} from "./babai";
import { verifyCertificate, CERTIFICATE_VERSION } from "./verify";

export { LIMITS, CERTIFICATE_VERSION };

function parseMatrix(rows: string[][]): IMat {
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error("基必须是非空二维十进制字符串数组");
  return rows.map((r, i) => {
    if (!Array.isArray(r)) throw new Error(`第 ${i} 行不是数组`);
    return parseVec(r);
  });
}

function resultToJson(r: LllResult) {
  return JSON.stringify({
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
  });
}

function lllFromJson(json: string): LllResult {
  const o = JSON.parse(json);
  return {
    status: o.status,
    reduced: o.reduced,
    basisPrime: (o.basis_prime as string[][]).map(parseVec),
    U: (o.U as string[][]).map(parseVec),
    original: (o.original as string[][]).map(parseVec),
    delta: frac(BigInt(o.delta_num), BigInt(o.delta_den)),
    iterations: o.iterations,
    swaps: o.swaps,
    sizeReductions: o.size_reductions,
    maxDigitsSeen: o.max_digits_seen,
    dependentIndex: o.dependent_index,
    steps: o.steps ?? [],
    message: o.message,
  };
}

function babaiToJson(b: BabaiResult) {
  if (!b.ok) return JSON.stringify({ ok: false, error: b.error });
  return JSON.stringify({
    ok: true,
    coeffs_reduced: b.coeffsReduced.map((x) => x.toString()),
    coeffs_original: b.coeffsOriginal.map((x) => x.toString()),
    lattice_point: vecToStr(b.latticePoint),
    residual: vecToStr(b.residual),
    dist_sq: b.distSq.toString(),
    dist_decimal: b.distDecimal,
    half_integer_ties: b.ties,
    guarantee:
      "Babai 最近平面只给出近似最近点，不保证是整个格的全局最近点。",
  });
}

function boxToJson(x: BoxResult) {
  return JSON.stringify({
    ok: x.ok,
    error: x.error,
    radius: x.radius.toString(),
    explored: x.explored,
    best_coeffs_reduced: x.bestCoeffsReduced.map((v) => v.toString()),
    best_point: vecToStr(x.bestPoint),
    best_dist_sq: x.bestDistSq.toString(),
    note: x.note,
  });
}

export class Service {
  constructor(private store: Store) {}

  limits() {
    return {
      max_basis_vectors: LIMITS.MAX_BASIS_VECTORS,
      max_ambient_dim: LIMITS.MAX_AMBIENT_DIM,
      max_integer_digits: LIMITS.MAX_INTEGER_DIGITS,
      default_delta: "3/4",
      default_iteration_budget: LIMITS.DEFAULT_ITERATION_BUDGET,
      default_digit_budget: LIMITS.DEFAULT_DIGIT_BUDGET,
      tie_breaking: "半整数平局向远离 0 方向舍入（half away from zero）",
      certificate_version: CERTIFICATE_VERSION,
    };
  }

  importBasis(name: string, rows: string[][]) {
    const m = parseMatrix(rows);
    const id = this.store.insertBasis(
      name || `basis-${Date.now()}`,
      m[0].length,
      m.length,
      JSON.stringify(matToStr(m))
    );
    return { id, dim: m[0].length, nvec: m.length };
  }

  listBases() {
    return this.store.listBases().map((b) => ({
      id: b.id,
      name: b.name,
      dim: b.dim,
      nvec: b.nvec,
      basis: JSON.parse(b.basis_json),
      created_at: b.created_at,
    }));
  }

  reduce(
    basisId: number,
    opts: {
      deltaNum?: string;
      deltaDen?: string;
      iterationBudget?: number;
      digitBudget?: number;
    } = {}
  ) {
    const row = this.store.getBasis(basisId);
    if (!row) throw new Error(`格基 ${basisId} 不存在`);
    const basis = parseMatrix(JSON.parse(row.basis_json));
    const delta = frac(
      BigInt(opts.deltaNum ?? "3"),
      BigInt(opts.deltaDen ?? "4")
    );
    const dErr = validateDelta(delta);
    if (dErr) throw new Error(dErr);
    const result = lllReduce(basis, {
      delta,
      iterationBudget: opts.iterationBudget,
      digitBudget: opts.digitBudget,
    });
    const id = this.store.insertReduction(
      basisId,
      result.status,
      result.reduced,
      result.delta.n.toString(),
      result.delta.d.toString(),
      resultToJson(result)
    );
    return { reduction_id: id, ...JSON.parse(resultToJson(result)) };
  }

  summary(reductionId: number) {
    const row = this.store.getReduction(reductionId);
    if (!row) throw new Error(`约简记录 ${reductionId} 不存在`);
    const o = JSON.parse(row.result_json);
    return {
      reduction_id: row.id,
      basis_id: row.basis_id,
      status: o.status,
      reduced: o.reduced,
      delta: `${o.delta_num}/${o.delta_den}`,
      iterations: o.iterations,
      swaps: o.swaps,
      size_reductions: o.size_reductions,
      max_digits_seen: o.max_digits_seen,
      dependent_index: o.dependent_index,
      message: o.message,
      step_count: (o.steps ?? []).length,
      steps: o.steps ?? [],
    };
  }

  certificate(reductionId: number) {
    const row = this.store.getReduction(reductionId);
    if (!row) throw new Error(`约简记录 ${reductionId} 不存在`);
    const o = JSON.parse(row.result_json);
    return {
      version: row.cert_version,
      reduction_id: row.id,
      basis_id: row.basis_id,
      original_basis: o.original,
      reduced_basis: o.basis_prime,
      U: o.U,
      delta_num: o.delta_num,
      delta_den: o.delta_den,
      claimed_status: o.status,
    };
  }

  verify(
    reductionId: number,
    override?: {
      reducedBasis?: string[][];
      U?: string[][];
      deltaNum?: string;
      deltaDen?: string;
    }
  ) {
    const cert0 = this.certificate(reductionId);
    const cert = {
      version: cert0.version,
      originalBasis: parseMatrix(cert0.original_basis),
      reducedBasis: override?.reducedBasis
        ? parseMatrix(override.reducedBasis)
        : parseMatrix(cert0.reduced_basis),
      U: override?.U ? parseMatrix(override.U) : parseMatrix(cert0.U),
      deltaNum: override?.deltaNum ?? cert0.delta_num,
      deltaDen: override?.deltaDen ?? cert0.delta_den,
    };
    const res = verifyCertificate(cert);
    return { reduction_id: reductionId, ...res };
  }

  approximate(reductionId: number, targetRows: string[], boxRadius?: string) {
    const row = this.store.getReduction(reductionId);
    if (!row) throw new Error(`约简记录 ${reductionId} 不存在`);
    const o = JSON.parse(row.result_json);
    if (!o.reduced)
      throw new Error(
        `约简记录 ${reductionId} 状态为 ${o.status}，未完成全部条件，不能据此做 Babai`
      );
    const Bp = parseMatrix(o.basis_prime);
    const U = parseMatrix(o.U);
    const target = parseVec(targetRows);
    if (target.length !== Bp[0].length)
      throw new Error("目标维数与基不一致");
    const b = babaiNearestPlane(Bp, target, U);
    if (!b.ok) throw new Error(b.error);

    const original = parseMatrix(o.original);
    const pointViaOriginal = matVec(original, b.coeffsOriginal);
    const pointInOriginalLattice =
      pointViaOriginal.length === b.latticePoint.length &&
      pointViaOriginal.every((x, i) => x === b.latticePoint[i]);

    const targetId = this.store.insertTarget(
      row.basis_id,
      reductionId,
      JSON.stringify(vecToStr(target))
    );
    const babaiJson = babaiToJson(b);
    this.store.updateTargetBabai(targetId, babaiJson);

    let box = null;
    if (boxRadius !== undefined) {
      const radius = BigInt(boxRadius);
      const bx = enumerateBox(Bp, target, b.coeffsReduced, radius);
      this.store.updateTargetBox(targetId, boxToJson(bx));
      box = {
        ...JSON.parse(boxToJson(bx)),
        babai_dist_sq: b.distSq.toString(),
        babai_is_box_optimal: bx.ok ? bx.bestDistSq === b.distSq : null,
      };
    }

    return {
      target_id: targetId,
      reduction_id: reductionId,
      basis_id: row.basis_id,
      certificate_version: row.cert_version,
      babai: JSON.parse(babaiJson),
      independent_membership_check: {
        point_rebuilt_from_original_coeffs: vecToStr(pointViaOriginal),
        in_original_lattice: pointInOriginalLattice,
      },
      box,
    };
  }

  listTargets() {
    return this.store.listTargets().map((t) => ({
      id: t.id,
      basis_id: t.basis_id,
      reduction_id: t.reduction_id,
      target: JSON.parse(t.target_json),
      babai: t.babai_json ? JSON.parse(t.babai_json) : null,
      box: t.box_json ? JSON.parse(t.box_json) : null,
      created_at: t.created_at,
    }));
  }

  exportReduction(reductionId: number) {
    const cert = this.certificate(reductionId);
    const verification = this.verify(reductionId);
    return { certificate: cert, verification };
  }
}

export { lllFromJson };
