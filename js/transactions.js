/**
 * transactions.js
 * Pure financial calculations, validation, filtering/sorting,
 * and UI controller for Transaction History (Feature 3) & Add/Edit Modal (Feature 2).
 * Calculations are strictly decoupled from storage so they remain backend-portable.
 */

import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  getCurrentMonthISO,
  getTodayISO,
} from './storage.js';

export const CATEGORY_COLORS = {
  Food: '#0f766e',
  Housing: '#1e293b',
  Transport: '#2563eb',
  Utilities: '#d97706',
  Healthcare: '#dc2626',
  Entertainment: '#7c3aed',
  Shopping: '#0891b2',
  Education: '#4f46e5',
  Other: '#64748b',
  Salary: '#16a34a',
  Freelance: '#0d9488',
  Investments: '#2563eb',
  Bonus: '#ca8a04',
  Rental: '#475569',
  Refund: '#64748b',
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return currencyFormatter.format(num);
}

export function formatDateDisplay(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatMonthLabel(ym) {
  if (!ym || !ym.includes('-')) return ym || '';
  const [y, m] = ym.split('-').map(Number);
  const dateObj = new Date(y, m - 1, 1);
  return dateObj.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function formatShortMonthLabel(ym) {
  if (!ym || !ym.includes('-')) return ym || '';
  const [y, m] = ym.split('-').map(Number);
  const dateObj = new Date(y, m - 1, 1);
  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  });
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Pure dynamic summary calculation (Total Balance = Total Income - Total Expenses).
 */
export function calculateSummary(transactions, targetMonth = getCurrentMonthISO()) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let monthlyIncome = 0;
  let monthlySpending = 0;
  let monthlyExpenseCount = 0;

  for (const txn of transactions) {
    const amt = Number(txn.amount) || 0;
    const isTargetMonth = typeof txn.date === 'string' && txn.date.startsWith(targetMonth);

    if (txn.type === 'income') {
      totalIncome += amt;
      incomeCount += 1;
      if (isTargetMonth) monthlyIncome += amt;
    } else {
      totalExpenses += amt;
      expenseCount += 1;
      if (isTargetMonth) {
        monthlySpending += amt;
        monthlyExpenseCount += 1;
      }
    }
  }

  const totalBalance = totalIncome - totalExpenses;
  const netMonthlyCashflow = monthlyIncome - monthlySpending;
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  return {
    totalBalance,
    totalIncome,
    totalExpenses,
    incomeCount,
    expenseCount,
    monthlyIncome,
    monthlySpending,
    monthlyExpenseCount,
    netMonthlyCashflow,
    savingsRate,
    totalCount: transactions.length,
  };
}

/**
 * Computes category totals sorted descending by amount.
 */
export function getCategoryBreakdown(transactions, type = 'expense', monthFilter = null) {
  const map = new Map();
  let grandTotal = 0;

  for (const txn of transactions) {
    if (txn.type !== type) continue;
    if (monthFilter && (!txn.date || !txn.date.startsWith(monthFilter))) continue;

    const amt = Number(txn.amount) || 0;
    grandTotal += amt;
    const existing = map.get(txn.category) || { category: txn.category, total: 0, count: 0 };
    existing.total += amt;
    existing.count += 1;
    map.set(txn.category, existing);
  }

  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .map((entry) => ({
      ...entry,
      percentage: grandTotal > 0 ? (entry.total / grandTotal) * 100 : 0,
      color: CATEGORY_COLORS[entry.category] || '#64748b',
    }));
}

/**
 * Computes monthly income vs expenses trend across recent months.
 */
export function getMonthlyTrend(transactions, targetMonth = getCurrentMonthISO(), monthsCount = 6) {
  const [baseY, baseM] = targetMonth.split('-').map(Number);
  const months = [];

  for (let i = monthsCount - 1; i >= 0; i -= 1) {
    const d = new Date(baseY, baseM - 1 - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      month: ym,
      label: formatShortMonthLabel(ym),
      income: 0,
      expense: 0,
    });
  }

  const indexByMonth = new Map(months.map((m, idx) => [m.month, idx]));

  for (const txn of transactions) {
    if (!txn.date) continue;
    const ym = txn.date.slice(0, 7);
    const idx = indexByMonth.get(ym);
    if (idx === undefined) continue;

    const amt = Number(txn.amount) || 0;
    if (txn.type === 'income') {
      months[idx].income += amt;
    } else {
      months[idx].expense += amt;
    }
  }

  return months;
}

