#!/usr/bin/env node
import { resolve } from "node:path";
import { LLLService, LIMITS, ValidationError } from "../service/service";
import { Store } from "../db/store";

function usage(): string {
  return [
    "用法: lll <命令> [参数]",
    "命令:",
    "  limits                                   查看公开上限",
    "  import <basis.json> [name]               导入整数格基（十进制字符串矩阵）",
    "  list                                     列出已导入基",
    "  reduce <basisId> [deltaNum deltaDen] [--max-iter N] [--max-bits N]",
    "  summary <reductionId>                    约简过程摘要",
    "  verify <reductionId>                     独立核验证书",
    "  target <basisId> <target.json>           添加目标向量",
    "  approx <reductionId> <targetId> [boxR]   Babai 近似（可选盒对照半径）",
    "  export <reductionId> <out.json>          导出约简结果与证书",
    "",
    "环境变量:",
    "  LLL_DATA_DIR (默认 ./data)  LLL_PORT (默认 8787)",
  ].join("\n");
}

function dataDir(): string {
  return resolve(process.env.LLL_DATA_DIR ?? resolve(process.cwd(), "data"));
}

function openService(): { service: LLLService; store: Store } {
  const store = new Store(resolve(dataDir(), "lll.sqlite"));
  return { service: new LLLService(store), store };
}

function print(x: unknown): void {
  process.stdout.write(JSON.stringify(x, null, 2) + "\n");
}

function readJson(path: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs") as typeof import("node:fs");
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function fail(msg: string): never {
  process.stderr.write("错误: " + msg + "\n");
  process.exit(1);
}

function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === "-h" || cmd === "--help") {
    process.stdout.write(usage() + "\n");
    return;
  }

  const { service, store } = openService();
  try {
    switch (cmd) {
      case "limits":
        print(LIMITS);
        break;
      case "import": {
        if (!args[1]) fail("缺少 basis.json");
        const res = service.importBasis(readJson(args[1]), args[2] ?? null);
        print(res);
        break;
      }
      case "list":
        print(service.listBases());
        break;
      case "reduce": {
        const basisId = Number(args[1]);
        if (!Number.isInteger(basisId)) fail("缺少 basisId");
        let deltaNum: string | undefined;
        let deltaDen: string | undefined;
        const rest = args.slice(2).filter((a) => !a.startsWith("--"));
        if (rest.length >= 1 && !rest[0].startsWith("--")) {
          deltaNum = rest[0];
          deltaDen = rest[1];
        }
        const maxIter = flag(args, "--max-iter");
        const maxBits = flag(args, "--max-bits");
        print(service.reduce(basisId, {
          deltaNum, deltaDen,
          maxIterations: maxIter ? Number(maxIter) : undefined,
          maxBits: maxBits ? Number(maxBits) : undefined,
        }));
        break;
      }
      case "summary":
        print(service.processSummary(Number(args[1])));
        break;
      case "verify":
        print(service.verifyReduction(Number(args[1])));
        break;
      case "target":
        print(service.addTarget(Number(args[1]), readJson(args[2])));
        break;
      case "approx":
        print(service.approximate(
          Number(args[1]), Number(args[2]),
          args[3] !== undefined ? Number(args[3]) : undefined,
        ));
        break;
      case "export": {
        const r = service.getReduction(Number(args[1]));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require("node:fs") as typeof import("node:fs");
        fs.writeFileSync(args[2], JSON.stringify(r, null, 2), "utf8");
        print({ exported: args[2], reductionId: r.id, status: r.status });
        break;
      }
      default:
        fail(`未知命令: ${cmd}\n\n${usage()}`);
    }
  } catch (e) {
    if (e instanceof ValidationError) fail(e.message);
    throw e;
  } finally {
    store.close();
  }
}

main();
