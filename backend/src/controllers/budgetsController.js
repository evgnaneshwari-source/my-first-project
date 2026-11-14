const db = require('../config/database');

function parseIntegerId(idParam) {
  const num = Number(idParam);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

function parseMonth(monthParam) {
  const num = Number(monthParam);
  if (!Number.isInteger(num) || num < 1 || num > 12) {
    return null;
  }
  return num;
}

function parseYear(yearParam) {
  const num = Number(yearParam);
  if (!Number.isInteger(num) || num < 1900 || num > 2100) {
    return null;
  }
  return num;
}

// GET /api/budgets/:year/:month
function getBudgetByMonth(req, res, next) {
  try {
    const year = parseYear(req.params.year);
    const month = parseMonth(req.params.month);

    if (!year) {
      return res.status(400).json({
        success: false,
        error: 'Invalid year: must be a 4-digit integer between 1900 and 2100.',
      });
    }

    if (!month) {
      return res.status(400).json({
        success: false,
        error: 'Invalid month: must be an integer between 1 and 12.',
      });
    }

    const stmt = db.prepare('SELECT * FROM monthly_budgets WHERE year = ? AND month = ?');
    const row = stmt.get(year, month);

    if (!row) {
      return res.status(404).json({
        success: false,
        error: `No budget configured for ${year}-${String(month).padStart(2, '0')}.`,
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

// POST /api/budgets
function createBudget(req, res, next) {
  try {
    const { year, month, amount } = req.body;

    const parsedYear = parseYear(year);
    const parsedMonth = parseMonth(month);
    const parsedAmount = Number(amount);

    if (!parsedYear) {
      return res.status(400).json({
        success: false,
        error: 'Year is required and must be an integer between 1900 and 2100.',
      });
    }

    if (!parsedMonth) {
      return res.status(400).json({
        success: false,
        error: 'Month is required and must be an integer between 1 and 12.',
      });
    }

    if (amount === undefined || amount === null || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount is required and must be a number greater than 0.',
      });
    }

    const checkStmt = db.prepare('SELECT * FROM monthly_budgets WHERE year = ? AND month = ?');
    const existing = checkStmt.get(parsedYear, parsedMonth);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A budget for ${parsedYear}-${String(parsedMonth).padStart(2, '0')} already exists. Use PUT to update it.`,
        data: existing,
      });
    }

    const cleanAmount = Math.round(parsedAmount * 100) / 100;
    const insertStmt = db.prepare(`
      INSERT INTO monthly_budgets (year, month, amount)
      VALUES (?, ?, ?)
    `);

    const result = insertStmt.run(parsedYear, parsedMonth, cleanAmount);
    const createdStmt = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?');
    const created = createdStmt.get(result.lastInsertRowid);

    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/budgets/:id
function updateBudget(req, res, next) {
  try {
    const id = parseIntegerId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: budget ID must be a positive integer.',
      });
    }

    const checkStmt = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?');
    const existing = checkStmt.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Budget with ID ${id} not found.`,
      });
    }

    const { amount } = req.body;
    const parsedAmount = Number(amount);

    if (amount === undefined || amount === null || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a number greater than 0.',
      });
    }

    const cleanAmount = Math.round(parsedAmount * 100) / 100;
    const updateStmt = db.prepare('UPDATE monthly_budgets SET amount = ? WHERE id = ?');
    updateStmt.run(cleanAmount, id);

    const updated = checkStmt.get(id);

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBudgetByMonth,
  createBudget,
  updateBudget,
};
