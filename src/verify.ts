/**
 * 独立证书核验：不依赖 LLL 运行时状态，只依据证书中的
 * 原始基 B、约简基 B'、变换 U、delta 做独立的整数/有理数检查。
 *
 * 检查项：
 *  1. 变换关系 B' = U B（独立整数乘法）
 *  2. 单模性 det(U) = ±1（独立小矩阵行列式）
 *  3. 尺寸约简 |mu_ij| <= 1/2
 *  4. 全部 Lovász 不等式 B*_k² >= (delta - mu²) B*_{k-1}²
 *  5. delta 合法区间 (1/4, 1)
 */
import { Frac, frac, abs, gt, lte, mul, sub, ZERO } from "./frac";
import { IMat, matMul, determinant } from "./matrix";
import { gramSchmidt } from "./gso";

export const CERTIFICATE_VERSION = "lll-cert-v1";

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

export interface VerifyResult {
  valid: boolean;
  certificateVersion: string;
  checks: CheckResult[];
}

export interface Certificate {
  version: string;
  originalBasis: IMat;
  reducedBasis: IMat;
  U: IMat;
  deltaNum: string;
  deltaDen: string;
}

function matricesEqual(a: IMat, b: IMat): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    for (let j = 0; j < a[i].length; j++)
      if (a[i][j] !== b[i][j]) return false;
  }
  return true;
}

export function verifyCertificate(cert: Certificate): VerifyResult {
  const checks: CheckResult[] = [];
  const { originalBasis: B, reducedBasis: Bp, U } = cert;

  // 形状一致性
  const shapeOk =
    B.length === Bp.length &&
    B.length === U.length &&
    B.length > 0 &&
    B.every((r, i) => r.length === Bp[i].length) &&
    U.every((r) => r.length === U.length);
  checks.push({
    name: "shape",
    pass: shapeOk,
    detail: shapeOk
      ? `方阵 U 为 ${U.length}x${U.length}，基为 ${B.length}x${
          B[0]?.length ?? 0
        }`
      : "B、B'、U 形状不一致或为空",
  });

  if (!shapeOk)
    return { valid: false, certificateVersion: cert.version, checks };

  // 0. 版本
  checks.push({
    name: "version",
    pass: cert.version === CERTIFICATE_VERSION,
    detail:
      cert.version === CERTIFICATE_VERSION
        ? `证书版本 ${cert.version}`
        : `证书版本不匹配：得到 ${cert.version}，期望 ${CERTIFICATE_VERSION}`,
  });

  // 5. delta
  let delta: Frac;
  try {
    delta = frac(BigInt(cert.deltaNum), BigInt(cert.deltaDen));
  } catch {
    checks.push({
      name: "delta",
      pass: false,
      detail: `delta 无法解析为整数分数：${cert.deltaNum}/${cert.deltaDen}`,
    });
    return { valid: false, certificateVersion: cert.version, checks };
  }
  const deltaOk =
    gt(delta, frac(1n, 4n)) && lte(delta, frac(1n)) && delta.n < delta.d;
  checks.push({
    name: "delta",
    pass: deltaOk,
    detail: deltaOk
      ? `delta=${delta.n}/${delta.d} 位于 (1/4,1)`
      : `delta=${delta.n}/${delta.d} 不在合法开区间 (1/4,1)`,
  });

  // 1. B' = U B（独立整数乘法）
  const UB = matMul(U, B);
  const transformOk = matricesEqual(UB, Bp);
  checks.push({
    name: "transform",
    pass: transformOk,
    detail: transformOk
      ? "独立整数乘法确认 B' = U B"
      : "B' ≠ U B：基或变换矩阵被篡改",
  });

  // 2. det(U) = ±1（独立行列式）
  let detU = 0n;
  let detOk = false;
  let detDetail = "";
  try {
    detU = determinant(U);
    detOk = detU === 1n || detU === -1n;
    detDetail = detOk
      ? `det(U)=${detU}，单模（保格）`
      : `det(U)=${detU} ≠ ±1，不是单模变换，格可能已改变`;
  } catch (e) {
    detDetail = "行列式计算失败：" + String(e);
  }
  checks.push({ name: "unimodular", pass: detOk, detail: detDetail });

  // GSO on B'
  const g = gramSchmidt(Bp);
  const indepOk = g.dependentIndex === -1;
  checks.push({
    name: "independence",
    pass: indepOk,
    detail: indepOk
      ? "约简基线性无关"
      : `约简基第 ${g.dependentIndex} 个正交分量为零（线性相关）`,
  });

  if (indepOk && deltaOk) {
    // 3. 尺寸约简
    let sizeOk = true;
    const bad: string[] = [];
    for (let i = 0; i < g.n; i++)
      for (let j = 0; j < i; j++) {
        if (gt(abs(g.mu[i][j]), frac(1n, 2n))) {
          sizeOk = false;
          bad.push(`|mu[${i}][${j}]| > 1/2`);
        }
      }
    checks.push({
      name: "size-reduction",
      pass: sizeOk,
      detail: sizeOk
        ? "全部 |mu_ij| <= 1/2"
        : "违反尺寸约简：" + bad.slice(0, 5).join("，"),
    });

    // 4. Lovász
    let lovOk = true;
    const lbad: string[] = [];
    for (let k = 1; k < g.n; k++) {
      const mu = g.mu[k][k - 1];
      const rhs = mul(sub(delta, mul(mu, mu)), g.B[k - 1]);
      if (gt(rhs, g.B[k])) {
        lovOk = false;
        lbad.push(`k=${k}`);
      }
    }
    checks.push({
      name: "lovasz",
      pass: lovOk,
      detail: lovOk
        ? `全部 ${g.n - 1} 条 Lovász 不等式成立`
        : "违反 Lovász 条件于 " + lbad.slice(0, 5).join("，"),
    });
  }

  const valid = checks.every((c) => c.pass);
  return { valid, certificateVersion: cert.version, checks };
}
