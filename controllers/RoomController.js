const DbConn = require("../helper/DbTransaction");
const db = require("../config/db");
const { formidable } = require("formidable");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const RoomController = {
  getAllRoom: async (req, res) => {
    const Client = new DbConn();
    const client = await Client.initConnection();
    const isVirtual = req.query.is_virtual;
    try {
      let query = "SELECT * from mst_room";
      let params = [];

      if (isVirtual !== undefined) {
        query += " WHERE is_virtual = ?";
        params.push(isVirtual === "true" ? "T" : "F");
      }

      const get = await client.query(query, params);
      const rooms = get[0].map((room) => ({
        ...room,
        image: room.image || `${process.env.BASE_URL || "https://localhost:5000"}/be-api/static/img/office1.jpg`,
      }));
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
    const isVirtual = req.query.is_virtual;
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
          image: item.image || `${process.env.BASE_URL || "https://localhost:5000"}/be-api/static/img/office1.jpg`,
        });
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
        roomFac.push({
          ...item,
          fasilitas: fac,
          image: item.image || `${process.env.BASE_URL || "https://localhost:5000"}/be-api/static/img/office1.jpg`,
        });
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
      is_virtual: data.is_virtual !== undefined ? (data.is_virtual === true ? "T" : "F") : null,
    };

    console.log("getAvailableRoom payload:", payload);
    console.log("Filtering for virtual rooms:", payload.is_virtual);

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

      console.log("Available rooms found:", getRoom[0].length, "rooms");
      getRoom[0].forEach((room) => {
        console.log(`Room: ${room.id_ruangan}, Virtual: ${room.is_virtual}, Name: ${room.nama}`);
      });

      // Add placeholder image for rooms without images and ensure consistent data
      const roomsWithPlaceholder = getRoom[0].map((room) => ({
        ...room,
        image: room.image || `${process.env.BASE_URL || "https://localhost:5000"}/be-api/static/img/office1.jpg`,
        nama: room.nama || "Room Name",
        lokasi: room.lokasi || "Location",
        is_virtual_display: room.is_virtual === "T" ? "Virtual" : "Physical",
        room_type_badge: room.is_virtual === "T" ? "virtual" : "physical",
      }));

      res.status(200).send({
        message: "Success get avail room",
        data: roomsWithPlaceholder,
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
      const room = {
        ...get[0][0],
        image: get[0][0].image || `${process.env.BASE_URL || "https://localhost:5000"}/be-api/static/img/office1.jpg`,
      };
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
        is_virtual: fields.is_virtual?.[0] || "F",
        zoom_link: fields.zoom_link?.[0] || null,
        zoom_meeting_id: fields.zoom_meeting_id?.[0] || null,
        zoom_passcode: fields.zoom_passcode?.[0] || null,
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
        const baseUrl = process.env.BASE_URL || `https://localhost:${process.env.PORT}`;
        imagePath = `${baseUrl}/be-api/static/room_photo/${newFileName}`;
      }

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
        is_virtual: fields.is_virtual?.[0] || "F",
        zoom_link: fields.zoom_link?.[0] || null,
        zoom_meeting_id: fields.zoom_meeting_id?.[0] || null,
        zoom_passcode: fields.zoom_passcode?.[0] || null,
      };

      await client.beginTransaction();

      // Get current room data to check for existing image
      const currentRoom = await client.query(`SELECT image FROM mst_room WHERE id_ruangan = ?`, [id]);

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
        const baseUrl = process.env.BASE_URL || `https://localhost:${process.env.PORT}`;
        imagePath = `${baseUrl}/be-api/static/room_photo/${newFileName}`;
      }

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

  generateQRCode: async (req, res) => {
    const id_ruangan = req.params.id_ruangan;
    const qrCodeDir = path.join(__dirname, "../public/qrcode");
    const qrCodePath = path.join(qrCodeDir, `${id_ruangan}.png`);

    try {
      // Check if room exists
      const Client = new DbConn();
      const client = await Client.initConnection();

      const roomCheck = await client.query(`SELECT id_ruangan FROM mst_room WHERE id_ruangan = ?`, [id_ruangan]);

      if (roomCheck[0].length === 0) {
        client.release();
        return res.status(404).send({ message: "Room not found" });
      }

      client.release();

      // Create QR code directory if it doesn't exist
      if (!fs.existsSync(qrCodeDir)) {
        fs.mkdirSync(qrCodeDir, { recursive: true });
      }

      // Generate QR code with room ID
      await QRCode.toFile(qrCodePath, id_ruangan, {
        errorCorrectionLevel: "H",
        type: "png",
        quality: 0.92,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        width: 256,
      });

      // Return the generated QR code as response
      res.sendFile(qrCodePath);
    } catch (error) {
      console.error("Error generating QR code:", error);
      res.status(500).send({ message: error.message });
    }
  },

  checkQRCodeExists: async (req, res) => {
    const id_ruangan = req.params.id_ruangan;
    const qrCodePath = path.join(__dirname, "../public/qrcode", `${id_ruangan}.png`);

    try {
      const exists = fs.existsSync(qrCodePath);

      if (exists) {
        const baseUrl = process.env.BASE_URL || `https://localhost:${process.env.PORT}`;
        const qrCodeUrl = `${baseUrl}/be-api/static/qrcode/${id_ruangan}.png`;
        res.status(200).send({
          exists: true,
          qr_code_url: qrCodeUrl,
        });
      } else {
        res.status(200).send({
          exists: false,
          qr_code_url: null,
        });
      }
    } catch (error) {
      console.error("Error checking QR code:", error);
      res.status(500).send({ message: error.message });
    }
  },
};

module.exports = RoomController;
