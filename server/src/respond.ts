import type { Outgoing } from "./wire.js";

export function applyOutgoing(
  res: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (chunk?: string) => void;
  },
  result: Outgoing,
): void {
  res.statusCode = result.status;
  for (const [key, value] of Object.entries(result.headers ?? {})) {
    res.setHeader(key, value);
  }
  if (result.text != null) {
    res.setHeader("content-type", result.contentType ?? "text/plain; charset=utf-8");
    res.end(result.text);
    return;
  }
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(result.body));
}
