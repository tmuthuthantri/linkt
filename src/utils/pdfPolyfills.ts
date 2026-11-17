/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Runtime polyfills required by pdfjs-dist. Evaluated before pdf.js itself
 * (ES modules evaluate dependencies in import order) (modern pdf.js builds rely on
 * very recent ECMAScript APIs that some corporate-managed browsers lack).
 */

const P = Promise as any;
if (typeof P.withResolvers !== 'function') {
  P.withResolvers = function withResolvers<T>() {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (r?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (typeof P.try !== 'function') {
  P.try = function tryFn(fn: (...a: unknown[]) => unknown, ...args: unknown[]) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

const U8 = Uint8Array as any;
if (typeof U8.prototype.toHex !== 'function') {
  Object.defineProperty(U8.prototype, 'toHex', {
    value: function toHex(this: Uint8Array) {
      let out = '';
      for (let i = 0; i < this.length; i++) out += this[i].toString(16).padStart(2, '0');
      return out;
    },
    writable: true,
    configurable: true,
  });
}

if (typeof U8.fromHex !== 'function') {
  Object.defineProperty(U8, 'fromHex', {
    value: function fromHex(hex: string) {
      if (hex.length % 2 !== 0) throw new SyntaxError('Invalid hex string');
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) {
        const byte = Number.parseInt(hex.substr(i * 2, 2), 16);
        if (Number.isNaN(byte)) throw new SyntaxError('Invalid hex string');
        out[i] = byte;
      }
      return out;
    },
    writable: true,
    configurable: true,
  });
}

const M = Math as any;
if (typeof M.sumPrecise !== 'function') {
  // Neumaier compensated summation — close enough to the spec for rendering maths.
  M.sumPrecise = function sumPrecise(values: Iterable<number>) {
    let sum = 0;
    let c = 0;
    for (const v of values) {
      const t = sum + v;
      if (Math.abs(sum) >= Math.abs(v)) c += sum - t + v;
      else c += v - t + sum;
      sum = t;
    }
    return sum + c;
  };
}

export {};
