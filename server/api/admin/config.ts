import { handleAdminConfigRequest } from "../../src/remote-config.js";
import { vercel } from "../../src/vercel.js";

export default vercel(handleAdminConfigRequest);
