const RoomController = require("../controllers/RoomController");
const express = require("express");
const router = express.Router();
const AuthToken = require("../middleware/authentication");

router.use(AuthToken);

router.get("/", RoomController.getAllRoom);
router.get("/fas", RoomController.getAllRoomWithFac);
router.get("/avai", RoomController.getAvailableRoomWithParam);
router.post("/search-avail", RoomController.getAvailableRoom);
router.get("/:id_ruangan", RoomController.getRoomDetails);
router.post("/", RoomController.createRoom);
router.put("/:id_ruangan", RoomController.updateRoom);
router.delete("/:id_ruangan", RoomController.deleteRoom);

module.exports = router;
