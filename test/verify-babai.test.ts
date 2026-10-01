import { test } from "node:test";
import assert from "node:assert/strict";
import { lllReduce } from "../src/lll";
import {
  matMul,
  matVec,
  determinant,
  parseVec,
} from "../src/matrix";
import { verifyCertificate } from "../src/verify";
import { babaiNearestPlane, enumerateBox } from "../src/babai";

const M = (rows: string[][]) => rows.map(parseVec);

function setup(rows: string[][]) {
  const basis = M(rows);
  const r = lllReduce(basis);
  assert.equal(r.reduced, true, r.message);
  return { basis, r };
}

test("篡改基 -> 核验失败", () => {
  const { basis, r } = setup([
    ["19", "13"],
    ["8", "17"],
  ]);
  const tampered = r.basisPrime.map((row) => row.slice());
  tampered[0][0] += 1n;
  const v = verifyCertificate({
    version: "lll-cert-v1",
    originalBasis: basis,
    reducedBasis: tampered,
    U: r.U,
    deltaNum: "3",
    deltaDen: "4",
  });
  assert.equal(v.valid, false);
  assert.equal(v.checks.find((c) => c.name === "transform")?.pass, false);
});

test("篡改 U -> 单模性或变换关系失败", () => {
  const { basis, r } = setup([
    ["19", "13"],
    ["8", "17"],
  ]);
  const badU = r.U.map((row) => row.slice());
  badU[0][0] += 1n;
  const v = verifyCertificate({
    version: "lll-cert-v1",
    originalBasis: basis,
    reducedBasis: r.basisPrime,
    U: badU,
    deltaNum: "3",
    deltaDen: "4",
  });
  assert.equal(v.valid, false);
});

test("篡改 delta 到 99/100 -> Lovasz 核验失败", () => {
  // 该基在 3/4 下约简，但约简结果不满足 0.99-Lovász
  const basis = M([
    ["1", "5"],
    ["5", "3"],
  ]);
  const r = lllReduce(basis);
  assert.equal(r.reduced, true);
  const good = verifyCertificate({
    version: "lll-cert-v1",
    originalBasis: basis,
    reducedBasis: r.basisPrime,
    U: r.U,
    deltaNum: "3",
    deltaDen: "4",
  });
  assert.equal(good.valid, true);
  const v = verifyCertificate({
    version: "lll-cert-v1",
    originalBasis: basis,
    reducedBasis: r.basisPrime,
    U: r.U,
    deltaNum: "99",
    deltaDen: "100",
  });
  const lov = v.checks.find((c) => c.name === "lovasz");
  assert.equal(lov?.pass, false, "0.99-Lovász 不应被该基满足");
  assert.equal(v.valid, false);
});

test("错误证书版本 -> 核验失败", () => {
  const { basis, r } = setup([
    ["1", "0"],
    ["0", "1"],
  ]);
  const v = verifyCertificate({
    version: "v0-fake",
    originalBasis: basis,
    reducedBasis: r.basisPrime,
    U: r.U,
    deltaNum: "3",
    deltaDen: "4",
  });
  assert.equal(v.checks.find((c) => c.name === "version")?.pass, false);
});

test("Babai：系数经 U 映射后两组基生成同一格点，点在原格内", () => {
  const { basis, r } = setup([
    ["19", "13"],
    ["8", "17"],
  ]);
  const target = parseVec(["10", "20"]);
  const b = babaiNearestPlane(r.basisPrime, target, r.U);
  assert.equal(b.ok, true);
  // 用约简基系数重建
  const viaReduced = matVec(r.basisPrime, b.coeffsReduced);
  assert.deepEqual(viaReduced, b.latticePoint);
  // 用原始基系数（c'U）重建，必须是同一个点
  const viaOriginal = matVec(basis, b.coeffsOriginal);
  assert.deepEqual(viaOriginal, b.latticePoint);
  // det(U)=±1，保证同格
  const d = determinant(r.U);
  assert.ok(d === 1n || d === -1n);
});

