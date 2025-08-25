const express = require("express");
const router = express.Router();
//import controllers here
const Example = require("../controllers/ExampleController");
const Book = require("./Book");
const User = require("./User");
const Room = require("./Room");
const Tab = require("./Tab");
const Notif = require("../controllers/NotificationController");

//@using router
// router.use('/api/<endpoint>', <controller>)
router.use("/be-api/book", Book);
router.use("/be-api/user", User);
router.use("/be-api/room", Room);
router.use("/be-api/tab", Tab);
router.get("/be-api/notif", Notif.PushMultiNotif);
router.get("/be-api/notif/cron", Notif.GetNotifCron);
router.get("/be-api/testcron", Example.cronTest);

router.use("/be-api/healthcheck", (req, res) => {
  res.status(200).send({
    message: "Connected",
  });
});

module.exports = router;
