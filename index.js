const dotenv = require("dotenv");
dotenv.config({
  path: `./.env.${process.env.NODE_ENV}`,
});
const express = require("express");
const os = require("os");
const https = require("https");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const whitelist = require("./config/allowedOrigins");
const app = express();
const credentials = require("./middleware/credential");
const routers = require("./routes");
const BookingChores = require("./helper/BookingChores");
const NotificationManager = require("./helper/NotificationManager");
const port = process.env.PORT;
const corsOption = {
  credentials: true,
  origin: function (req, callback) {
    if (whitelist.indexOf(req) !== -1) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  methods: ["POST", "PUT", "GET", "OPTIONS", "HEAD", "DELETE", "PATCH"],
  credentials: true,
  exposedHeaders: ["set-cookie"],
};

const servOption = {
  cert: fs.readFileSync("./ssl/localhost.pem"),
  key: fs.readFileSync("./ssl/localhost-key.pem"),
};

app.use(credentials);
app.use(cors(corsOption));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(routers);
app.use("/be-api/static", express.static("public")); // http://localhost:5000/static/img/office1.jpg
NotificationManager.ReRunCron();
NotificationManager.ReRunCronMail();
NotificationManager.CleanUpCron();

// app.listen(process.env.PORT, () => {
//   console.log(`App running on ${process.env.PORT}`);
// });

const server = https.createServer(servOption, app).listen(port, () => {
  console.log(`App running on ${port}`);
});
