import { handleAnalyzeRequest, type Incoming } from "../src/http";

export default async function handler(req: Incoming, res: { status: (code: number) => { json: (body: unknown) => void } }) {
  const result = await handleAnalyzeRequest(req);
  res.status(result.status).json(result.body);
}
