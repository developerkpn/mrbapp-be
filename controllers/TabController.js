const TabModel = require("../models/TabModel");

const TabController = {
  getRoomInfo: async (req, res) => {
    try {
      const ipAddress = req.query.ipAddress1;
      const data = await TabModel.getRoomInfo(ipAddress);
      res.status(200).send(data);
      console.log(data);
    } catch (error) {
      res.status(500).send({
        message: error.message,
      });
    }
  },

  onMeeting: async (req, res) => {
    try {
      const formattedDate = req.query.formattedDate2;
      const formattedTime = req.query.formattedTime2;
      const ipAddress = req.query.ipAddress2;
      const data = await TabModel.getOngoingMeeting(formattedDate, formattedTime, ipAddress);
      res.status(200).send(data);
      console.log(data);
    } catch (error) {
      res.status(500).send({
        message: error.message,
      });
    }
  },

  nextMeeting: async (req, res) => {
    try {
      const formattedDate = req.query.formattedDate2;
      const formattedTime = req.query.formattedTime2;
      const ipAddress = req.query.ipAddress3;
      const data = await TabModel.getNextMeeting(formattedDate, formattedTime, ipAddress);
      res.status(200).send(data);
      console.log(data);
    } catch (error) {
      res.status(500).send({
        message: error.message,
      });
    }
  },

  prevMeeting: async (req, res) => {
    try {
      const formattedDate = req.query.formattedDate2;
      const formattedTime = req.query.formattedTime2;
      const ipAddress = req.query.ipAddress4;
      const data = await TabModel.getPreviousMeeting(formattedDate, formattedTime, ipAddress);
      res.status(200).send(data);
      console.log(data);
    } catch (error) {
      res.status(500).send({
        message: error.message,
      });
    }
  },
};

module.exports = TabController;
