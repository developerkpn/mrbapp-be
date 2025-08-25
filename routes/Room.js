const RoomController = require("../controllers/RoomController");
const express = require("express");
const router = express.Router();
const AuthToken = require("../middleware/authentication");
const AdminCheck = require("../middleware/admincheck");

router.use(AuthToken);

router.get("/", RoomController.getAllRoom);
router.get("/facilities", RoomController.getAllFacilities);
router.get("/fas", RoomController.getAllRoomWithFac);
router.get("/avai", RoomController.getAvailableRoomWithParam);
router.post("/search-avail", RoomController.getAvailableRoom);
router.get("/:id_ruangan/qrcode/check", RoomController.checkQRCodeExists);
router.post("/:id_ruangan/qrcode/generate", AdminCheck, RoomController.generateQRCode);
router.get("/:id_ruangan", RoomController.getRoomDetails);
router.post("/", AdminCheck, RoomController.createRoom);
router.put("/:id_ruangan", RoomController.updateRoom);
router.patch("/:id_ruangan", AdminCheck, RoomController.editRoomLimited);
router.delete("/:id_ruangan", AdminCheck, RoomController.deleteRoom);

module.exports = router;
