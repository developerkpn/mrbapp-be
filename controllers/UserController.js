const UserModel = require("../models/UserModel");
const Emailer = require("../helper/Emailer");
const OTPHandler = require("../helper/OTPHandler");
const uuid = require("uuidv4");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const { hashPassword, validatePassword } = require("../middleware/hashpass");
const convertTZ = require("../helper/helper");

const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 1 week in ms

const UserController = {
  refreshToken: async (req, res) => {
    try {
      const refreshToken = req.cookies?.refresh_token;
      if (!refreshToken) {
        throw new Error("Refresh token not found");
      }

      const decodedRefreshToken = decodeURIComponent(refreshToken);
      const decoded = jwt.verify(decodedRefreshToken, process.env.SECRETJWT, {
        ignoreExpiration: true,
      });

      const userId = decoded.id_user;

      const result = await UserModel.refreshToken(userId);
      res.status(200).send(result);
    } catch (error) {
      res.status(401).send({ message: error.message });
    }
  },

  loginUser: async (req, res) => {
    try {
      const emailoruname = req.body.username;
      const password = req.body.password;
      let now = new Date();
      if (process.env.MYSQLDB === "mrbapp") {
        now = convertTZ(now, "Asia/Jakarta");
      }

      let subscription = null;
      if (req.body?.subscription) {
        subscription = JSON.parse(req.body.subscription);
      }

      const result = await UserModel.loginUser(emailoruname, subscription, now);

      // Validate password
      const validate = await validatePassword(password, result.data.password);
      if (!validate) {
        res.status(400).send({ message: "Password not valid" });
        return;
      }

      res.cookie("refresh_token", encodeURIComponent(result.refreshToken), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });

      res.status(200).send({
        message: `Success sign in, welcome ${result.data.nama}`,
        data: {
          name: result.data.nama,
          email: result.data.email,
          id_user: result.data.id_user,
          role_id: result.data.role_id,
          role_name: result.data.role_name,
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  },

  logout: async (req, res) => {
    try {
      const refreshToken = req.cookies?.refresh_token;
      if (!refreshToken) {
        res.status(200).send({ message: "Logged out" });
        return;
      }

      await UserModel.logout(refreshToken);

      res.clearCookie("refresh_token", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });
      res.status(200).send({ message: "Logged out" });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  },

  registerUser: async (req, res) => {
    try {
      const email = req.body.email;
      const password = await hashPassword(req.body.password);
      const payload = {
        nama: req.body.nama,
        business_unit: req.body.business_unit,
        username: req.body.username,
        password: password,
        email: req.body.email,
        id_user: uuid.uuid(),
        role_id: "321de04f-1e49-4ed0-b301-3ed6ea54ce9c",
      };

      await UserModel.registerUser(payload);

      // send otp to email to verify registration
      const [otpCode, otpHashed, validUntil] = OTPHandler.createOTP();
      const payloadOtp = {
        email: payload.email,
        otp_code: otpHashed,
        valid_until: validUntil,
      };

      await UserModel.createOTPRecord(payloadOtp, email);

      const Email = new Emailer();
      const result = await Email.otpVerifyNew(otpCode, payload.email);
      console.log(result);

      res.status(200).send({
        message: "User registered, please verify with otp",
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        message: error.message,
      });
    }
  },

  //@New User Verification
  newUserVerify: async (req, res) => {
    try {
      const email = req.body.email;
      const otpInput = req.body.otpInput;

      const validateOTP = await OTPHandler.validateOTP(otpInput, email);
      await UserModel.verifyNewUser(email);

      res.status(200).send({
        message: "User Validated",
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        message: error.message,
      });
    }
  },

  //@Reset forgotten password
  reqResetPassword: async (req, res) => {
    try {
      const email = req.body.email;
      const Mailer = new Emailer();

      const userExists = await UserModel.checkUserExists(email);
      if (!userExists) {
        throw new Error("User not registered yet");
      }

      const [otpCode, encodedOTP, validUntil] = OTPHandler.createOTP();
      const payload = {
        email: email,
        otp_code: encodedOTP,
        valid_until: validUntil,
      };

      await UserModel.createResetPasswordOTP(payload);
      const sendEmail = await Mailer.otpResetPass(otpCode, email);

      res.status(200).send({
        message: "OTP has sent, please check your email address",
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: error.message,
      });
    }
  },

  //@VerifyResetPassword
  verifResetPass: async (req, res) => {
    const email = req.body.email;
    const otpInput = req.body.otpInput;
    try {
      await OTPHandler.validateOTP(otpInput, email);
      const sessionToken = jwt.sign({ email: email }, process.env.SECRETJWT, {
        expiresIn: "5m",
      });
      res.cookie("resetpwdSess", sessionToken, {
        httpOnly: true,
        sameSite: false,
        secure: true,
      });
      res.status(200).send({
        message: "OTP Verified",
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        message: error.message,
      });
    }
  },

  resetPassword: async (req, res) => {
    try {
      const session = req.cookies.resetpwdSess;
      const newPass = req.body.newPass;
      const email = req.body.email;

      jwt.verify(session, process.env.SECRETJWT);

      const hashedNewPass = await hashPassword(newPass);
      await UserModel.resetPassword(email, hashedNewPass);

      res.status(200).send({
        message: "Password has reset",
      });
    } catch (error) {
      if (error?.name == "TokenExpiredError") {
        res.status(403).send("Session Expired");
      } else if (error?.name == "JsonWebTokenError") {
        res.status(403).send("Invalid Session");
      } else {
        res.status(500).send(error.message);
      }
    }
  },

  getEmailDomain: async (req, res) => {
    try {
      const data = await UserModel.getEmailDomains();
      res.status(200).send({ data });
    } catch (error) {
      res.status(500).send({
        message: error.message,
      });
    }
  },

  getBizUnit: async (req, res) => {
    try {
      const data = await UserModel.getBizUnits();
      res.status(200).send({ data });
    } catch (error) {
      res.status(500).send({
        message: error.message,
      });
    }
  },

  checkPenalty: async (req, res) => {
    const id_user = req.useridSess;
    try {
      const result = await UserModel.checkAndUpdatePenalty(id_user);
      const penalty = result.penalty;
      const counter = result.counter;

      if (result.updated) {
        res.status(200).send({
          message: "Your penalty is finished",
          updated: true,
          counter: counter,
        });
        return;
      } else if (penalty !== null) {
        res.status(400).send({
          message: `You have penalty until ${penalty}`,
          penalty: penalty,
          counter: counter,
        });
        return;
      } else {
        res.status(200).send({
          message: "User don't have penalty",
          counter: counter,
        });
        return;
      }
    } catch (error) {
      res.status(500).send({
        message: error,
      });
      console.error("Error in checkPenalty", error);
    }
  },
};

module.exports = UserController;
