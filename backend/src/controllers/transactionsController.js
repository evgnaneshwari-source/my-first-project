const db = require('../config/database');

function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return (
    dateObj.getFullYear() === y &&
    dateObj.getMonth() === m - 1 &&
    dateObj.getDate() === d
  );
}

function parseIntegerId(idParam) {
  const num = Number(idParam);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

function validateTransactionPayload(body) {
  const { title, amount, category, type, date, description } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return 'Title is required and must be a non-empty string.';
  }

  const numAmount = Number(amount);
  if (amount === undefined || amount === null || Number.isNaN(numAmount) || numAmount <= 0) {
    return 'Amount must be a number greater than 0.';
  }

  if (!category || typeof category !== 'string' || category.trim().length === 0) {
    return 'Category is required and must be a non-empty string.';
  }

  if (type !== 'income' && type !== 'expense') {
    return 'Type must be either "income" or "expense".';
  }

  if (!isValidDateString(date)) {
    return 'Date must be a valid date in YYYY-MM-DD format.';
  }

  return null;
}

// GET /api/transactions
function getAllTransactions(req, res, next) {
  try {
    const stmt = db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC');
    const rows = stmt.all();
    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/transactions/:id
function getTransactionById(req, res, next) {
  try {
    const id = parseIntegerId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: transaction ID must be a positive integer.',
      });
    }

    const stmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const row = stmt.get(id);

    if (!row) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: row,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/transactions
function createTransaction(req, res, next) {
  try {
    const validationError = validateTransactionPayload(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError,
      });
    }

    const { title, amount, category, type, date, description } = req.body;
    const cleanTitle = title.trim();
    const cleanAmount = Math.round(Number(amount) * 100) / 100;
    const cleanCategory = category.trim();
    const cleanDesc = description ? String(description).trim() : '';

    const stmt = db.prepare(`
      INSERT INTO transactions (title, amount, category, type, date, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(cleanTitle, cleanAmount, cleanCategory, type, date, cleanDesc);
    const createdStmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const created = createdStmt.get(result.lastInsertRowid);

    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/transactions/:id
function updateTransaction(req, res, next) {
  try {
    const id = parseIntegerId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: transaction ID must be a positive integer.',
      });
    }

    const checkStmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const existing = checkStmt.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} not found.`,
      });
    }

    const validationError = validateTransactionPayload(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError,
      });
    }

    const { title, amount, category, type, date, description } = req.body;
    const cleanTitle = title.trim();
    const cleanAmount = Math.round(Number(amount) * 100) / 100;
    const cleanCategory = category.trim();
    const cleanDesc = description !== undefined ? String(description).trim() : existing.description;

    const stmt = db.prepare(`
      UPDATE transactions
      SET title = ?, amount = ?, category = ?, type = ?, date = ?, description = ?
      WHERE id = ?
    `);

    stmt.run(cleanTitle, cleanAmount, cleanCategory, type, date, cleanDesc, id);
    const updated = checkStmt.get(id);

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/transactions/:id
function deleteTransaction(req, res, next) {
  try {
    const id = parseIntegerId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: transaction ID must be a positive integer.',
      });
    }

    const checkStmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const existing = checkStmt.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} not found.`,
      });
    }

    const stmt = db.prepare('DELETE FROM transactions WHERE id = ?');
    stmt.run(id);

    return res.status(200).json({
      success: true,
      message: `Transaction ${id} deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};
