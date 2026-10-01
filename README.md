# 整数格 LLL 约简与 Babai 近似最近点后端（教学用途）

一个**只做后端（API + CLI）**的小维数整数格分析服务。输入十进制整数行向量组成的格基，执行
精确有理数 **LLL 约简**，并对目标向量做 **Babai 最近平面（Nearest Plane）近似最近点**。

> 用途限定：格算法教学与可验证性演示。**不用于**恢复真实密钥或攻击任何外部系统。

技术栈：**TypeScript + Node.js（内置 `node:sqlite`）**，运行时**零第三方依赖**，
不依赖 Docker、WSL、付费服务或在线 API，可直接在 Windows 本地运行。

## 精确性与确定性约定

- 所有 Gram–Schmidt 系数 `mu_ij`、正交范数平方 `B_i`、尺寸约简与 Lovász 判定都在
  **BigInt 有理数 `Q`（分子/分母约分）** 上完成，**不先转浮点再声称精确**。
  浮点仅用于距离 `sqrt` 的人类可读展示，不参与任何判定。
- **delta** 必须是满足 `1/4 < delta < 1` 的精确分数（默认 `3/4`），越界立即拒绝。
- **最近整数的半整数平局规则**：向远离 0 的方向舍入（half away from zero），
  即 `+k+1/2 -> k+1`、`-k-1/2 -> -k-1`，完全确定；发生平局的坐标会在结果中列出。
- 约简全程同步维护整数变换矩阵 `U`，输出 `B' = U B` 的证据，并用**独立整数乘法**
  核验该等式、用**独立小矩阵行列式**核验 `det(U)=±1`（单模，保格）。
- 零向量、线性相关、迭代预算耗尽、中间整数位数预算耗尽都会明确报错，
  **未完成的约简其 `reduced` 标志恒为 `false`，绝不冒充满足全部条件**。

## 公开上限

| 项目 | 上限 / 默认 |
| --- | --- |
| 基向量数量 | 16 |
| 环境维数 | 64 |
| 单个整数十进制位数 | 60 |
| 默认 delta | 3/4 |
| 默认迭代预算 | 200000 |
| 默认中间整数位数预算 | 100000 |

整数一律以**十进制字符串**输入/输出，避免 JS number 精度问题。

## 环境要求

- Node.js `>= 22.5`（开发使用 v25，内置稳定可用的 `node:sqlite`）。
- Windows PowerShell；下面命令均在项目根目录执行。

## 构建 / 测试 / 启动 / 演示

```powershell
npm install        # 仅安装 TypeScript 与 @types/node（开发期）
npm run build      # tsc 编译到 dist/
npm test           # 构建 + node --test（18 个测试）
npm start          # 启动 HTTP API，默认 http://127.0.0.1:8080
npm run demo       # 端到端教学演示（含反例、篡改、重启复现）
```

可选配置：

```powershell
# 可配置端口与项目内数据目录
node dist/src/cli.js serve --port 9000 --data ./data
$env:LLL_PORT="9000"; $env:LLL_DATA_DIR="./data"; npm start
```

## CLI 用法

```powershell
node dist/src/cli.js limits
node dist/src/cli.js import --name skew --rows '[["1","1000000"],["0","1"]]'
node dist/src/cli.js list
node dist/src/cli.js reduce --basis 1                         # 默认 delta 3/4
node dist/src/cli.js reduce --basis 1 --delta-num 99 --delta-den 100 `
                          --iteration-budget 5000 --digit-budget 2000
