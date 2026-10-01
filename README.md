# 整数格 LLL 约简与近似最近点后端（教学用途）

使用 **TypeScript + Node.js + SQLite** 从零实现的小维数整数格分析服务，仅提供 **HTTP API 与 CLI**（无前端、无 Docker、无 WSL、无付费服务、无外部在线 API）。

> 用途限定：整数格的教学演示与算法分析。**不用于恢复真实密钥，不用于攻击任何外部系统。** 所有格基、目标点均由使用者自行输入。

## 功能

- 输入线性无关的**整数行向量**作为格基，整数一律以**十进制字符串**输入/输出（内部用 BigInt，任意位数受上限约束）。
- 自实现 **BigInt 精确有理数**运算、Gram–Schmidt 系数、尺寸约简、Lovász 条件判定。
  - 内部判定**绝不先转浮点**；`distanceApprox` 等浮点字段仅用于展示。
  - `delta` 为精确有理数，要求 `1/4 < delta < 1`，默认 `3/4`。
  - 最近整数采用确定的**半整数平局远离零**规则：`+1/2 → +1`、`-1/2 → -1`。
- 同步跟踪整数变换矩阵 `U`，输出 `B' = U B`，并以独立整数乘法核验变换关系、以 **Bareiss 精确行列式**核验 `det(U)=±1`（单模）。
- 零向量、线性相关输入、迭代预算耗尽、整数位数预算耗尽均给出明确状态，**未完成约简不会被标记为已满足全部条件**。
- 独立**证书核验**：指纹防篡改 + 变换关系 + 单模性 + 尺寸约简条件 + 全部 Lovász 不等式；篡改基、`U` 或 `delta` 都会被识别。
- **Babai 最近平面**近似：给出约简基整数系数、映射回原始基的整数系数、格点、精确平方距离、所用基版本；明确声明**不保证全局最近点**。
- **有限系数盒穷举对照**（确定性字典序），盒内最优**不**等同于全格精确最近点。
- 独立核验 Babai 点确在原格内、两组基系数生成同一格点。内置一个 Babai 非最近点的反例。
- SQLite 持久化格基、约简参数、目标点、约简结果与证书；重启后可复现同一报告。

## 公开上限

| 项目 | 默认值 | 环境/参数 |
| --- | --- | --- |
| 基向量数量 `m` | 16 | `LIMITS.maxBasisVectors` |
| 环境维数 `n` | 16 | `LIMITS.maxDimension` |
| 输入整数十进制位数 | 10000 | `LIMITS.maxIntegerDigits` |
| 最大迭代数 | 100000 | 约简请求 `maxIterations` |
| 中间整数位数 | 10000 | 约简请求 `maxBits` |
| HTTP 端口 | 8787 | 环境变量 `LLL_PORT` |
| 数据目录 | `./data` | 环境变量 `LLL_DATA_DIR` |

## 环境要求

- Windows 本地 Node.js **>= 22**（开发与验证使用 Node v25；使用内置 `node:sqlite`，**无需** `better-sqlite3` 等原生编译依赖）。
- TypeScript 仅为构建期依赖。

## 构建 / 测试 / 启动 / 演示

```powershell
# 1. 安装依赖
npm install

# 2. 构建（输出到 dist/）
npm run build

# 3. 运行全部测试（node:test，25 个用例）
npm test

# 4. 启动 HTTP API（默认 http://localhost:8787）
npm start

# 5. 一键教学演示（改善表示 / 对照误差 / 篡改失败 / 反例 / 重启复现 / 预算中断）
npm run demo

# 可选：API 冒烟脚本（自行起停服务器）
powershell -ExecutionPolicy Bypass -File scripts/smoke-api.ps1
```

自定义端口与数据目录：

```powershell
$env:LLL_PORT="9000"
$env:LLL_DATA_DIR="$PWD/mydata"
npm start
```

## CLI

