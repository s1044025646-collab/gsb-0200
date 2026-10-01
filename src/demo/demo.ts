import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../db/store";
import { LLLService } from "../service/service";
import { lllReduce } from "../core/lll";
import { babaiNearestPlane, enumerateBox } from "../core/babai";
import { parseIMat, parseIVec, inorm2 } from "../core/vec";

function line(s = ""): void { process.stdout.write(s + "\n"); }
function head(s: string): void { line("\n=== " + s + " ==="); }

function matNum(r: number[][]) { return parseIMat(r.map((x) => x.map(String))); }

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), "lll-demo-"));
  const dbPath = join(dir, "demo.sqlite");
  line(`临时数据目录: ${dir}`);

  head("1) LLL 改善搜索表示（向量变短，格不变）");
  const B0 = matNum([[5, 3], [3, 5]]);
  const r = lllReduce(B0);
  line("原始基 B0 = " + JSON.stringify(B0.map((x) => x.map(String))));
  line("约简基 B' = " + JSON.stringify(r.basis.map((x) => x.map(String))));
  line(`首向量长度平方: ${inorm2(B0[0]).toString()} -> ${inorm2(r.basis[0]).toString()}`);
  line("U = " + JSON.stringify(r.U.map((x) => x.map(String))));

  head("2) 走 SQLite 服务：导入/约简/证书核验");
  const store = new Store(dbPath);
  const service = new LLLService(store);
  const imp = service.importBasis(B0.map((x) => x.map((y) => y.toString())), "demo-skew");
  const red = service.reduce(imp.id);
  const ver = service.verifyReduction(red.reductionId);
  line(`reductionId=${red.reductionId} status=${red.status} 证书valid=${ver.valid} det(U)=${ver.detU}`);

  head("3) Babai 近似 + 有限盒对照（含近似误差对照）");
  const tgt = service.addTarget(imp.id, ["-6", "2"]);
  const appr = service.approximate(red.reductionId, tgt.id, 3);
  line(`格点=${JSON.stringify(appr.point)} 约简基系数=${JSON.stringify(appr.reducedCoeffs)} 原基系数=${JSON.stringify(appr.originalCoeffs)}`);
  line(`平方距离=${appr.distanceSq.num}/${appr.distanceSq.den} 近似距离≈${appr.distanceApprox.toFixed(4)}`);
  line(`点在原格内=${appr.pointInOriginalLattice} 两组表示一致=${appr.representationsAgree}`);
  if (appr.box) {
    line(`盒R=${appr.box.radius} 组合数=${appr.box.combos} 盒内最优点=${JSON.stringify(appr.box.bestPoint)}`);
    line(`盒内最优平方距离=${appr.box.bestDistanceSq.num}/${appr.box.bestDistanceSq.den} Babai是否盒内最优=${appr.box.babaiIsBoxOptimal}`);
  }
  line("说明: " + appr.note);

  head("4) 篡改证书必须失败");
  const cert = red.certificate;
  const good = service.verifyCertificateObject(cert);
  line("原始证书 valid=" + good.valid);
  const tampered = JSON.parse(JSON.stringify(cert));
  tampered.basisReduced[0][1] = String(Number(tampered.basisReduced[0][1]) + 1);
  const bad = service.verifyCertificateObject(tampered);
  line(`篡改 B' 后 valid=${bad.valid}（指纹一致=${bad.fingerprintsOk}, 变换成立=${bad.transformOk}）`);
  line("违规: " + bad.violations.join(" | "));

  head("5) Babai 非最近点反例（教学）");
  const BC = matNum([[5, 3], [3, 5]]);
  const rc = lllReduce(BC);
  const ct = parseIVec(["-6", "2"]);
  const cbab = babaiNearestPlane(rc.basis, ct);
  const cbox = enumerateBox(rc.basis, ct, 8, cbab);
  line(`目标=(-6,2) Babai点=${JSON.stringify(cbab.point.map(String))} 平方距离=${cbab.distanceSqRat.num}/${cbab.distanceSqRat.den}`);
  line(`盒内最优(R=8)点=${JSON.stringify(cbox.bestPoint.map(String))} 平方距离=${cbox.bestDistanceSqRat.num}/${cbox.bestDistanceSqRat.den} Babai是否盒内最优=${cbox.babaiIsBoxOptimal}`);
  line("=> Babai 返回点不是全格最近点，仅为近似；盒内最优也不等于全格精确解声明。");

  head("6) 重启复现");
  store.close();
  const store2 = new Store(dbPath);
  const service2 = new LLLService(store2);
  const ver2 = service2.verifyReduction(red.reductionId);
  const appr2 = service2.approximate(red.reductionId, tgt.id, 4);
  line(`重开数据库后证书valid=${ver2.valid} 格点一致=${JSON.stringify(appr2.point) === JSON.stringify(appr.point)}`);
  store2.close();

  head("7) 预算中断");
  {
    const s3 = new Store(join(dir, "b.sqlite"));
    const sv3 = new LLLService(s3);
    const i3 = sv3.importBasis([["1", "10000"], ["1", "10001"]]);
    const r3 = sv3.reduce(i3.id, { maxIterations: 0 });
    line(`maxIterations=0 -> status=${r3.status} complete=${r3.complete}`);
    line("摘要: " + sv3.processSummary(r3.reductionId).message);
    s3.close();
  }

  rmSync(dir, { recursive: true, force: true });
  line("\n演示完成。");
}

main();
