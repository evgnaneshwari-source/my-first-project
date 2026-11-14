/**
 * storage.js
 * Centralized persistence module connected to the Express + SQLite backend.
 * Uses REST API endpoints via fetch() for all CRUD operations, with one-time
 * migration from LocalStorage if existing user data is detected.
 */

const API_BASE = '/api';

const STORAGE_KEYS = {
  TRANSACTIONS: 'clearledger_transactions_v1',
  BUDGET: 'clearledger_budget_v1',
  INITIALIZED: 'clearledger_initialized_v1',
  MIGRATED: 'clearledger_migrated_v1',
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

export const SUBSCRIPTION_CATEGORIES = [
  'Entertainment',
  'Education',
  'Shopping',
  'Fitness',
  'Software',
  'Utilities',
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

function normalizeTransaction(raw) {
  return {
    id: raw.id,
    title: String(raw.title || '').trim(),
    amount: Math.round((Number(raw.amount) || 0) * 100) / 100,
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || getTodayISO()).slice(0, 10),
    description: String(raw.description || '').trim(),
  };
}

/**
 * Migration helper:
 * Imports existing LocalStorage transactions & budget to the SQLite database once.
 * Sets STORAGE_KEYS.MIGRATED flag so it never runs again.
 * Leaves the original LocalStorage data untouched as a backup.
 */
export async function migrateFromLocalStorage() {
  const alreadyMigrated = localStorage.getItem(STORAGE_KEYS.MIGRATED);
  if (alreadyMigrated === 'true') {
    return { migrated: false, count: 0 };
  }

  let importedCount = 0;
  const localTxns = safeReadJSON(STORAGE_KEYS.TRANSACTIONS, []);
  const localBudget = safeReadJSON(STORAGE_KEYS.BUDGET, null);

  // Check if backend already has records
  let backendHasTxns = false;
  try {
    const res = await fetch(`${API_BASE}/transactions`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        backendHasTxns = true;
      }
    }
  } catch (err) {
    console.warn('Could not check backend transactions during migration:', err);
  }

  // Import local transactions if backend is empty
  if (!backendHasTxns && Array.isArray(localTxns) && localTxns.length > 0) {
    for (const txn of localTxns) {
      try {
        const res = await fetch(`${API_BASE}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: txn.title,
            amount: Number(txn.amount),
            category: txn.category,
            type: txn.type,
            date: txn.date,
            description: txn.description || '',
          }),
        });
        if (res.ok) importedCount += 1;
      } catch (err) {
        console.error('Failed to import transaction to SQLite:', err);
      }
    }
  }

  // Import local budget if present
  if (localBudget && Number(localBudget.monthlyLimit) > 0 && localBudget.month) {
    const [y, m] = String(localBudget.month).split('-').map(Number);
    if (y && m) {
      try {
        const res = await fetch(`${API_BASE}/budgets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year: y,
            month: m,
            amount: Number(localBudget.monthlyLimit),
          }),
        });
        if (res.ok) importedCount += 1;
      } catch (err) {
        console.error('Failed to import budget to SQLite:', err);
      }
    }
  }

  localStorage.setItem(STORAGE_KEYS.MIGRATED, 'true');
  return { migrated: true, count: importedCount };
}

/**
 * Retrieve all transactions from the SQLite database.
 * REST endpoint: GET /api/transactions
 */
