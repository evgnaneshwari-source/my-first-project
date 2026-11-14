const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const backendRoot = path.resolve(__dirname, '../../');

let dbPath;
if (process.env.DATABASE_PATH) {
  dbPath = path.isAbsolute(process.env.DATABASE_PATH)
    ? process.env.DATABASE_PATH
    : path.resolve(backendRoot, process.env.DATABASE_PATH);
} else if (process.env.VERCEL) {
  dbPath = path.join('/tmp', 'expense-tracker.db');
  const seedDbPath = path.resolve(backendRoot, 'database/expense-tracker.db');
  if (fs.existsSync(seedDbPath) && !fs.existsSync(dbPath)) {
    try {
      fs.copyFileSync(seedDbPath, dbPath);
    } catch (e) {
      console.warn('Could not seed /tmp database from repo:', e);
    }
  }
} else {
  const defaultPath = 'database/expense-tracker.db';
  dbPath = path.resolve(backendRoot, defaultPath);
}

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
