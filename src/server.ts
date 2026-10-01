/** 纯 Node http 的 JSON API（无第三方框架） */
import * as http from "node:http";
import { Service } from "./service";

interface Route {
  method: string;
  pattern: RegExp;
  handler: (svc: Service, body: any, params: string[]) => any;
}

const routes: Route[] = [
  { method: "GET", pattern: /^\/api\/limits$/, handler: (s) => s.limits() },
  {
    method: "POST",
    pattern: /^\/api\/bases$/,
    handler: (s, b) => s.importBasis(b.name, b.basis),
  },
  { method: "GET", pattern: /^\/api\/bases$/, handler: (s) => s.listBases() },
  {
    method: "POST",
    pattern: /^\/api\/bases\/(\d+)\/reduce$/,
    handler: (s, b, p) =>
      s.reduce(Number(p[0]), {
        deltaNum: b.delta_num,
        deltaDen: b.delta_den,
        iterationBudget: b.iteration_budget,
        digitBudget: b.digit_budget,
      }),
  },
  {
    method: "GET",
    pattern: /^\/api\/reductions\/(\d+)\/summary$/,
    handler: (s, _b, p) => s.summary(Number(p[0])),
  },
  {
    method: "GET",
    pattern: /^\/api\/reductions\/(\d+)\/certificate$/,
    handler: (s, _b, p) => s.certificate(Number(p[0])),
  },
  {
    method: "POST",
    pattern: /^\/api\/reductions\/(\d+)\/verify$/,
    handler: (s, b, p) => s.verify(Number(p[0]), b?.override),
  },
  {
    method: "POST",
    pattern: /^\/api\/reductions\/(\d+)\/approximate$/,
    handler: (s, b, p) =>
      s.approximate(Number(p[0]), b.target, b.box_radius),
  },
  { method: "GET", pattern: /^\/api\/targets$/, handler: (s) => s.listTargets() },
  {
    method: "GET",
    pattern: /^\/api\/reductions\/(\d+)\/export$/,
    handler: (s, _b, p) => s.exportReduction(Number(p[0])),
  },
];

export function createServer(svc: Service): http.Server {
  return http.createServer((req, res) => {
    const send = (code: number, obj: unknown) => {
      const text = JSON.stringify(obj, null, 2);
      res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(text);
    };

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const url = (req.url ?? "").split("?")[0];
        let parsed: any = {};
        if (body) parsed = JSON.parse(body);
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = url.match(r.pattern);
          if (m) {
            const result = r.handler(svc, parsed, m.slice(1));
            send(200, { ok: true, data: result });
            return;
          }
        }
        send(404, { ok: false, error: `无此路由: ${req.method} ${url}` });
      } catch (e) {
        send(400, { ok: false, error: (e as Error).message });
      }
    });
    req.on("error", () => send(500, { ok: false, error: "请求错误" }));
  });
}
