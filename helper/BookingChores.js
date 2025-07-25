//@clean up booking function
require("dotenv").config({ path: `.env.development` });
const moment = require("moment");
const cron = require("node-cron");
const NotificationManager = require("./NotificationManager");
const DbConn = require("./DbTransaction");
const convertTZ = require("./helper");
const Mailer = require("./Emailer");

const BookingChores = {};

// Mutex to prevent concurrent cron job executions
let isRunning = false;

BookingChores.userPenalty = async function (usersId, client) {
  let now = new Date();
  now = convertTZ(now, "Asia/Jakarta");
  now = moment(now).add(3, "days");
  try {
    console.log("usersId", usersId);
    if (usersId.length === 0) {
      return "Users clear";
    }
    const placeholder = usersId.map(() => "?").join(",");
    const penFormat = moment(now).format("YYYY-M-D HH:mm:ss");
    const setCounter = await client.query(
      `UPDATE mst_user
      SET penalty_ctr = CASE
        WHEN penalty_ctr >= 3 THEN 0
        ELSE penalty_ctr + 1
      END
      WHERE id_user IN (${placeholder})`,
      usersId
    );
    const setPenalty = await client.query(
      `UPDATE mst_user SET penalty_until = ?
      WHERE penalty_ctr >= 3 AND id_user IN (${placeholder})`,
      [penFormat, usersId]
    );
    return `Penalty: ${usersId.join(",")}`;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

BookingChores.Penalty = async () => {
  if (isRunning) {
    console.log("=== BookingChores.Penalty already running, skipping ===");
    return "Already running";
  }

  isRunning = true;
  console.log("=== Starting BookingChores.Penalty execution ===");
  const Client = new DbConn();
  const client = await Client.initConnection();
  const penalizedUsers = new Set();
  const mailer = new Mailer();
  console.log("Database connection and mailer initialized");

  try {
    await client.beginTransaction();

    // Fetch detailed booking information for email notifications (only for late check-ins)
    const emailNotificationQuery = `
      SELECT
        BOOK.id_book, BOOK.id_user, BOOK.id_ruangan, BOOK.book_date,
        BOOK.time_start, BOOK.time_end, BOOK.agenda, BOOK.remark, BOOK.prtcpt_ctr,
        USER.nama as username, USER.email,
        ROOM.nama as room_name
      FROM
        req_book BOOK
        LEFT JOIN mst_user USER ON BOOK.id_user = USER.id_user
        LEFT JOIN mst_room ROOM ON BOOK.id_ruangan = ROOM.id_ruangan
      WHERE
        TIMESTAMP(CONCAT(BOOK.book_date, ' ', BOOK.time_start)) + INTERVAL 15 MINUTE <= CONVERT_TZ(NOW(), '+00:00', '+07:00')
        AND BOOK.is_active = 'T'
        AND BOOK.approval = 'approved'
        AND BOOK.check_in = 'F';
    `;

    const emailNotificationResults = await client.query(emailNotificationQuery);

    console.log(emailNotificationResults, "emailNotificationResults");

    const bookingsToEmailAbout = emailNotificationResults[0];

    // Fetch penalizable bookings
    const penaltyQuery = `
      SELECT
        id_book, id_user, id_ruangan, book_date, time_start, time_end, is_active, approval, check_in, check_out
      FROM
        req_book BOOK
      WHERE
        (
          TIMESTAMP(CONCAT(BOOK.book_date, ' ', BOOK.time_start)) + INTERVAL 15 MINUTE <= CONVERT_TZ(NOW(), '+00:00', '+07:00')
          AND is_active = 'T'
          AND approval = 'approved'
          AND check_in = 'F'
        )
        OR
        (
          TIMESTAMP(CONCAT(BOOK.book_date, ' ', BOOK.time_end)) + INTERVAL 15 MINUTE < CONVERT_TZ(NOW(), '+00:00', '+07:00')
          AND is_active = 'T'
          AND approval = 'approved'
          AND check_out = 'F'
        );
    `;
    const penaltyResults = await client.query(penaltyQuery);
    console.log(penaltyResults, "penaltyResults");
    const penaltyUserRecords = penaltyResults[0];

    // Send email notifications for auto-cancelled bookings (before updating the database)
    if (bookingsToEmailAbout.length > 0) {
      console.log(
        `Sending auto-cancellation emails for ${bookingsToEmailAbout.length} bookings`
      );

      for (const booking of bookingsToEmailAbout) {
        console.log(
          `Processing booking for email: ${booking.agenda} - ${booking.email}`
        );
        if (booking.email) {
          try {
            const emailData = {
              username: booking.username,
              email: booking.email,
              agenda: booking.agenda,
              remark: booking.remark,
              ruangan: booking.room_name,
              book_date: booking.book_date,
              time_start: booking.time_start,
              time_end: booking.time_end,
              capacity: booking.prtcpt_ctr,
              approval: "cancelled",
              reject_note:
                "Your booking was automatically cancelled because you did not check in within 15 minutes of the meeting start time. According to our booking policy, all meeting rooms must be checked in on time to ensure availability for all users.",
            };

            console.log("About to send email with data:", emailData);
            await mailer.approvalNotif(emailData);
            console.log(
              `Auto-cancellation email sent to: ${booking.email} for booking: ${booking.agenda}`
            );
          } catch (emailError) {
            console.error(
              `Failed to send auto-cancellation email to ${booking.email}:`,
              emailError
            );
            // Continue with the process even if email fails
          }
        }
      }
    }

    // Update status of not checked-in bookings
    const updateStatusQuery = `
      WITH selected_books AS (
        SELECT id_book
        FROM req_book BOOK
        WHERE
          TIMESTAMP(CONCAT(BOOK.book_date, ' ', BOOK.time_start)) + INTERVAL 15 MINUTE <= CONVERT_TZ(NOW(), '+00:00', '+07:00')
          AND check_in = 'F'
          AND is_active = 'T'
          AND approval = 'approved'
      )
      UPDATE req_book
      SET approval = 'finished', is_active = 'F'
      WHERE id_book IN (SELECT id_book FROM selected_books);
    `;
    const updateStatusResults = await client.query(updateStatusQuery);
    console.log(
      `Not checked-in bookings updated to finished: ${updateStatusResults[0].affectedRows}`
    );

    if (penaltyUserRecords.length === 0) {
      return "No user penalty";
    }

    // Collect unique penalized user IDs
    penaltyUserRecords.forEach((record) => penalizedUsers.add(record.id_user));
    const uniqueUserIds = Array.from(penalizedUsers);

    // Fetch users eligible for penalty
    const userPlaceholders = uniqueUserIds.map(() => "?").join(",");
    const usersQuery = `
      SELECT id_user, penalty_until
      FROM mst_user
      WHERE id_user IN (${userPlaceholders})
    `;
    const usersResult = await client.query(usersQuery, uniqueUserIds);
    const usersToPenalize = usersResult[0].map((user) => user.id_user);

    // Apply penalties
    await BookingChores.userPenalty(usersToPenalize, client);

    await client.commit();
    console.log(
      "=== BookingChores.Penalty execution completed successfully ==="
    );
    return "Success: Penalty applied and auto-cancellation emails sent";
  } catch (error) {
    await client.rollback();
    console.error("=== Error in BookingChores.Penalty ===", error);
    throw error; // Ensure the error is propagated
  } finally {
    client.release();
    console.log("Database connection released");
    isRunning = false;
  }
};

BookingChores.CleanUp = async () => {
  const Client = new DbConn();
  const client = await Client.initConnection();
  const idBook = new Set(); // Using Set to automatically handle unique user ids
  try {
    await client.beginTransaction();
    const expired = await client.query(`
      SELECT
        id_book, id_user, id_ruangan, book_date, time_start, time_end, is_active
      FROM
        req_book BOOK
      WHERE
        TIMESTAMP(CONCAT( BOOK.book_date, ' ', BOOK.time_end )) + INTERVAL 15 MINUTE < CONVERT_TZ(NOW(), '+00:00', '+07:00')
        AND
        IS_ACTIVE = 'T'
      `);
    const expiredBook = expired[0];

    if (expiredBook.length === 0) {
      return "No expired booking, everything is clear";
    }

    expiredBook.forEach((item) => {
      idBook.add(item.id_book);
    });

    let bookId = [];

    idBook.forEach((item) => {
      bookId.push(item);
    });

    const bIdHolder = bookId.map(() => "?").join(",");
    await client.query(
      `UPDATE req_book SET is_active = 'F', approval = 'finished'
      WHERE TIMESTAMP(CONCAT( book_date, ' ', time_end )) + INTERVAL 15 MINUTE < CONVERT_TZ(NOW(), '+00:00', '+07:00')
      AND
      id_book IN (${bIdHolder})`,
      bookId
    );
    await client.commit();
    return "success clean booking";
    // const updateReqBook = Promise.all(promise);
  } catch (error) {
    await client.rollback();
    console.error(error);
  } finally {
    client.release();
  }
};

cron.schedule('* * * * *', async () => {
  const timestamp = new Date().toISOString();
  console.log(`\n=== CRON JOB EXECUTION STARTED at ${timestamp} ===`);
  try {
    const penaltyRes = await BookingChores.Penalty();
    // const cleanUp = await BookingChores.CleanUp();
    await NotificationManager.CleanUpCron();
    console.log("Penalty result:", penaltyRes);
  } catch (error) {
    console.error("CRON JOB ERROR:", error);
  }
  console.log(
    `=== CRON JOB EXECUTION COMPLETED at ${new Date().toISOString()} ===\n`
  );
});

console.log("BookingChores cron job initialized - running every minute");

// setInterval(() => {
//   console.log("SEND EMAIL");
// }, 5 * 60 * 1000);
