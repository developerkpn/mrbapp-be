const BookReqController = require("../controllers/BookReqController");
const Penalty = require("../middleware/penalty");
const user = require("../controllers/UserController");
const AuthToken = require("../middleware/authentication");
const AdminCheck = require("../middleware/admincheck");
const express = require("express");
const router = express.Router();

router.use(AuthToken);

router.get("/checkin/:id_user", BookReqController.getCheckInBook);
router.get("/checkout/:id_user", BookReqController.getCheckOutBook);
router.patch("/checkin", BookReqController.checkIn);
router.patch("/checkout", BookReqController.checkOut);

router.patch("/approval/:id_book", BookReqController.approval);
router.patch("/cancel/:id_book", AdminCheck, BookReqController.cancelBooking);

router.post("/", Penalty, BookReqController.createBook);
router.get("/", BookReqController.showAllBook);
router.get("/show", BookReqController.showBookbyUser);
router.get("/byroom", BookReqController.showBookbyRoom);
router.get("/:id_book", BookReqController.getBookById);
router.patch("/:id_book", BookReqController.editBook);
router.delete("/:id_book", BookReqController.cancelBook);
// http://localhost:5000/api/book/byroom?roomid=ROOM003

module.exports = router;
