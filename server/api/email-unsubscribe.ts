import { handleEmailUnsubscribeRequest } from "../src/outreach.js";
import { vercel } from "../src/vercel.js";

export default vercel(handleEmailUnsubscribeRequest);