export async function getTransactions() {
  const res = await fetch(`${API_BASE}/transactions`);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to fetch transactions (${res.status})`);
  }
  const json = await res.json();
  const list = json.data || [];
  return list.map(normalizeTransaction);
}

/**
 * Save a new transaction to the SQLite database.
 * REST endpoint: POST /api/transactions
 */
export async function saveTransaction(transactionInput) {
  const res = await fetch(`${API_BASE}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: transactionInput.title,
      amount: Number(transactionInput.amount),
      category: transactionInput.category,
      type: transactionInput.type,
      date: transactionInput.date,
      description: transactionInput.description || '',
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to save transaction (${res.status})`);
  }

  const json = await res.json();
  return normalizeTransaction(json.data);
}

/**
 * Update an existing transaction by ID in the SQLite database.
 * REST endpoint: PUT /api/transactions/:id
 */
export async function updateTransaction(id, updatedFields) {
  const res = await fetch(`${API_BASE}/transactions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: updatedFields.title,
      amount: Number(updatedFields.amount),
      category: updatedFields.category,
      type: updatedFields.type,
      date: updatedFields.date,
      description: updatedFields.description || '',
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to update transaction (${res.status})`);
  }

  const json = await res.json();
  return normalizeTransaction(json.data);
}

/**
 * Delete a transaction by ID in the SQLite database.
 * REST endpoint: DELETE /api/transactions/:id
 */
export async function deleteTransaction(id) {
  const res = await fetch(`${API_BASE}/transactions/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to delete transaction (${res.status})`);
  }

  return true;
}

/**
 * Retrieve budget for a specific month (YYYY-MM).
 * REST endpoint: GET /api/budgets/:year/:month
 */
export async function getBudget(monthISO = getCurrentMonthISO()) {
  const [year, month] = monthISO.split('-').map(Number);
  if (!year || !month) {
    return {
      id: null,
      monthlyLimit: 0,
      month: monthISO,
      updatedAt: getTodayISO(),
    };
  }

  const res = await fetch(`${API_BASE}/budgets/${year}/${month}`);
  if (res.status === 404) {
    return {
      id: null,
      monthlyLimit: 0,
      month: monthISO,
      updatedAt: getTodayISO(),
    };
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to fetch budget (${res.status})`);
  }

  const json = await res.json();
  const record = json.data;
  return {
    id: record.id,
    monthlyLimit: Number(record.amount) || 0,
    month: `${record.year}-${String(record.month).padStart(2, '0')}`,
    updatedAt: record.created_at || getTodayISO(),
  };
}

/**
 * Save or update budget configuration in the SQLite database.
 * Uses POST /api/budgets or PUT /api/budgets/:id
 */
export async function saveBudget(budgetInput) {
  const targetMonth = String(budgetInput.month || getCurrentMonthISO());
  const [year, month] = targetMonth.split('-').map(Number);
  const amount = Math.max(0, Math.round((Number(budgetInput.monthlyLimit) || 0) * 100) / 100);

  // Check if a budget already exists for this month
  const checkRes = await fetch(`${API_BASE}/budgets/${year}/${month}`);
  if (checkRes.ok) {
    const checkJson = await checkRes.json();
    const existing = checkJson.data;
    // Update existing budget
    const putRes = await fetch(`${API_BASE}/budgets/${existing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });

    if (!putRes.ok) {
      const errBody = await putRes.json().catch(() => ({}));
      throw new Error(errBody.error || `Failed to update budget (${putRes.status})`);
    }

    const putJson = await putRes.json();
    return {
      id: putJson.data.id,
      monthlyLimit: Number(putJson.data.amount) || 0,
      month: targetMonth,
      updatedAt: putJson.data.created_at || getTodayISO(),
    };
  }

  // Otherwise, create a new budget
  const postRes = await fetch(`${API_BASE}/budgets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, month, amount }),
  });

  if (!postRes.ok) {
    const errBody = await postRes.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to create budget (${postRes.status})`);
  }

  const postJson = await postRes.json();
  return {
    id: postJson.data.id,
    monthlyLimit: Number(postJson.data.amount) || 0,
    month: targetMonth,
    updatedAt: postJson.data.created_at || getTodayISO(),
  };
}

export function normalizeSubscription(raw) {
  return {
    id: raw.id,
    name: String(raw.name || '').trim(),
    amount: Math.round((Number(raw.amount) || 0) * 100) / 100,
    billing_cycle: raw.billing_cycle === 'yearly' ? 'yearly' : 'monthly',
    category: String(raw.category || 'Other').trim(),
    renewal_date: String(raw.renewal_date || getTodayISO()).slice(0, 10),
    status: ['active', 'cancelled', 'expired'].includes(raw.status) ? raw.status : 'active',
    is_unused: Boolean(raw.is_unused),
    description: String(raw.description || '').trim(),
  };
}

/**
 * Retrieve all subscriptions from the SQLite database.
 * REST endpoint: GET /api/subscriptions
 */
export async function getSubscriptions() {
  const res = await fetch(`${API_BASE}/subscriptions`);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to fetch subscriptions (${res.status})`);
  }
  const json = await res.json();
  const list = json.data || [];
  return list.map(normalizeSubscription);
}

