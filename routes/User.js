const express = require("express");
const router = express.Router();
const controller = require("../controllers/UserController");

router.post("/register", controller.registerUser);
router.post("/verifynew", controller.newUserVerify);
router.post("/login", controller.loginUser);
router.post("/reqres", controller.reqResetPassword);
router.post("/verifresotp", controller.verifResetPass);
router.post("/resetpass", controller.resetPassword);
router.post("/refreshtoken", controller.refreshToken);
router.post("/logout", controller.logout);

router.patch("/penalty", controller.checkPenalty);
router.get("/email", controller.getEmailDomain);
router.get("/bizunit", controller.getBizUnit);

module.exports = router;
