/**
 * dashboard.js
 * Feature 1: Dashboard view renderer & Chart.js orchestration.
 */

import {
  calculateSummary,
  escapeHtml,
  formatCurrency,
  formatDateDisplay,
  formatMonthLabel,
  getCategoryBreakdown,
  getMonthlyTrend,
} from './transactions.js';
import { computeBudgetStatus } from './budget.js';

let monthlyOverviewChart = null;
let categoryBreakdownChart = null;

function destroyDashboardCharts() {
  if (monthlyOverviewChart) {
    monthlyOverviewChart.destroy();
    monthlyOverviewChart = null;
  }
  if (categoryBreakdownChart) {
    categoryBreakdownChart.destroy();
    categoryBreakdownChart = null;
  }
}

export function renderDashboardView(container, state, handlers) {
  destroyDashboardCharts();

  const { transactions, budget, activeMonth } = state;
  const summary = calculateSummary(transactions, activeMonth);
  const budgetStatus = computeBudgetStatus(transactions, budget, activeMonth);
  const monthLabel = formatMonthLabel(activeMonth);

  const monthlyTrend = getMonthlyTrend(transactions, activeMonth, 6);
  const categoryBreakdown = getCategoryBreakdown(transactions, 'expense', activeMonth);
  const recentTransactions = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const balanceClass =
    summary.totalBalance > 0 ? 'is-positive' : summary.totalBalance < 0 ? 'is-negative' : '';

  let monthlyMetaHtml = `<span>${summary.monthlyExpenseCount} expense${
    summary.monthlyExpenseCount === 1 ? '' : 's'
  } in ${escapeHtml(monthLabel)}</span>`;

  if (budgetStatus.hasBudget) {
    const pctText = `${budgetStatus.utilizationPct.toFixed(1)}% of ${formatCurrency(
      budgetStatus.monthlyLimit
    )} budget`;
    const metaTone =
      budgetStatus.state === 'exceeded'
        ? 'is-danger'
        : budgetStatus.state === 'warning'
        ? 'is-warning'
        : 'is-positive';
    monthlyMetaHtml = `<span class="${metaTone}">${escapeHtml(pctText)}</span>`;
  }

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Financial Overview</h2>
        <p class="section-subtitle">Real-time ledger summary and spending trends for ${escapeHtml(
          monthLabel
        )}.</p>
      </div>
    </div>

    <!-- 4-Column KPI Summary Strip -->
    <div class="kpi-grid">
      <article class="kpi-card">
        <div class="kpi-label">
          <span>Total Balance</span>
          <i data-lucide="landmark"></i>
        </div>
        <div class="kpi-value ${balanceClass}">${formatCurrency(summary.totalBalance)}</div>
        <div class="kpi-meta">
          <span>Income minus expenses across all entries</span>
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-label">
          <span>Total Income</span>
          <i data-lucide="arrow-up-right"></i>
        </div>
        <div class="kpi-value is-positive">${formatCurrency(summary.totalIncome)}</div>
        <div class="kpi-meta">
          <span>${summary.incomeCount} income transaction${summary.incomeCount === 1 ? '' : 's'}</span>
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-label">
          <span>Total Expenses</span>
          <i data-lucide="arrow-down-right"></i>
        </div>
        <div class="kpi-value">${formatCurrency(summary.totalExpenses)}</div>
        <div class="kpi-meta">
          <span>${summary.expenseCount} expense transaction${summary.expenseCount === 1 ? '' : 's'}</span>
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-label">
          <span>Monthly Spending</span>
          <i data-lucide="calendar"></i>
        </div>
        <div class="kpi-value">${formatCurrency(summary.monthlySpending)}</div>
        <div class="kpi-meta">${monthlyMetaHtml}</div>
      </article>
    </div>

    <!-- Charts Grid: Monthly Spending Overview + Expense Category Breakdown -->
    <div class="grid-dashboard-charts">
      <section class="surface-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Monthly Spending Overview</h3>
            <p class="card-subtitle">6-month expense trajectory ending ${escapeHtml(monthLabel)}</p>
          </div>
          <button type="button" class="btn btn-ghost" data-nav-target="analytics">
            <span>Full Analytics</span>
            <i data-lucide="arrow-right"></i>
          </button>
        </div>
        ${
          transactions.some((t) => t.type === 'expense')
            ? `<div class="chart-canvas-wrap"><canvas id="chart-dashboard-monthly" aria-label="Monthly spending overview bar chart"></canvas></div>`
            : `<div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="bar-chart-2"></i></div>
                <h4 class="empty-state-title">No spending data yet</h4>
                <p class="empty-state-desc">Add an expense transaction to visualize your monthly spending trend.</p>
              </div>`
        }
      </section>

      <section class="surface-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Expense Category Breakdown</h3>
            <p class="card-subtitle">${escapeHtml(monthLabel)} spending by category</p>
          </div>
        </div>
        ${
          categoryBreakdown.length > 0
            ? `
              <div class="chart-canvas-wrap" style="height: 200px;">
                <canvas id="chart-dashboard-categories" aria-label="Expense category breakdown chart"></canvas>
              </div>
              <ul class="breakdown-list">
                ${categoryBreakdown
                  .slice(0, 5)
                  .map(
                    (item) => `
                  <li class="breakdown-item">
                    <span class="breakdown-left">
                      <span class="color-swatch" style="background-color: ${item.color};"></span>
                      <span class="breakdown-name">${escapeHtml(item.category)}</span>
                    </span>
                    <span class="breakdown-right">
                      <span class="breakdown-share">${item.percentage.toFixed(1)}%</span>
                      <span class="breakdown-amount">${formatCurrency(item.total)}</span>
                    </span>
                  </li>
                `
                  )
                  .join('')}
              </ul>
            `
            : `<div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="pie-chart"></i></div>
                <h4 class="empty-state-title">No expenses in ${escapeHtml(monthLabel)}</h4>
                <p class="empty-state-desc">Log an expense for this month to see category distribution.</p>
              </div>`
        }
      </section>
    </div>

    <!-- Recent Transactions Table -->
    <section class="surface-card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Recent Transactions</h3>
          <p class="card-subtitle">Most recent entries across your ledger</p>
        </div>
        <button type="button" class="btn btn-secondary" data-nav-target="transactions">
          <span>View All Transactions</span>
        </button>
      </div>
      ${
        recentTransactions.length > 0
          ? `
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
                  ${recentTransactions
                    .map((txn) => {
                      const isIncome = txn.type === 'income';
                      return `
                        <tr>
                          <td>
                            <div class="txn-title-cell">
                              <span class="txn-title-text">${escapeHtml(txn.title)}</span>
                              ${
                                txn.description
                                  ? `<span class="txn-desc-text">${escapeHtml(txn.description)}</span>`
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
                            ${isIncome ? '+' : '-'}${formatCurrency(txn.amount)}
                          </td>
                          <td class="col-right">
                            <div class="row-actions">
                              <button
                                type="button"
                                class="icon-btn"
                                data-dash-edit="${escapeHtml(txn.id)}"
                                aria-label="Edit ${escapeHtml(txn.title)}"
                                title="Edit transaction"
                              >
                                <i data-lucide="pencil"></i>
                              </button>
                              <button
                                type="button"
                                class="icon-btn is-danger"
                                data-dash-delete="${escapeHtml(txn.id)}"
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
          `
          : `
            <div class="empty-state">
              <div class="empty-state-icon"><i data-lucide="receipt"></i></div>
              <h4 class="empty-state-title">Your ledger is empty</h4>
              <p class="empty-state-desc">Add your first income or expense entry to populate your dashboard.</p>
              <button type="button" class="btn btn-primary" data-dash-add="true">Add First Transaction</button>
            </div>
          `
      }
    </section>
  `;

  // Wire buttons
  container.querySelectorAll('[data-nav-target]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onNavigate(btn.dataset.navTarget));
  });

  container.querySelectorAll('[data-dash-edit]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onEdit(btn.dataset.dashEdit));
  });

  container.querySelectorAll('[data-dash-delete]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onDelete(btn.dataset.dashDelete));
  });

  const emptyAddBtn = container.querySelector('[data-dash-add]');
  if (emptyAddBtn) {
    emptyAddBtn.addEventListener('click', () => handlers.onOpenAdd());
  }

  // Render Chart.js visualizations
  if (typeof window.Chart === 'function') {
    const monthlyCanvas = container.querySelector('#chart-dashboard-monthly');
    if (monthlyCanvas) {
      monthlyOverviewChart = new window.Chart(monthlyCanvas, {
        type: 'bar',
        data: {
          labels: monthlyTrend.map((m) => m.label),
          datasets: [
            {
              label: 'Monthly Spending',
              data: monthlyTrend.map((m) => m.expense),
              backgroundColor: monthlyTrend.map((m) =>
                m.month === activeMonth ? '#0f766e' : '#cbd5e1'
              ),
              borderRadius: 6,
              maxBarThickness: 40,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` Spending: ${formatCurrency(ctx.parsed.y)}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#64748b', font: { family: 'Plus Jakarta Sans', size: 12 } },
            },
            y: {
              beginAtZero: true,
              border: { display: false },
              grid: { color: '#f1f5f9' },
              ticks: {
                color: '#64748b',
                font: { family: 'IBM Plex Mono', size: 11 },
                callback: (val) => `$${val.toLocaleString()}`,
              },
            },
          },
        },
      });
    }

    const catCanvas = container.querySelector('#chart-dashboard-categories');
    if (catCanvas && categoryBreakdown.length > 0) {
      categoryBreakdownChart = new window.Chart(catCanvas, {
        type: 'doughnut',
        data: {
          labels: categoryBreakdown.map((c) => c.category),
          datasets: [
            {
              data: categoryBreakdown.map((c) => c.total),
              backgroundColor: categoryBreakdown.map((c) => c.color),
              borderWidth: 2,
              borderColor: '#ffffff',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '66%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
                  return ` ${ctx.label}: ${formatCurrency(ctx.parsed)} (${pct}%)`;
                },
              },
            },
          },
        },
      });
    }
  }

  if (window.lucide) window.lucide.createIcons();
}