node dist/src/cli.js summary --id 1
node dist/src/cli.js certificate --id 1
node dist/src/cli.js verify --id 1                            # 独立核验
node dist/src/cli.js approx --id 1 --target '["500000","7"]' --box-radius 2
node dist/src/cli.js targets
node dist/src/cli.js export --id 1
node dist/src/cli.js serve --port 8080 --data ./data
```

## HTTP API

仅监听 `127.0.0.1`，请求/响应均为 JSON，响应包一层 `{ "ok": true, "data": ... }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/limits` | 上限、默认参数、平局规则、证书版本 |
| POST | `/api/bases` | 导入格基，体 `{ "name": "...", "basis": [["1","2"],...] }` |
| GET | `/api/bases` | 列出格基 |
| POST | `/api/bases/:id/reduce` | LLL 约简，可带 `delta_num/delta_den/iteration_budget/digit_budget` |
| GET | `/api/reductions/:id/summary` | 约简过程摘要（交换、尺寸约简、逐步记录） |
| GET | `/api/reductions/:id/certificate` | 导出证书（B、B'、U、delta、版本） |
| POST | `/api/reductions/:id/verify` | 独立核验；体可传 `override` 注入被篡改字段做阴性测试 |
| POST | `/api/reductions/:id/approximate` | Babai 近似，体 `{ "target": [...], "box_radius": "2" }`（盒对照可选） |
| GET | `/api/targets` | 目标点与 Babai/盒结果历史 |
| GET | `/api/reductions/:id/export` | 证书 + 核验报告一起导出 |

快速体验：

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/limits
```

## 证书独立核验内容

证书版本固定为 `lll-cert-v1`，核验完全独立于约简运行时状态，逐项给出结论：

1. `version`：证书版本匹配；
2. `delta`：`1/4 < delta < 1`；
3. `transform`：用独立整数乘法验证 `B' = U B`；
4. `unimodular`：用独立高斯消元行列式验证 `det(U)=±1`；
5. `independence`：约简基线性无关（无零正交分量）；
6. `size-reduction`：全部 `|mu_ij| <= 1/2`；
7. `lovasz`：全部 `B*_k² >= (delta - mu_k,k-1²) B*_{k-1}²`。

被篡改的基、`U`、`delta` 或证书版本都会导致 `valid=false`（演示脚本第 4 步有展示）。

## Babai 近似与有限盒对照

- 返回：相对约简基的整数系数、经 `U` 映射回原始基的整数系数、格点、残差、
  距离平方、发生半整数平局的坐标、以及使用的约简/证书版本。
- 服务端额外做**独立成格检查**：用“原始基系数”重建的点必须与 Babai 点完全相同，
  证明该点确在原格 `L(B)` 内。
- **明确不保证全局最近**。`approximate` 的 `box_radius` 会以 Babai 系数为中心，在
  `c_i ∈ [center_i - R, center_i + R]` 的**有限系数盒**内穷举并报告盒内最优点。
  盒内最优**不等于**整格的精确最近点（盒外未搜索），返回中会显式重申这一点。

### 内置反例（近似 ≠ 最近）

基 `B = [[4,1],[1,2]]`，LLL 后 `B' = [[1,2],[3,-1]]`，目标 `t = (-6,-6)`：
Babai 最近平面返回格点 `(-7,-7)`，距离平方 `2`；而格点 `(-6,-5)` 距离平方 `1`。
该例在测试与 `npm run demo` 中都会复现，直观说明 Babai 只是近似。

## 数据持久化

使用项目内 `data/` 目录下的 SQLite 文件 `lll.db`（自动创建，WAL 模式）。
表：`meta`（含证书版本）、`bases`、`reductions`、`targets`。
重启进程后用同一 id 调用 `summary` / `verify` / `export` 可**复现同一份报告**。

## 测试覆盖

`npm test` 覆盖：已约简基、严重斜交基、需要交换的基、负坐标、半整数平局舍入、
零向量、线性相关、非法 delta、迭代预算中断；证书的独立整数乘法与小矩阵行列式核验、
两组基系数经 `U` 映射生成同一格点、Babai 点确在原格内，以及近似非最近点反例。

## 限制与说明

- 面向小维数教学：Gram–Schmidt 每轮整体重算以保持简单与精确，高维/大基性能有限。
- 精确有理数的分子分母可能快速增长，因此设置了位数预算，超限会明确失败而非给出错误“成功”。
- 有限盒穷举设枚举上限（默认 2,000,000 个候选），过大会被拒绝以保护本地资源。
- 无鉴权、仅绑定回环地址，请勿暴露到公网；不含任何前端页面。
