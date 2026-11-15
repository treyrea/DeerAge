import { handleConfigRequest, type Incoming } from "../src/http.js";

export default async function handler(req: Incoming, res: { status: (code: number) => { json: (body: unknown) => void } }) {
  const result = await handleConfigRequest(req);
  res.status(result.status).json(result.body);
}
