const BookReqModel = require("../models/BookReqModel");
const Emailer = require("../helper/Emailer");
const Notif = require("../helper/NotificationManager");
const cron = require("node-cron");
const moment = require("moment");
const uuid = require("uuidv4");
const convertTZ = require("../helper/helper");

// CASE
//           WHEN CONVERT_TZ(NOW(), '+00:00', '+07:00') > upcoming_time AND CONVERT_TZ(NOW(), '+00:00', '+07:00') < start_time AND BK.is_active = 'T' AND BK.approval = 'approved' THEN 'Oncoming'
//           WHEN CONVERT_TZ(NOW(), '+00:00', '+07:00') > start_time AND CONVERT_TZ(NOW(), '+00:00', '+07:00') < end_time AND BK.is_active = 'T' AND BK.approval = 'approved' THEN 'Ongoing'
//           WHEN CONVERT_TZ(NOW(), '+00:00', '+07:00') < start_time AND BK.is_active = 'T' THEN 'Pending'
//           WHEN CONVERT_TZ(NOW(), '+00:00', '+07:00') > end_time OR BK.is_active = 'F' OR BK.approval = 'rejected' THEN 'Inactive'
//           ELSE ''
//         END AS status

const BookReqController = {
  createBook: async (req, res) => {
    const data = req.body.data;

    // Validate required fields
    if (!data.id_ruangan || !data.category || !data.participant) {
      res.status(400).send({
        message: "Missing required fields: room ID, category, and participant count are required",
      });
      return;
    }

    let today = new Date();
    today = convertTZ(today, "Asia/Jakarta");

    const id_book = uuid.uuid();
    const id_notif = uuid.uuid();

    try {
      const bookingData = {
        ...data,
        created_at: today,
      };

      const result = await BookReqModel.createBooking(bookingData, id_book, id_notif);

      if (!result.success && result.conflict) {
        // Get user info for rejection email
        const userInfo = await BookReqModel.getUserEmail(data.id_user);

        if (!userInfo) {
          res.status(404).send({
            message: "User not found",
          });
          return;
        }

        const rejectionData = {
          email: userInfo.email,
          username: userInfo.username,
          approval: "rejected",
          reject_note: `The room ${data.id_ruangan} is already booked for the requested time slot. Please choose a different time or room.`,
          agenda: data.agenda,
          remark: data.remark,
          ruangan: data.id_ruangan, // Map id_ruangan to ruangan for email template
          book_date: data.book_date,
          time_start: data.time_start,
          time_end: data.time_end,
          capacity: data.participant, // Map participant to capacity for email template
        };

        // Send rejection email to user
        const Email = new Emailer();
        await Email.approvalNotif(rejectionData);

        res.status(400).send({
          message: `${data.id_ruangan} is already booked for this time slot`,
          booked: result.booked,
        });
        return;
      }

      // Set up notifications since booking is immediately approved
      const bookDate = moment(new Date(`${data.book_date} ${data.time_start}`)).subtract(15, "m");
      await Notif.CreateNewCron(
        bookDate,
        "Meeting Check In Reminder",
        "Please check in for agenda: " + data.agenda,
        data.id_user,
        id_book,
        id_notif
      );
      await Notif.CreateNewCronMail(bookDate, result.payload);

      // Send confirmation email to user (not admin notification)
      const userEmail = await BookReqModel.getUserEmail(result.payload.id_user);

      if (!userEmail) {
        res.status(404).send({
          message: "User not found",
        });
        return;
      }
      const userData = {
        email: userEmail.email,
        username: userEmail.username,
        approval: "approved",
        agenda: result.payload.agenda,
        remark: result.payload.remark,
        ruangan: result.payload.id_ruangan, // Map id_ruangan to ruangan for email template
        book_date: result.payload.book_date,
        time_start: result.payload.time_start,
        time_end: result.payload.time_end,
        capacity: result.payload.prtcpt_ctr, // Map prtcpt_ctr to capacity for email template
      };

      const Email = new Emailer();
      await Email.approvalNotif(userData); // Send approved notification to user

      res.status(200).send({
        message: "Room booked successfully! No approval needed.",
        id_ticket: result.id_ticket,
        status: "approved",
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: error.message });
    }
  },

  getBookById: async (req, res) => {
    try {
      const value = req.params.id_book;
      const data = await BookReqModel.getBookById(value);

      if (!data) {
        res.status(404).send({
          message: "Booking not found",
        });
        return;
      }
      res.status(200).send(data);
    } catch (error) {
      res.status(500).send({
        message: error.message,
      });
    }
  },

  editBook: async (req, res) => {
    let today = new Date();
    today = convertTZ(today, "Asia/Jakarta");
    try {
      const data = req.body.data;
      const id_book = req.params.id_book;
      if (!id_book) {
        throw Error("Request Error");
      }

      const updateData = {
        ...data,
        updated_at: today,
      };

      const result = await BookReqModel.updateBooking(updateData, id_book);

      if (!result.success && result.conflict) {
        // Get user info for rejection email
        const userInfo = await BookReqModel.getUserEmail(data.id_user);

        if (!userInfo) {
          res.status(404).send({
            message: "User not found",
          });
          return;
        }

        const rejectionData = {
          email: userInfo.email,
          username: userInfo.username,
          approval: "rejected",
          reject_note: `Cannot update booking: The room ${data.id_ruangan} is already booked for the new requested time slot. Please choose a different time or room.`,
          agenda: data.agenda,
          remark: data.remark,
          ruangan: data.id_ruangan, // Map id_ruangan to ruangan for email template
          book_date: data.book_date,
          time_start: data.time_start,
          time_end: data.time_end,
          capacity: data.participant, // Map participant to capacity for email template
        };

        // Send rejection email to user
        const Email = new Emailer();
        await Email.approvalNotif(rejectionData);

        res.status(400).send({
          message: `${data.id_ruangan} is already booked for this time slot`,
          booked: result.booked,
        });
        return;
      }

      const userInfo = await BookReqModel.getUserEmail(data.id_user);

      if (!userInfo) {
        res.status(404).send({
          message: "User not found",
        });
        return;
      }

      const userData = {
        email: userInfo.email,
        username: userInfo.username,
        approval: "approved",
        agenda: data.agenda,
        remark: data.remark,
        ruangan: data.id_ruangan, // Map id_ruangan to ruangan for email template
        book_date: data.book_date,
        time_start: data.time_start,
        time_end: data.time_end,
        capacity: data.participant, // Map participant to capacity for email template
      };

      const Email = new Emailer();
      await Email.approvalNotif(userData); // Send approved notification to user

      res.status(200).send({
        message: "Booking updated successfully! No approval needed.",
        id_ticket: result.id_ticket,
        status: "approved",
      });
    } catch (error) {
      res.status(500).send({
        message: error.message,
      });
    }
  },

  cancelBook: async (req, res) => {
    try {
      const id_book = req.params.id_book;
      await BookReqModel.cancelBooking(id_book);
      res.status(200).send({
        message: `${id_book} is canceled`,
      });
    } catch (error) {
      res.status(500).send({
        message: error.message,
      });
    }
  },

  showAllBook: async (req, res) => {
    try {
      const book_date = req.query.book_date || null;
      const approval = req.query.approval || null;
      const room = req.query.room || null;

      const data = await BookReqModel.getAllBookings(book_date, approval, room);
      res.status(200).send({ data });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  showBookbyUser: async (req, res) => {
    try {
      const userid = req.query.id_user;
      const book_date = req.query.book_date || null;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const status = req.query.status || null;
      const active = req.query.active || null;
      if (userid === undefined) {
        throw Error("Request Error");
      }

      const data = await BookReqModel.getBookingsByUser(userid, book_date, limit, status, active);
      res.status(200).send({ data });
    } catch (error) {
      console.error(error);
      if (error.message === "Request Error") {
        res.status(400).send({ message: error.message });
      } else {
        res.status(500).send({ message: error.message });
      }
    }
  },

  showBookbyRoom: async (req, res) => {
    const roomId = req.query.roomid;
    try {
      if (roomId === undefined) {
        throw Error("Request Error");
      }
      const books = await BookReqModel.getBookingsByRoom(roomId);
      res.status(200).send({ data: books });
    } catch (error) {
      console.log(error);
      res.status(500).send(error);
    }
  },

  approval: async (req, res) => {
    try {
      const data = req.body.data;
      const id_book = req.params.id_book;
      const id_notif = uuid.uuid();
      const bookDate = moment(new Date(`${data.book_date} ${data.time_start}`)).subtract(15, "m");
      if (!id_book) {
        throw Error("Request Error");
      }
      const payload = {
        approval: data.approval,
        reject_note: data.reject_note,
      };
      console.log(payload);

      await BookReqModel.updateApproval(payload, id_book);

      if (data.approval === "approved") {
        await Notif.CreateNewCron(
          bookDate,
          "Meeting Check In Reminder",
          "Please check in for agenda: " + data.agenda,
          data.id_user,
          id_book,
          id_notif
        );
        await Notif.CreateNewCronMail(bookDate, data);
      }
      const Email = new Emailer();
      await Email.approvalNotif(data);
      res.status(200).send({
        message: `Book ${data.approval}`,
        id_book: id_book,
        reject_note: data.reject_note,
      });
    } catch (error) {
      res.status(500).send({
        message: error.message,
      });
    }
  },

  checkIn: async (req, res) => {
    try {
      const { id_user, room_id } = req.body.data;
      console.log({ id_user, room_id }, "check-in data");

      if (!id_user || !room_id) {
        res.status(400).send({
          message: "User ID and Room ID are required",
        });
        return;
      }

      const result = await BookReqModel.checkIn(id_user, room_id);

      if (!result.success) {
        res.status(404).send({
          message: result.message,
        });
        return;
      }

      res.status(200).send({
        message: "Check in successful",
        id_user: id_user,
        id_book: result.booking.id_book,
        room_id: room_id,
        agenda: result.booking.agenda,
        time_start: result.booking.time_start,
        time_end: result.booking.time_end,
      });
    } catch (error) {
      console.error("Check-in error:", error);
      res.status(500).send({
        message: error.message,
      });
    }
  },

  checkOut: async (req, res) => {
    try {
      const { id_user, room_id } = req.body.data;
      console.log({ id_user, room_id }, "check-out data");

      if (!id_user || !room_id) {
        res.status(400).send({
          message: "User ID and Room ID are required",
        });
        return;
      }

      const result = await BookReqModel.checkOut(id_user, room_id);

      if (!result.success) {
        res.status(404).send({
          message: result.message,
        });
        return;
      }

      res.status(200).send({
        message: "Check out successful",
        id_user: id_user,
        id_book: result.booking.id_book,
        room_id: room_id,
        agenda: result.booking.agenda,
        time_start: result.booking.time_start,
        time_end: result.booking.time_end,
      });
    } catch (error) {
      console.error("Check-out error:", error);
      res.status(500).send({
        message: error.message,
      });
    }
  },

  getCheckInBook: async (req, res) => {
    const id_user = req.params.id_user;
    try {
      const data = await BookReqModel.getCheckInBookings(id_user);
      res.status(200).send({ data });
    } catch (error) {
      res.status(500).send({
        message: error.message,
      });
    }
  },

  getCheckOutBook: async (req, res) => {
    const id_user = req.params.id_user;
    try {
      const data = await BookReqModel.getCheckOutBookings(id_user);
      res.status(200).send({ data });
    } catch (error) {
      res.status(500).send({
        message: error.message,
      });
    }
  },

  cancelBooking: async (req, res) => {
    try {
      const id_book = req.params.id_book;
      const { cancel_reason } = req.body;

      if (!id_book) {
        throw new Error("Book ID is required");
      }

      const result = await BookReqModel.cancelBookingWithReason(id_book, cancel_reason);

      if (!result.success) {
        res.status(result.message === "Booking not found" ? 404 : 400).send({
          message: result.message,
        });
        return;
      }

      // Send cancellation email to user
      const emailData = {
        email: result.booking.email,
        username: result.booking.username,
        approval: "cancelled",
        reject_note: cancel_reason || "Your booking has been cancelled by admin",
        agenda: result.booking.agenda,
        remark: result.booking.remark,
        ruangan: result.booking.id_ruangan,
        book_date: result.booking.book_date,
        time_start: result.booking.time_start,
        time_end: result.booking.time_end,
        capacity: result.booking.prtcpt_ctr,
      };

      console.log(emailData, "emailData");

      const Email = new Emailer();
      await Email.approvalNotif(emailData);

      res.status(200).send({
        message: "Booking cancelled successfully",
        id_book: id_book,
        cancel_reason: cancel_reason,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        message: error.message,
      });
    }
  },
};

module.exports = BookReqController;
