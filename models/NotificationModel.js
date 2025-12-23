const DbConn = require("../helper/DbTransaction");
const webpush = require("web-push");

const NotificationModel = {
  getNotificationTargets: async (userId) => {
    const Client = new DbConn();
    const client = await Client.initConnection();

    try {
      const getNotifTrg = await client.query(`SELECT * FROM notif_sub WHERE id_user = ?`, [userId]);
      return getNotifTrg[0];
    } finally {
      client.release();
    }
  },

  sendNotification: async (subscription, payload) => {
    return await webpush.sendNotification(subscription, JSON.stringify(payload));
  },
};

module.exports = NotificationModel;
