/**
 * storage.js
 * Centralized persistence module using LocalStorage.
 * Designed with an API-ready interface so each method can be replaced
 * with async REST API calls (Node.js / Express.js / SQL) without modifying UI logic.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'clearledger_transactions_v1',
  BUDGET: 'clearledger_budget_v1',
  INITIALIZED: 'clearledger_initialized_v1',
};

export const EXPENSE_CATEGORIES = [
  'Food',
  'Housing',
  'Transport',
  'Utilities',
  'Healthcare',
  'Entertainment',
  'Shopping',
  'Education',
  'Other',
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Bonus',
  'Rental',
  'Refund',
  'Other',
];

export function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthISO() {
  return getTodayISO().slice(0, 7);
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `txn_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Generates realistic seed transactions anchored relative to the current date
 * so first-time users immediately see populated charts and monthly metrics.
 */
function buildSampleTransactions() {
  const now = new Date();
  const shiftMonth = (monthsAgo, day) => {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, Math.min(day, 28));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  return [
    {
      id: 'txn_seed_01',
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: shiftMonth(0, 1),
      description: 'Primary engineering payroll deposit',
    },
    {
      id: 'txn_seed_02',
      title: 'Apartment Rent',
      amount: 1650,
      category: 'Housing',
      type: 'expense',
      date: shiftMonth(0, 2),
      description: 'Monthly lease payment',
    },
    {
      id: 'txn_seed_03',
      title: 'Trader Joe’s Market',
      amount: 214.5,
      category: 'Food',
      type: 'expense',
      date: shiftMonth(0, 4),
      description: 'Weekly groceries and pantry staples',
    },
    {
      id: 'txn_seed_04',
      title: 'Electric & Fiber Internet',
      amount: 168.0,
      category: 'Utilities',
      type: 'expense',
      date: shiftMonth(0, 6),
      description: 'Monthly utility and broadband billing',
    },
    {
      id: 'txn_seed_05',
      title: 'UI Design Advisory',
      amount: 850,
      category: 'Freelance',
      type: 'income',
      date: shiftMonth(0, 8),
      description: 'Client sprint consultation invoice #104',
    },
    {
      id: 'txn_seed_06',
      title: 'Transit Pass & Fuel',
      amount: 142.75,
      category: 'Transport',
      type: 'expense',
      date: shiftMonth(0, 9),
      description: 'Commuter rail pass and weekend fuel',
    },
    {
      id: 'txn_seed_07',
      title: 'Dental Checkup',
      amount: 185,
      category: 'Healthcare',
      type: 'expense',
      date: shiftMonth(0, 10),
      description: 'Routine cleaning and co-pay',
    },
    {
      id: 'txn_seed_08',
      title: 'Whole Foods & Coffee',
      amount: 196.4,
      category: 'Food',
      type: 'expense',
      date: shiftMonth(0, 11),
      description: 'Fresh produce and specialty coffee beans',
    },
    {
      id: 'txn_seed_09',
      title: 'Ergonomic Desk Lamp',
      amount: 129,
      category: 'Shopping',
      type: 'expense',
      date: shiftMonth(0, 12),
      description: 'Home office lighting upgrade',
    },
    {
      id: 'txn_seed_10',
      title: 'Cinema & Dinner',
      amount: 94.2,
      category: 'Entertainment',
      type: 'expense',
      date: shiftMonth(0, 13),
      description: 'Friday evening dinner and tickets',
    },
    // Previous Month (-1)
    {
      id: 'txn_seed_11',
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: shiftMonth(1, 1),
      description: 'Primary engineering payroll deposit',
    },
    {
      id: 'txn_seed_12',
      title: 'Apartment Rent',
      amount: 1650,
      category: 'Housing',
      type: 'expense',
      date: shiftMonth(1, 2),
      description: 'Monthly lease payment',
    },
    {
      id: 'txn_seed_13',
      title: 'Grocery & Household',
      amount: 482.3,
      category: 'Food',
      type: 'expense',
      date: shiftMonth(1, 9),
      description: 'Monthly grocery runs',
    },
    {
      id: 'txn_seed_14',
      title: 'Utilities Bundle',
      amount: 162.1,
      category: 'Utilities',
      type: 'expense',
      date: shiftMonth(1, 14),
      description: 'Power, water, and internet',
    },
    {
      id: 'txn_seed_15',
      title: 'Quarterly Dividend',
      amount: 320,
      category: 'Investments',
      type: 'income',
      date: shiftMonth(1, 19),
      description: 'Index ETF quarterly distribution',
    },
    {
      id: 'txn_seed_16',
      title: 'Annual Tech Course',
      amount: 240,
      category: 'Education',
      type: 'expense',
      date: shiftMonth(1, 22),
      description: 'Systems architecture workshop',
    },
    // Two Months Ago (-2)
    {
      id: 'txn_seed_17',
      title: 'Monthly Salary',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: shiftMonth(2, 1),
      description: 'Monthly payroll deposit',
    },
    {
      id: 'txn_seed_18',
      title: 'Apartment Rent',
      amount: 1650,
      category: 'Housing',
      type: 'expense',
      date: shiftMonth(2, 2),
      description: 'Monthly lease payment',
    },
    {
      id: 'txn_seed_19',
      title: 'Supermarket & Dining',
      amount: 530,
      category: 'Food',
      type: 'expense',
      date: shiftMonth(2, 12),
      description: 'Groceries and dining out',
    },
    {
      id: 'txn_seed_20',
      title: 'Regional Rail & Transit',
      amount: 175,
      category: 'Transport',
      type: 'expense',
      date: shiftMonth(2, 18),
      description: 'Travel pass and rideshares',
    },
    // Three Months Ago (-3)
    {
      id: 'txn_seed_21',
      title: 'Monthly Salary',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: shiftMonth(3, 1),
      description: 'Monthly payroll deposit',
    },
    {
      id: 'txn_seed_22',
      title: 'Apartment Rent',
      amount: 1650,
      category: 'Housing',
      type: 'expense',
      date: shiftMonth(3, 2),
      description: 'Monthly lease payment',
    },
    {
      id: 'txn_seed_23',
      title: 'Groceries & Produce',
      amount: 445,
      category: 'Food',
      type: 'expense',
      date: shiftMonth(3, 15),
      description: 'Weekly food shopping',
    },
    {
      id: 'txn_seed_24',
      title: 'Utilities & Mobile',
      amount: 190,
      category: 'Utilities',
      type: 'expense',
      date: shiftMonth(3, 20),
      description: 'Electricity and mobile plan',
    },
  ];
}

