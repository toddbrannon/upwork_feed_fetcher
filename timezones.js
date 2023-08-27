// timezones.js
const { registerTimezone, setTimezone } = require('timezone-support');

// Register the timezones you intend to use
registerTimezone('America/Chicago');

// Set the default timezone
setTimezone('America/Chicago');

module.exports = {}; // Export an empty object (or any other content if needed)
