const DbConn = require("../helper/DbTransaction");
const db = require("../config/db");
const { formidable } = require("formidable");
const fs = require("fs");
const path = require("path");

const RoomController = {
  getAllRoom: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    try {
      const get = await client.query("SELECT * from mst_room");
      const rooms = get[0];
      res.status(200).send(rooms);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    } finally {
      client.release();
    }
  },

  getAllRoomWithFac: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    const id_room = req.query.id_room || null;
    try {
      const getroom = await client.query(
        `SELECT * from mst_room
        LEFT JOIN mst_category
          ON mst_room.category = mst_category.id_category
        WHERE (id_ruangan = ? OR ? IS NULL)`,
        [id_room, id_room]
      );
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
        roomFac.push({ ...item, fasilitas: fac });
      });
      res.status(200).send({ data: roomFac });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: error.message });
    } finally {
      client.release();
    }
  },

  getAvailableRoomWithParam: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    // await Client.init();
    try {
      const hours = req.query.hours;
      if (hours === undefined) {
        throw Error("parameter is empty");
      }
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
        roomFac.push({ ...item, fasilitas: fac });
      });
      res.status(200).send({ data: roomFac });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: error.message });
    } finally {
      client.release();
    }
  },

  getAvailableRoom: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    const data = req.body.data;
    // const dateBook = new Date

    const payload = {
      book_date: data.book_date,
      time_start: data.time_start,
      time_end: data.time_end,
      prtcpt_ctr: data.participant,
      category: data.category,
      id_book: data.id_book ? data.id_book : "",
    };

    console.log(payload);

    try {
      await client.beginTransaction();
      const getRoom = await client.query(
        `SELECT mst_room.id_ruangan, mst_room.nama, mst_room.kapasitas FROM mst_room
          WHERE mst_room.kapasitas >= ?
          AND mst_room.category = ?
		      AND mst_room.is_active = 'T'
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
          ORDER BY mst_room.kapasitas`,
        [
          payload.prtcpt_ctr,
          payload.category,
          payload.book_date,
          payload.id_book,
          payload.time_end,
          payload.time_start,
        ]
      );
      await client.commit();
      res.status(200).send({
        message: "Success get avail room",
        data: getRoom[0],
      });
    } catch (error) {
      await client.rollback();
      console.log(error);
      res.status(500).send({ message: error.message });
    } finally {
      client.release();
    }
  },

  getRoomDetails: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    const id = req.params.id_ruangan;
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
      const room = get[0][0];
      res.status(200).send(room);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    } finally {
      client.release();
    }
  },

  createRoom: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      // Create upload directory if it doesn't exist
      const uploadDir = path.join(__dirname, "../public/room_photo");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Parse the form data
      const form = formidable({
        uploadDir: uploadDir,
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB limit
        filter: ({ mimetype }) => {
          // Only allow image files
          return mimetype && mimetype.includes("image");
        },
      });

      const [fields, files] = await form.parse(req);

      // Extract field values (formidable returns arrays)
      const data = {
        nama: fields.nama?.[0],
        kapasitas: parseInt(fields.kapasitas?.[0]),
        lokasi: fields.lokasi?.[0],
        category: fields.category?.[0],
        is_active: fields.is_active?.[0] || "T",
      };

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

      // Default floor to 46 if not provided, or extract from location
      let floor = "46";
      if (data.lokasi && data.lokasi.match(/\d+/)) {
        const floorMatch = data.lokasi.match(/\d+/);
        floor = floorMatch[0];
      }

      const generatedId = `ROOM${nextNumber}LT${floor}`;

      // Handle image upload
      let imagePath = null;
      if (files.image && files.image[0]) {
        const imageFile = files.image[0];
        const fileExtension = path.extname(imageFile.originalFilename);
        const newFileName = `${generatedId}${fileExtension}`;
        const newFilePath = path.join(uploadDir, newFileName);

        // Move the uploaded file to the final location with room ID as filename
        fs.renameSync(imageFile.filepath, newFilePath);

        // Store full URL instead of relative path
        const baseUrl =
          process.env.BASE_URL || `https://localhost:${process.env.PORT}`;
        imagePath = `${baseUrl}/be-api/static/room_photo/${newFileName}`;
      }

      await client.query(
        `INSERT INTO mst_room (id_ruangan, nama, kapasitas, lokasi, category, image, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          generatedId,
          data.nama,
          data.kapasitas,
          data.lokasi,
          data.category,
          imagePath,
          data.is_active,
        ]
      );

      await client.commit();
      res.status(201).send({
        message: "Room created successfully",
        id_ruangan: generatedId,
        image_path: imagePath,
      });
    } catch (error) {
      await client.rollback();
      console.error("Error creating room:", error);
      res.status(500).send({ message: error.message });
    } finally {
      client.release();
    }
  },

  updateRoom: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    const id = req.params.id_ruangan;

    try {
      // Create upload directory if it doesn't exist
      const uploadDir = path.join(__dirname, "../public/room_photo");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Parse the form data
      const form = formidable({
        uploadDir: uploadDir,
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB limit
        filter: ({ mimetype }) => {
          // Only allow image files
          return mimetype && mimetype.includes("image");
        },
      });

      const [fields, files] = await form.parse(req);

      // Extract field values (formidable returns arrays)
      const data = {
        nama: fields.nama?.[0],
        kapasitas: parseInt(fields.kapasitas?.[0]),
        lokasi: fields.lokasi?.[0],
        category: fields.category?.[0],
        is_active: fields.is_active?.[0] || "T",
      };

      await client.beginTransaction();

      // Get current room data to check for existing image
      const currentRoom = await client.query(
        `SELECT image FROM mst_room WHERE id_ruangan = ?`,
        [id]
      );

      // Handle image upload
      let imagePath = currentRoom[0][0]?.image; // Keep existing image by default
      if (files.image && files.image[0]) {
        // Delete old image if it exists and is a local file
        if (imagePath && imagePath.includes("/be-api/static/room_photo/")) {
          const fileName = imagePath.split("/").pop();
          const oldImagePath = path.join(uploadDir, fileName);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }

        const imageFile = files.image[0];
        const fileExtension = path.extname(imageFile.originalFilename);
        const newFileName = `${id}${fileExtension}`;
        const newFilePath = path.join(uploadDir, newFileName);

        // Move the uploaded file to the final location with room ID as filename
        fs.renameSync(imageFile.filepath, newFilePath);

        // Store full URL instead of relative path
        const baseUrl =
          process.env.BASE_URL || `https://localhost:${process.env.PORT}`;
        imagePath = `${baseUrl}/be-api/static/room_photo/${newFileName}`;
      }

      await client.query(
        `UPDATE mst_room SET nama = ?, kapasitas = ?, lokasi = ?, category = ?, image = ?, is_active = ? WHERE id_ruangan = ?`,
        [
          data.nama,
          data.kapasitas,
          data.lokasi,
          data.category,
          imagePath,
          data.is_active,
          id,
        ]
      );
      await client.commit();
      res.status(200).send({
        message: "Room updated successfully",
        image_path: imagePath,
      });
    } catch (error) {
      await client.rollback();
      console.error("Error updating room:", error);
      res.status(500).send({ message: error.message });
    } finally {
      client.release();
    }
  },

  deleteRoom: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    const id = req.params.id_ruangan;
    try {
      await client.beginTransaction();
      await client.query(`DELETE FROM mst_room WHERE id_ruangan = ?`, [id]);
      await client.commit();
      res.status(200).send({ message: "Room deleted" });
    } catch (error) {
      await client.rollback();
      res.status(500).send({ message: error.message });
    } finally {
      client.release();
    }
  },
};

module.exports = RoomController;
