import { handleAnalyzeRequest, type Incoming } from "../src/http.js";

export default async function handler(req: Incoming, res: { status: (code: number) => { json: (body: unknown) => void } }) {
  const body = req.body && typeof req.body === "object" ? { ...(req.body as Record<string, unknown>), mode: "score" } : { mode: "score" };
  const result = await handleAnalyzeRequest({ ...req, body });
  res.status(result.status).json(result.body);
}
