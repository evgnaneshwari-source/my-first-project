const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const backendRoot = path.resolve(__dirname, '../../');
const dbRelativePath = process.env.DATABASE_PATH || 'database/expense-tracker.db';
const dbPath = path.isAbsolute(dbRelativePath)
  ? dbRelativePath
  : path.resolve(backendRoot, dbRelativePath);

// Ensure the directory for the database file exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Initialize database
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Execute schema to ensure tables and indexes exist
const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

module.exports = db;
