import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { Store } from "../db/store";
import { LLLService, LIMITS, ValidationError } from "../service/service";

const PORT = Number(process.env.LLL_PORT ?? 8787);
const DATA_DIR = process.env.LLL_DATA_DIR ?? resolve(process.cwd(), "data");

const store = new Store(resolve(DATA_DIR, "lll.sqlite"));
const service = new LLLService(store);

function send(res: ServerResponse, code: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
  });
  res.end(json);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

interface Route {
  method: string;
  pattern: RegExp;
  handle: (params: RegExpExecArray, body: unknown) => unknown | Promise<unknown>;
}

const routes: Route[] = [
  { method: "GET", pattern: /^\/api\/limits$/, handle: () => LIMITS },
  { method: "POST", pattern: /^\/api\/bases$/, handle: (_p, b) => {
      const body = b as { basis?: unknown; name?: string };
      return service.importBasis(body.basis, body.name ?? null);
    } },
  { method: "GET", pattern: /^\/api\/bases$/, handle: () => service.listBases() },
  { method: "GET", pattern: /^\/api\/bases\/(\d+)$/, handle: (p) => service.getBasis(Number(p[1])) },
  { method: "POST", pattern: /^\/api\/bases\/(\d+)\/reduce$/, handle: (p, b) => {
      const body = (b ?? {}) as {
        deltaNum?: string; deltaDen?: string; maxIterations?: number; maxBits?: number;
      };
      return service.reduce(Number(p[1]), body);
    } },
  { method: "GET", pattern: /^\/api\/reductions\/(\d+)$/, handle: (p) => service.getReduction(Number(p[1])) },
  { method: "GET", pattern: /^\/api\/reductions\/(\d+)\/summary$/, handle: (p) => service.processSummary(Number(p[1])) },
  { method: "GET", pattern: /^\/api\/reductions\/(\d+)\/verify$/, handle: (p) => service.verifyReduction(Number(p[1])) },
  { method: "GET", pattern: /^\/api\/reductions\/(\d+)\/conditions$/, handle: (p) => service.checkConditions(Number(p[1])) },
  { method: "POST", pattern: /^\/api\/bases\/(\d+)\/targets$/, handle: (p, b) => {
      const body = b as { target?: unknown };
      return service.addTarget(Number(p[1]), body.target);
    } },
  { method: "POST", pattern: /^\/api\/reductions\/(\d+)\/approx\/(\d+)$/, handle: (p, b) => {
      const body = (b ?? {}) as { boxRadius?: number };
      return service.approximate(Number(p[1]), Number(p[2]), body.boxRadius);
    } },
  { method: "POST", pattern: /^\/api\/certificates\/verify$/, handle: (_p, b) =>
      service.verifyCertificateObject(b as never) },
];

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, service: "int-lll-backend", dataDir: DATA_DIR });
    }
    for (const route of routes) {
      if (req.method !== route.method) continue;
      const m = route.pattern.exec(url.pathname);
      if (!m) continue;
      const body = req.method === "POST" ? await readBody(req) : {};
      return send(res, 200, { ok: true, data: await route.handle(m, body) });
    }
    return send(res, 404, { ok: false, error: "未找到对应路由" });
  } catch (e) {
    if (e instanceof ValidationError) return send(res, 400, { ok: false, error: e.message });
    if (e instanceof SyntaxError) return send(res, 400, { ok: false, error: "请求体不是合法 JSON" });
    const msg = (e as Error).message;
    return send(res, 500, { ok: false, error: msg });
  }
});

server.listen(PORT, () => {
  process.stdout.write(`[lll] API 已启动: http://localhost:${PORT}  数据目录: ${DATA_DIR}\n`);
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
