/**
 * 精确有理数运算：分子分母均为 bigint，分母恒正，约分存储。
 * 任何判定都基于这些精确分数，绝不先转浮点再声称精确。
 */

export interface Frac {
  n: bigint; // 分子
  d: bigint; // 分母（正数）
}

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

export function frac(n: bigint | number, d: bigint | number = 1n): Frac {
  let num = BigInt(n);
  let den = BigInt(d);
  if (den === 0n) throw new Error("有理数分母为零");
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return { n: num / g, d: den / g };
}

export const ZERO: Frac = { n: 0n, d: 1n };
export const ONE: Frac = { n: 1n, d: 1n };

export function isZero(a: Frac): boolean {
  return a.n === 0n;
}

export function neg(a: Frac): Frac {
  return { n: -a.n, d: a.d };
}

export function add(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Frac, b: Frac): Frac {
  return frac(a.n * b.n, a.d * b.d);
}

export function div(a: Frac, b: Frac): Frac {
  if (b.n === 0n) throw new Error("有理数除以零");
  return frac(a.n * b.d, a.d * b.n);
}

/** a == b */
export function eq(a: Frac, b: Frac): boolean {
  return a.n * b.d === b.n * a.d;
}

/** a < b */
export function lt(a: Frac, b: Frac): boolean {
  return a.n * b.d < b.n * a.d;
}

/** a <= b */
export function lte(a: Frac, b: Frac): boolean {
  return a.n * b.d <= b.n * a.d;
}

/** a > b */
export function gt(a: Frac, b: Frac): boolean {
  return lt(b, a);
}

/** a >= b */
export function gte(a: Frac, b: Frac): boolean {
  return lte(b, a);
}

/** 绝对值 */
export function abs(a: Frac): Frac {
  return a.n < 0n ? { n: -a.n, d: a.d } : a;
}

/**
 * 最近整数，半整数平局规则：向远离 0 的方向舍入（half away from zero）。
 * 即 +k+1/2 -> k+1，-k-1/2 -> -k-1。确定性、无浮点。
 */
export function roundNearest(a: Frac): { q: bigint; tie: boolean } {
  // 截断商与余数（余数与分母同号，分母为正，故余数非负）
  let q = a.n / a.d;
  let r = a.n % a.d;
  let tie = false;
  if (a.n >= 0n) {
    const twice = 2n * r;
    if (twice > a.d) q += 1n;
    else if (twice === a.d) {
      q += 1n; // 平局向远离 0：正数向上
      tie = true;
    }
  } else {
    // 负数：JS 的 % 结果符号随被除数，r <= 0
    const twice = -2n * r;
    if (twice > a.d) q -= 1n;
    else if (twice === a.d) {
      q -= 1n; // 平局向远离 0：负数向下
      tie = true;
    }
  }
  return { q, tie };
}

/** 十进制字符串输出（精确，不使用科学计数法） */
export function toDecimal(a: Frac, maxFracDigits = 40): string {
  const negSign = a.n < 0n;
  const num = negSign ? -a.n : a.n;
  const whole = num / a.d;
  let rem = num % a.d;
  let s = whole.toString();
  if (rem !== 0n) {
    let fracPart = "";
    let digits = 0;
    const seen = new Map<bigint, number>();
    while (rem !== 0n && digits < maxFracDigits) {
      if (seen.has(rem)) {
        const start = seen.get(rem)!;
        fracPart =
          fracPart.slice(0, start) + "(" + fracPart.slice(start) + ")";
        rem = 0n;
      } else {
        seen.set(rem, digits);
        rem *= 10n;
        const digit = rem / a.d;
        fracPart += digit.toString();
        rem = rem % a.d;
        digits++;
      }
    }
    s += "." + fracPart;
    if (rem !== 0n && digits >= maxFracDigits) s += "…";
  }
  return (negSign ? "-" : "") + s;
}

/** 序列化为普通字符串 "n/d" */
export function serialize(a: Frac): string {
  return a.n.toString() + "/" + a.d.toString();
}

/** 反序列化 "n/d" 或整数 */
export function parse(s: string): Frac {
  const parts = s.split("/");
  if (parts.length === 1) return frac(BigInt(parts[0].trim()));
  if (parts.length === 2)
    return frac(BigInt(parts[0].trim()), BigInt(parts[1].trim()));
  throw new Error("无法解析有理数: " + s);
}
