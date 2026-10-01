import { test } from "node:test";
import assert from "node:assert/strict";
import { lllReduce, DEFAULT_PARAMS } from "../core/lll";
import { parseIMat } from "../core/vec";
import { buildCertificate, verifyCertificate, LLLCertificate } from "../core/cert";

function mat(rows: number[][]) {
  return parseIMat(rows.map((r) => r.map(String)));
}

function freshCert(): { cert: LLLCertificate } {
  const B0 = mat([[1, 100], [1, 101]]);
  const r = lllReduce(B0, DEFAULT_PARAMS);
  const cert = buildCertificate(B0, r, DEFAULT_PARAMS, new Date().toISOString());
  return { cert };
}

test("真实证书核验通过：变换、单模、尺寸、Lovasz", () => {
  const { cert } = freshCert();
  const v = verifyCertificate(cert);
  assert.equal(v.valid, true, v.violations.join("; "));
  assert.equal(v.detU === "1" || v.detU === "-1", true);
  assert.equal(v.transformOk, true);
  assert.equal(v.sizeReduced, true);
  assert.equal(v.lovaszAll, true);
});

test("篡改约简基被识别", () => {
  const { cert } = freshCert();
  const tampered: LLLCertificate = JSON.parse(JSON.stringify(cert));
  tampered.basisReduced[0][0] = String(Number(tampered.basisReduced[0][0]) + 1);
  const v = verifyCertificate(tampered);
  assert.equal(v.valid, false);
  assert.equal(v.fingerprintsOk, false);
});

test("篡改 U（破坏单模/变换）被识别", () => {
  const { cert } = freshCert();
  const tampered: LLLCertificate = JSON.parse(JSON.stringify(cert));
  tampered.U[0][0] = String(Number(tampered.U[0][0]) + 2);
  const v = verifyCertificate(tampered);
  assert.equal(v.valid, false);
  assert.ok(v.violations.length > 0);
});

test("篡改 delta 导致 Lovasz 失效被识别", () => {
  const { cert } = freshCert();
  const tampered: LLLCertificate = JSON.parse(JSON.stringify(cert));
  // 改用更苛刻的 delta=0.99，可能使原约简不满足 Lovasz；同时指纹必坏。
  tampered.delta = { num: "99", den: "100" };
  const v = verifyCertificate(tampered);
  assert.equal(v.valid, false);
  assert.equal(v.fingerprintsOk, false);
});

test("未完成约简不得冒充 reduced", () => {
  const B0 = mat([[1, 10000], [1, 10001]]);
  const r = lllReduce(B0, { ...DEFAULT_PARAMS, maxIterations: 0 });
  const cert = buildCertificate(B0, r, { ...DEFAULT_PARAMS, maxIterations: 0 }, new Date().toISOString());
  // 强制把状态改成 reduced，核验必须拒绝
  const forged: LLLCertificate = JSON.parse(JSON.stringify(cert));
  forged.status = "reduced";
  forged.fingerprints = cert.fingerprints;
  const v = verifyCertificate(forged);
  assert.equal(v.valid, false);
});
