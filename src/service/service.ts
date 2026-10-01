import { createHash } from "node:crypto";
import { Store } from "../db/store";
import {
  DEFAULT_PARAMS, LLLParams, LLLResult, lllReduce, checkInput, checkLLLConditions,
} from "../core/lll";
import {
  IMat, IVec, parseIMat, parseIVec, imatToStrings, ivecToStrings,
} from "../core/vec";
import { babaiNearestPlane, enumerateBox, mapCoeffsToOriginal } from "../core/babai";
import {
  LLLCertificate, buildCertificate, verifyCertificate,
  verifyPointInOriginalLattice, verifySameLatticePoint,
} from "../core/cert";

export const LIMITS = {
  maxDimension: 16,        // 环境维数上限
  maxBasisVectors: 16,     // 基向量数量上限（m <= dim）
  maxIntegerDigits: 10000, // 输入整数十进制位数上限
};

function nowIso(): string {
  return new Date().toISOString();
}

function fingerprintBasis(basis: IMat): string {
  return createHash("sha256").update(JSON.stringify(imatToStrings(basis))).digest("hex");
}

export class ValidationError extends Error {}

export class LLLService {
  constructor(private store: Store) {}

  validateBasisInput(rawRows: unknown): { basis: IMat; dim: number; m: number } {
    let basis: IMat;
    try {
      basis = parseIMat(typeof rawRows === "string" ? rawRows : (rawRows as never));
    } catch (e) {
      throw new ValidationError(`基解析失败: ${(e as Error).message}`);
    }
    const m = basis.length;
    if (m === 0) throw new ValidationError("基向量数量至少为 1");
    if (m > LIMITS.maxBasisVectors) {
      throw new ValidationError(`基向量数量 ${m} 超过上限 ${LIMITS.maxBasisVectors}`);
    }
    const dim = basis[0].length;
    if (dim === 0) throw new ValidationError("环境维数至少为 1");
    if (dim > LIMITS.maxDimension) {
      throw new ValidationError(`环境维数 ${dim} 超过上限 ${LIMITS.maxDimension}`);
    }
 if (m > dim) throw new ValidationError(`基向量数量 ${m} 不能大于环境维数 ${dim}`);
    for (let i = 0; i < m; i++) {
      if (basis[i].length !== dim) throw new ValidationError(`第 ${i} 行维数不一致`);
      for (let j = 0; j < dim; j++) {
        const digits = (basis[i][j] < 0n ? -basis[i][j] : basis[i][j]).toString(10).length;
        if (digits > LIMITS.maxIntegerDigits) {
          throw new ValidationError(`元素 [${i}][${j}] 位数 ${digits} 超过上限 ${LIMITS.maxIntegerDigits}`);
        }
      }
    }
    const chk = checkInput(basis);
    if (!chk.ok) {
      if (chk.reason === "zero_vector") {
        throw new ValidationError(`第 ${chk.index} 个基向量为零向量，拒绝导入`);
      }
      if (chk.reason === "dependent_input") {
        throw new ValidationError(`输入线性相关（第 ${chk.index} 个 Gram-Schmidt 向量为零），拒绝导入`);
      }
      throw new ValidationError("基矩阵形状非法");
    }
    return { basis, dim, m };
  }

  importBasis(rows: unknown, name?: string | null) {
    const { basis, dim, m } = this.validateBasisInput(rows);
    const createdAt = nowIso();
    const basisJson = JSON.stringify(imatToStrings(basis));
    const id = this.store.insertBasis(name ?? null, dim, m, basisJson, createdAt);
    return {
      id, name: name ?? null, dim, m,
      basis: imatToStrings(basis),
      basisVersion: fingerprintBasis(basis),
      createdAt,
    };
  }

  getBasis(id: number) {
    const rec = this.store.getBasis(id);
    if (!rec) throw new ValidationError(`基 id=${id} 不存在`);
    return {
      id: rec.id, name: rec.name, dim: rec.dim, m: rec.m,
      basis: JSON.parse(rec.basis_json) as string[][],
      basisVersion: createHash("sha256").update(rec.basis_json).digest("hex"),
      createdAt: rec.created_at,
    };
  }

  listBases() {
    return this.store.listBases().map((r) => ({
      id: r.id, name: r.name, dim: r.dim, m: r.m, createdAt: r.created_at,
    }));
  }

