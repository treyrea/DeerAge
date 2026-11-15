import { handleAdminFeedbackRequest } from "../../src/feedback.js";
import { vercel } from "../../src/vercel.js";

export default vercel(handleAdminFeedbackRequest);
