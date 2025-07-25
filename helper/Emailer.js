const mailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const EmailGen = require("./EmailGen");

let adminEmail = ["anggi.pranasa@hotmail.com"];
if (process.env.MYSQLDB === "mrbapp") {
  adminEmail.push("nita.cahyani@kpn-corp.com");
}

class Mailer {
  constructor() {
    this.tp = mailer.createTransport({
      name: "kpndomain.com",
      host: process.env.SMTP_HOST,
      secure: true,
      port: process.env.SMPT_PORT,
      tls: {
        ciphers: "SSLv3",
        rejectUnauthorized: false,
      },
      auth: {
        user: `${process.env.SMTP_USERNAME}`,
        pass: `${process.env.SMTP_PASSWORD}`,
      },
      pool: true,
    });
  }

  async otpVerifyNew(otpCode, emailTarget) {
    const setup = {
      from: process.env.SMTP_USERNAME,
      to: emailTarget,
      subject: "Roomeet - OTP New User",
      text: `This is your OTP Code: ${otpCode}, this code will expired after 5 minute. Please insert before expiry time`,
    };
    try {
      await this.tp.sendMail(setup);
      return emailTarget;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async otpResetPass(otpCode, emailTarget) {
    const setup = {
      from: process.env.SMTP_USERNAME,
      to: emailTarget,
      subject: "Roomeet - Reset Password",
      text: `This is your OTP Code: ${otpCode}, this code will expired after 5 minute. Please insert before expiry time`,
    };
    try {
      const send = await this.tp.sendMail(setup);
      console.log("success", send);
      return emailTarget;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async approvalNotif(data) {
    console.log("EMAIL RUNNING for approval:", data.approval, "to:", data.email);
    let setup;

    if (data.approval === "approved") {
      const approved = EmailGen.NotifyApproved(data);
      setup = {
        from: process.env.SMTP_USERNAME,
        to: data.email,
        subject: `Roomeet - Your meeting is ${data.approval}`,
        html: approved,
      };
    } else if (data.approval === "rejected") {
      const rejected = EmailGen.NotifyRejected(data);
      setup = {
        from: process.env.SMTP_USERNAME,
        to: data.email,
        subject: `Roomeet - Your meeting is ${data.approval}`,
        html: rejected,
      };
    } else if (data.approval === "cancelled") {
      console.log("Handling cancelled email for:", data.email, "agenda:", data.agenda);
      try {
        const cancelled = EmailGen.NotifyCancelled(data);
        console.log("Generated cancelled email HTML, length:", cancelled.length);
        setup = {
          from: process.env.SMTP_USERNAME,
          to: data.email,
          subject: `Roomeet - Your meeting has been ${data.approval}`,
          html: cancelled,
        };
        console.log("Email setup created for cancelled booking");
      } catch (emailGenError) {
        console.error("Error generating cancelled email HTML:", emailGenError);
        throw emailGenError;
      }
    }
    if (!setup) {
      console.error("Email setup is undefined! Approval status:", data.approval);
      throw new Error(`Email setup failed for approval status: ${data.approval}`);
    }
    
    try {
      console.log("Sending email with setup:", setup);
      const send = await this.tp.sendMail(setup);
      console.log("Email sent successfully:", send);
      return data.email;
    } catch (error) {
      console.error("Error sending email:", error);
      throw error;
    }
  }

  async newBooking(data, id_ticket) {
    const setup = {
      from: process.env.SMTP_USERNAME,
      to: adminEmail,
      subject: "Roomeet - New Booking",
      html: EmailGen.NewBookMail(data, id_ticket),
    };
    try {
      const send = await this.tp.sendMail(setup);
      console.log("success", send);
      return adminEmail;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async editedBooking(data, id_ticket, id_book) {
    const setup = {
      from: process.env.SMTP_USERNAME,
      to: adminEmail,
      subject: "Roomeet - Edited Booking",
      html: EmailGen.EditBookMail(data, id_ticket, id_book),
    };
    try {
      const send = await this.tp.sendMail(setup);
      console.log("success", send);
      return adminEmail;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async reminder(data) {
    const setup = {
      from: process.env.SMTP_USERNAME,
      to: data.email,
      subject: "Roomeet - Check In Reminder",
      html: EmailGen.reminderMail(data),
    };
    try {
      const send = await this.tp.sendMail(setup);
      console.log("success", send);
      return data.email;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}

module.exports = Mailer;
