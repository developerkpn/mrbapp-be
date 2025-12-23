# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Roomeet is a room booking and management system backend built with Node.js/Express. This is a REST API that serves a Next.js frontend and handles room bookings, user authentication, notifications, and administrative functions.

## Development Commands

### Running the Application
- **Development**: `npm run server_dev` - Runs with nodemon and development environment
- **Production**: `npm run server_prod` - Runs with nodemon and production environment  
- **Basic server**: `npm run server` - Runs with node (development environment)

### Docker Development
- **Build dev image**: `docker buildx build --platform linux/arm64 -t faizbyp/mrbapp-be:x.x.x -f Dockerfile.dev --load .`
- **Build prod image**: `docker buildx build --platform linux/arm64 -t faizbyp/mrbapp-be:x.x.x -f Dockerfile.prod --load .`
- **Run dev container**: `docker run -p 5000:5000 --env-file .env.development faizbyp/mrbapp-be:x.x.x`
- **Run prod container**: `docker run -p 5000:5000 --env-file .env.production faizbyp/mrbapp-be:x.x.x`

### PM2 Process Management
The app uses PM2 for process management with `ecosystem.config.js` configuration.

## Architecture

### Core Application Structure
- **Entry point**: `index.js` - Main server file with HTTPS configuration, CORS setup, and middleware registration
- **Database**: MySQL with connection pooling (`config/db.js`)
- **Authentication**: JWT-based with refresh tokens
- **Environment**: Uses `.env.development` or `.env.production` based on NODE_ENV

### API Structure
All API endpoints are prefixed with `/be-api/`:
- `/be-api/user` - User management (auth, registration, password reset)
- `/be-api/book` - Booking management (CRUD, approval, check-in/out)
- `/be-api/room` - Room management (availability, details)
- `/be-api/tab` - Meeting display info for room tablets
- `/be-api/notif` - Push notifications

### Key Controllers
- **BookReqController.js**: Handles all booking operations with atomic transaction handling for availability checks, automatic booking approval, and race condition prevention
- **UserController.js**: Authentication with refresh token system, registration, password reset, OTP verification, and subscription management
- **RoomController.js**: Room availability and management with admin controls
- **NotificationController.js**: Push notification scheduling and delivery

### Middleware Chain
- **authentication.js**: JWT token validation and user session management
- **admincheck.js**: Admin role verification
- **bookcheck.js**: Prevents double-booking conflicts
- **penalty.js**: User penalty system enforcement
- **credential.js**: CORS credential handling

### Helper Modules
- **DbTransaction.js**: Database connection pool and transaction management
- **NotificationManager.js**: Cron-based notification scheduling with web-push integration
- **BookingChores.js**: Automated booking status updates, penalty system enforcement, and cleanup tasks with mutex protection for concurrent execution
- **Emailer.js**: Email sending with nodemailer including booking approval/rejection notifications
- **EmailGen.js**: Email template generation for various booking events
- **OTPHandler.js**: OTP generation and validation
- **helper.js**: Timezone conversion utilities for Asia/Jakarta

### Database Integration
- Uses MySQL2 with promise-based connection pooling
- Atomic transactions for booking operations to prevent race conditions
- Timezone handling for Asia/Jakarta

### Security Features
- JWT access/refresh token system with 30-second access tokens and 7-day refresh tokens
- Password hashing with bcryptjs
- CORS with whitelist configuration
- HTTPS with SSL certificates
- User penalty system for booking abuse prevention with automatic cancellation for late check-ins
- Transaction-level row locking (FOR UPDATE) to prevent race conditions in booking operations

### Real-time Features
- Web push notifications for booking reminders
- Cron-based scheduling for automated tasks
- Email notifications for booking events

### File Structure Patterns
- Controllers handle business logic and HTTP responses
- Routes define endpoint mappings and middleware chains  
- Helpers contain reusable utilities and external service integrations
- Middleware handles cross-cutting concerns like auth and validation

## Environment Configuration

The application requires environment-specific files (`.env.development`, `.env.production`) with:
- MySQL database connection parameters
- JWT secrets for token signing
- SMTP configuration for emails
- Web push VAPID keys for notifications
- SSL certificate paths for HTTPS

## Important Notes

- Server runs on HTTPS by default with SSL certificates in `/ssl/` directory
- All booking operations use atomic transactions with row locking to prevent race conditions
- Bookings are automatically approved upon creation (no manual approval process)
- Automatic cancellation system for bookings where users fail to check in within 15 minutes
- Notification system uses cron scheduling with timezone awareness and mutex protection
- The application includes comprehensive penalty system with escalating consequences for booking management
- Email notifications are sent for booking approvals, rejections, and automatic cancellations  
- Static files are served from `/public/` directory at `/be-api/static/` endpoint
- QR code integration for easy check-in/check-out functionality