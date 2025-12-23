import { check, group } from "k6";
import http from "k6/http";
import { Counter, Rate, Trend } from "k6/metrics";

// Custom metrics for race condition analysis
const bookingConflicts = new Counter("booking_conflicts");
const bookingSuccesses = new Counter("booking_successes");
const authFailures = new Counter("auth_failures");
const bookingSuccessRate = new Rate("booking_success_rate");
const responseTime = new Trend("booking_response_time");

// Test configuration
const BASE_URL = __ENV.BASE_URL || "https://localhost:5001";
const TEST_USERS = [
  { username: "Ben", password: "ADMIN" },
  { username: "Ben2", password: "ADMIN" },
  { username: "Ben3", password: "ADMIN" },
];

// Test scenarios configuration
export const options = {
  // SSL configuration for self-signed certificates
  insecureSkipTLSVerify: true,

  cloud: {
    distribution: {
      "amazon:us:ashburn": { loadZone: "amazon:us:ashburn", percent: 100 },
    },
    apm: [],
  },

  scenarios: {
    // High concurrency race condition test
    race_condition_burst: {
      executor: "per-vu-iterations",
      vus: 5,
      iterations: 1,
      maxDuration: "15s",
      exec: "raceConditionTest",
    },

    // Medium race condition test
    race_condition_medium: {
      executor: "per-vu-iterations",
      vus: 10,
      iterations: 1,
      maxDuration: "20s",
      exec: "raceConditionTest",
      startTime: "20s",
    },

    // Overlapping bookings
    overlapping_bookings: {
      executor: "constant-arrival-rate",
      rate: 10,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 5,
      maxVUs: 15,
      exec: "overlappingBookingsTest",
      startTime: "45s",
    },

    // Rapid successive bookings (same user)
    rapid_successive: {
      executor: "per-vu-iterations",
      vus: 3,
      iterations: 3,
      maxDuration: "60s",
      exec: "rapidSuccessiveTest",
      startTime: "80s",
    },
  },

  thresholds: {
    http_req_duration: ["p(95)<3000"], // 95% of requests under 3 seconds (cloud latency)
    booking_success_rate: ["rate<0.15"], // Expect low success rate due to conflicts
    booking_conflicts: ["count>10"], // Reduced for smaller VU count (5+10=15 max conflicts)
    http_req_failed: ["rate<0.1"], // Less than 10% failures (more lenient for cloud/ngrok)
  },
};

// Shared authentication tokens (simulate real-world token sharing)
let authTokens = {};

export function setup() {
  console.log("Setting up test data...");

  // Pre-authenticate all users
  for (let i = 0; i < TEST_USERS.length; i++) {
    const user = TEST_USERS[i];
    const authResponse = authenticate(user.username, user.password);
    if (authResponse && authResponse.accessToken) {
      authTokens[user.username] = authResponse;
    }
  }

  return { authTokens };
}

// Authentication function with retry logic
function authenticate(username, password, retries = 3) {
  const loginPayload = {
    username: username,
    password: password,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = http.post(`${BASE_URL}/be-api/user/login`, JSON.stringify(loginPayload), {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true", // Required for ngrok free tier
      },
      tags: { name: "auth" },
    });

    console.log(`Auth attempt ${attempt}/${retries} for ${username}: ${response.status}`);

    if (response.status === 200) {
      const body = JSON.parse(response.body);
      console.log(`Auth success for ${username}: ${body.data.id_user}`);
      return {
        accessToken: body.data.accessToken,
        userId: body.data.id_user,
        userName: body.data.name,
      };
    } else if (attempt < retries) {
      console.log(`Auth failed for ${username}, retrying... (${response.status})`);
      // Small delay before retry
      http.batch([]);
    } else {
      authFailures.add(1);
      console.log(`Auth failed for ${username} after ${retries} attempts: ${response.status} - ${response.body}`);
      return null;
    }
  }
}

// Generate booking data for the same room and time slot (race condition target)
function generateRaceConditionBooking() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const bookDate = tomorrow.toISOString().split("T")[0];

  return {
    id_ruangan: "ROOM001", // Same room for all concurrent requests
    id_user: "", // Will be set based on authenticated user
    agenda: `Race Condition Test Meeting ${Math.random()}`,
    remark: "K6 load testing concurrent bookings",
    book_date: bookDate,
    time_start: "10:00:00", // Same time slot
    time_end: "11:00:00", // Same time slot
    category: "Meeting",
    participant: 5,
    facility: [],
  };
}

// Generate overlapping booking data
function generateOverlappingBooking(offset = 0) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const bookDate = tomorrow.toISOString().split("T")[0];

  const startHour = 14 + Math.floor(offset / 4); // Different but overlapping times
  const startMinute = (offset % 4) * 15;
  const endHour = startHour + 1;
  const endMinute = startMinute;

  return {
    id_ruangan: "ROOM002",
    id_user: "",
    agenda: `Overlapping Test Meeting ${offset}`,
    remark: "K6 load testing overlapping bookings",
    book_date: bookDate,
    time_start: `${startHour.toString().padStart(2, "0")}:${startMinute.toString().padStart(2, "0")}:00`,
    time_end: `${endHour.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")}:00`,
    category: "Meeting",
    participant: 3,
    facility: [],
  };
}

