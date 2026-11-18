import { handlePushTokenRequest } from "../src/outreach.js";
import { vercel } from "../src/vercel.js";

export default vercel(handlePushTokenRequest);
