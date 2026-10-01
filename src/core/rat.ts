// 精确有理数：分子/分母均为 BigInt，分母恒为正，最简分数。
// 所有内部判定均使用本类型，不先转浮点。

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

export class Rat {
  readonly n: bigint; // 分子
  readonly d: bigint; // 分母（正）

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }

  static make(n: bigint, d: bigint = 1n): Rat {
    if (d === 0n) throw new Error("有理数分母为零");
    if (n === 0n) return new Rat(0n, 1n);
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    return new Rat(n / g, d / g);
  }

  static ZERO = Rat.make(0n);
  static ONE = Rat.make(1n);

  // 十进制字符串解析，例如 "12" "-3" "0"；仅接受可选符号加数字。
  static fromDecimal(s: string): Rat {
    const t = String(s).trim();
    if (!/^[+-]?\d+$/.test(t)) {
      throw new Error(`非法整数十进制字符串: ${JSON.stringify(s)}`);
    }
    return Rat.make(BigInt(t), 1n);
  }

  toDecimal(): string {
    if (this.d !== 1n) throw new Error("不是整数，无法十进制整数输出");
    return this.n.toString(10);
  }

  isInteger(): boolean {
    return this.d === 1n;
  }
  isZero(): boolean {
    return this.n === 0n;
  }
  isNegative(): boolean {
    return this.n < 0n;
  }

  neg(): Rat {
    return Rat.make(-this.n, this.d);
  }
  abs(): Rat {
    return this.n < 0n ? Rat.make(-this.n, this.d) : this;
  }
  add(o: Rat): Rat {
    return Rat.make(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Rat): Rat {
    return Rat.make(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Rat): Rat {
    return Rat.make(this.n * o.n, this.d * o.d);
  }
  div(o: Rat): Rat {
    if (o.n === 0n) throw new Error("有理数除以零");
    return Rat.make(this.n * o.d, this.d * o.n);
  }

  cmp(o: Rat): -1 | 0 | 1 {
    const l = this.n * o.d;
    const r = o.n * this.d;
    if (l < r) return -1;
    if (l > r) return 1;
    return 0;
  }
  lt(o: Rat): boolean { return this.cmp(o) < 0; }
  lte(o: Rat): boolean { return this.cmp(o) <= 0; }
  gt(o: Rat): boolean { return this.cmp(o) > 0; }
  gte(o: Rat): boolean { return this.cmp(o) >= 0; }
  eq(o: Rat): boolean { return this.cmp(o) === 0; }

  // 最近整数，半整数平局向“远离零”方向取（确定性，对称）：
  // +k+1/2 -> k+1，-k-1/2 -> -(k+1)。
  nearestIntHalfAway(): bigint {
    if (this.d === 1n) return this.n;
    const q = this.n / this.d; // 向零截断
    const r = this.n - q * this.d; // 与 n 同号，|r| < d
    const twice = (r >= 0n ? r : -r) * 2n;
    if (twice > this.d) return r >= 0n ? q + 1n : q - 1n;
    if (twice < this.d) return q;
    // 恰好半整数：远离零
    return r >= 0n ? q + 1n : q - 1n;
  }

  // 近似浮点（仅用于展示，绝不参与判定）
  toNumberApprox(): number {
    return Number(this.n) / Number(this.d);
  }
}

export function rat(n: bigint | number, d: bigint | number = 1): Rat {
  return Rat.make(BigInt(n), BigInt(d));
}