/**
 * Save a new subscription to the SQLite database.
 * REST endpoint: POST /api/subscriptions
 */
export async function saveSubscription(input) {
  const res = await fetch(`${API_BASE}/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      amount: Number(input.amount),
      billing_cycle: input.billing_cycle || 'monthly',
      category: input.category,
      renewal_date: input.renewal_date,
      status: input.status || 'active',
      is_unused: input.is_unused ? 1 : 0,
      description: input.description || '',
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to save subscription (${res.status})`);
  }

  const json = await res.json();
  return normalizeSubscription(json.data);
}

/**
 * Update an existing subscription by ID.
 * REST endpoint: PUT /api/subscriptions/:id
 */
export async function updateSubscription(id, input) {
  const res = await fetch(`${API_BASE}/subscriptions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      amount: Number(input.amount),
      billing_cycle: input.billing_cycle,
      category: input.category,
      renewal_date: input.renewal_date,
      status: input.status,
      is_unused: input.is_unused ? 1 : 0,
      description: input.description,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to update subscription (${res.status})`);
  }

  const json = await res.json();
  return normalizeSubscription(json.data);
}

/**
 * Delete a subscription by ID.
 * REST endpoint: DELETE /api/subscriptions/:id
 */
export async function deleteSubscription(id) {
  const res = await fetch(`${API_BASE}/subscriptions/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to delete subscription (${res.status})`);
  }

  return true;
}

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
    { title: 'Monthly Salary', amount: 5400, category: 'Salary', type: 'income', date: shiftMonth(0, 1), description: 'Primary engineering payroll deposit' },
    { title: 'Apartment Rent', amount: 1650, category: 'Housing', type: 'expense', date: shiftMonth(0, 2), description: 'Monthly lease payment' },
    { title: 'Trader Joe’s Market', amount: 214.5, category: 'Food', type: 'expense', date: shiftMonth(0, 4), description: 'Weekly groceries and pantry staples' },
    { title: 'Electric & Fiber Internet', amount: 168.0, category: 'Utilities', type: 'expense', date: shiftMonth(0, 6), description: 'Monthly utility and broadband billing' },
    { title: 'UI Design Advisory', amount: 850, category: 'Freelance', type: 'income', date: shiftMonth(0, 8), description: 'Client sprint consultation invoice #104' },
    { title: 'Transit Pass & Fuel', amount: 142.75, category: 'Transport', type: 'expense', date: shiftMonth(0, 9), description: 'Commuter rail pass and weekend fuel' },
    { title: 'Dental Checkup', amount: 185, category: 'Healthcare', type: 'expense', date: shiftMonth(0, 10), description: 'Routine cleaning and co-pay' },
    { title: 'Whole Foods & Coffee', amount: 196.4, category: 'Food', type: 'expense', date: shiftMonth(0, 11), description: 'Fresh produce and specialty coffee beans' },
    { title: 'Ergonomic Desk Lamp', amount: 129, category: 'Shopping', type: 'expense', date: shiftMonth(0, 12), description: 'Home office lighting upgrade' },
    { title: 'Cinema & Dinner', amount: 94.2, category: 'Entertainment', type: 'expense', date: shiftMonth(0, 13), description: 'Friday evening dinner and tickets' },
    { title: 'Monthly Salary', amount: 5400, category: 'Salary', type: 'income', date: shiftMonth(1, 1), description: 'Primary engineering payroll deposit' },
    { title: 'Apartment Rent', amount: 1650, category: 'Housing', type: 'expense', date: shiftMonth(1, 2), description: 'Monthly lease payment' },
    { title: 'Grocery & Household', amount: 482.3, category: 'Food', type: 'expense', date: shiftMonth(1, 9), description: 'Monthly grocery runs' },
    { title: 'Utilities Bundle', amount: 162.1, category: 'Utilities', type: 'expense', date: shiftMonth(1, 14), description: 'Power, water, and internet' },
    { title: 'Quarterly Dividend', amount: 320, category: 'Investments', type: 'income', date: shiftMonth(1, 19), description: 'Index ETF quarterly distribution' },
    { title: 'Annual Tech Course', amount: 240, category: 'Education', type: 'expense', date: shiftMonth(1, 22), description: 'Systems architecture workshop' },
    { title: 'Monthly Salary', amount: 5200, category: 'Salary', type: 'income', date: shiftMonth(2, 1), description: 'Monthly payroll deposit' },
    { title: 'Apartment Rent', amount: 1650, category: 'Housing', type: 'expense', date: shiftMonth(2, 2), description: 'Monthly lease payment' },
    { title: 'Supermarket & Dining', amount: 530, category: 'Food', type: 'expense', date: shiftMonth(2, 12), description: 'Groceries and dining out' },
    { title: 'Regional Rail & Transit', amount: 175, category: 'Transport', type: 'expense', date: shiftMonth(2, 18), description: 'Travel pass and rideshares' },
  ];
}

