import { createHash } from "node:crypto";
import { IMat, imatMul, intDet, imatToStrings, parseIMat } from "./vec";
import { LLLResult, LLLParams, checkLLLConditions } from "./lll";

export const CERT_SCHEMA_VERSION = "lll-cert-v1";

export interface LLLCertificate {
  schemaVersion: string;
  createdAt: string;
  basisOriginal: string[][];
  basisReduced: string[][];
  U: string[][];
  delta: { num: string; den: string };
  params: { maxIterations: number; maxBits: number };
  status: string;
  iterations: number;
  swaps: number;
  stepCount: number;
  fingerprints: {
    basisOriginal: string;
    basisReduced: string;
    U: string;
    delta: string;
  };
}

function sha256Canonical(x: unknown): string {
  return createHash("sha256").update(canonicalJSON(x)).digest("hex");
}

// 确定性 JSON（键排序），避免序列化差异影响指纹。
export function canonicalJSON(x: unknown): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(canonicalJSON).join(",") + "]";
  const keys = Object.keys(x as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON((x as Record<string, unknown>)[k])).join(",") + "}";
}

export function buildCertificate(
  B0: IMat,
  result: LLLResult,
  params: LLLParams,
  createdAt: string,
): LLLCertificate {
  const Bs = imatToStrings(result.basis);
  const B0s = imatToStrings(B0);
  const Us = imatToStrings(result.U);
  const delta = { num: result.delta.num, den: result.delta.den };
  return {
    schemaVersion: CERT_SCHEMA_VERSION,
    createdAt,
    basisOriginal: B0s,
    basisReduced: Bs,
    U: Us,
    delta,
    params: { maxIterations: params.maxIterations, maxBits: params.maxBits },
    status: result.status,
    iterations: result.iterations,
    swaps: result.swaps,
    stepCount: result.steps.length,
    fingerprints: {
      basisOriginal: sha256Canonical(B0s),
      basisReduced: sha256Canonical(Bs),
      U: sha256Canonical(Us),
      delta: sha256Canonical(delta),
    },
  };
}

export interface CertVerification {
  valid: boolean;
  schemaOk: boolean;
  fingerprintsOk: boolean;
  transformOk: boolean;       // B' = U B0
  unimodular: boolean;       // det(U) = ±1
  sizeReduced: boolean;
  lovaszAll: boolean;
  statusConsistent: boolean; // status=reduced 当且仅当全部条件满足
  detU: string;
  violations: string[];
}

// 独立核验：只用整数乘法、Bareiss 行列式和精确有理数条件，不采信证书内任何结论字段。
export function verifyCertificate(cert: LLLCertificate): CertVerification {
  const violations: string[] = [];
  const schemaOk = cert.schemaVersion === CERT_SCHEMA_VERSION;
  if (!schemaOk) violations.push(`证书版本不匹配：${cert.schemaVersion}`);

  let B0: IMat, Bp: IMat, U: IMat;
  try {
    B0 = parseIMat(cert.basisOriginal);
    Bp = parseIMat(cert.basisReduced);
    U = parseIMat(cert.U);
  } catch (e) {
    return {
      valid: false, schemaOk, fingerprintsOk: false, transformOk: false,
      unimodular: false, sizeReduced: false, lovaszAll: false,
      statusConsistent: false, detU: "N/A",
      violations: [...violations, `证书数据无法解析: ${(e as Error).message}`],
    };
  }

  // 指纹核验：任何对 B、U、delta 的篡改都会破坏指纹。
  const fpOk =
    cert.fingerprints.basisOriginal === sha256Canonical(cert.basisOriginal) &&
    cert.fingerprints.basisReduced === sha256Canonical(cert.basisReduced) &&
    cert.fingerprints.U === sha256Canonical(cert.U) &&
    cert.fingerprints.delta === sha256Canonical(cert.delta);
  if (!fpOk) violations.push("指纹不一致：证书内容疑似被篡改");

  // 独立整数乘法核验 B' = U B0
  const UB = imatMul(U, B0);
  let transformOk = UB.length === Bp.length;
  if (transformOk) {
    for (let i = 0; i < UB.length; i++) {
      if (UB[i].length !== Bp[i].length || UB[i].some((x, j) => x !== Bp[i][j])) {
        transformOk = false;
        break;
      }
    }
  }
  if (!transformOk) violations.push("变换关系失败：U·B0 ≠ B'（基或 U 被篡改）");

  // 单模性 det(U) = ±1
  let detU = 0n;
  let unimodular = false;
  try {
    detU = intDet(U);
    unimodular = detU === 1n || detU === -1n;
  } catch (e) {
    violations.push(`U 行列式计算失败: ${(e as Error).message}`);
  }
  if (!unimodular) violations.push(`U 不是单模矩阵：det(U)=${detU.toString()}`);

  // 尺寸约简 + Lovasz（独立重算）
  let sizeReduced = false;
  let lovaszAll = false;
  try {
    const dn = BigInt(cert.delta.num);
    const dd = BigInt(cert.delta.den);
    const rep = checkLLLConditions(Bp, dn, dd);
    sizeReduced = rep.sizeReduced;
    lovaszAll = rep.lovaszAll;
    violations.push(...rep.violations);
  } catch (e) {
    violations.push(`条件核验失败: ${(e as Error).message}`);
  }

  const allCond = sizeReduced && lovaszAll && transformOk && unimodular && !anyZero(Bp);
  const statusConsistent =
    cert.status === "reduced" ? allCond : !allCond || cert.status !== "reduced";
  if (!statusConsistent) {
    violations.push(`状态不一致：status=${cert.status}，但条件满足情况不符（未完成约简不得冒充已约简）`);
  }

  const valid =
    schemaOk && fpOk && transformOk && unimodular &&
    sizeReduced && lovaszAll && statusConsistent &&
    cert.status === "reduced";

  return {
    valid, schemaOk, fingerprintsOk: fpOk, transformOk, unimodular,
    sizeReduced, lovaszAll, statusConsistent, detU: detU.toString(), violations,
  };
}

function anyZero(m: IMat): boolean {
  for (const row of m) {
    let s = 0n;
    for (const x of row) s += x < 0n ? -x : x;
    if (s === 0n) return true;
  }
  return false;
}

// 核验 Babai 点确在原格内：c_orig 为整数系数，独立整数乘法。
export function verifyPointInOriginalLattice(
  point: bigint[],
  origCoeffs: string[],
  B0: IMat,
): { inLattice: boolean; reconstructed: bigint[] } {
  const coeffRow: IMat = [origCoeffs.map((s) => BigInt(s))];
  const rec = imatMul(coeffRow, B0)[0];
  const inLattice = rec.length === point.length && rec.every((x, i) => x === point[i]);
  return { inLattice, reconstructed: rec };
}

// 同一点的两组基表示一致性：c' B' = (c' U) B0。
export function verifySameLatticePoint(
  reducedCoeffs: string[],
  origCoeffs: string[],
  Bp: IMat,
  U: IMat,
  B0: IMat,
): boolean {
  const cR: IMat = [reducedCoeffs.map((s) => BigInt(s))];
  const cO: IMat = [origCoeffs.map((s) => BigInt(s))];
  const p1 = imatMul(cR, Bp)[0];
  const pViaU = imatMul(imatMul(cR, U), B0)[0];
  const p2 = imatMul(cO, B0)[0];
  return eq(p1, pViaU) && eq(pViaU, p2);
}

function eq(a: bigint[], b: bigint[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
