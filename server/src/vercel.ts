import { applyOutgoing } from "./respond.js";
import type { Incoming, Outgoing } from "./wire.js";

type NodeResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (chunk?: string) => void;
};

export function vercel(handle: (req: Incoming) => Promise<Outgoing>) {
  return async function handler(req: Incoming, res: NodeResponse) {
    applyOutgoing(res, await handle(req));
  };
}