  reduce(
    basisId: number,
    opts: { deltaNum?: string; deltaDen?: string; maxIterations?: number; maxBits?: number } = {},
  ) {
    const bRec = this.store.getBasis(basisId);
    if (!bRec) throw new ValidationError(`基 id=${basisId} 不存在`);
    const B0 = parseIMat(bRec.basis_json);

    const params: LLLParams = {
      deltaNum: opts.deltaNum !== undefined ? BigInt(opts.deltaNum) : DEFAULT_PARAMS.deltaNum,
      deltaDen: opts.deltaDen !== undefined ? BigInt(opts.deltaDen) : DEFAULT_PARAMS.deltaDen,
      maxIterations: opts.maxIterations ?? DEFAULT_PARAMS.maxIterations,
      maxBits: opts.maxBits ?? DEFAULT_PARAMS.maxBits,
    };

    const result: LLLResult = lllReduce(B0, params);
    const createdAt = nowIso();
    const cert = buildCertificate(B0, result, params, createdAt);
    const basisVersion = fingerprintBasis(B0);

    const reductionId = this.store.insertReduction({
      basis_id: basisId,
      basis_version: basisVersion,
      delta_num: result.delta.num,
      delta_den: result.delta.den,
      max_iterations: params.maxIterations,
      max_bits: params.maxBits,
      status: result.status,
      iterations: result.iterations,
      swaps: result.swaps,
      reduced_json: JSON.stringify(imatToStrings(result.basis)),
      u_json: JSON.stringify(imatToStrings(result.U)),
      steps_json: JSON.stringify(result.steps),
      cert_json: JSON.stringify(cert),
      created_at: createdAt,
    });

    return {
      reductionId,
      basisId,
      basisVersion,
      status: result.status,
      message: result.message,
      delta: result.delta,
      iterations: result.iterations,
      swaps: result.swaps,
      reducedBasis: imatToStrings(result.basis),
      U: imatToStrings(result.U),
      certificate: cert,
      complete: result.status === "reduced",
    };
  }

  getReduction(id: number) {
    const rec = this.store.getReduction(id);
    if (!rec) throw new ValidationError(`约简 id=${id} 不存在`);
    return {
      id: rec.id,
      basisId: rec.basis_id,
      basisVersion: rec.basis_version,
      delta: { num: rec.delta_num, den: rec.delta_den },
      params: { maxIterations: rec.max_iterations, maxBits: rec.max_bits },
      status: rec.status,
      iterations: rec.iterations,
      swaps: rec.swaps,
      reducedBasis: JSON.parse(rec.reduced_json),
      U: JSON.parse(rec.u_json),
      steps: JSON.parse(rec.steps_json),
      certificate: JSON.parse(rec.cert_json) as LLLCertificate,
      createdAt: rec.created_at,
    };
  }

  processSummary(reductionId: number) {
    const r = this.getReduction(reductionId);
    const steps = r.steps as { type: string; k: number; j?: number; q?: string }[];
    const sizeCount = steps.filter((s) => s.type === "size").length;
    const swapCount = steps.filter((s) => s.type === "swap").length;
    // 仅返回前 200 步，防止巨大输出。
    const preview = steps.slice(0, 200);
    return {
      reductionId,
      status: r.status,
      complete: r.status === "reduced",
      delta: r.delta,
      iterations: r.iterations,
      swaps: r.swaps,
      sizeReductions: sizeCount,
      swapEvents: swapCount,
      totalSteps: steps.length,
      truncated: steps.length > preview.length,
      stepsPreview: preview,
      message: r.status === "reduced"
        ? "约简完成，全部尺寸约简与 Lovasz 条件满足"
        : "约简未完成，当前结果不得冒充已满足全部 LLL 条件",
    };
  }

  verifyReduction(reductionId: number) {
    const r = this.getReduction(reductionId);
    return verifyCertificate(r.certificate);
  }

  // 直接核验外部提交的证书（用于演示篡改证书失败）。
  verifyCertificateObject(cert: LLLCertificate) {
    return verifyCertificate(cert);
  }

