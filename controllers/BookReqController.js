const DbConn = require("../helper/DbTransaction");
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

const BookReqCol = [
  "id_ruangan",
  "id_user",
  "created_at",
  "book_date",
  "time_start",
  "time_end",
  "agenda",
  "prtcpt_ctr",
  "remark",
  "is_active",
  "id_book",
];

const BookReqController = {
  createBook: async (req, res) => {
    const data = req.body.data;
    const Client = new DbConn();
    const client = await Client.initConnection();
    let today = new Date();
    today = convertTZ(today, "Asia/Jakarta");

    const id_book = uuid.uuid();
    const id_notif = uuid.uuid();

    try {
      await client.beginTransaction();

      // ATOMIC AVAILABILITY CHECK - within the same transaction
      const isBooked = await client.query(
        `SELECT
          id_ruangan,
          DATE_FORMAT(book_date, '%Y-%m-%d') as book_date,
          DATE_FORMAT(time_start, '%H:%i') as time_start,
          DATE_FORMAT(time_end, '%H:%i') as time_end
        FROM
          req_book
        WHERE
          id_ruangan = ?
          AND book_date = ?
          AND is_active = 'T'
          AND (
            (req_book.time_start < ? AND req_book.time_end > ?)
          )
        FOR UPDATE`, // Add FOR UPDATE to lock the rows during transaction
        [data.id_ruangan, data.book_date, data.time_end, data.time_start]
      );

      // If room is already booked, send rejection email and fail
      if (isBooked[0].length > 0) {
        await client.rollback();

        // Get user info for rejection email
        const userInfo = await client.query(
          "SELECT email, username FROM mst_user WHERE id_user = ?",
          [data.id_user]
        );

        const rejectionData = {
          email: userInfo[0][0].email,
          username: userInfo[0][0].username,
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

        return res.status(400).send({
          message: `${data.id_ruangan} is already booked for this time slot`,
          booked: isBooked[0],
        });
      }

      // Room is available - create booking immediately as approved
      const payload = {
        id_ruangan: data.id_ruangan,
        id_user: data.id_user,
        created_at: today,
        book_date: data.book_date,
        time_start: data.time_start,
        time_end: data.time_end,
        agenda: data.agenda,
        prtcpt_ctr: data.participant,
        remark: data.remark,
        category: data.category,
        id_book: id_book,
        is_active: "T",
        id_notif: id_notif,
        approval: "approved", // IMMEDIATELY APPROVED - no pending status
        check_in: "F",
        check_out: "F",
      };

      const [query, value] = await Client.insertQuery(payload, "req_book");
      await client.query(query, value);

      const n = await client.query(
        "SELECT nama FROM mst_user WHERE id_user = ?",
        [payload.id_user]
      );
      Object.defineProperty(payload, "nama", { value: n[0][0].nama });

      const q = await client.query(
        "SELECT id_ticket FROM req_book where id_book = ?",
        [id_book]
      );
      const id_ticket = q[0][0].id_ticket;

      // Commit the transaction first to ensure booking is saved
      await client.commit();

      // Set up notifications since booking is immediately approved
      const bookDate = moment(
        new Date(`${data.book_date} ${data.time_start}`)
      ).subtract(15, "m");
      await Notif.CreateNewCron(
        bookDate,
        "Meeting Check In Reminder",
        "Please check in for agenda: " + data.agenda,
        data.id_user,
        id_book,
        id_notif
      );
      await Notif.CreateNewCronMail(bookDate, payload);

      // Send confirmation email to user (not admin notification)
      const userEmail = await client.query(
        "SELECT email, username FROM mst_user WHERE id_user = ?",
        [payload.id_user]
      );
      const userData = {
        email: userEmail[0][0].email,
        username: userEmail[0][0].username,
        approval: "approved",
        agenda: payload.agenda,
        remark: payload.remark,
        ruangan: payload.id_ruangan, // Map id_ruangan to ruangan for email template
        book_date: payload.book_date,
        time_start: payload.time_start,
        time_end: payload.time_end,
        capacity: payload.prtcpt_ctr, // Map prtcpt_ctr to capacity for email template
      };

      const Email = new Emailer();
      await Email.approvalNotif(userData); // Send approved notification to user

      res.status(200).send({
        message: "Room booked successfully! No approval needed.",
        id_ticket: id_ticket,
        status: "approved",
      });
    } catch (error) {
      console.log(error);
      await client.rollback();
      res.status(500).send({ message: error.message });
    } finally {
      client.release();
    }
  },

  getBookById: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    try {
      await client.beginTransaction();
      const value = req.params.id_book;
      const query =
        "SELECT req_book.*, mst_user.username, mst_user.email FROM req_book LEFT JOIN mst_user ON req_book.id_user = mst_user.id_user WHERE id_book = ?";
      const data = await client.query(query, value);
      await client.commit();
      res.status(200).send(data[0][0]);
      console.log(data);
    } catch (error) {
      await client.rollback();
      res.status(500).send({
        message: error.message,
      });
    } finally {
      client.release();
    }
  },

  editBook: async (req, res) => {
    let today = new Date();
    today = convertTZ(today, "Asia/Jakarta");
    const Client = new DbConn();
    const client = await Client.initConnection();
    try {
      const data = req.body.data;
      console.log(data);
      const id_book = req.params.id_book;
      if (!id_book) {
        throw Error("Request Error");
      }
      // Check availability for the new time slot (excluding current booking)
      const isBooked = await client.query(
        `SELECT
          id_ruangan,
          DATE_FORMAT(book_date, '%Y-%m-%d') as book_date,
          DATE_FORMAT(time_start, '%H:%i') as time_start,
          DATE_FORMAT(time_end, '%H:%i') as time_end
        FROM
          req_book
        WHERE
          id_ruangan = ?
          AND book_date = ?
          AND is_active = 'T'
          AND id_book != ?
          AND (
            (req_book.time_start < ? AND req_book.time_end > ?)
          )
        FOR UPDATE`,
        [
          data.id_ruangan,
          data.book_date,
          id_book,
          data.time_end,
          data.time_start,
        ]
      );

      // If new time slot is already booked, send rejection email and fail
      if (isBooked[0].length > 0) {
        await client.rollback();

        // Get user info for rejection email
        const userInfo = await client.query(
          "SELECT email, username FROM mst_user WHERE id_user = ?",
          [data.id_user]
        );

        const rejectionData = {
          email: userInfo[0][0].email,
          username: userInfo[0][0].username,
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

        return res.status(400).send({
          message: `${data.id_ruangan} is already booked for this time slot`,
          booked: isBooked[0],
        });
      }

      const payload = {
        id_ruangan: data.id_ruangan,
        book_date: data.book_date,
        time_start: data.time_start,
        time_end: data.time_end,
        agenda: data.agenda,
        prtcpt_ctr: data.participant,
        remark: data.remark,
        approval: "approved", // Keep as approved since no manual approval needed
        updated_at: today,
        updated_by: data.id_user,
      };
      await client.beginTransaction();
      console.log("BEFORE", cron.getTasks());
      let id_notif = "";
      const notif = await client.query(
        `SELECT id_notif FROM push_sched WHERE id_req = ? AND type = 'push'`,
        [id_book]
      );
      if (notif[0][0]) {
        id_notif = notif[0][0].id_notif;
        await client.query(`DELETE FROM push_sched WHERE id_req = ?`, [
          id_book,
        ]);
        global.scheduledTasks.delete(id_notif);
      }
      const [query, value] = Client.updateQuery(
        payload,
        { id_book: id_book },
        "req_book"
      );
      const updateData = await client.query(query, value);
      const q = await client.query(
        "SELECT id_ticket from req_book where id_book = ?",
        [id_book]
      );
      const id_ticket = q[0][0].id_ticket;
      await client.commit();

      const userInfo = await client.query(
        "SELECT nama, email, username FROM mst_user WHERE id_user = ?",
        [data.id_user]
      );
      const userData = {
        email: userInfo[0][0].email,
        username: userInfo[0][0].username,
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
        id_ticket: id_ticket,
        status: "approved",
      });
      console.log(query, value);
      console.log(updateData);
    } catch (error) {
      await client.rollback();
      res.status(500).send({
        message: error.message,
      });
    } finally {
      client.release();
    }
  },

  cancelBook: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    try {
      const id_book = req.params.id_book;
      await client.beginTransaction();

      const [query, value] = Client.updateQuery(
        { is_active: "F", approval: "canceled" },
        { id_book: id_book },
        "req_book"
      );
      const updateData = await client.query(query, value);
      await client.commit();
      res.status(200).send({
        message: `${id_book} is canceled`,
      });
    } catch (error) {
      await client.rollback();
      res.status(500).send({
        message: error.message,
      });
    } finally {
      client.release();
    }
  },

  showAllBook: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    try {
      await client.beginTransaction();
      const book_date = req.query.book_date || null;
      const approval = req.query.approval || null;
      const room = req.query.room || null;

      let approvalFilter =
        approval === "calendar"
          ? ["approved", "finished", "pending"]
          : [approval];
      let approvalPlaceholders = approvalFilter.map(() => "?").join(",");

      const showall = await client.query(
        `SELECT req_book.*, mst_user.username FROM req_book LEFT JOIN mst_user ON req_book.id_user = mst_user.id_user
        WHERE (req_book.book_date = ? OR ? IS NULL)
        AND (req_book.approval IN (${approvalPlaceholders}) OR ? IS NULL)
        AND (req_book.id_ruangan = ? OR ? IS NULL)
        ORDER BY req_book.id DESC`,
        [book_date, book_date, ...approvalFilter, approval, room, room]
      );
      await client.commit();
      res.status(200).send({ data: showall[0] });
    } catch (error) {
      await client.rollback();
      console.error(error);
      res.status(500).send(error);
    } finally {
      client.release();
    }
  },

  showBookbyUser: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    try {
      const userid = req.query.id_user;
      const book_date = req.query.book_date || null;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const status = req.query.status || null;
      const active = req.query.active || null;
      if (userid === undefined) {
        throw Error("Request Error");
      }
      await client.beginTransaction();
      const showData = await client.query(
        `SELECT
        id_book,
        id_ticket,
        id_user,
        MR.nama as nama_ruangan,
        MR.id_ruangan as id_room,
        agenda,
        BK.is_active,
        BK.approval,
        time_start,
        time_end,
        book_date,
        approval
      FROM
        (
        SELECT
          id_book,
          id_ticket,
          id_ruangan,
          agenda,
          id_user,
          is_active,
          approval,
          DATE_FORMAT(time_start, '%H:%i') as time_start,
          DATE_FORMAT(book_date, '%Y-%m-%d') as book_date,
          DATE_FORMAT(time_end, '%H:%i') as time_end,
          TIMESTAMP (
          CONCAT( book_date, ' ', time_start )) AS start_time,
          TIMESTAMP (
          CONCAT( book_date, ' ', time_end)) AS end_time,
          TIMESTAMP ( TIMESTAMP (
          CONCAT( book_date, ' ', time_start )) - INTERVAL 15 MINUTE ) AS upcoming_time
        FROM
        req_book
        ) BK
        LEFT JOIN mst_room MR ON BK.id_ruangan = MR.id_ruangan
        WHERE id_user = ?
          AND
            (book_date = ? OR ? IS NULL)
          AND
            (BK.is_active = ? OR ? IS NULL)
          AND
            (BK.approval = ? OR ? IS NULL)
        ORDER BY book_date DESC
        LIMIT ?`,
        [userid, book_date, book_date, active, active, status, status, limit]
      );
      const data = showData[0];
      await client.commit();
      res.status(200).send({ data: data });
    } catch (error) {
      await client.rollback();
      console.error(error);
      if (error.message === "Request Error") {
        res.status(400).send({ message: error.message });
      } else {
        res.status(500).send({ message: error.message });
      }
    } finally {
      client.release();
    }
  },

  showBookbyRoom: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    const roomId = req.query.roomid;
    try {
      if (roomId === undefined) {
        throw Error("Request Error");
      }
      const get = await client.query(
        "SELECT * FROM req_book where id_ruangan = ? and is_active = 'F'",
        [roomId]
      );
      const books = get[0];
      res.status(200).send({ data: books });
    } catch (error) {
      console.log(error);
      res.status(500).send(error);
    } finally {
      client.release();
    }
  },

  approval: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    try {
      const data = req.body.data;
      const id_book = req.params.id_book;
      const id_notif = uuid.uuid();
      const bookDate = moment(
        new Date(`${data.book_date} ${data.time_start}`)
      ).subtract(15, "m");
      if (!id_book) {
        throw Error("Request Error");
      }
      const payload = {
        approval: data.approval,
        reject_note: data.reject_note,
      };
      console.log(payload);
      await client.beginTransaction();
      const [query, value] = Client.updateQuery(
        payload,
        { id_book: id_book },
        "req_book"
      );
      const updateData = await client.query(query, value);
      await client.commit();

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
      await client.rollback();
      res.status(500).send({
        message: error.message,
      });
    } finally {
      client.release();
    }
  },

  checkIn: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    try {
      const data = req.body.data;
      const payload = {
        check_in: "T",
      };
      console.log(payload);
      await client.beginTransaction();
      const [query, value] = Client.updateQuery(
        payload,
        { id_user: data.id_user, id_book: data.id_book },
        "req_book"
      );
      const updateData = await client.query(query, value);
      await client.commit();
      console.log(query, value);
      console.log(updateData[0].changedRows);
      if (updateData[0].changedRows === 1) {
        res.status(200).send({
          message: "Check in success",
          id_user: data.id_user,
          id_book: data.id_book,
        });
      } else {
        res.status(400).send({
          message: "Bad Request: Payload error",
        });
      }
    } catch (error) {
      await client.rollback();
      res.status(500).send({
        message: error.message,
      });
    } finally {
      client.release();
    }
  },

  checkOut: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    try {
      const data = req.body.data;
      const payload = {
        check_out: "T",
        is_active: "F",
        approval: "finished",
      };
      console.log(payload);
      await client.beginTransaction();
      const [query, value] = Client.updateQuery(
        payload,
        { id_user: data.id_user, id_book: data.id_book },
        "req_book"
      );
      const updateData = await client.query(query, value);
      await client.commit();
      console.log(query, value);
      console.log(updateData[0].changedRows);
      if (updateData[0].changedRows === 1) {
        res.status(200).send({
          message: "Check out success",
          id_user: data.id_user,
          id_book: data.id_book,
        });
      } else {
        res.status(400).send({
          message: "Bad Request: Payload error",
        });
      }
    } catch (error) {
      await client.rollback();
      res.status(500).send({
        message: error.message,
      });
    } finally {
      client.release();
    }
  },

  getCheckInBook: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    const id_user = req.params.id_user;
    try {
      await client.beginTransaction();
      const getBook = await client.query(
        `
        SELECT * FROM req_book WHERE (
          id_user = ?
          AND
          is_active = 'T'
          AND
          check_in = 'F'
          AND
          approval = 'approved'
          AND
          book_date = DATE_FORMAT(CONVERT_TZ(NOW(), '+00:00', '+07:00'), '%Y-%m-%d')
          AND
          CONVERT_TZ(CURTIME(), '+00:00', '+07:00') BETWEEN (time_start - INTERVAL 15 MINUTE) AND (time_start + INTERVAL 15 MINUTE)
        )
        `,
        [id_user]
      );
      await client.commit();
      res.status(200).send({ data: getBook[0] });
    } catch (error) {
      await client.rollback();
      res.status(500).send({
        message: error.message,
      });
    } finally {
      client.release();
    }
  },

  getCheckOutBook: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    const id_user = req.params.id_user;
    try {
      await client.beginTransaction();
      const getBook = await client.query(
        `
        SELECT * FROM req_book WHERE (
          id_user = ?
          AND
          is_active = 'T'
          AND
          check_in = 'T'
          AND
          check_out = 'F'
          AND
          approval = 'approved'
          AND
          book_date = DATE_FORMAT(CONVERT_TZ(NOW(), '+00:00', '+07:00'), '%Y-%m-%d')
          AND
          CONVERT_TZ(CURTIME(), '+00:00', '+07:00') > time_start
          AND
          CONVERT_TZ(CURTIME(), '+00:00', '+07:00') < time_end + INTERVAL 15 MINUTE
        );
        `,
        [id_user]
      );
      await client.commit();
      res.status(200).send({ data: getBook[0] });
    } catch (error) {
      await client.rollback();
      res.status(500).send({
        message: error.message,
      });
    } finally {
      client.release();
    }
  },
};

module.exports = BookReqController;