```powershell
node dist/cli/index.js limits
node dist/cli/index.js import examples/basis.json myname
node dist/cli/index.js list
node dist/cli/index.js reduce <basisId>                 # 默认 delta=3/4
node dist/cli/index.js reduce <basisId> 99 100 --max-iter 5000 --max-bits 2000
node dist/cli/index.js summary <reductionId>
node dist/cli/index.js verify <reductionId>
node dist/cli/index.js target <basisId> examples/target.json
node dist/cli/index.js approx <reductionId> <targetId> 3   # 末尾 3 为盒半径（可选）
node dist/cli/index.js export <reductionId> out.json
```

## HTTP API

所有响应为 `{ "ok": boolean, "data"?: ..., "error"?: string }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| GET | `/api/limits` | 公开上限 |
| POST | `/api/bases` | 导入基，body `{"basis":[["5","3"],...],"name"?}` |
| GET | `/api/bases` | 列出基 |
| GET | `/api/bases/:id` | 基详情（含基版本指纹） |
| POST | `/api/bases/:id/reduce` | 约简，body `{"deltaNum"?, "deltaDen"?, "maxIterations"?, "maxBits"?}` |
| GET | `/api/reductions/:id` | 约简结果与证书 |
| GET | `/api/reductions/:id/summary` | 过程摘要（步数、交换、尺寸约简计数） |
| GET | `/api/reductions/:id/verify` | 独立证书核验 |
| GET | `/api/reductions/:id/conditions` | 直接重算尺寸约简与 Lovász 条件 |
| POST | `/api/bases/:id/targets` | 添加目标 `{"target":["-6","2"]}` |
| POST | `/api/reductions/:rid/approx/:tid` | Babai，body `{"boxRadius"?:3}` |
| POST | `/api/certificates/verify` | 核验外部提交的证书 JSON（用于演示篡改检测） |

PowerShell 调用示例：

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8787/api/bases `
  -ContentType "application/json" -Body '{"basis":[["5","3"],["3","5"]]}'
```

## 状态与证书字段

约简 `status` 取值：

- `reduced`：尺寸约简与全部 Lovász 不等式均满足（证书方可 `valid=true`）。
- `zero_vector`：存在零向量。
- `dependent_input`：基线性相关。
- `iteration_budget_exhausted`：迭代预算耗尽（部分约简，禁止用于 Babai）。
- `bit_budget_exhausted`：整数位数预算耗尽（部分约简）。

证书 `schemaVersion = lll-cert-v1`，对原始基、约简基、`U`、`delta` 分别保存 SHA-256 指纹；核验端**只信任重算结果**，不采信证书内的结论字段。

## 教学反例（Babai 非最近点）

基 `B0 = [[5,3],[3,5]]`，δ=3/4 约简后 `B' = [[-2,2],[3,5]]`。目标 `t=(-6,2)`：

- Babai 返回点 `(-9,1)`，平方距离 `10`；
- 系数盒 `R=8` 内存在点 `(-4,4)`，平方距离 `8`（严格更小）。

说明 Babai 最近平面只是近似；盒内最优也仅是有限范围内最优，不是全格精确 CVP 声明。

## 目录结构

```
src/
  core/      rat.ts(有理数) vec.ts(整数/有理向量矩阵,Bareiss行列式)
             gs.ts(Gram-Schmidt) lll.ts(LLL与条件核验)
             babai.ts(最近平面+盒穷举) cert.ts(证书生成/核验)
  db/store.ts        node:sqlite 持久化
  service/service.ts 业务编排与输入校验
  server/index.ts    HTTP API
  cli/index.ts       CLI
  demo/demo.ts       教学演示
  test/*.test.ts     node:test 测试
scripts/smoke-api.ps1
examples/           示例输入
```

## 限制与说明

- 面向小维数教学设计（默认上限 16 维）；不针对高维性能优化。
- 精确有理数在中间位宽增长时可能变慢，故设置位数与迭代预算并明确报告耗尽。
- Babai 与盒穷举**都不是**精确 CVP 求解器；本项目不声明全局最近点。
- `node:sqlite` 在当前 Node 版本会打印一次 ExperimentalWarning，不影响功能。
