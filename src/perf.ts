/**
 * Dev-only performance instrumentation.
 *
 * __DEV__ is replaced by esbuild at bundle time:
 *   dev:  --define:__DEV__=true   → marks + console.debug output
 *   prod: --define:__DEV__=false  → measure(label, fn) compiles down to fn()
 */
declare const __DEV__: boolean;

export function measure<T>(label: string, fn: () => T): T {
  if (!__DEV__) return fn();
  const start = `${label}-start`;
  const end = `${label}-end`;
  performance.mark(start);
  const result = fn();
  performance.mark(end);
  const entry = performance.measure(label, start, end);
  console.debug(`[perf] ${label}: ${entry.duration.toFixed(2)}ms`);
  return result;
}
