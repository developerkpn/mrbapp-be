# Roomeet Project: Fullstack System Documentation

## Overview

Roomeet is a fullstack room booking and management system, consisting of:

- **Backend** (`mrbapp-be/`): Node.js/Express REST API, MySQL, JWT authentication, email/notification, business logic.
- **Frontend** (`roomeet/`): Next.js (React), Material UI, SWR for data fetching, NextAuth for authentication, and a modular UI.

This document details each module, API endpoints, backend/frontend integration, and technical code references.

---

## 1. Authentication & User Management

### Backend

**Controller:** `mrbapp-be/controllers/UserController.js`
**Routes:** `mrbapp-be/routes/User.js` (mounted at `/be-api/user`)

| Endpoint        | Method | Description                                                          | Controller Function |
| --------------- | ------ | -------------------------------------------------------------------- | ------------------- |
| `/register`     | POST   | Register new user, store in temp table, send OTP to email            | `registerUser`      |
| `/verifynew`    | POST   | Verify OTP, move user from temp to main table                        | `newUserVerify`     |
| `/login`        | POST   | Authenticate user, return JWT access/refresh tokens, handle push sub | `loginUser`         |
| `/reqres`       | POST   | Request password reset, send OTP to email                            | `reqResetPassword`  |
| `/verifresotp`  | POST   | Verify OTP for password reset                                        | `verifResetPass`    |
| `/resetpass`    | POST   | Reset password (after OTP verified)                                  | `resetPassword`     |
| `/refreshtoken` | POST   | Issue new access token from refresh token                            | `refreshToken`      |
| `/penalty`      | PATCH  | Check and update user penalty status                                 | `checkPenalty`      |
| `/email`        | GET    | Get allowed email domains                                            | `getEmailDomain`    |
| `/bizunit`      | GET    | Get business units                                                   | `getBizUnit`        |

**Key Backend Details:**

- Passwords are hashed with bcrypt (`middleware/hashpass.js`).
- OTPs are generated and validated (`helper/OTPHandler.js`).
- Email sending via nodemailer (`helper/Emailer.js`).
- JWT tokens for session and refresh (`jsonwebtoken`).
- Penalty logic for users who abuse the system.

### Frontend

**Key Files:**

- `roomeet/src/app/(auth)/login/page.tsx` — Login form, calls `/user/login` via NextAuth.
- `roomeet/src/app/(auth)/register/page.tsx` — Registration form, calls `/user/register`.
- `roomeet/src/app/(auth)/register/otp/page.tsx` — OTP verification, calls `/user/verifynew`.
- `roomeet/src/app/(auth)/forgot-pass/page.tsx` — Request password reset, calls `/user/reqres`.
- `roomeet/src/app/(auth)/forgot-pass/reset/[email]/page.tsx` — OTP verification and password reset, calls `/user/verifresotp` and `/user/resetpass`.
- `roomeet/src/lib/axios.ts` — Configures API base URL and credentials.
- `roomeet/src/app/api/auth/[...nextauth]/route.ts` — NextAuth credentials provider, proxies login to backend `/user/login`.
- `roomeet/src/lib/hooks/useAxiosAuth.ts` — Attaches JWT to requests, handles token refresh via `/user/refreshtoken`.

**Frontend Flow:**

- Registration: `/register` → `/register/otp` (OTP) → `/login`
- Login: `/login` → NextAuth → `/user/login` (backend) → JWT tokens stored in session
- Password reset: `/forgot-pass` → `/user/reqres` → `/forgot-pass/reset/[email]` (OTP) → `/user/verifresotp` → `/user/resetpass`
- All API calls use `axiosAuth` with JWT in headers.

---

## 2. Booking Management

### Backend

**Controller:** `mrbapp-be/controllers/BookReqController.js`
**Routes:** `mrbapp-be/routes/Book.js` (mounted at `/be-api/book`)

| Endpoint             | Method | Description                                                    | Controller Function |
| -------------------- | ------ | -------------------------------------------------------------- | ------------------- |
| `/`                  | POST   | Create new booking (with penalty and booking check middleware) | `createBook`        |
| `/`                  | GET    | List all bookings (filterable by date, approval, room)         | `showAllBook`       |
| `/show`              | GET    | List bookings by user                                          | `showBookbyUser`    |
| `/byroom`            | GET    | List bookings by room                                          | `showBookbyRoom`    |
| `/:id_book`          | GET    | Get booking by ID                                              | `getBookById`       |
| `/:id_book`          | PATCH  | Edit booking                                                   | `editBook`          |
| `/:id_book`          | DELETE | Cancel booking                                                 | `cancelBook`        |
| `/approval/:id_book` | PATCH  | Approve/reject booking (admin)                                 | `approval`          |
| `/checkin/:id_user`  | GET    | Get bookings available for check-in                            | `getCheckInBook`    |
| `/checkout/:id_user` | GET    | Get bookings available for check-out                           | `getCheckOutBook`   |
| `/checkin`           | PATCH  | Check-in to a booking                                          | `checkIn`           |
| `/checkout`          | PATCH  | Check-out from a booking                                       | `checkOut`          |

**Key Backend Details:**

- Middleware: `bookcheck` (prevents double-booking), `penalty` (checks user penalty).
- Booking status and penalty logic handled in controller and `helper/BookingChores.js`.
- Email notifications sent on booking creation/approval.

### Frontend

**Key Files:**

