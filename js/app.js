/**
 * app.js
 * Application bootstrap, navigation state, modal orchestration, and reactive view updates.
 * Connected to Express + SQLite backend through async storage methods.
 */

import {
  clearAllData,
  deleteSubscription,
  deleteTransaction,
  getBudget,
  getCurrentMonthISO,
  getSubscriptions,
  getTransactions,
  migrateFromLocalStorage,
  resetToSampleData,
  saveBudget,
  saveSubscription,
  saveTransaction,
  updateSubscription,
  updateTransaction,
} from './storage.js';
import {
  createTransactionModalController,
  escapeHtml,
  exportTransactionsToCSV,
  formatMonthLabel,
  getAvailableMonths,
  renderTransactionsView,
} from './transactions.js';
import { renderDashboardView } from './dashboard.js';
import { renderAnalyticsView } from './analytics.js';
import { computeBudgetStatus, renderBudgetView } from './budget.js';
import {
  createSubscriptionModalController,
  renderSubscriptionsView,
} from './subscriptions.js';

const VIEW_LABELS = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  analytics: 'Analytics',
  budget: 'Budget',
  subscriptions: 'Subscriptions',
};

const appState = {
  activeView: 'dashboard',
  activeMonth: getCurrentMonthISO(),
  transactions: [],
  budget: null,
  subscriptions: [],
  isLoading: false,
  error: null,
};

let transactionModal = null;
let subscriptionModal = null;
let pendingConfirmAction = null;

/* ==========================================================================
   Toast Feedback
   ========================================================================== */

