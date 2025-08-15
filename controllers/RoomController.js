const RoomModel = require("../models/RoomModel");
const db = require("../config/db");
const { formidable } = require("formidable");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const RoomController = {
  getAllRoom: async (req, res) => {
    const isVirtual = req.query.is_virtual;
    try {
      const data = await RoomModel.getAllRooms(isVirtual);
      const rooms = data.map((room) => ({
        ...room,
        image: room.image || `${process.env.BASE_URL || "https://localhost:5000"}/be-api/static/img/office1.jpg`,
      }));
      res.status(200).send(rooms);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  getAllRoomWithFac: async (req, res) => {
    const id_room = req.query.id_room || null;
    const isVirtual = req.query.is_virtual;
    try {
      const roomFac = await RoomModel.getAllRoomsWithFacilities(id_room, isVirtual);
      const roomsWithImages = roomFac.map((item) => ({
        ...item,
        image: item.image || `${process.env.BASE_URL || "https://localhost:5000"}/be-api/static/img/office1.jpg`,
      }));
      res.status(200).send({ data: roomsWithImages });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: error.message });
    }
  },

  getAvailableRoomWithParam: async (req, res) => {
    try {
      const hours = req.query.hours;
      if (hours === undefined) {
        throw Error("parameter is empty");
      }
      const roomFac = await RoomModel.getAvailableRoomsWithParam(hours);
      const roomsWithImages = roomFac.map((item) => ({
        ...item,
        image: item.image || `${process.env.BASE_URL || "https://localhost:5000"}/be-api/static/img/office1.jpg`,
      }));
      res.status(200).send({ data: roomsWithImages });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: error.message });
    }
  },

  getAvailableRoom: async (req, res) => {
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

    try {
      const rooms = await RoomModel.getAvailableRooms(payload);

      // Add placeholder image for rooms without images and ensure consistent data
      const roomsWithPlaceholder = rooms.map((room) => ({
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
      console.log(error);
      res.status(500).send({ message: error.message });
    }
  },

  getRoomDetails: async (req, res) => {
    const id = req.params.id_ruangan;
    try {
      const roomData = await RoomModel.getRoomDetails(id);
      const room = {
        ...roomData,
        image: roomData.image || `${process.env.BASE_URL || "https://localhost:5000"}/be-api/static/img/office1.jpg`,
      };
      res.status(200).send(room);
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  },

  createRoom: async (req, res) => {
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

      // Generate automatic room ID
      const generatedId = await RoomModel.generateRoomId(data);

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

      const result = await RoomModel.createRoom(data, imagePath, generatedId);

      res.status(201).send({
        message: "Room created successfully",
        id_ruangan: result.id_ruangan,
        image_path: result.image_path,
      });
    } catch (error) {
      console.error("Error creating room:", error);
      res.status(500).send({ message: error.message });
    }
  },

  updateRoom: async (req, res) => {
    const id = req.params.id_ruangan;

    try {
      const roomExists = await RoomModel.checkRoomExists(id);

      if (!roomExists) {
        res.status(404).send({ message: "Room not found" });
        return;
      }

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

      // Get current room data to check for existing image
      const currentImagePath = await RoomModel.getCurrentRoomImage(id);

      // Handle image upload
      let imagePath = currentImagePath; // Keep existing image by default
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

      const result = await RoomModel.updateRoom(id, data, imagePath);

      res.status(200).send({
        message: "Room updated successfully",
        image_path: result.image_path,
      });
    } catch (error) {
      console.error("Error updating room:", error);
      res.status(500).send({ message: error.message });
    }
  },

  deleteRoom: async (req, res) => {
    const id = req.params.id_ruangan;
    try {
      const roomExists = await RoomModel.checkRoomExists(id);
      if (!roomExists) {
        res.status(404).send({ message: "Room not found" });
        return;
      }
      await RoomModel.deleteRoom(id);
      res.status(200).send({ message: "Room deleted" });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  },

  generateQRCode: async (req, res) => {
    const id_ruangan = req.params.id_ruangan;
    const qrCodeDir = path.join(__dirname, "../public/qrcode");
    const qrCodePath = path.join(qrCodeDir, `${id_ruangan}.png`);

    try {
      // Check if room exists
      const roomExists = await RoomModel.checkRoomExists(id_ruangan);

      if (!roomExists) {
        return res.status(404).send({ message: "Room not found" });
      }

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
