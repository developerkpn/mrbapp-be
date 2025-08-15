const DbConn = require("../helper/DbTransaction");

const TabModel = {
  getRoomInfo: async (ipAddress) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      const data = await client.query(
        `SELECT
            id_ruangan,
            nama AS nama_ruangan,
            ip_address,
            image_background
        FROM mst_room
        WHERE ip_address = ?`,
        [ipAddress]
      );
      await client.commit();
      return data[0];
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getOngoingMeeting: async (formattedDate, formattedTime, ipAddress) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      const data = await client.query(
        `SELECT
            a.id_ticket,
            a.id_ruangan,
            c.nama AS nama_ruangan,
            c.ip_address,
            a.id_user,
            b.nama AS nama_user,
            b.business_unit,
            d.division,
            a.book_date,
            a.category,
            a.time_start,
            DATE_FORMAT(time_start, '%H:%i') AS time_start_formatted,
            a.time_end,
            DATE_FORMAT(time_end, '%H:%i') AS time_end_formatted,
            a.agenda,
            a.prtcpt_ctr AS peserta,
            a.remark,
            a.check_in,
            a.check_out
        FROM req_book a
        LEFT JOIN mst_user b
        ON a.id_user = b.id_user
        LEFT JOIN mst_room c
        ON a.id_ruangan = c.id_ruangan
        LEFT JOIN mst_biz_unit d
        ON b.business_unit = d.id_unit
        WHERE a.book_date = ? AND
            a.approval = 'approved' AND
            a.is_active = 'T' AND
            c.ip_address = ? AND
            a.time_start <= ? AND
            a.check_out = 'F' AND
            a.time_end >= ?`,
        [formattedDate, ipAddress, formattedTime, formattedTime]
      );
      await client.commit();
      return data[0];
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getNextMeeting: async (formattedDate, formattedTime, ipAddress) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      const data = await client.query(
        `SELECT
            a.id_ticket,
            a.id_ruangan,
            c.nama AS nama_ruangan,
            c.ip_address,
            a.id_user,
            b.nama AS nama_user,
            b.business_unit,
            d.division,
            a.book_date,
            a.category,
            a.time_start,
            DATE_FORMAT(time_start, '%H:%i') AS time_start_formatted,
            a.time_end,
            DATE_FORMAT(time_end, '%H:%i') AS time_end_formatted,
            a.agenda,
            a.prtcpt_ctr AS peserta,
            a.remark,
            a.check_in,
            a.check_out
        FROM req_book a
        LEFT JOIN mst_user b
        ON a.id_user = b.id_user
        LEFT JOIN mst_room c
        ON a.id_ruangan = c.id_ruangan
        LEFT JOIN mst_biz_unit d
        ON b.business_unit = d.id_unit
        WHERE a.book_date = ? AND
            a.approval = 'approved' AND
            a.is_active = 'T' AND
            c.ip_address = ? AND
            a.time_start > ?
            ORDER BY time_start ASC`,
        [formattedDate, ipAddress, formattedTime]
      );
      await client.commit();
      return data[0];
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getPreviousMeeting: async (formattedDate, formattedTime, ipAddress) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      const data = await client.query(
        `SELECT
            a.id_ticket,
            a.id_ruangan,
            c.nama AS nama_ruangan,
            c.ip_address,
            a.id_user,
            b.nama AS nama_user,
            b.business_unit,
            d.division,
            a.book_date,
            a.category,
            a.time_start,
            DATE_FORMAT(time_start, '%H:%i') AS time_start_formatted,
            a.time_end,
            DATE_FORMAT(time_end, '%H:%i') AS time_end_formatted,
            a.agenda,
            a.prtcpt_ctr AS peserta,
            a.remark,
            a.check_in,
            a.check_out
        FROM req_book a
        LEFT JOIN mst_user b
        ON a.id_user = b.id_user
        LEFT JOIN mst_room c
        ON a.id_ruangan = c.id_ruangan
        LEFT JOIN mst_biz_unit d
        ON b.business_unit = d.id_unit
        WHERE a.book_date = ? AND
            a.approval = 'approved' AND
            c.ip_address = ? AND
            time_end < ?
          ORDER BY (time_end) ASC`,
        [formattedDate, ipAddress, formattedTime]
      );
      await client.commit();
      return data[0];
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },
};

module.exports = TabModel;
