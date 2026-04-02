export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function ensure<T>(val: T | null | undefined, description: string): T {
  assert(val != null, `Required value missing: ${description}`);
  return val;
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}