- `roomeet/src/app/dashboard/book/[[...bookpar]]/page.tsx` — Booking form page, fetches booking for edit if needed.
- `roomeet/src/components/book/components/BookFormSingle.tsx` — Booking form, handles create/edit, checks room availability via `/room/search-avail`, submits to `/book` or `/book/:id_book`.
- `roomeet/src/components/booklist/CardListBook.tsx` — Lists user bookings, allows cancellation via `/book/:id_book`.
- `roomeet/src/components/admin/ApprovalAction.tsx` — Admin approval/rejection, calls `/book/approval/:id_book`.
- `roomeet/src/components/home/components/Home.tsx` — Handles check-in/check-out, penalty check, fetches `/book/checkin/:id_user` and `/book/checkout/:id_user`.

**Frontend Flow:**

- User creates/edits booking: fills form, checks room availability, submits to backend.
- Admin approves/rejects bookings via approval UI.
- Users can check in/out, see their bookings, and cancel if needed.

---

## 3. Room Management

### Backend

**Controller:** `mrbapp-be/controllers/RoomController.js`
**Routes:** `mrbapp-be/routes/Room.js` (mounted at `/be-api/room`)

| Endpoint        | Method | Description                               | Controller Function         |
| --------------- | ------ | ----------------------------------------- | --------------------------- |
| `/`             | GET    | List all rooms                            | `getAllRoom`                |
| `/fas`          | GET    | List all rooms with facilities            | `getAllRoomWithFac`         |
| `/avai`         | GET    | List available rooms for a given duration | `getAvailableRoomWithParam` |
| `/search-avail` | POST   | Search available rooms for booking        | `getAvailableRoom`          |
| `/:id_ruangan`  | GET    | Get room details by ID                    | `getRoomDetails`            |

**Key Backend Details:**

- Room availability logic checks for overlapping bookings.
- Facilities and categories are joined for detailed room info.

### Frontend

**Key Files:**

- `roomeet/src/components/room/components/Room.tsx` — Room selection and calendar, fetches `/room` and `/room/fas`.
- `roomeet/src/components/book/components/BookFormSingle.tsx` — Checks room availability via `/room/search-avail`.

**Frontend Flow:**

- User can view all rooms, see facilities, and check availability for booking.

---

## 4. Tab/Meeting Info (for Room Displays)

### Backend

**Controller:** `mrbapp-be/controllers/TabController.js`
**Routes:** `mrbapp-be/routes/Tab.js` (mounted at `/be-api/tab`)

| Endpoint    | Method | Description                     | Controller Function |
| ----------- | ------ | ------------------------------- | ------------------- |
| `/room`     | GET    | Get room info by IP address     | `getRoomInfo`       |
| `/onmeet`   | GET    | Get current meeting for a room  | `onMeeting`         |
| `/nextmeet` | GET    | Get next meeting for a room     | `nextMeeting`       |
| `/prevmeet` | GET    | Get previous meeting for a room | `prevMeeting`       |

**Key Backend Details:**

- Used for room display panels to show current/next/previous meetings.

### Frontend

- Not directly used in main user/admin UI, but can be used for room display devices.

---

## 5. Notifications

### Backend

**Controller:** `mrbapp-be/controllers/NotificationController.js`
**Routes:** Registered in `routes/index.js` as `/be-api/notif` and `/be-api/notif/cron`

| Endpoint      | Method | Description                                | Controller Function |
| ------------- | ------ | ------------------------------------------ | ------------------- |
| `/notif`      | GET    | Send push notification to all user devices | `PushMultiNotif`    |
| `/notif/cron` | GET    | Get all scheduled notification crons       | `GetNotifCron`      |

**Key Backend Details:**

- Uses `web-push` for browser push notifications.
- Schedules notifications with `node-cron`.
- Notification subscriptions are managed during login.

### Frontend

- Push subscription is handled during login (`/login/page.tsx`), and sent to backend.
- Notifications are used for meeting reminders, approval, etc.

---

## 6. Middleware & Helpers

- **Authentication:** JWT-based, handled in `middleware/authentication.js`.
- **Booking Check:** Prevents double-booking, `middleware/bookcheck.js`.
- **Penalty:** Checks and enforces user penalties, `middleware/penalty.js`.
- **Database:** Connection pooling and query helpers in `helper/DbTransaction.js`.
- **Email:** Nodemailer setup and templates in `helper/Emailer.js` and `helper/EmailGen.js`.
- **OTP:** Generation and validation in `helper/OTPHandler.js`.
- **Booking Chores:** Automated cleanup and penalty logic in `helper/BookingChores.js`.

---

## 7. Design System & UI

- **UI Library:** Material UI (MUI) for all components.
- **Component Structure:**
  - `roomeet/src/common/` — Reusable form and UI components (inputs, dialogs, skeletons, etc.).
  - `roomeet/src/components/` — Feature-specific components (booking, admin, room, home, etc.).
- **State/Data:**
  - SWR for data fetching and caching.
  - React Hook Form for form state.
  - NextAuth for authentication/session.
- **Theme:**
  - `roomeet/src/app/theme.ts` — Custom MUI theme.

---

## 8. Deployment & Environment

- **Backend:**
  - Dockerized (`Dockerfile`, `Dockerfile.dev`, `Dockerfile.prod`).
  - Environment variables for DB, JWT, SMTP, etc.
  - See `mrbapp-be/README.md` for build and run instructions.
- **Frontend:**
  - Next.js app, environment variables in `.env` files.
  - Uses `NEXT_PUBLIC_APPURL` to point to backend API.

---

## 9. Summary of Integration

- All frontend API calls are routed to backend endpoints under `/be-api/`.
- Auth/session is managed via NextAuth and JWT, with refresh handled automatically.
- Booking, room, and user management are tightly integrated between frontend and backend.
- Notifications and emails are automated for booking events and reminders.

---

For further technical details, see the referenced files and code comments throughout the codebase.
