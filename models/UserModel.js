const DbConn = require("../helper/DbTransaction");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const { hashPassword } = require("../middleware/hashpass");

const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 1 week in ms

const UserModel = {
  refreshToken: async (userId) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();

      const userData = await client.query("SELECT * FROM mst_user WHERE id_user = ?", [userId]);
      const user = userData[0][0];

      if (!user.refresh_token_expiry_at || new Date(user.refresh_token_expiry_at) < new Date()) {
        throw new Error("Refresh token expired");
      }

      const payload = {
        email: user.email,
        username: user.username,
        name: user.nama,
        id_user: user.id_user,
        role_id: user.role_id,
        role_name: user.role_name,
      };

      const newAccessToken = jwt.sign(payload, process.env.SECRETJWT, {
        expiresIn: "30s",
      });

      await client.commit();
      return { accessToken: newAccessToken };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  loginUser: async (emailoruname, subscription, now) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      const checkUserData = await client.query(
        `SELECT email, username, password, nama, id_user, mu.role_id, mr.role_name FROM mst_user mu
        left join mst_role mr on mr.role_id = mu.role_id
        where username = ? or email = ?`,
        [emailoruname, emailoruname]
      );

      if (checkUserData[0].length === 0) {
        throw new Error("User not found");
      }

      const data = checkUserData[0][0];

      if (subscription) {
        const checkUserSub = await client.query("SELECT id FROM notif_sub WHERE endpoint_sub = ?", [
          subscription.sub.endpoint,
        ]);
        if (checkUserSub[0].length !== 0) {
          await client.query("DELETE FROM notif_sub where endpoint_sub = ?", [subscription.sub.endpoint]);
        }
        let dataNotifSub = [
          data.id_user,
          subscription.sub.endpoint,
          subscription.sub.keys.p256dh,
          subscription.sub.keys.auth,
          moment(now).format(),
        ];
        await client.query(
          "INSERT INTO notif_sub(id_user, endpoint_sub, p256dh_sub, auth_sub, created_date) VALUES(?,?,?,?,?)",
          dataNotifSub
        );
      }

      const refreshToken = jwt.sign(
        {
          email: data.email,
          username: data.username,
          name: data.nama,
          id_user: data.id_user,
          role_id: data.role_id,
          role_name: data.role_name,
        },
        process.env.SECRETJWT,
        { expiresIn: "7d" }
      );

      const accessToken = jwt.sign(
        {
          email: data.email,
          username: data.username,
          name: data.nama,
          id_user: data.id_user,
          role_id: data.role_id,
          role_name: data.role_name,
        },
        process.env.SECRETJWT,
        { expiresIn: "30s" }
      );

      const expiryDate = new Date(Date.now() + REFRESH_TOKEN_EXPIRY);
      await client.query("UPDATE mst_user SET refresh_token = ?, refresh_token_expiry_at = ? WHERE id_user = ?", [
        refreshToken,
        expiryDate,
        data.id_user,
      ]);

      await client.commit();

      return {
        data: data,
        refreshToken: refreshToken,
        accessToken: accessToken,
      };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  logout: async (refreshToken) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      await client.query(
        "UPDATE mst_user SET refresh_token = NULL, refresh_token_expiry_at = NULL WHERE refresh_token = ?",
        [refreshToken]
      );
      await client.commit();
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  registerUser: async (payload) => {
    const Conn = new DbConn();
    await Conn.init();
    const client = Conn.poolConnection;

    try {
      await client.beginTransaction();

      //check if existing validated
      const existValid = await Conn.select("SELECT * FROM mst_user where username = ? or email = ?", [
        payload.username,
        payload.email,
      ]);
      if (existValid[0].length > 0) {
        throw new Error("User already existed");
      }

      const existInvalid = await Conn.select("SELECT * FROM mst_user_temp where username = ? or email = ?", [
        payload.username,
        payload.email,
      ]);

      if (!existInvalid[0].length > 0) {
        const [query, val] = Conn.insertQuery(payload, "mst_user_temp");
        await client.query(query, val);
      } else {
        throw new Error("User already registered, please verify account");
      }

      await client.commit();
      return { success: true };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
      Conn.releaseConnection();
    }
  },

  createOTPRecord: async (payloadOtp, email) => {
    const Conn = new DbConn();
    await Conn.init();
    const client = Conn.poolConnection;

    try {
      await client.beginTransaction();
      const [qClean, valClean] = Conn.deleteQuery({ email: email }, "otp_trans");
      const [queryOTP, valOTP] = Conn.insertQuery(payloadOtp, "otp_trans");
      await client.query(qClean, valClean);
      await client.query(queryOTP, valOTP);
      await client.commit();
      return { success: true };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
      Conn.releaseConnection();
    }
  },

  verifyNewUser: async (email) => {
    const Conn = new DbConn();
    const client = await Conn.initConnection();

    try {
      await client.beginTransaction();
      const tempUser = await client.query("SELECT * FROM mst_user_temp where email = ?", [email]);
      const userData = tempUser[0][0];
      delete userData.id;

      const [qInsert, valIns] = Conn.insertQuery(userData, "mst_user");
      const [qDelete, valDel] = Conn.deleteQuery({ email: email }, "mst_user_temp");
      const [qDeleteOTP, valDelOTP] = Conn.deleteQuery({ email: email }, "otp_trans");

      let promises = [
        client.query(qInsert, valIns),
        client.query(qDelete, valDel),
        client.query(qDeleteOTP, valDelOTP),
      ];
      await Promise.all(promises);
      await client.commit();
      return { success: true };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  checkUserExists: async (email) => {
    const Conn = new DbConn();
    const client = await Conn.initConnection();

    try {
      const checkRegis = await client.query("SELECT * FROM mst_user where email = ?", [email]);
      return checkRegis[0].length > 0;
    } finally {
      client.release();
    }
  },

  createResetPasswordOTP: async (payload) => {
    const Conn = new DbConn();
    const client = await Conn.initConnection();

    try {
      await client.beginTransaction();
      const [qClean, valClean] = Conn.deleteQuery({ email: payload.email }, "otp_trans");
      await client.query(qClean, valClean);
      const [queryOTP, valOTP] = Conn.insertQuery(payload, "otp_trans");
      await client.query(queryOTP, valOTP);
      await client.commit();
      return { success: true };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  resetPassword: async (email, hashedNewPass) => {
    const Conn = new DbConn();
    const client = await Conn.initConnection();

    try {
      await client.beginTransaction();
      const checkUser = await client.query("SELECT * FROM mst_user WHERE email = ? ", [email]);
      if (checkUser[0].length == 0) {
        throw new Error("User not found");
      }

      const payload = {
        password: hashedNewPass,
      };
      const [qUpPass, valUpPass] = Conn.updateQuery(payload, { email: email }, "mst_user");
      await client.query(qUpPass, valUpPass);
      await client.commit();
      return { success: true };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getEmailDomains: async () => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      const getEmail = await client.query(`
        SELECT domain FROM allowed_email
        `);
      await client.commit();
      return getEmail[0];
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  getBizUnits: async () => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      const getUnit = await client.query(`
        SELECT * FROM mst_biz_unit
        `);
      await client.commit();
      return getUnit[0];
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },

  checkAndUpdatePenalty: async (id_user) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      await client.beginTransaction();
      const updateData = await client.query(
        `
        UPDATE mst_user SET penalty_until = null, penalty_ctr = 0
        WHERE id_user = ? AND penalty_until < CONVERT_TZ(NOW(), '+00:00', '+07:00')
        `,
        [id_user]
      );
      const select = await client.query(`SELECT penalty_until, penalty_ctr FROM mst_user WHERE id_user = ?`, [id_user]);
      const pen = select[0][0]?.penalty_until || null;
      const counter = select[0][0]?.penalty_ctr || 0;
      let penalty = null;
      if (pen !== null) {
        penalty = moment(pen).format("dddd, DD-MM-YYYY, HH:mm");
      }
      await client.commit();

      return {
        updated: updateData[0].changedRows === 1,
        penalty: penalty,
        counter: counter,
      };
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  },
};

module.exports = UserModel;
