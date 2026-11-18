import { handleAdminHarvestsRequest } from "../../src/harvest.js";
import { vercel } from "../../src/vercel.js";

export default vercel(handleAdminHarvestsRequest);
