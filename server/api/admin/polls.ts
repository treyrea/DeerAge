import { handleAdminPollsRequest } from "../../src/content.js";
import { vercel } from "../../src/vercel.js";

export default vercel(handleAdminPollsRequest);