  addTarget(basisId: number, targetRows: unknown) {
    const bRec = this.store.getBasis(basisId);
    if (!bRec) throw new ValidationError(`基 id=${basisId} 不存在`);
    let t: IVec;
    try {
      t = parseIVec(typeof targetRows === "string" ? targetRows : (targetRows as never));
    } catch (e) {
      throw new ValidationError(`目标向量解析失败: ${(e as Error).message}`);
    }
    if (t.length !== bRec.dim) {
      throw new ValidationError(`目标维数 ${t.length} 与环境维数 ${bRec.dim} 不一致`);
    }
    for (const x of t) {
      const digits = (x < 0n ? -x : x).toString(10).length;
      if (digits > LIMITS.maxIntegerDigits) {
        throw new ValidationError(`目标元素位数超过上限 ${LIMITS.maxIntegerDigits}`);
      }
    }
    const createdAt = nowIso();
    const id = this.store.insertTarget(basisId, JSON.stringify(ivecToStrings(t)), createdAt);
    return { id, basisId, target: ivecToStrings(t), createdAt };
  }

  approximate(reductionId: number, targetId: number, boxRadius?: number) {
    const rRec = this.store.getReduction(reductionId);
    if (!rRec) throw new ValidationError(`约简 id=${reductionId} 不存在`);
    if (rRec.status !== "reduced") {
      throw new ValidationError(
        `约简状态为 ${rRec.status}，未完成约简不能用于 Babai；请先取得 reduced 证书`,
      );
    }
    const tRec = this.store.getTarget(targetId);
    if (!tRec) throw new ValidationError(`目标 id=${targetId} 不存在`);
    if (tRec.basis_id !== rRec.basis_id) {
      throw new ValidationError("目标与约简不属于同一个基");
    }
    const Bp = parseIMat(rRec.reduced_json);
    const U = parseIMat(rRec.u_json);
    const B0 = parseIMat(this.store.getBasis(rRec.basis_id)!.basis_json);
    const target = parseIVec(tRec.target_json);

    const babai = babaiNearestPlane(Bp, target);
    const coeffsB = babai.reducedCoeffs.map((s) => BigInt(s));
    const coeffsO = mapCoeffsToOriginal(coeffsB, U);

    // 独立核验：点在原格内，两组基系数生成同一点。
    const inOrig = verifyPointInOriginalLattice(babai.point, coeffsO.map((x) => x.toString()), B0);
    const samePoint = verifySameLatticePoint(
      babai.reducedCoeffs, coeffsO.map((x) => x.toString()), Bp, U, B0,
    );

    let box = null;
    if (boxRadius !== undefined) {
      box = enumerateBox(Bp, target, boxRadius, babai);
    }
    const boxStored = box
      ? { ...box, bestPoint: box.bestPoint.map((x) => x.toString()) }
      : null;

    const createdAt = nowIso();
    const babaiId = this.store.insertBabai({
      reduction_id: reductionId,
      target_id: targetId,
      coeffs_reduced_json: JSON.stringify(babai.reducedCoeffs),
      coeffs_original_json: JSON.stringify(coeffsO.map((x) => x.toString())),
      point_json: JSON.stringify(babai.point.map((x) => x.toString())),
      dist2_num: babai.distanceSqRat.num,
      dist2_den: babai.distanceSqRat.den,
      box_radius: boxRadius ?? null,
      box_json: boxStored ? JSON.stringify(boxStored) : null,
      created_at: createdAt,
    });

    return {
      babaiId,
      basisVersion: rRec.basis_version,
      reductionId,
      targetId,
      reducedCoeffs: babai.reducedCoeffs,
      originalCoeffs: coeffsO.map((x) => x.toString()),
      point: babai.point.map((x) => x.toString()),
      distanceSq: babai.distanceSqRat,
      distanceApprox: babai.distanceApprox,
      pointInOriginalLattice: inOrig.inLattice,
      representationsAgree: samePoint,
      box: box
        ? {
            radius: box.radius,
            combos: box.combos,
            bestCoeffs: box.bestCoeffs,
            bestPoint: box.bestPoint.map((x) => x.toString()),
            bestDistanceSq: box.bestDistanceSqRat,
            bestDistanceApprox: box.bestDistanceApprox,
            babaiIsBoxOptimal: box.babaiIsBoxOptimal,
            note: box.note,
          }
        : null,
      note: babai.note,
    };
  }

  // 独立条件快照（不经过证书），供 API 直接复核当前约简基。
  checkConditions(reductionId: number) {
    const r = this.getReduction(reductionId);
    const Bp = parseIMat(JSON.stringify(r.reducedBasis));
    return checkLLLConditions(Bp, BigInt(r.delta.num), BigInt(r.delta.den));
  }
}
