import { Router, urlencoded } from "express";
import { getAuthorization, postToken, postAuthorizeDecision } from "../controllers/oauthController.js";

const router = Router();

const form = urlencoded({ extended: false });

router.get("/authorize", getAuthorization);
router.post("/authorize/decision", form, postAuthorizeDecision);
router.post("/token", form, postToken);

export default router;
