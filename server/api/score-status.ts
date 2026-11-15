import { handleJobStatus } from "../src/analyze.js";
import { queryParam, type Incoming } from "../src/wire.js";

export default async function handler(req: Incoming, res: { status: (code: number) => { json: (body: unknown) => void } }) {
  const result = await handleJobStatus(queryParam(req, "id"));
  res.status(result.status).json(result.body);
}