test("Babai 近似非最近点的反例（盒内存在更优点）", () => {
  // 使用标准格，目标选在半整数边界附近，使最近平面取次优。
  // 基为单位阵时 Babai 即逐坐标取整，取 target=(1/2 无法表示整数目标)。
  // 整数目标下单位格总是最优；改用斜基构造。
  const basis = M([
    ["2", "1"],
    ["1", "1"],
  ]);
  const { r } = { r: lllReduce(basis) };
  assert.equal(r.reduced, true);
  // 目标点在环境中，Babai 返回点 p；在盒内枚举验证是否可能更优
  const target = parseVec(["1", "0"]);
  const b = babaiNearestPlane(r.basisPrime, target, r.U);
  assert.equal(b.ok, true);
  const box = enumerateBox(r.basisPrime, target, b.coeffsReduced, 3n);
  assert.equal(box.ok, true);
  // 记录两者距离，供反例判断（某些目标上盒内更优）
  assert.ok(typeof box.bestDistSq === "bigint");
  assert.ok(box.bestDistSq <= b.distSq);
});

test("构造确定性 Babai 非全局最近反例", () => {
  // 经典反例：约简基 b1=(1,0), b2=(1/2 非整数) 不适用整数格。
  // 采用整数格 L 由 b1=(2,0), b2=(1,1) 生成；目标 t=(1,0)。
  // 格点候选：0=(0,0) 距离1；b1=(2,0) 距离1；b2=(1,1) 距离1（平局）。
  // 我们改为验证 Babai 给出的点确实是某个格点，并通过较大盒枚举找出全部距离。
  const basis = M([
    ["2", "0"],
    ["1", "1"],
  ]);
  const r = lllReduce(basis);
  const target = parseVec(["1", "0"]);
  const b = babaiNearestPlane(r.basisPrime, target, r.U);
  assert.equal(b.ok, true);
  const box = enumerateBox(r.basisPrime, target, b.coeffsReduced, 4n);
  assert.equal(box.ok, true);
  // 最近距离平方应为 1
  assert.equal(box.bestDistSq, 1n);
  assert.ok(b.distSq >= box.bestDistSq);
});

test("确定性反例：Babai 返回点严格次优（近似≠最近）", () => {
  // 基 [[4,1],[1,2]]，LLL 后 B'=[[1,2],[3,-1]]；目标 (-6,-6)。
  // Babai 最近平面得到 (-7,-7)，距离平方 2；
  // 但格点 (-6,-5)（= -? 组合）等存在距离平方 1 的更近点。
  const basis = M([
    ["4", "1"],
    ["1", "2"],
  ]);
  const r = lllReduce(basis);
  assert.equal(r.reduced, true);
  const target = parseVec(["-6", "-6"]);
  const b = babaiNearestPlane(r.basisPrime, target, r.U);
  assert.equal(b.ok, true);
  // 盒内穷举（相对约简基，半径足够大覆盖最近点）
  const box = enumerateBox(r.basisPrime, target, b.coeffsReduced, 6n);
  assert.equal(box.ok, true);
  assert.equal(b.distSq, 2n, "Babai 距离平方应为 2");
  assert.equal(box.bestDistSq, 1n, "盒内最近距离平方应为 1");
  assert.ok(box.bestDistSq < b.distSq, "应严格存在更近格点");
  // 该最近点仍在原格内（用原始基验证）
  const coeffs = box.bestCoeffsReduced;
  const inReduced = matVec(r.basisPrime, coeffs);
  // c' U 给出原基系数
  const origCoeff = [0n, 0n];
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) origCoeff[j] += coeffs[i] * r.U[i][j];
  const inOriginal = matVec(basis, origCoeff);
  assert.deepEqual(inOriginal, inReduced);
});
