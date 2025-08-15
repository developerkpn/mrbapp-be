const DbConn = require("../helper/DbTransaction");
const uuid = require("uuidv4");

const BookReqModel = {
  createBooking: async (data, id_book, id_notif) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

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
        FOR UPDATE`,
        [data.id_ruangan, data.book_date, data.time_end, data.time_start]
      );

      // If room is already booked, return conflict
      if (isBooked[0].length > 0) {
        await client.rollback();
        return {
          success: false,
          conflict: true,
          booked: isBooked[0],
        };
      }

      // Room is available - create booking immediately as approved
      const payload = {
        id_ruangan: data.id_ruangan,
        id_user: data.id_user,
        created_at: data.created_at,
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

      const n = await client.query("SELECT nama FROM mst_user WHERE id_user = ?", [payload.id_user]);
      Object.defineProperty(payload, "nama", { value: n[0][0].nama });

      const q = await client.query("SELECT id_ticket FROM req_book where id_book = ?", [id_book]);
      const id_ticket = q[0][0].id_ticket;

      // Commit the transaction first to ensure booking is saved
      await client.commit();

      return {
        success: true,
        payload: payload,
        id_ticket: id_ticket,
      };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getUserEmail: async (id_user) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      const userInfo = await client.query("SELECT email, username FROM mst_user WHERE id_user = ?", [id_user]);
      return userInfo[0][0] || null;
    } finally {
      client.release();
    }
  },

  getBookById: async (id_book) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      const query =
        "SELECT req_book.*, mst_user.username, mst_user.email, mst_room.nama as nama_ruangan, mst_room.kapasitas, mst_room.lokasi, mst_room.image, mst_room.is_virtual, mst_room.zoom_link, mst_room.zoom_meeting_id, mst_room.zoom_passcode FROM req_book LEFT JOIN mst_user ON req_book.id_user = mst_user.id_user LEFT JOIN mst_room ON req_book.id_ruangan = mst_room.id_ruangan WHERE id_book = ?";
      const data = await client.query(query, id_book);
      await client.commit();
      return data[0][0] || null;
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  updateBooking: async (data, id_book) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
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
        [data.id_ruangan, data.book_date, id_book, data.time_end, data.time_start]
      );

      // If new time slot is already booked, return conflict
      if (isBooked[0].length > 0) {
        await client.rollback();
        return {
          success: false,
          conflict: true,
          booked: isBooked[0],
        };
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
        updated_at: data.updated_at,
        updated_by: data.id_user,
      };

      await client.beginTransaction();

      // Delete existing notification
      let id_notif = "";
      const notif = await client.query(`SELECT id_notif FROM push_sched WHERE id_req = ? AND type = 'push'`, [id_book]);
      if (notif[0][0]) {
        id_notif = notif[0][0].id_notif;
        await client.query(`DELETE FROM push_sched WHERE id_req = ?`, [id_book]);
        global.scheduledTasks.delete(id_notif);
      }

      const [query, value] = Client.updateQuery(payload, { id_book: id_book }, "req_book");
      await client.query(query, value);

      const q = await client.query("SELECT id_ticket from req_book where id_book = ?", [id_book]);
      const id_ticket = q[0][0].id_ticket;

      await client.commit();

      return {
        success: true,
        id_ticket: id_ticket,
      };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  cancelBooking: async (id_book) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();

      const [query, value] = Client.updateQuery(
        { is_active: "F", approval: "canceled" },
        { id_book: id_book },
        "req_book"
      );
      await client.query(query, value);
      await client.commit();

      return { success: true };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getAllBookings: async (book_date, approval, room) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();

      let approvalFilter = approval === "calendar" ? ["approved", "finished", "pending"] : [approval];
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
      return showall[0];
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getBookingsByUser: async (userid, book_date, limit, status, active) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      const showData = await client.query(
        `SELECT
        id_book,
        id_ticket,
        id_user,
        MR.nama as nama_ruangan,
        MR.id_ruangan as id_room,
        MR.is_virtual,
        MR.zoom_link,
        MR.zoom_meeting_id,
        MR.zoom_passcode,
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
      return data;
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getBookingsByRoom: async (roomId) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      const get = await client.query("SELECT * FROM req_book where id_ruangan = ? and is_active = 'F'", [roomId]);
      return get[0];
    } finally {
      client.release();
    }
  },

  updateApproval: async (data, id_book) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      const payload = {
        approval: data.approval,
        reject_note: data.reject_note,
      };

      await client.beginTransaction();
      const [query, value] = Client.updateQuery(payload, { id_book: id_book }, "req_book");
      const updateData = await client.query(query, value);
      await client.commit();

      return { success: true };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  checkIn: async (id_user, room_id) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();

      // Find active booking for this user in this room today within check-in window
      const bookingQuery = await client.query(
        `SELECT * FROM req_book WHERE
          id_user = ?
          AND id_ruangan = ?
          AND is_active = 'T'
          AND check_in = 'F'
          AND approval = 'approved'
          AND book_date = DATE_FORMAT(CONVERT_TZ(NOW(), '+00:00', '+07:00'), '%Y-%m-%d')
          AND CONVERT_TZ(CURTIME(), '+00:00', '+07:00') BETWEEN (time_start - INTERVAL 15 MINUTE) AND (time_start + INTERVAL 15 MINUTE)`,
        [id_user, room_id]
      );

      if (bookingQuery[0].length === 0) {
        await client.rollback();
        return {
          success: false,
          message:
            "No valid booking found for check-in. Make sure you have an active booking for this room today within the check-in window (15 minutes before start time).",
        };
      }

      const booking = bookingQuery[0][0];
      const id_book = booking.id_book;

      // Update booking to checked in
      const payload = { check_in: "T" };
      const [query, value] = Client.updateQuery(payload, { id_book: id_book }, "req_book");

      const updateData = await client.query(query, value);
      await client.commit();

      if (updateData[0].changedRows === 1) {
        return {
          success: true,
          booking: booking,
        };
      } else {
        return {
          success: false,
          message: "Failed to update check-in status",
        };
      }
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  checkOut: async (id_user, room_id) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();

      // Find active booking for this user in this room today that's checked in but not checked out
      const bookingQuery = await client.query(
        `SELECT * FROM req_book WHERE
          id_user = ?
          AND id_ruangan = ?
          AND is_active = 'T'
          AND check_in = 'T'
          AND check_out = 'F'
          AND approval = 'approved'
        `,
        [id_user, room_id]
      );

      if (bookingQuery[0].length === 0) {
        await client.rollback();
        return {
          success: false,
          message:
            "No valid booking found for check-out. Make sure you have checked in and the meeting is still active",
        };
      }

      const booking = bookingQuery[0][0];
      const id_book = booking.id_book;

      // Update booking to checked out and finished
      const payload = {
        check_out: "T",
        is_active: "F",
        approval: "finished",
      };

      const [query, value] = Client.updateQuery(payload, { id_book: id_book }, "req_book");

      const updateData = await client.query(query, value);
      await client.commit();

      if (updateData[0].changedRows === 1) {
        return {
          success: true,
          booking: booking,
        };
      } else {
        return {
          success: false,
          message: "Failed to update check-out status",
        };
      }
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getCheckInBookings: async (id_user) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      const getBook = await client.query(
        `
        SELECT
          req_book.*,
          mst_room.is_virtual,
          mst_room.zoom_link,
          mst_room.zoom_meeting_id,
          mst_room.zoom_passcode
        FROM req_book
        LEFT JOIN mst_room ON req_book.id_ruangan = mst_room.id_ruangan
        WHERE (
          req_book.id_user = ?
          AND
          req_book.is_active = 'T'
          AND
          req_book.check_in = 'F'
          AND
          req_book.approval = 'approved'
          AND
          req_book.book_date = DATE_FORMAT(CONVERT_TZ(NOW(), '+00:00', '+07:00'), '%Y-%m-%d')
          AND
          CONVERT_TZ(CURTIME(), '+00:00', '+07:00') BETWEEN (req_book.time_start - INTERVAL 15 MINUTE) AND (req_book.time_start + INTERVAL 15 MINUTE)
        )
        `,
        [id_user]
      );
      await client.commit();
      return getBook[0];
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getCheckOutBookings: async (id_user) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      const getBook = await client.query(
        `
        SELECT
          req_book.*,
          mst_room.is_virtual,
          mst_room.zoom_link,
          mst_room.zoom_meeting_id,
          mst_room.zoom_passcode
        FROM req_book
        LEFT JOIN mst_room ON req_book.id_ruangan = mst_room.id_ruangan
        WHERE (
          req_book.id_user = ?
          AND
          req_book.is_active = 'T'
          AND
          req_book.check_in = 'T'
          AND
          req_book.check_out = 'F'
          AND
          req_book.approval = 'approved'
          AND
          req_book.book_date = DATE_FORMAT(CONVERT_TZ(NOW(), '+00:00', '+07:00'), '%Y-%m-%d')
          AND
          CONVERT_TZ(CURTIME(), '+00:00', '+07:00') > req_book.time_start
          AND
          CONVERT_TZ(CURTIME(), '+00:00', '+07:00') < req_book.time_end + INTERVAL 15 MINUTE
        );
        `,
        [id_user]
      );
      await client.commit();
      return getBook[0];
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  cancelBookingWithReason: async (id_book, cancel_reason) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();

      // Get booking details first
      const bookingQuery = await client.query(
        "SELECT req_book.*, mst_user.username, mst_user.email FROM req_book LEFT JOIN mst_user ON req_book.id_user = mst_user.id_user WHERE id_book = ?",
        [id_book]
      );

      if (bookingQuery[0].length === 0) {
        await client.rollback();
        return {
          success: false,
          message: "Booking not found",
        };
      }

      const booking = bookingQuery[0][0];

      // Check if booking can be cancelled (only active bookings)
      if (booking.is_active !== "T") {
        await client.rollback();
        return {
          success: false,
          message: "Cannot cancel inactive booking",
        };
      }

      // Update booking to cancelled status
      const payload = {
        is_active: "F",
        approval: "cancelled",
        reject_note: cancel_reason || "Cancelled by admin",
      };

      const [query, value] = Client.updateQuery(payload, { id_book: id_book }, "req_book");

      await client.query(query, value);
      await client.commit();

      return {
        success: true,
        booking: booking,
      };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },
};

module.exports = BookReqModel;
