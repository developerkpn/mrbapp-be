const moment = require("moment");
const EmailGen = {};

EmailGen.NotifyApproved = (data) => {
  return `<main style="font-family: sans-serif">
  <img
    src="https://safetyfirstindonesia.co.id/assets/uploads/images/9f09b-kpn-corp.png"
    width="40%"
    alt="KPN Corp"
  />
  <h1>Roomeet</h1>
  <p>Hello, ${data.username}</p>
  <p>
    Your booking, <strong>"${data.agenda}"</strong> is
    <strong style="color: green">${data.approval}</strong>.
  </p>
  <table style="width: 100%">
    <tr>
      <td style="width:25%">Agenda</td>
      <td>${data.agenda}</td>
    </tr>
    <tr>
      <td style="width:25%">Remark</td>
      <td>${data.remark || "-"}</td>
    </tr>
    <tr>
      <td style="width:25%">Room</td>
      <td>${data.ruangan}</td>
    </tr>
    <tr>
      <td style="width:25%">Booking Date</td>
      <td>${moment(data.book_date).format("DD-MM-YYYY")}</td>
    </tr>
    <tr>
      <td style="width:25%">Time</td>
      <td>${data.time_start} - ${data.time_end}</td>
    </tr>
    <tr>
      <td style="width:25%">Participants</td>
      <td>${data.capacity}</td>
    </tr>
  </table>
  <p>Don't forget to check in 15 minutes before the meeting start.</p>
  <hr />
  <p>Thank you.</p>
</main>`;
};

EmailGen.NotifyRejected = (data) => {
  return `<main style="font-family: sans-serif">
  <img
    src="https://safetyfirstindonesia.co.id/assets/uploads/images/9f09b-kpn-corp.png"
    width="40%"
    alt="KPN Corp"
  />
  <h1>Roomeet</h1>
  <p>Hello, ${data.username}</p>
  <p>
    Your booking, <strong>"${data.agenda}"</strong> is
    <strong style="color: red">${data.approval}</strong>.
  </p>
  <table style="width: 100%">
    <tr>
      <td style="width:25%">Agenda</td>
      <td>${data.agenda}</td>
    </tr>
    <tr>
      <td style="width:25%">Remark</td>
      <td>${data.remark || "-"}</td>
    </tr>
    <tr>
      <td style="width:25%">Room</td>
      <td>${data.ruangan}</td>
    </tr>
    <tr>
      <td style="width:25%">Booking Date</td>
      <td>${moment(data.book_date).format("DD-MM-YYYY")}</td>
    </tr>
    <tr>
      <td style="width:25%">Time</td>
      <td>${data.time_start} - ${data.time_end}</td>
    </tr>
    <tr>
      <td style="width:25%">Participants</td>
      <td>${data.capacity}</td>
    </tr>
  </table>
  <p>Here's some note from administrator:</p>
  <blockquote style="background: lightGray; padding: 16px">${
    data.reject_note
  }</blockquote>
  <p>Please create a new booking based on the note above</p>
  <hr />
  <p>Thank you.</p>
</main>`;
};

EmailGen.NewBookMail = (data, id_ticket) => {
  return `<main style="font-family: sans-serif">
  <img
    src="https://safetyfirstindonesia.co.id/assets/uploads/images/9f09b-kpn-corp.png"
    width="40%"
    alt="KPN Corp"
  />
  <h1>Roomeet</h1>
  <p>Hello, Admin</p>
  <p>
    There's a new booking, <strong>"${data.agenda}"</strong>
  </p>
  <table style="width: 100%">
    <tr>
      <td style="width:25%">User Name</td>
      <td>${data.nama}</td>
    </tr>
    <tr>
      <td style="width:25%">ID Ticket</td>
      <td>${id_ticket}</td>
    </tr>
    <tr>
      <td style="width:25%">Agenda</td>
      <td>${data.agenda}</td>
    </tr>
    <tr>
      <td style="width:25%">Remark</td>
      <td>${data.remark}</td>
    </tr>
    <tr>
      <td style="width:25%">Room</td>
      <td>${data.id_ruangan}</td>
    </tr>
    <tr>
      <td style="width:25%">Booking Date</td>
      <td>${moment(data.book_date).format("DD-MM-YYYY")}</td>
    </tr>
    <tr>
      <td style="width:25%">Time</td>
      <td>${data.time_start} - ${data.time_end}</td>
    </tr>
    <tr>
      <td style="width:25%">Participants</td>
      <td>${data.prtcpt_ctr}</td>
    </tr>
  </table>
  <br>
  <a href="https://roomeet.gamasap.com/admin/approval/${
    data.id_book
  }">Click here to check details</a>
  <hr />
  <p>Thank you.</p>
</main>`;
};

