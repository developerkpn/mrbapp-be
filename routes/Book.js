const BookReqController = require("../controllers/BookReqController");
const BookCheck = require("../middleware/bookcheck");
const Penalty = require("../middleware/penalty");
const user = require("../controllers/UserController");
const AuthToken = require("../middleware/authentication");
const express = require("express");
const router = express.Router();

router.use(AuthToken);

router.get("/checkin/:id_user", BookReqController.getCheckInBook);
router.get("/checkout/:id_user", BookReqController.getCheckOutBook);
router.patch("/checkin", BookReqController.checkIn);
router.patch("/checkout", BookReqController.checkOut);

router.patch("/approval/:id_book", BookReqController.approval);

router.post("/", Penalty, BookCheck, BookReqController.createBook);
router.get("/", BookReqController.showAllBook);
router.get("/show", BookReqController.showBookbyUser);
router.get("/byroom", BookReqController.showBookbyRoom);
router.get("/:id_book", BookReqController.getBookById);
router.patch("/:id_book", BookReqController.editBook);
router.delete("/:id_book", BookReqController.cancelBook);
// http://localhost:5000/api/book/byroom?roomid=ROOM003

module.exports = router;