function buildSampleBudget() {
  return {
    monthlyLimit: 3200,
    month: getCurrentMonthISO(),
    updatedAt: getTodayISO(),
  };
}

function safeReadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (err) {
    console.error(`Failed reading ${key} from LocalStorage:`, err);
    return fallback;
  }
}

function safeWriteJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`Failed writing ${key} to LocalStorage:`, err);
    return false;
  }
}

function normalizeTransaction(raw) {
  return {
    id: String(raw.id || generateId()),
    title: String(raw.title || '').trim(),
    amount: Math.round((Number(raw.amount) || 0) * 100) / 100,
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || getTodayISO()).slice(0, 10),
    description: String(raw.description || '').trim(),
  };
}

/**
 * Initializes LocalStorage once on first visit.
 * If the user later clears data intentionally, the initialized flag prevents re-seeding.
 */
export function initializeStorage() {
  const alreadyInitialized = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
  if (!alreadyInitialized) {
    safeWriteJSON(STORAGE_KEYS.TRANSACTIONS, buildSampleTransactions());
    safeWriteJSON(STORAGE_KEYS.BUDGET, buildSampleBudget());
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  }
}

/**
 * Retrieve all transactions.
 * Future REST mapping: GET /api/transactions
 */
export function getTransactions() {
  initializeStorage();
  const list = safeReadJSON(STORAGE_KEYS.TRANSACTIONS, []);
  if (!Array.isArray(list)) return [];
  return list.map(normalizeTransaction);
}

/**
 * Save a new transaction.
 * Future REST mapping: POST /api/transactions
 */
export function saveTransaction(transactionInput) {
  const transactions = getTransactions();
  const created = normalizeTransaction({
    ...transactionInput,
    id: transactionInput.id || generateId(),
  });
  transactions.unshift(created);
  safeWriteJSON(STORAGE_KEYS.TRANSACTIONS, transactions);
  return created;
}

/**
 * Update an existing transaction by ID.
 * Future REST mapping: PUT /api/transactions/:id
 */
export function updateTransaction(id, updatedFields) {
  const transactions = getTransactions();
  const index = transactions.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const updated = normalizeTransaction({
    ...transactions[index],
    ...updatedFields,
    id,
  });
  transactions[index] = updated;
  safeWriteJSON(STORAGE_KEYS.TRANSACTIONS, transactions);
  return updated;
}

/**
 * Delete a transaction by ID.
 * Future REST mapping: DELETE /api/transactions/:id
 */
export function deleteTransaction(id) {
  const transactions = getTransactions();
  const next = transactions.filter((item) => item.id !== id);
  const removed = next.length !== transactions.length;
  if (removed) {
    safeWriteJSON(STORAGE_KEYS.TRANSACTIONS, next);
  }
  return removed;
}

/**
 * Retrieve budget configuration.
 * Future REST mapping: GET /api/budget
 */
export function getBudget() {
  initializeStorage();
  const raw = safeReadJSON(STORAGE_KEYS.BUDGET, null);
  if (!raw || typeof raw !== 'object') {
    return {
      monthlyLimit: 0,
      month: getCurrentMonthISO(),
      updatedAt: getTodayISO(),
    };
  }
  return {
    monthlyLimit: Math.max(0, Number(raw.monthlyLimit) || 0),
    month: String(raw.month || getCurrentMonthISO()),
    updatedAt: String(raw.updatedAt || getTodayISO()),
  };
}

/**
 * Save budget configuration.
 * Future REST mapping: PUT /api/budget
 */
export function saveBudget(budgetInput) {
  const current = getBudget();
  const next = {
    monthlyLimit: Math.max(0, Math.round((Number(budgetInput.monthlyLimit) || 0) * 100) / 100),
    month: String(budgetInput.month || current.month || getCurrentMonthISO()),
    updatedAt: getTodayISO(),
  };
  safeWriteJSON(STORAGE_KEYS.BUDGET, next);
  return next;
}

/**
 * Reset LocalStorage to the curated sample dataset.
 */
export function resetToSampleData() {
  const sampleTxns = buildSampleTransactions();
  const sampleBudget = buildSampleBudget();
  safeWriteJSON(STORAGE_KEYS.TRANSACTIONS, sampleTxns);
  safeWriteJSON(STORAGE_KEYS.BUDGET, sampleBudget);
  localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  return { transactions: sampleTxns, budget: sampleBudget };
}

/**
 * Clear all transactions and reset budget to 0.
 */
export function clearAllData() {
  safeWriteJSON(STORAGE_KEYS.TRANSACTIONS, []);
  safeWriteJSON(STORAGE_KEYS.BUDGET, {
    monthlyLimit: 0,
    month: getCurrentMonthISO(),
    updatedAt: getTodayISO(),
  });
  localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
}
