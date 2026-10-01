/**
 * 端到端教学演示（自包含，使用项目内临时数据目录）：
 *  1. 导入严重斜交基 -> 约简 -> 展示 B'=UB、det(U)=±1、证书核验
 *  2. Babai 近似 + 有限盒对照，展示近似误差
 *  3. 展示 Babai 非最近点反例
 *  4. 篡改基/U/delta 后核验失败
 *  5. 关闭并重新打开数据库（重启），复现同一报告
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { Store } from "./db";
import { Service } from "./service";

function hr(t: string): void {
  process.stdout.write("\n==== " + t + " ====\n");
}

function run(dataDir: string): {
  reductionId: number;
  basisId: number;
  counterReductionId: number;
} {
  const store = new Store(dataDir);
  const svc = new Service(store);

  hr("公开上限与平局规则");
  console.log(svc.limits());

  hr("1. 导入严重斜交基并约简");
  const imp = svc.importBasis("skew-demo", [
    ["1", "1000000"],
    ["0", "1"],
  ]);
  console.log("导入:", imp);
  const red = svc.reduce(imp.id);
  console.log("状态:", red.status, "| 交换:", red.swaps, "| 尺寸约简:", red.size_reductions);
  console.log("原基  B =", red.original);
  console.log("约简基 B' =", red.basis_prime);
  console.log("变换 U =", red.U);
  const v = svc.verify(red.reduction_id);
  console.log("证书核验通过:", v.valid);
  for (const c of v.checks) console.log("  -", c.name, "=>", c.pass, "|", c.detail);

  hr("2. Babai 近似最近点 + 有限盒对照");
  const ap = svc.approximate(red.reduction_id, ["500000", "7"], "2");
  console.log("目标: [500000,7]");
  console.log("Babai 系数(约简基):", ap.babai.coeffs_reduced);
  console.log("Babai 系数(原始基):", ap.babai.coeffs_original);
  console.log("格点:", ap.babai.lattice_point, " 距离²:", ap.babai.dist_sq);
  console.log("点在原格内(独立重建):", ap.independent_membership_check.in_original_lattice);
  console.log("证书版本:", ap.certificate_version);
  if (ap.box) {
    console.log("盒半径:", ap.box.radius, "枚举格点数:", ap.box.explored);
    console.log("盒内最近距离²:", ap.box.best_dist_sq, " Babai距离²:", ap.box.babai_dist_sq);
    console.log("Babai 是否盒内最优:", ap.box.babai_is_box_optimal);
    console.log("说明:", ap.box.note);
  }

  hr("3. Babai 非最近点反例");
  const imp2 = svc.importBasis("counterexample", [
    ["4", "1"],
    ["1", "2"],
  ]);
  const red2 = svc.reduce(imp2.id);
  const ap2 = svc.approximate(red2.reduction_id, ["-6", "-6"], "6");
  console.log("B' =", red2.basis_prime);
  console.log("Babai 点:", ap2.babai.lattice_point, "距离²:", ap2.babai.dist_sq);
  console.log("盒内最近点:", ap2.box.best_point, "距离²:", ap2.box.best_dist_sq);
  console.log("=> 近似(" + ap2.babai.dist_sq + ") 严格劣于 盒内最近(" + ap2.box.best_dist_sq + ")，证明不保证全局最近");

  store.close();
  return {
    reductionId: red.reduction_id,
    basisId: imp.id,
    counterReductionId: red2.reduction_id,
  };
}

function tamperDemo(
  dataDir: string,
  reductionId: number,
  counterReductionId: number
): void {
  const store = new Store(dataDir);
  const svc = new Service(store);
  hr("4. 篡改检测");

  const cert = svc.certificate(reductionId);
  const badBasis = cert.reduced_basis.map((r: string[]) => r.slice());
  badBasis[0][0] = String(BigInt(badBasis[0][0]) + 1n);
  console.log("篡改 B' 一个元素 -> valid =", svc.verify(reductionId, { reducedBasis: badBasis }).valid);

  const badU = cert.U.map((r: string[]) => r.slice());
  badU[0][0] = String(BigInt(badU[0][0]) + 1n);
  console.log("篡改 U 一个元素 -> valid =", svc.verify(reductionId, { U: badU }).valid);

  // delta 篡改：使用一个 3/4-约简但不满足 0.99-Lovász 的基
  const deltaBasis = svc.importBasis("delta-tamper-demo", [
    ["1", "5"],
    ["5", "3"],
  ]);
  const deltaReduction = svc.reduce(deltaBasis.id);
  console.log(
    "篡改 delta=99/100 -> valid =",
    svc
      .verify(deltaReduction.reduction_id, { deltaNum: "99", deltaDen: "100" })
      .valid
  );
  console.log(
    "  同一证书以真实 delta=3/4 核验 -> valid =",
    svc.verify(deltaReduction.reduction_id).valid
  );

  store.close();
}

function restartDemo(dataDir: string, reductionId: number): void {
  hr("5. 重启后复现报告（重新打开 SQLite）");
  const store = new Store(dataDir);
  const svc = new Service(store);
  const summary = svc.summary(reductionId);
  const v = svc.verify(reductionId);
  console.log("摘要:", {
    status: summary.status,
    reduced: summary.reduced,
    delta: summary.delta,
    swaps: summary.swaps,
    size_reductions: summary.size_reductions,
  });
  console.log("重启后证书核验通过:", v.valid);
  console.log("数据库中格基数量:", svc.listBases().length);
  console.log("数据库中目标点数量:", svc.listTargets().length);
  store.close();
}

function main(): void {
  const dataDir = path.join(process.cwd(), "data", "demo");
  fs.rmSync(dataDir, { recursive: true, force: true });
  const { reductionId, counterReductionId } = run(dataDir);
  tamperDemo(dataDir, reductionId, counterReductionId);
  restartDemo(dataDir, reductionId);
  hr("演示完成");
}

main();
