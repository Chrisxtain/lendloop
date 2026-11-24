import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Flip tools to "on loan" when a future booking's start date arrives (UTC).
// Hourly rather than daily so a missed run can never leave a tool wrong for long.
crons.interval("activate started bookings", { hours: 1 }, internal.loans.activateStartedBookings, {});

export default crons;
