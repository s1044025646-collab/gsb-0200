import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../db/store";
import { LLLService } from "../service/service";

function freshService(): { service: LLLService; store: Store; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "lll-test-"));
  const store = new Store(join(dir, "t.sqlite"));
  return { service: new LLLService(store), store, dir };
}

test("端到端：导入→约简→核验→目标→Babai→盒对照", () => {
  const { service, store, dir } = freshService();
  try {
    const imp = service.importBasis([["1", "100"], ["1", "101"]], "skew");
    const red = service.reduce(imp.id);
    assert.equal(red.complete, true);
    const ver = service.verifyReduction(red.reductionId);
    assert.equal(ver.valid, true, ver.violations.join("; "));

    const tgt = service.addTarget(imp.id, ["4", "250"]);
    const appr = service.approximate(red.reductionId, tgt.id, 3);
    assert.equal(appr.pointInOriginalLattice, true);
    assert.equal(appr.representationsAgree, true);
    assert.ok(appr.box);
    assert.match(appr.note, /不保证/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("拒绝零向量与相关向量导入", () => {
  const { service, store, dir } = freshService();
  try {
    assert.throws(() => service.importBasis([["0", "0"], ["1", "1"]]), /零向量/);
    assert.throws(() => service.importBasis([["1", "2"], ["2", "4"]]), /线性相关/);
    assert.throws(() => service.importBasis([["1", "2", "3"], ["1", "2"]]), /维数/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("未完成约简禁止用于 Babai", () => {
  const { service, store, dir } = freshService();
  try {
    const imp = service.importBasis([["1", "10000"], ["1", "10001"]]);
    const red = service.reduce(imp.id, { maxIterations: 0 });
    assert.equal(red.complete, false);
    const tgt = service.addTarget(imp.id, ["0", "1"]);
    assert.throws(
      () => service.approximate(red.reductionId, tgt.id),
      /未完成约简不能用于 Babai/,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("重启后从 SQLite 复现同一报告", () => {
  const dir = mkdtempSync(join(tmpdir(), "lll-restart-"));
  const dbPath = join(dir, "t.sqlite");
  let redId: number;
  let tgtId: number;
  let firstApprox: unknown;
  {
    const store = new Store(dbPath);
    const service = new LLLService(store);
    const imp = service.importBasis([["1", "100"], ["1", "101"]]);
    const red = service.reduce(imp.id);
    redId = red.reductionId;
    const tgt = service.addTarget(imp.id, ["4", "250"]);
    tgtId = tgt.id;
    firstApprox = service.approximate(redId, tgtId, 2);
    store.close();
  }
  {
    // 重新打开同一数据库文件（模拟重启）
    const store = new Store(dbPath);
    const service = new LLLService(store);
    const ver = service.verifyReduction(redId!);
    assert.equal(ver.valid, true);
    const secondApprox = service.approximate(redId!, tgtId!, 2);
    assert.deepEqual(
      JSON.stringify({ p: secondApprox.point, c: secondApprox.reducedCoeffs }),
      JSON.stringify({ p: (firstApprox as { point: string[] }).point,
        c: (firstApprox as { reducedCoeffs: string[] }).reducedCoeffs }),
    );
    store.close();
  }
  rmSync(dir, { recursive: true, force: true });
});
