const DbConn = require("../helper/DbTransaction");
const fs = require("fs");
const path = require("path");

const RoomModel = {
  getAllRooms: async (isVirtual) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      let query = "SELECT * from mst_room";
      let params = [];

      if (isVirtual !== undefined) {
        query += " WHERE is_virtual = ?";
        params.push(isVirtual === "true" ? "T" : "F");
      }

      const get = await client.query(query, params);
      return get[0];
    } finally {
      client.release();
    }
  },

  getAllRoomsWithFacilities: async (id_room, isVirtual) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      let query = `SELECT * from mst_room
        LEFT JOIN mst_category
          ON mst_room.category = mst_category.id_category
        WHERE (id_ruangan = ? OR ? IS NULL)`;
      let params = [id_room, id_room];

      if (isVirtual !== undefined) {
        query += " AND is_virtual = ?";
        params.push(isVirtual === "true" ? "T" : "F");
      }

      const getroom = await client.query(query, params);
      const rooms = getroom[0];
      let roomFac = [];
      let promise = [];

      rooms.forEach((item) => {
        promise.push(
          client.query(
            `SELECT MF.nama from fas_room FR LEFT JOIN mst_fas MF
        ON FR.id_fasilitas = MF.id_fasilitas
        WHERE id_ruangan = ?`,
            item.id_ruangan
          )
        );
      });

      const dataGet = await Promise.all(promise);
      rooms.forEach((item, index) => {
        const fac = dataGet[index][0].map((item) => item.nama);
        roomFac.push({
          ...item,
          fasilitas: fac,
        });
      });

      return roomFac;
    } finally {
      client.release();
    }
  },

  getAvailableRoomsWithParam: async (hours) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      const getroom = await client.query(
        `SELECT
            id,
            id_ruangan,
            kapasitas,
            nama,
            lokasi,
            image
          FROM
            mst_room
          WHERE
            id_ruangan NOT IN (
              SELECT
                id_ruangan
              FROM
                req_book
              WHERE
                (
                  CONVERT_TZ(CURTIME(), '+00:00', '+07:00') BETWEEN time_start
                  AND time_end
                  OR DATE_ADD(CONVERT_TZ(NOW(), '+00:00', '+07:00'), INTERVAL ? HOUR) BETWEEN time_start
                  AND time_end
                  AND book_date = DATE_FORMAT(CONVERT_TZ(NOW(), '+00:00', '+07:00'), '%Y-%m-%d')
                )
            )
        `,
        [hours]
      );
      const rooms = getroom[0];
      let roomFac = [];
      let promise = [];

      rooms.forEach((item) => {
        promise.push(
          client.query(`SELECT MF.nama from fas_room FR LEFT JOIN mst_fas MF
          ON fr.id_fasilitas = MF.id_fasilitas
          WHERE id_ruangan = '${item.id_ruangan}'`)
        );
      });

      const dataGet = await Promise.all(promise);
      rooms.forEach((item, index) => {
        const fac = dataGet[index][0].map((item) => item.nama);
        roomFac.push({
          ...item,
          fasilitas: fac,
        });
      });

      return roomFac;
    } finally {
      client.release();
    }
  },

  getAvailableRooms: async (payload) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();

      // Build dynamic WHERE clause for better control
      let virtualFilter = "";
      let params = [payload.prtcpt_ctr, payload.category];

      if (payload.is_virtual !== null) {
        virtualFilter = "AND mst_room.is_virtual = ?";
        params.push(payload.is_virtual);
      }

      const query = `SELECT mst_room.id_ruangan, mst_room.nama, mst_room.kapasitas, mst_room.is_virtual, mst_room.zoom_link, mst_room.zoom_meeting_id, mst_room.zoom_passcode FROM mst_room
          WHERE mst_room.kapasitas >= ?
          AND mst_room.category = ?
		      AND mst_room.is_active = 'T'
          ${virtualFilter}
          AND mst_room.id_ruangan NOT IN (
            SELECT distinct req_book.id_ruangan
            FROM
					  req_book
            WHERE
					  req_book.book_date = ?
					  AND IF (? = "", req_book.is_active = 'T', false)
					  AND (
              (req_book.time_start < ? AND req_book.time_end > ?)
					  )
          )
          ORDER BY mst_room.kapasitas`;

      // Add remaining parameters
      params.push(payload.book_date, payload.id_book, payload.time_end, payload.time_start);

      const getRoom = await client.query(query, params);
      await client.commit();

      return getRoom[0];
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getRoomDetails: async (id) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      const get = await client.query(
        `SELECT
          mst_fas.nama AS fasilitas,
          mst_room.*,
          mst_category.*,
          fas_room.*
        FROM mst_room
        LEFT JOIN mst_category
          ON mst_room.category = mst_category.id_category
        LEFT JOIN fas_room
          ON mst_room.id_ruangan = fas_room.id_ruangan
        LEFT JOIN mst_fas
          on fas_room.id_fasilitas = mst_fas.id_fasilitas
        WHERE mst_room.id_ruangan = ?`,
        [id]
      );
      return get[0][0];
    } finally {
      client.release();
    }
  },

  generateRoomId: async (data) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();

      // Generate automatic room ID
      const getLastRoom = await client.query(
        `SELECT id_ruangan FROM mst_room
         WHERE id_ruangan REGEXP '^ROOM[0-9]+LT[0-9]+$'
         ORDER BY CAST(SUBSTRING(id_ruangan, 5, LOCATE('LT', id_ruangan) - 5) AS UNSIGNED) DESC
         LIMIT 1`
      );

      let nextNumber = 1;
      if (getLastRoom[0].length > 0) {
        const lastId = getLastRoom[0][0].id_ruangan;
        const numberPart = lastId.match(/ROOM(\d+)LT/);
        if (numberPart) {
          nextNumber = parseInt(numberPart[1]) + 1;
        }
      }

      // Default floor to 47 if not provided, or extract from location
      let floor = "47";
      if (data.lokasi && data.lokasi.match(/\d+/)) {
        const floorMatch = data.lokasi.match(/\d+/);
        floor = floorMatch[0];
      }

      const generatedId = `ROOM${nextNumber}LT${floor}`;
      await client.commit();
      return generatedId;
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  createRoom: async (data, imagePath, generatedId) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();

      await client.query(
        `INSERT INTO mst_room (id_ruangan, nama, kapasitas, lokasi, category, image, is_active, is_virtual, zoom_link, zoom_meeting_id, zoom_passcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generatedId,
          data.nama,
          data.kapasitas,
          data.lokasi,
          data.category,
          imagePath,
          data.is_active,
          data.is_virtual,
          data.zoom_link,
          data.zoom_meeting_id,
          data.zoom_passcode,
        ]
      );

      await client.commit();
      return {
        id_ruangan: generatedId,
        image_path: imagePath,
      };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  updateRoom: async (id, data, imagePath) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();

      await client.query(
        `UPDATE mst_room SET nama = ?, kapasitas = ?, lokasi = ?, category = ?, image = ?, is_active = ?, is_virtual = ?, zoom_link = ?, zoom_meeting_id = ?, zoom_passcode = ? WHERE id_ruangan = ?`,
        [
          data.nama,
          data.kapasitas,
          data.lokasi,
          data.category,
          imagePath,
          data.is_active,
          data.is_virtual,
          data.zoom_link,
          data.zoom_meeting_id,
          data.zoom_passcode,
          id,
        ]
      );
      await client.commit();
      return { image_path: imagePath };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getCurrentRoomImage: async (id) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      const currentRoom = await client.query(`SELECT image FROM mst_room WHERE id_ruangan = ?`, [id]);
      return currentRoom[0][0]?.image;
    } finally {
      client.release();
    }
  },

  deleteRoom: async (id) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      await client.query(`DELETE FROM mst_room WHERE id_ruangan = ?`, [id]);
      await client.commit();
      return { success: true };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  checkRoomExists: async (id_ruangan) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      const roomCheck = await client.query(`SELECT id_ruangan FROM mst_room WHERE id_ruangan = ?`, [id_ruangan]);
      return roomCheck[0].length > 0;
    } finally {
      client.release();
    }
  },
};

module.exports = RoomModel;
