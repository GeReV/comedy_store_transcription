export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function ensure<T>(val: T | null | undefined, description: string): T {
  assert(val != null, `Required value missing: ${description}`);
  return val;
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
