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

function validateSubscriptionPayload(body) {
  const { name, amount, billing_cycle, category, renewal_date, status, is_unused } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return 'Subscription name is required and must be a non-empty string.';
  }

  const numAmount = Number(amount);
  if (amount === undefined || amount === null || Number.isNaN(numAmount) || numAmount <= 0) {
    return 'Amount must be a number greater than 0.';
  }

  if (billing_cycle !== 'monthly' && billing_cycle !== 'yearly') {
    return 'Billing cycle must be either "monthly" or "yearly".';
  }

  if (!category || typeof category !== 'string' || category.trim().length === 0) {
    return 'Category is required and must be a non-empty string.';
  }

  if (!isValidDateString(renewal_date)) {
    return 'Renewal date must be a valid date in YYYY-MM-DD format.';
  }

  if (status !== undefined && !['active', 'cancelled', 'expired'].includes(status)) {
    return 'Status must be "active", "cancelled", or "expired".';
  }

  if (is_unused !== undefined && ![0, 1, true, false].includes(is_unused)) {
    return 'is_unused must be a boolean or 0/1 integer.';
  }

  return null;
}

// GET /api/subscriptions
function getAllSubscriptions(req, res, next) {
  try {
    const stmt = db.prepare('SELECT * FROM subscriptions ORDER BY renewal_date ASC, id DESC');
    const rows = stmt.all();
    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/subscriptions/:id
function getSubscriptionById(req, res, next) {
  try {
    const id = parseIntegerId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: subscription ID must be a positive integer.',
      });
    }

    const stmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
    const row = stmt.get(id);

    if (!row) {
      return res.status(404).json({
        success: false,
        error: `Subscription with ID ${id} not found.`,
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

// POST /api/subscriptions
function createSubscription(req, res, next) {
  try {
    const validationError = validateSubscriptionPayload(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError,
      });
    }

    const {
      name,
      amount,
      billing_cycle,
      category,
      renewal_date,
      status = 'active',
      is_unused = 0,
      description,
    } = req.body;

    const cleanName = name.trim();
    const cleanAmount = Math.round(Number(amount) * 100) / 100;
    const cleanCategory = category.trim();
    const cleanStatus = status || 'active';
    const cleanUnused = is_unused ? 1 : 0;
    const cleanDesc = description ? String(description).trim() : '';

    const stmt = db.prepare(`
      INSERT INTO subscriptions (name, amount, billing_cycle, category, renewal_date, status, is_unused, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      cleanName,
      cleanAmount,
      billing_cycle,
      cleanCategory,
      renewal_date,
      cleanStatus,
      cleanUnused,
      cleanDesc
    );

    const createdStmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
    const created = createdStmt.get(result.lastInsertRowid);

    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/subscriptions/:id
function updateSubscription(req, res, next) {
  try {
    const id = parseIntegerId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: subscription ID must be a positive integer.',
      });
    }

    const checkStmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
    const existing = checkStmt.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Subscription with ID ${id} not found.`,
      });
    }

    const validationError = validateSubscriptionPayload(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError,
      });
    }

    const {
      name,
      amount,
      billing_cycle,
      category,
      renewal_date,
      status,
      is_unused,
      description,
    } = req.body;

    const cleanName = name.trim();
    const cleanAmount = Math.round(Number(amount) * 100) / 100;
    const cleanCategory = category.trim();
    const cleanStatus = status !== undefined ? status : existing.status;
    const cleanUnused = is_unused !== undefined ? (is_unused ? 1 : 0) : existing.is_unused;
    const cleanDesc = description !== undefined ? String(description).trim() : existing.description;

    const stmt = db.prepare(`
      UPDATE subscriptions
      SET name = ?, amount = ?, billing_cycle = ?, category = ?, renewal_date = ?, status = ?, is_unused = ?, description = ?
      WHERE id = ?
    `);

    stmt.run(
      cleanName,
      cleanAmount,
      billing_cycle,
      cleanCategory,
      renewal_date,
      cleanStatus,
      cleanUnused,
      cleanDesc,
      id
    );

    const updated = checkStmt.get(id);

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/subscriptions/:id
function deleteSubscription(req, res, next) {
  try {
    const id = parseIntegerId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID: subscription ID must be a positive integer.',
      });
    }

    const checkStmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
    const existing = checkStmt.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Subscription with ID ${id} not found.`,
      });
    }

    const stmt = db.prepare('DELETE FROM subscriptions WHERE id = ?');
    stmt.run(id);

    return res.status(200).json({
      success: true,
      message: `Subscription ${id} deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllSubscriptions,
  getSubscriptionById,
  createSubscription,
  updateSubscription,
  deleteSubscription,
};
