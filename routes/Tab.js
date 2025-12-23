const TabController = require("../controllers/TabController");
const express = require("express");
const router = express.Router();
const AuthToken = require("../middleware/authentication");

router.use(AuthToken);

router.get("/room", TabController.getRoomInfo);
router.get("/onmeet", TabController.onMeeting);
router.get("/nextmeet", TabController.nextMeeting);
router.get("/prevmeet", TabController.prevMeeting);

module.exports = router;
