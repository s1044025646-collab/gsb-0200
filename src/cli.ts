#!/usr/bin/env node
/** 命令行入口：import / reduce / summary / certificate / verify / approx / box / export / serve */
import * as fs from "node:fs";
import * as path from "node:path";
import { Store } from "./db";
import { Service } from "./service";
import { createServer } from "./server";

function parseArg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function readRows(arg?: string, file?: string): string[][] {
  if (file) {
    const text = fs.readFileSync(path.resolve(file), "utf-8");
    const obj = JSON.parse(text);
    return obj.basis ?? obj;
  }
  if (arg) {
    const obj = JSON.parse(arg);
    return obj.basis ?? obj;
  }
  throw new Error("需要通过 --rows '<json>' 或 --file path.json 提供基");
}

function print(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const dataDir =
    parseArg(rest, "--data") ??
    process.env.LLL_DATA_DIR ??
    path.join(process.cwd(), "data");
  const store = new Store(dataDir);
  const svc = new Service(store);

  try {
    switch (cmd) {
      case "limits":
        print(svc.limits());
        break;

      case "import": {
        const rows = readRows(parseArg(rest, "--rows"), parseArg(rest, "--file"));
        const name = parseArg(rest, "--name") ?? "";
        print(svc.importBasis(name, rows));
        break;
      }

      case "list":
        print(svc.listBases());
        break;

      case "reduce": {
        const basisId = Number(parseArg(rest, "--basis"));
        if (!basisId) throw new Error("需要 --basis <id>");
        print(
          svc.reduce(basisId, {
            deltaNum: parseArg(rest, "--delta-num"),
            deltaDen: parseArg(rest, "--delta-den"),
            iterationBudget: Number(
              parseArg(rest, "--iteration-budget") ?? 0
            ) || undefined,
            digitBudget:
              Number(parseArg(rest, "--digit-budget") ?? 0) || undefined,
          })
        );
        break;
      }

      case "summary": {
        const id = Number(parseArg(rest, "--id"));
        print(svc.summary(id));
        break;
      }

      case "certificate": {
        const id = Number(parseArg(rest, "--id"));
        print(svc.certificate(id));
        break;
      }

      case "verify": {
        const id = Number(parseArg(rest, "--id"));
        const overrideFile = parseArg(rest, "--tamper");
        let override;
        if (overrideFile) {
          override = JSON.parse(fs.readFileSync(overrideFile, "utf-8"));
        }
        print(svc.verify(id, override));
        break;
      }

      case "approx":
      case "babai": {
        const id = Number(parseArg(rest, "--id"));
        const targetJson = parseArg(rest, "--target");
        const targetFile = parseArg(rest, "--target-file");
        let target: string[];
        if (targetFile) {
          const o = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
          target = o.target ?? o;
        } else if (targetJson) {
          target = JSON.parse(targetJson);
        } else throw new Error("需要 --target '[...]' 或 --target-file");
        print(svc.approximate(id, target, parseArg(rest, "--box-radius")));
        break;
      }

      case "targets":
        print(svc.listTargets());
        break;

      case "export": {
        const id = Number(parseArg(rest, "--id"));
        print(svc.exportReduction(id));
        break;
      }

      case "serve": {
        const port = Number(
          parseArg(rest, "--port") ?? process.env.LLL_PORT ?? 8080
        );
        const server = createServer(svc);
        await new Promise<void>((resolve) =>
          server.listen(port, "127.0.0.1", () => resolve())
        );
        process.stdout.write(
          `LLL 后端已启动: http://127.0.0.1:${port}  数据目录: ${dataDir}\n`
        );
        break;
      }

      default:
        process.stdout.write(
          [
            "用法: lll <命令> [参数]",
            "命令:",
            "  limits                       查看公开上限与平局规则",
            "  import --rows <json>|--file f.json [--name n]   导入格基",
            "  list                         列出格基",
            "  reduce --basis <id> [--delta-num 3 --delta-den 4] [--iteration-budget N] [--digit-budget N]",
            "  summary --id <reductionId>   约简过程摘要",
            "  certificate --id <id>        导出证书",
            "  verify --id <id> [--tamper override.json]  独立核验（可注入篡改）",
            "  approx --id <id> --target '[..]' [--box-radius R]  Babai 近似+盒对照",
            "  targets                      列出目标点与结果",
            "  export --id <id>             导出证书+核验报告",
            "  serve [--port 8080] [--data dir]  启动 HTTP API",
          ].join("\n") + "\n"
        );
        if (cmd) process.exitCode = 1;
    }
  } finally {
    if (cmd !== "serve") store.close();
  }
}

main().catch((e) => {
  process.stderr.write("错误: " + (e as Error).message + "\n");
  process.exit(1);
});