/**
 * Collects unique YYYY-MM values present in transactions plus current month.
 */
export function getAvailableMonths(transactions) {
  const set = new Set([getCurrentMonthISO()]);
  for (const txn of transactions) {
    if (txn.date && txn.date.length >= 7) {
      set.add(txn.date.slice(0, 7));
    }
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/**
 * Filters and sorts transactions purely in memory.
 */
export function filterAndSortTransactions(transactions, filters) {
  const search = (filters.search || '').trim().toLowerCase();
  const category = filters.category || 'all';
  const type = filters.type || 'all';
  const sortBy = filters.sortBy || 'date-desc';

  const filtered = transactions.filter((txn) => {
    if (type !== 'all' && txn.type !== type) return false;
    if (category !== 'all' && txn.category !== category) return false;
    if (search) {
      const hay = `${txn.title} ${txn.description} ${txn.category} ${txn.date}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc':
        return a.date.localeCompare(b.date);
      case 'amount-desc':
        return b.amount - a.amount;
      case 'amount-asc':
        return a.amount - b.amount;
      case 'date-desc':
      default:
        return b.date.localeCompare(a.date);
    }
  });

  return filtered;
}

/**
 * Validates Add/Edit Transaction form input.
 */
export function validateTransactionInput(input) {
  const errors = {};
  const title = (input.title || '').trim();
  const amount = Number(input.amount);
  const category = (input.category || '').trim();
  const type = input.type;
  const date = (input.date || '').trim();
  const description = (input.description || '').trim();

  if (!title) {
    errors.title = 'Please enter a transaction title.';
  } else if (title.length < 2) {
    errors.title = 'Title must be at least 2 characters.';
  }

  if (!input.amount || Number.isNaN(amount) || amount <= 0) {
    errors.amount = 'Enter a valid amount greater than 0.';
  } else if (amount > 100000000) {
    errors.amount = 'Amount cannot exceed 100,000,000.';
  }

  if (!category) {
    errors.category = 'Please select a category.';
  }

  if (type !== 'income' && type !== 'expense') {
    errors.type = 'Select income or expense.';
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Please select a valid date.';
  }

  if (description.length > 240) {
    errors.description = 'Description cannot exceed 240 characters.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Exports transaction list as a downloadable CSV file.
 */
export function exportTransactionsToCSV(transactions) {
  const headers = ['ID', 'Date', 'Type', 'Title', 'Category', 'Amount', 'Description'];
  const escapeCsv = (val) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = transactions.map((t) =>
    [t.id, t.date, t.type, t.title, t.category, t.amount.toFixed(2), t.description]
      .map(escapeCsv)
      .join(',')
  );

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `clearledger-transactions-${getTodayISO()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ==========================================================================
   Feature 3: Transaction History View Renderer & Stateful Filter Controls
   ========================================================================== */

const historyFilters = {
  search: '',
  category: 'all',
  type: 'all',
  sortBy: 'date-desc',
};

export function renderTransactionsView(container, transactions, handlers) {
  const allCategories = Array.from(
    new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...transactions.map((t) => t.category)])
  ).sort();

  const filtered = filterAndSortTransactions(transactions, historyFilters);

  let filteredIncome = 0;
  let filteredExpense = 0;
  for (const t of filtered) {
    if (t.type === 'income') filteredIncome += t.amount;
    else filteredExpense += t.amount;
  }

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Transaction History</h2>
        <p class="section-subtitle">Search, filter, edit, or delete any recorded income and expense entry.</p>
      </div>
    </div>

    <div class="surface-card">
      <div class="toolbar">
        <div class="toolbar-filters">
          <div class="search-input-wrap">
            <i data-lucide="search"></i>
            <label for="filter-search" class="sr-only">Search transactions</label>
            <input
              type="search"
              id="filter-search"
              class="input-control"
              placeholder="Search title, category, or notes..."
              value="${escapeHtml(historyFilters.search)}"
            />
          </div>

          <label for="filter-type" class="sr-only">Filter by type</label>
          <select id="filter-type" class="select-control select-compact" aria-label="Filter by type">
            <option value="all" ${historyFilters.type === 'all' ? 'selected' : ''}>All Types</option>
            <option value="income" ${historyFilters.type === 'income' ? 'selected' : ''}>Income Only</option>
            <option value="expense" ${historyFilters.type === 'expense' ? 'selected' : ''}>Expenses Only</option>
          </select>

          <label for="filter-category" class="sr-only">Filter by category</label>
          <select id="filter-category" class="select-control select-compact" aria-label="Filter by category">
            <option value="all" ${historyFilters.category === 'all' ? 'selected' : ''}>All Categories</option>
            ${allCategories
              .map(
                (cat) =>
                  `<option value="${escapeHtml(cat)}" ${
                    historyFilters.category === cat ? 'selected' : ''
                  }>${escapeHtml(cat)}</option>`
              )
              .join('')}
          </select>

          <label for="filter-sort" class="sr-only">Sort transactions</label>
          <select id="filter-sort" class="select-control select-compact" aria-label="Sort transactions">
            <option value="date-desc" ${historyFilters.sortBy === 'date-desc' ? 'selected' : ''}>Date: Newest First</option>
            <option value="date-asc" ${historyFilters.sortBy === 'date-asc' ? 'selected' : ''}>Date: Oldest First</option>
            <option value="amount-desc" ${historyFilters.sortBy === 'amount-desc' ? 'selected' : ''}>Amount: High to Low</option>
            <option value="amount-asc" ${historyFilters.sortBy === 'amount-asc' ? 'selected' : ''}>Amount: Low to High</option>
          </select>
        </div>

        ${
          historyFilters.search || historyFilters.category !== 'all' || historyFilters.type !== 'all'
            ? `<button type="button" id="btn-reset-filters" class="btn btn-ghost">Reset Filters</button>`
            : ''
        }
      </div>

      <div class="summary-strip">
        <span>Showing <strong>${filtered.length}</strong> of <strong>${transactions.length}</strong> entries</span>
        <span aria-hidden="true">·</span>
        <span>Filtered Income: <strong style="color: var(--income)">${formatCurrency(filteredIncome)}</strong></span>
        <span aria-hidden="true">·</span>
        <span>Filtered Expenses: <strong>${formatCurrency(filteredExpense)}</strong></span>
      </div>

      <div id="transactions-table-region"></div>
    </div>
  `;

  const tableRegion = container.querySelector('#transactions-table-region');
  renderTransactionTableRows(tableRegion, filtered, transactions.length === 0, handlers);

  // Wire Filter Listeners
  const searchInput = container.querySelector('#filter-search');
  const typeSelect = container.querySelector('#filter-type');
  const categorySelect = container.querySelector('#filter-category');
  const sortSelect = container.querySelector('#filter-sort');
  const resetBtn = container.querySelector('#btn-reset-filters');

  searchInput.addEventListener('input', (e) => {
    historyFilters.search = e.target.value;
    const nextFiltered = filterAndSortTransactions(transactions, historyFilters);
    updateFilteredSummaryAndTable(container, nextFiltered, transactions.length, handlers);
  });

  typeSelect.addEventListener('change', (e) => {
    historyFilters.type = e.target.value;
    renderTransactionsView(container, transactions, handlers);
  });

  categorySelect.addEventListener('change', (e) => {
    historyFilters.category = e.target.value;
    renderTransactionsView(container, transactions, handlers);
  });

  sortSelect.addEventListener('change', (e) => {
    historyFilters.sortBy = e.target.value;
    renderTransactionsView(container, transactions, handlers);
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      historyFilters.search = '';
      historyFilters.category = 'all';
      historyFilters.type = 'all';
      historyFilters.sortBy = 'date-desc';
      renderTransactionsView(container, transactions, handlers);
    });
  }

  if (window.lucide) window.lucide.createIcons();
}

function updateFilteredSummaryAndTable(container, filtered, totalCount, handlers) {
  let filteredIncome = 0;
  let filteredExpense = 0;
  for (const t of filtered) {
    if (t.type === 'income') filteredIncome += t.amount;
    else filteredExpense += t.amount;
  }

  const strip = container.querySelector('.summary-strip');
  if (strip) {
    strip.innerHTML = `
      <span>Showing <strong>${filtered.length}</strong> of <strong>${totalCount}</strong> entries</span>
      <span aria-hidden="true">·</span>
      <span>Filtered Income: <strong style="color: var(--income)">${formatCurrency(filteredIncome)}</strong></span>
      <span aria-hidden="true">·</span>
      <span>Filtered Expenses: <strong>${formatCurrency(filteredExpense)}</strong></span>
    `;
  }

  const tableRegion = container.querySelector('#transactions-table-region');
  renderTransactionTableRows(tableRegion, filtered, totalCount === 0, handlers);
  if (window.lucide) window.lucide.createIcons();
}

function renderTransactionTableRows(target, rows, isDatabaseEmpty, handlers) {
  if (rows.length === 0) {
    target.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i data-lucide="${isDatabaseEmpty ? 'receipt' : 'search-x'}"></i>
        </div>
        <h3 class="empty-state-title">${
          isDatabaseEmpty ? 'No transactions recorded yet' : 'No matching transactions found'
        }</h3>
        <p class="empty-state-desc">${
          isDatabaseEmpty
            ? 'Add your first income or expense entry to start tracking balances, charts, and monthly budgets.'
            : 'Try adjusting your search keywords, category selection, or type filter.'
        }</p>
        ${
          isDatabaseEmpty
            ? `<button type="button" class="btn btn-primary" data-empty-add="true">Add First Transaction</button>`
            : ''
        }
      </div>
    `;

    const addBtn = target.querySelector('[data-empty-add]');
    if (addBtn) {
      addBtn.addEventListener('click', () => handlers.onOpenAdd());
    }
    return;
  }

  target.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Category</th>
            <th>Type</th>
            <th>Date</th>
            <th class="col-right">Amount</th>
            <th class="col-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((txn) => {
              const isIncome = txn.type === 'income';
              const sign = isIncome ? '+' : '-';
              return `
                <tr data-id="${escapeHtml(txn.id)}">
                  <td>
                    <div class="txn-title-cell">
                      <span class="txn-title-text">${escapeHtml(txn.title)}</span>
                      ${
                        txn.description
                          ? `<span class="txn-desc-text" title="${escapeHtml(txn.description)}">${escapeHtml(
                              txn.description
                            )}</span>`
                          : ''
                      }
                    </div>
                  </td>
                  <td>${escapeHtml(txn.category)}</td>
                  <td>
                    <span class="type-label ${isIncome ? 'is-income' : 'is-expense'}">
                      <i data-lucide="${isIncome ? 'arrow-up-right' : 'arrow-down-right'}"></i>
                      <span>${isIncome ? 'Income' : 'Expense'}</span>
                    </span>
                  </td>
                  <td class="tabular-nums">${escapeHtml(formatDateDisplay(txn.date))}</td>
                  <td class="col-right amount-cell ${isIncome ? 'is-income' : 'is-expense'}">
                    ${sign}${formatCurrency(txn.amount)}
                  </td>
                  <td class="col-right">
                    <div class="row-actions">
                      <button
                        type="button"
                        class="icon-btn"
                        data-action="edit"
                        data-id="${escapeHtml(txn.id)}"
                        aria-label="Edit ${escapeHtml(txn.title)}"
                        title="Edit transaction"
                      >
                        <i data-lucide="pencil"></i>
                      </button>
                      <button
                        type="button"
                        class="icon-btn is-danger"
                        data-action="delete"
                        data-id="${escapeHtml(txn.id)}"
                        aria-label="Delete ${escapeHtml(txn.title)}"
                        title="Delete transaction"
                      >
                        <i data-lucide="trash-2"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  target.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onEdit(btn.dataset.id));
  });

  target.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onDelete(btn.dataset.id));
  });
}

/* ==========================================================================
   Feature 2: Add / Edit Transaction Modal Controller
   ========================================================================== */

export function createTransactionModalController({ onSave }) {
  const modal = document.getElementById('transaction-modal');
  const form = document.getElementById('transaction-form');
  const modalTitle = document.getElementById('transaction-modal-title');
  const modalSubtitle = document.getElementById('transaction-modal-subtitle');
  const submitBtn = document.getElementById('transaction-submit-btn');

  const idInput = document.getElementById('txn-id');
  const typeInput = document.getElementById('txn-type');
  const titleInput = document.getElementById('txn-title');
  const amountInput = document.getElementById('txn-amount');
  const categorySelect = document.getElementById('txn-category');
  const dateInput = document.getElementById('txn-date');
  const descInput = document.getElementById('txn-description');

  const btnExpense = document.getElementById('type-btn-expense');
  const btnIncome = document.getElementById('type-btn-income');
  const closeBtn = document.getElementById('transaction-modal-close');
  const cancelBtn = document.getElementById('transaction-modal-cancel');

  function populateCategoryOptions(type, selectedCategory = '') {
    const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    categorySelect.innerHTML = [
      `<option value="">Select a category</option>`,
      ...list.map(
        (cat) =>
          `<option value="${escapeHtml(cat)}" ${
            selectedCategory === cat ? 'selected' : ''
          }>${escapeHtml(cat)}</option>`
      ),
    ].join('');
  }

  function setType(type, preserveCategory = false) {
    const normalized = type === 'income' ? 'income' : 'expense';
    typeInput.value = normalized;
    btnExpense.classList.toggle('is-active', normalized === 'expense');
    btnExpense.setAttribute('aria-pressed', String(normalized === 'expense'));
    btnIncome.classList.toggle('is-active', normalized === 'income');
    btnIncome.setAttribute('aria-pressed', String(normalized === 'income'));

    const prevCat = preserveCategory ? categorySelect.value : '';
    populateCategoryOptions(normalized, prevCat);
  }

  function clearErrors() {
    ['title', 'amount', 'category', 'date', 'description'].forEach((field) => {
      const errEl = document.getElementById(`err-txn-${field}`);
      const inputEl = document.getElementById(`txn-${field}`);
      if (errEl) errEl.textContent = '';
      if (inputEl) inputEl.classList.remove('is-invalid');
    });
  }

  function showErrors(errors) {
    Object.entries(errors).forEach(([field, msg]) => {
      const errEl = document.getElementById(`err-txn-${field}`);
      const inputEl = document.getElementById(`txn-${field}`);
      if (errEl) errEl.textContent = msg;
      if (inputEl) inputEl.classList.add('is-invalid');
    });
  }

  function openForCreate(defaultType = 'expense') {
    clearErrors();
    form.reset();
    idInput.value = '';
    setType(defaultType, false);
    dateInput.value = getTodayISO();
    modalTitle.textContent = 'Add Transaction';
    modalSubtitle.textContent = 'Record a new income or expense entry.';
    submitBtn.textContent = 'Save Transaction';
    modal.hidden = false;
    titleInput.focus();
  }

  function openForEdit(transaction) {
    clearErrors();
    idInput.value = transaction.id;
    setType(transaction.type, false);
    titleInput.value = transaction.title;
    amountInput.value = transaction.amount;
    populateCategoryOptions(transaction.type, transaction.category);
    dateInput.value = transaction.date;
    descInput.value = transaction.description || '';
    modalTitle.textContent = 'Edit Transaction';
    modalSubtitle.textContent = 'Update the details of this recorded transaction.';
    submitBtn.textContent = 'Update Transaction';
    modal.hidden = false;
    titleInput.focus();
  }

  function close() {
    modal.hidden = true;
    clearErrors();
  }

  btnExpense.addEventListener('click', () => setType('expense', false));
  btnIncome.addEventListener('click', () => setType('income', false));
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) {
      close();
    }
  });

  // Live clear field error on input
  [titleInput, amountInput, categorySelect, dateInput, descInput].forEach((el) => {
    el.addEventListener('input', () => {
      el.classList.remove('is-invalid');
      const errId = `err-${el.id}`;
      const errEl = document.getElementById(errId);
      if (errEl) errEl.textContent = '';
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();

    const payload = {
      id: idInput.value.trim(),
      type: typeInput.value,
      title: titleInput.value.trim(),
      amount: amountInput.value,
      category: categorySelect.value,
      date: dateInput.value,
      description: descInput.value.trim(),
    };

    const validation = validateTransactionInput(payload);
    if (!validation.valid) {
      showErrors(validation.errors);
      return;
    }

    onSave({
      ...payload,
      amount: Number(payload.amount),
    });
    close();
  });

  return {
    openForCreate,
    openForEdit,
    close,
  };
}