// Main race condition test - multiple users booking same slot simultaneously
export function raceConditionTest(data) {
  group("Race Condition Test - Same Room & Time", () => {
    // Get authentication
    const userIndex = __VU % TEST_USERS.length;
    const user = TEST_USERS[userIndex];

    let auth = data.authTokens[user.username];

    // Authenticate if no token available
    if (!auth) {
      auth = authenticate(user.username, user.password);
      if (!auth) return;
    }

    // Generate booking for exact same slot
    const bookingData = generateRaceConditionBooking();
    bookingData.id_user = auth.userId;

    const payload = { data: bookingData };

    const startTime = Date.now();
    const response = http.post(`${BASE_URL}/be-api/book/`, JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.accessToken}`,
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true", // Required for ngrok free tier
      },
      tags: { name: "race_condition_booking" },
    });

    const duration = Date.now() - startTime;
    responseTime.add(duration);

    // Check results
    const success = check(response, {
      "status is 200 or 400": (r) => r.status === 200 || r.status === 400,
      "response has message": (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.hasOwnProperty("message");
        } catch {
          return false;
        }
      },
    });

    if (response.status === 200) {
      bookingSuccesses.add(1);
      bookingSuccessRate.add(true);
      console.log(`VU${__VU}: Booking SUCCESS - ${response.body}`);
    } else if (response.status === 400) {
      bookingConflicts.add(1);
      bookingSuccessRate.add(false);
      console.log(`VU${__VU}: Booking CONFLICT - ${response.body}`);
    } else {
      console.log(`VU${__VU}: Unexpected response ${response.status} - ${response.body}`);
      bookingSuccessRate.add(false);
    }
  });
}

// Overlapping bookings test
export function overlappingBookingsTest(data) {
  group("Overlapping Bookings Test", () => {
    const userIndex = __VU % TEST_USERS.length;
    const user = TEST_USERS[userIndex];

    // Always authenticate fresh for overlapping tests (tokens expire after 30s)
    let auth = authenticate(user.username, user.password);
    if (!auth) return;

    const bookingData = generateOverlappingBooking(__ITER);
    bookingData.id_user = auth.userId;

    const payload = { data: bookingData };

    const response = http.post(`${BASE_URL}/be-api/book/`, JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.accessToken}`,
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      tags: { name: "overlapping_booking" },
    });

    console.log(
      `VU${__VU}: Overlapping booking ${bookingData.id_ruangan} ${bookingData.time_start}-${bookingData.time_end}: ${response.status} - ${response.body}`
    );

    check(response, {
      "overlapping booking response valid": (r) => r.status === 200 || r.status === 400,
    });

    if (response.status === 200) {
      bookingSuccesses.add(1);
    } else if (response.status === 400) {
      bookingConflicts.add(1);
    }
  });
}

// Rapid successive bookings test (same user, different slots)
export function rapidSuccessiveTest(data) {
  group("Rapid Successive Bookings Test", () => {
    const testId = `VU${__VU}-IT${__ITER}`;
    console.log(`[${testId}] Starting rapid successive test`);

    const user = TEST_USERS[0]; // Use same user for all
    console.log(`[${testId}] Using user: ${user.username}`);

    // Always authenticate fresh for rapid tests (tokens expire after 30s)
    let auth = authenticate(user.username, user.password);
    if (!auth) {
      console.log(`[${testId}] FAILED: Authentication failed`);
      return;
    }
    console.log(`[${testId}] Authentication successful, userId: ${auth.userId}`);

    // Different time slots to avoid direct conflicts
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const bookDate = tomorrow.toISOString().split("T")[0];

    const hour = 16 + (__ITER % 3); // Vary the hour
    const minute = (__ITER % 4) * 15; // Vary the minute (0, 15, 30, 45)

    // Calculate end time properly, handling minute overflow
    const endTotalMinutes = minute + 30; // Add 30 minutes duration
    const endHour = hour + Math.floor(endTotalMinutes / 60); // Handle hour overflow
    const endMinute = endTotalMinutes % 60; // Handle minute overflow

    const bookingData = {
      id_ruangan: __VU % 3 === 0 ? "ROOM002" : __VU % 3 === 1 ? "ROOM003" : "ROOM004", // Cycle between ROOM002, ROOM003, ROOM004
      id_user: auth.userId,
      agenda: `Rapid Test ${testId}`,
      remark: "K6 rapid successive booking test",
      book_date: bookDate,
      time_start: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:00`,
      time_end: `${endHour.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")}:00`,
      category: "Meeting",
      participant: 2,
      facility: [],
    };

    console.log(
      `[${testId}] Booking request: ${bookingData.id_ruangan} ${bookingData.time_start}-${bookingData.time_end} on ${bookingData.book_date}`
    );

    const payload = { data: bookingData };
    const startTime = Date.now();

    const response = http.post(`${BASE_URL}/be-api/book/`, JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.accessToken}`,
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      tags: { name: "rapid_successive" },
    });

    const duration = Date.now() - startTime;
    console.log(`[${testId}] Response: ${response.status} (${duration}ms)`);

    if (response.body) {
      try {
        const responseBody = JSON.parse(response.body);
        if (responseBody.id_ticket) {
          console.log(`[${testId}] SUCCESS: Booking created with ticket ${responseBody.id_ticket}`);
        } else {
          console.log(`[${testId}] Response body: ${JSON.stringify(responseBody)}`);
        }
      } catch (e) {
        console.log(`[${testId}] Raw response: ${response.body.substring(0, 200)}`);
      }
    }

    check(response, {
      "rapid booking response valid": (r) => r.status === 200 || r.status === 400 || r.status === 401,
    });

    if (response.status === 200) {
      bookingSuccesses.add(1);
      console.log(`[${testId}] ✅ BOOKING SUCCESS`);
    } else if (response.status === 400) {
      bookingConflicts.add(1);
      console.log(`[${testId}] ❌ BOOKING CONFLICT`);
    } else if (response.status === 401) {
      authFailures.add(1);
      console.log(`[${testId}] 🔐 AUTH FAILED - Token expired`);
    } else {
      console.log(`[${testId}] ⚠️  UNEXPECTED STATUS: ${response.status}`);
    }
  });
}