function buildSampleSubscriptions() {
  const now = new Date();
  const shiftDays = (days) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  return [
    {
      name: 'Netflix Premium',
      amount: 15.49,
      billing_cycle: 'monthly',
      category: 'Entertainment',
      renewal_date: shiftDays(4),
      status: 'active',
      is_unused: false,
      description: '4K Ultra HD family streaming tier',
    },
    {
      name: 'Spotify Duo',
      amount: 14.99,
      billing_cycle: 'monthly',
      category: 'Entertainment',
      renewal_date: shiftDays(12),
      status: 'active',
      is_unused: false,
      description: 'Ad-free high fidelity music streaming',
    },
    {
      name: 'Amazon Prime',
      amount: 139.00,
      billing_cycle: 'yearly',
      category: 'Shopping',
      renewal_date: shiftDays(24),
      status: 'active',
      is_unused: false,
      description: 'Free expedited delivery & Prime Video',
    },
    {
      name: 'GitHub Copilot',
      amount: 10.00,
      billing_cycle: 'monthly',
      category: 'Software',
      renewal_date: shiftDays(2),
      status: 'active',
      is_unused: false,
      description: 'Developer AI pair programming assistant',
    },
    {
      name: 'Equinox Gym Membership',
      amount: 45.00,
      billing_cycle: 'monthly',
      category: 'Fitness',
      renewal_date: shiftDays(18),
      status: 'active',
      is_unused: true,
      description: 'Local fitness access (infrequently attended - flagged for review)',
    },
    {
      name: 'Coursera Plus',
      amount: 59.00,
      billing_cycle: 'monthly',
      category: 'Education',
      renewal_date: shiftDays(7),
      status: 'active',
      is_unused: false,
      description: 'Professional engineering certificates',
    },
  ];
}

/**
 * Reset SQLite database to sample dataset.
 */
export async function resetToSampleData() {
  const currentTxns = await getTransactions();
  for (const t of currentTxns) {
    await deleteTransaction(t.id);
  }
  const samples = buildSampleTransactions();
  for (const s of samples) {
    await saveTransaction(s);
  }
  await saveBudget({
    monthlyLimit: 3200,
    month: getCurrentMonthISO(),
  });

  const currentSubs = await getSubscriptions();
  for (const sub of currentSubs) {
    await deleteSubscription(sub.id);
  }
  const sampleSubs = buildSampleSubscriptions();
  for (const sub of sampleSubs) {
    await saveSubscription(sub);
  }
}

/**
 * Clear all transactions and reset budget to 0 in SQLite database.
 */
export async function clearAllData() {
  const currentTxns = await getTransactions();
  for (const t of currentTxns) {
    await deleteTransaction(t.id);
  }
  await saveBudget({
    monthlyLimit: 0,
    month: getCurrentMonthISO(),
  });

  const currentSubs = await getSubscriptions();
  for (const sub of currentSubs) {
    await deleteSubscription(sub.id);
  }
}
