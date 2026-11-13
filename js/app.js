/**
 * app.js
 * Application bootstrap, navigation state, modal orchestration, and reactive view updates.
 */

import {
  clearAllData,
  deleteTransaction,
  getBudget,
  getCurrentMonthISO,
  getTransactions,
  resetToSampleData,
  saveBudget,
  saveTransaction,
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

const VIEW_LABELS = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  analytics: 'Analytics',
  budget: 'Budget',
};

const appState = {
  activeView: 'dashboard',
  activeMonth: getCurrentMonthISO(),
  transactions: [],
  budget: null,
};

let transactionModal = null;
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

function syncStateFromStorage() {
  appState.transactions = getTransactions();
  appState.budget = getBudget();
  populateMonthSelector();
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
  const viewIds = ['dashboard', 'transactions', 'analytics', 'budget'];
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
      const target = appState.transactions.find((t) => t.id === id);
      if (target) transactionModal.openForEdit(target);
    },
    onDelete: (id) => requestDeleteTransaction(id),
    onSaveBudget: (monthlyLimit) => {
      saveBudget({ monthlyLimit, month: appState.activeMonth });
      syncStateFromStorage();
      renderActiveView();
      showToast('Monthly budget updated.', 'success');
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

function handleSaveTransaction(payload) {
  const isEditing = Boolean(payload.id);

  if (isEditing) {
    updateTransaction(payload.id, payload);
    showToast('Transaction updated.', 'success');
  } else {
    saveTransaction(payload);
    showToast('Transaction added.', 'success');
  }

  // Switch active month to the saved transaction's month if needed so user sees immediate impact
  if (payload.date && payload.date.length >= 7) {
    appState.activeMonth = payload.date.slice(0, 7);
  }

  syncStateFromStorage();
  renderActiveView();

  // Check budget threshold when saving an expense
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
}

function requestDeleteTransaction(id) {
  const txn = appState.transactions.find((t) => t.id === id);
  if (!txn) return;

  openConfirmModal({
    title: 'Delete Transaction',
    message: `Are you sure you want to delete "${txn.title}"? This action cannot be undone.`,
    confirmLabel: 'Delete',
    onConfirm: () => {
      deleteTransaction(id);
      syncStateFromStorage();
      renderActiveView();
      showToast('Transaction deleted.', 'success');
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

function initApp() {
  openConfirmModal = setupConfirmModal();
  transactionModal = createTransactionModalController({
    onSave: handleSaveTransaction,
  });

  // Navigation buttons
  document.querySelectorAll('.nav-link').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Topbar primary action & month switcher
  document.getElementById('btn-open-add-modal')?.addEventListener('click', () => {
    transactionModal.openForCreate('expense');
  });

  document.getElementById('global-month-select')?.addEventListener('change', (e) => {
    appState.activeMonth = e.target.value;
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
        'Replace current transactions and budget with the curated sample dataset? Any custom entries will be overwritten.',
      confirmLabel: 'Load Sample Data',
      onConfirm: () => {
        resetToSampleData();
        appState.activeMonth = getCurrentMonthISO();
        syncStateFromStorage();
        renderActiveView();
        closeMobileSidebar();
        showToast('Sample dataset loaded.', 'success');
      },
    });
  });

  document.getElementById('btn-clear-data')?.addEventListener('click', () => {
    openConfirmModal({
      title: 'Clear All Data',
      message:
        'Delete every transaction and reset your monthly budget to $0? This action cannot be undone.',
      confirmLabel: 'Clear Everything',
      onConfirm: () => {
        clearAllData();
        appState.activeMonth = getCurrentMonthISO();
        syncStateFromStorage();
        renderActiveView();
        closeMobileSidebar();
        showToast('All local data cleared.', 'success');
      },
    });
  });

  // Initial load
  syncStateFromStorage();
  renderActiveView();
}

document.addEventListener('DOMContentLoaded', initApp);