function showToast(message, variant = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const iconName =
    variant === 'error'
      ? 'alert-octagon'
      : variant === 'warning'
      ? 'alert-triangle'
      : 'check-circle-2';

  const toast = document.createElement('div');
  toast.className = `toast is-${variant}`;
  toast.innerHTML = `<i data-lucide="${iconName}"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.remove();
  }, 3600);
}

/* ==========================================================================
   Status Banner (Loading / Server Error)
   ========================================================================== */

function renderStatusBanner() {
  const container = document.getElementById('global-status-region');
  if (!container) return;

  if (appState.isLoading) {
    container.innerHTML = `
      <div class="alert-banner" role="status">
        <i data-lucide="loader"></i>
        <div>
          <h3 class="alert-banner-title">Loading Ledger</h3>
          <p class="alert-banner-desc">Syncing records with the database...</p>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  if (appState.error) {
    container.innerHTML = `
      <div class="alert-banner is-exceeded" role="alert">
        <i data-lucide="alert-octagon"></i>
        <div>
          <h3 class="alert-banner-title">Server Connection Error</h3>
          <p class="alert-banner-desc">${escapeHtml(appState.error)}</p>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = '';
}

/* ==========================================================================
   Confirmation Modal Controller
   ========================================================================== */

function setupConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const confirmBtn = document.getElementById('confirm-modal-confirm');
  const cancelBtn = document.getElementById('confirm-modal-cancel');
  const closeBtn = document.getElementById('confirm-modal-close');

  function closeConfirm() {
    modal.hidden = true;
    pendingConfirmAction = null;
  }

  cancelBtn.addEventListener('click', closeConfirm);
  closeBtn.addEventListener('click', closeConfirm);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeConfirm();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeConfirm();
  });

  confirmBtn.addEventListener('click', () => {
    if (typeof pendingConfirmAction === 'function') {
      pendingConfirmAction();
    }
    closeConfirm();
  });

  return function openConfirm({ title, message, confirmLabel = 'Confirm', onConfirm }) {
    titleEl.textContent = title;
    msgEl.textContent = message;
    confirmBtn.textContent = confirmLabel;
    pendingConfirmAction = onConfirm;
    modal.hidden = false;
    confirmBtn.focus();
  };
}

/* ==========================================================================
   Data Refresh & View Rendering
   ========================================================================== */

async function syncStateFromStorage() {
  appState.isLoading = true;
  appState.error = null;
  renderStatusBanner();

  try {
    const [txns, budget, subs] = await Promise.all([
      getTransactions(),
      getBudget(appState.activeMonth),
      getSubscriptions(),
    ]);
    appState.transactions = txns;
    appState.budget = budget;
    appState.subscriptions = subs;
    populateMonthSelector();
  } catch (err) {
    console.error('Failed to sync data from backend:', err);
    appState.error = err.message || 'Unable to connect to server. Ensure the backend is running.';
    showToast(appState.error, 'error');
  } finally {
    appState.isLoading = false;
    renderStatusBanner();
    renderActiveView();
  }
}

function populateMonthSelector() {
  const select = document.getElementById('global-month-select');
  if (!select) return;

  const months = getAvailableMonths(appState.transactions);
  if (!months.includes(appState.activeMonth)) {
    appState.activeMonth = months[0] || getCurrentMonthISO();
  }

  select.innerHTML = months
    .map(
      (ym) =>
        `<option value="${escapeHtml(ym)}" ${
          ym === appState.activeMonth ? 'selected' : ''
        }>${escapeHtml(formatMonthLabel(ym))}</option>`
    )
    .join('');
}

function renderActiveView() {
  const viewIds = ['dashboard', 'transactions', 'analytics', 'budget', 'subscriptions'];
  viewIds.forEach((id) => {
    const panel = document.getElementById(`view-${id}`);
    const isTarget = id === appState.activeView;
    if (panel) {
      panel.hidden = !isTarget;
      panel.classList.toggle('is-active', isTarget);
    }
  });

  document.querySelectorAll('.nav-link').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === appState.activeView);
  });

  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) {
    topbarTitle.textContent = VIEW_LABELS[appState.activeView] || 'Dashboard';
  }

  const handlers = {
    onNavigate: (viewName) => switchView(viewName),
    onOpenAdd: () => transactionModal.openForCreate('expense'),
    onEdit: (id) => {
      const target = appState.transactions.find((t) => String(t.id) === String(id));
      if (target) transactionModal.openForEdit(target);
    },
    onDelete: (id) => requestDeleteTransaction(id),
    onSaveBudget: async (monthlyLimit) => {
      try {
        await saveBudget({ monthlyLimit, month: appState.activeMonth });
        await syncStateFromStorage();
        showToast('Monthly budget updated.', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to update budget', 'error');
      }
    },
    // Subscriptions Handlers
    onOpenAddSubscription: () => subscriptionModal.openForCreate(),
    onEditSubscription: (id) => {
      const target = appState.subscriptions.find((s) => String(s.id) === String(id));
      if (target) subscriptionModal.openForEdit(target);
    },
    onDeleteSubscription: (id) => requestDeleteSubscription(id),
    onToggleUnused: async (id) => {
      const target = appState.subscriptions.find((s) => String(s.id) === String(id));
      if (!target) return;
      try {
        await updateSubscription(id, {
          ...target,
          is_unused: !target.is_unused,
        });
        await syncStateFromStorage();
        showToast(
          target.is_unused
            ? `Unmarked "${target.name}" from unused review.`
            : `Marked "${target.name}" as unused for cancellation review.`,
          'success'
        );
      } catch (err) {
        showToast(err.message || 'Failed to update subscription', 'error');
      }
    },
  };

  if (appState.activeView === 'dashboard') {
    renderDashboardView(document.getElementById('view-dashboard'), appState, handlers);
  } else if (appState.activeView === 'transactions') {
    renderTransactionsView(
      document.getElementById('view-transactions'),
      appState.transactions,
      handlers
    );
  } else if (appState.activeView === 'analytics') {
    renderAnalyticsView(document.getElementById('view-analytics'), appState, handlers);
  } else if (appState.activeView === 'budget') {
    renderBudgetView(document.getElementById('view-budget'), appState, handlers);
  } else if (appState.activeView === 'subscriptions') {
    renderSubscriptionsView(
      document.getElementById('view-subscriptions'),
      appState,
      handlers
    );
  }

  if (window.lucide) window.lucide.createIcons();
}

function switchView(viewName) {
  if (!VIEW_LABELS[viewName]) return;
  appState.activeView = viewName;
  closeMobileSidebar();
  renderActiveView();
}

/* ==========================================================================
   Action Handlers
   ========================================================================== */

let openConfirmModal = null;

async function handleSaveTransaction(payload) {
  const isEditing = Boolean(payload.id);

  try {
    if (isEditing) {
      await updateTransaction(payload.id, payload);
      showToast('Transaction updated.', 'success');
    } else {
      await saveTransaction(payload);
      showToast('Transaction added.', 'success');
    }

    if (payload.date && payload.date.length >= 7) {
      appState.activeMonth = payload.date.slice(0, 7);
    }

    await syncStateFromStorage();

    if (payload.type === 'expense') {
      const status = computeBudgetStatus(
        appState.transactions,
        appState.budget,
        appState.activeMonth
      );
      if (status.hasBudget && status.state === 'exceeded') {
        showToast(
          `Budget exceeded (${status.utilizationPct.toFixed(1)}% used for ${formatMonthLabel(
            appState.activeMonth
          )}).`,
          'error'
        );
      } else if (status.hasBudget && status.state === 'warning') {
        showToast(
          `Budget warning: ${status.utilizationPct.toFixed(1)}% used for ${formatMonthLabel(
            appState.activeMonth
          )}.`,
          'warning'
        );
      }
    }
  } catch (err) {
    showToast(err.message || 'Failed to save transaction', 'error');
  }
}

function requestDeleteTransaction(id) {
  const txn = appState.transactions.find((t) => String(t.id) === String(id));
  if (!txn) return;

  openConfirmModal({
    title: 'Delete Transaction',
    message: `Are you sure you want to delete "${txn.title}"? This action cannot be undone.`,
    confirmLabel: 'Delete',
    onConfirm: async () => {
      try {
        await deleteTransaction(id);
        await syncStateFromStorage();
        showToast('Transaction deleted.', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to delete transaction', 'error');
      }
    },
  });
}

async function handleSaveSubscription(payload) {
  const isEditing = Boolean(payload.id);

  try {
    if (isEditing) {
      await updateSubscription(payload.id, payload);
      showToast('Subscription updated.', 'success');
    } else {
      await saveSubscription(payload);
      showToast('Subscription added.', 'success');
    }
    await syncStateFromStorage();
  } catch (err) {
    showToast(err.message || 'Failed to save subscription', 'error');
  }
}

function requestDeleteSubscription(id) {
  const sub = appState.subscriptions.find((s) => String(s.id) === String(id));
  if (!sub) return;

  openConfirmModal({
    title: 'Delete Subscription',
    message: `Are you sure you want to delete "${sub.name}" from your subscriptions tracker? This action cannot be undone.`,
    confirmLabel: 'Delete Subscription',
    onConfirm: async () => {
      try {
        await deleteSubscription(id);
        await syncStateFromStorage();
        showToast('Subscription deleted.', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to delete subscription', 'error');
      }
    },
  });
}

/* ==========================================================================
   Mobile Sidebar Drawer
   ========================================================================== */

function openMobileSidebar() {
  document.getElementById('sidebar')?.classList.add('is-open');
  document.getElementById('sidebar-backdrop')?.classList.add('is-open');
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('is-open');
  document.getElementById('sidebar-backdrop')?.classList.remove('is-open');
}

/* ==========================================================================
   Bootstrap
   ========================================================================== */

async function initApp() {
  openConfirmModal = setupConfirmModal();
  transactionModal = createTransactionModalController({
    onSave: handleSaveTransaction,
  });
  subscriptionModal = createSubscriptionModalController({
    onSave: handleSaveSubscription,
  });

  // Navigation buttons
  document.querySelectorAll('.nav-link').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Topbar primary action & month switcher
  document.getElementById('btn-open-add-modal')?.addEventListener('click', () => {
    if (appState.activeView === 'subscriptions') {
      subscriptionModal.openForCreate();
    } else {
      transactionModal.openForCreate('expense');
    }
  });

  document.getElementById('global-month-select')?.addEventListener('change', async (e) => {
    appState.activeMonth = e.target.value;
    try {
      appState.budget = await getBudget(appState.activeMonth);
    } catch (err) {
      console.error('Error fetching budget for selected month:', err);
    }
    renderActiveView();
  });

  // Mobile sidebar controls
  document.getElementById('sidebar-open-btn')?.addEventListener('click', openMobileSidebar);
  document.getElementById('sidebar-close-btn')?.addEventListener('click', closeMobileSidebar);
  document.getElementById('sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);

  // Utility controls
  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    if (appState.transactions.length === 0) {
      showToast('No transactions to export.', 'warning');
      return;
    }
    exportTransactionsToCSV(appState.transactions);
    showToast('Transactions exported to CSV.', 'success');
  });

  document.getElementById('btn-reset-demo')?.addEventListener('click', () => {
    openConfirmModal({
      title: 'Load Sample Data',
      message:
        'Replace current ledger records, budget, and subscriptions with the curated sample dataset? Any custom entries will be overwritten.',
      confirmLabel: 'Load Sample Data',
      onConfirm: async () => {
        try {
          await resetToSampleData();
          appState.activeMonth = getCurrentMonthISO();
          await syncStateFromStorage();
          closeMobileSidebar();
          showToast('Sample dataset loaded.', 'success');
        } catch (err) {
          showToast(err.message || 'Failed to load sample data', 'error');
        }
      },
    });
  });

  document.getElementById('btn-clear-data')?.addEventListener('click', () => {
    openConfirmModal({
      title: 'Clear All Data',
      message:
        'Delete every transaction, subscription, and reset your monthly budget to $0? This action cannot be undone.',
      confirmLabel: 'Clear Everything',
      onConfirm: async () => {
        try {
          await clearAllData();
          appState.activeMonth = getCurrentMonthISO();
          await syncStateFromStorage();
          closeMobileSidebar();
          showToast('All data cleared.', 'success');
        } catch (err) {
          showToast(err.message || 'Failed to clear data', 'error');
        }
      },
    });
  });

  // Check and run one-time migration from LocalStorage if needed
  try {
    const migration = await migrateFromLocalStorage();
    if (migration.migrated && migration.count > 0) {
      console.log(`Migrated ${migration.count} records from LocalStorage.`);
      showToast(`Imported ${migration.count} existing records to database.`, 'success');
    }
  } catch (err) {
    console.warn('LocalStorage migration notice:', err);
  }

  // Initial load from backend
  await syncStateFromStorage();
}

document.addEventListener('DOMContentLoaded', initApp);