EmailGen.EditBookMail = (data, id_ticket, id_book) => {
  return `<main style="font-family: sans-serif">
  <img
    src="https://safetyfirstindonesia.co.id/assets/uploads/images/9f09b-kpn-corp.png"
    width="40%"
    alt="KPN Corp"
  />
  <h1>Roomeet</h1>
  <p>Hello, Admin</p>
  <p>
    There's an edited booking, <strong>"${data.agenda}"</strong>
  </p>
  <table style="width: 100%">
    <tr>
      <td style="width:25%">User Name</td>
      <td>${data.nama}</td>
    </tr>
    <tr>
      <td style="width:25%">ID Ticket</td>
      <td>${id_ticket}</td>
    </tr>
    <tr>
      <td style="width:25%">Agenda</td>
      <td>${data.agenda}</td>
    </tr>
    <tr>
      <td style="width:25%">Remark</td>
      <td>${data.remark}</td>
    </tr>
    <tr>
      <td style="width:25%">Room</td>
      <td>${data.id_ruangan}</td>
    </tr>
    <tr>
      <td style="width:25%">Booking Date</td>
      <td>${moment(data.book_date).format("DD-MM-YYYY")}</td>
    </tr>
    <tr>
      <td style="width:25%">Time</td>
      <td>${data.time_start} - ${data.time_end}</td>
    </tr>
    <tr>
      <td style="width:25%">Participants</td>
      <td>${data.participant}</td>
    </tr>
  </table>
  <br>
  <a href="https://roomeet.gamasap.com/admin/approval/${id_book}">Click here to check details</a>
  <hr />
  <p>Thank you.</p>
</main>`;
};

EmailGen.NotifyCancelled = (data) => {
  return `<main style="font-family: sans-serif">
  <img
    src="https://safetyfirstindonesia.co.id/assets/uploads/images/9f09b-kpn-corp.png"
    width="40%"
    alt="KPN Corp"
  />
  <h1>Roomeet</h1>
  <p>Hello, ${data.username}</p>
  <p>
    Your booking, <strong>"${data.agenda}"</strong> has been
    <strong style="color: red">${data.approval}</strong> by the administrator.
  </p>
  <table style="width: 100%">
    <tr>
      <td style="width:25%">Agenda</td>
      <td>${data.agenda}</td>
    </tr>
    <tr>
      <td style="width:25%">Remark</td>
      <td>${data.remark || "-"}</td>
    </tr>
    <tr>
      <td style="width:25%">Room</td>
      <td>${data.ruangan}</td>
    </tr>
    <tr>
      <td style="width:25%">Booking Date</td>
      <td>${moment(data.book_date).format("DD-MM-YYYY")}</td>
    </tr>
    <tr>
      <td style="width:25%">Time</td>
      <td>${data.time_start} - ${data.time_end}</td>
    </tr>
    <tr>
      <td style="width:25%">Participants</td>
      <td>${data.capacity}</td>
    </tr>
  </table>
  <p><strong>Cancellation reason:</strong></p>
  <p style="color: #666; font-style: italic;">${
    data.reject_note || "No reason provided"
  }</p>
  <p>We apologize for any inconvenience caused. If you believe this cancellation was made in error, please contact the administrator for assistance.</p>
  <p>You can create a new booking if needed through the Roomeet system.</p>
  <hr />
  <p>Thank you.</p>
</main>`;
};

EmailGen.reminderMail = (data) => {
  return `<main style="font-family: sans-serif">
  <img
    src="https://safetyfirstindonesia.co.id/assets/uploads/images/9f09b-kpn-corp.png"
    width="40%"
    alt="KPN Corp"
  />
  <h1>Roomeet</h1>
  <p>Hello, ${data.username}</p>
  <p>
    Don't forget to check in on your meeting, <strong>"${data.agenda}"</strong>
  </p>
  <table style="width: 100%">
    <tr>
      <td style="width:25%">ID Ticket</td>
      <td>${data.id_ticket}</td>
    </tr>
    <tr>
      <td style="width:25%">Agenda</td>
      <td>${data.agenda}</td>
    </tr>
    <tr>
      <td style="width:25%">Remark</td>
      <td>${data.remark}</td>
    </tr>
    <tr>
      <td style="width:25%">Room</td>
      <td>${data.id_ruangan}</td>
    </tr>
    <tr>
      <td style="width:25%">Booking Date</td>
      <td>${moment(data.book_date).format("DD-MM-YYYY")}</td>
    </tr>
    <tr>
      <td style="width:25%">Time</td>
      <td>${data.time_start} - ${data.time_end}</td>
    </tr>
    <tr>
      <td style="width:25%">Participants</td>
      <td>${data.prtcpt_ctr}</td>
    </tr>
  </table>
  <br>
  <a href="https://roomeet.gamasap.com/dashboard">Please check in on your dashboard</a>
  <hr />
  <p>Thank you.</p>
</main>`;
};

module.exports = EmailGen;
