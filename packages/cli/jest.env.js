const { config } = require('dotenv');

// Load .env file if it exists (for local development)
config({ path: '.env', quiet: true });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
