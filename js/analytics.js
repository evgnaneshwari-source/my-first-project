/**
 * analytics.js
 * Feature 4: Expense Analytics view renderer & dynamic Chart.js visualizations.
 */

import {
  calculateSummary,
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
  getCategoryBreakdown,
  getMonthlyTrend,
} from './transactions.js';

let incomeVsExpenseChart = null;
let categoryBarChart = null;
let distributionChart = null;

function destroyAnalyticsCharts() {
  if (incomeVsExpenseChart) {
    incomeVsExpenseChart.destroy();
    incomeVsExpenseChart = null;
  }
  if (categoryBarChart) {
    categoryBarChart.destroy();
    categoryBarChart = null;
  }
  if (distributionChart) {
    distributionChart.destroy();
    distributionChart = null;
  }
}

export function renderAnalyticsView(container, state, handlers) {
  destroyAnalyticsCharts();

  const { transactions, activeMonth } = state;
  const summary = calculateSummary(transactions, activeMonth);
  const monthLabel = formatMonthLabel(activeMonth);
  const monthlyTrend = getMonthlyTrend(transactions, activeMonth, 6);

  const monthlyCategoryBreakdown = getCategoryBreakdown(transactions, 'expense', activeMonth);
  const overallCategoryBreakdown = getCategoryBreakdown(transactions, 'expense', null);
  const activeBreakdown =
    monthlyCategoryBreakdown.length > 0 ? monthlyCategoryBreakdown : overallCategoryBreakdown;
  const breakdownScopeLabel =
    monthlyCategoryBreakdown.length > 0 ? monthLabel : 'All Recorded Months';

  const topCategory = activeBreakdown[0] || null;
  const avgExpense =
    summary.expenseCount > 0 ? summary.totalExpenses / summary.expenseCount : 0;

  const netSavingsClass =
    summary.totalBalance > 0 ? 'is-positive' : summary.totalBalance < 0 ? 'is-negative' : '';

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Expense Analytics</h2>
        <p class="section-subtitle">Income versus spending comparison, category distribution, and savings insights.</p>
      </div>
    </div>

    <!-- Analytics KPI Strip -->
    <div class="kpi-grid">
      <article class="kpi-card">
        <div class="kpi-label">
          <span>Total Savings</span>
          <i data-lucide="piggy-bank"></i>
        </div>
        <div class="kpi-value ${netSavingsClass}">${formatCurrency(summary.totalBalance)}</div>
        <div class="kpi-meta">
          <span>Savings rate: ${summary.savingsRate.toFixed(1)}% of total income</span>
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-label">
          <span>Highest Spending Category</span>
          <i data-lucide="trending-up"></i>
        </div>
        <div class="kpi-value">${topCategory ? escapeHtml(topCategory.category) : '—'}</div>
        <div class="kpi-meta">
          <span>${
            topCategory
              ? `${formatCurrency(topCategory.total)} · ${topCategory.percentage.toFixed(
                  1
                )}% (${escapeHtml(breakdownScopeLabel)})`
              : 'No expenses recorded yet'
          }</span>
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-label">
          <span>Net Cashflow (${escapeHtml(monthLabel)})</span>
          <i data-lucide="activity"></i>
        </div>
        <div class="kpi-value ${
          summary.netMonthlyCashflow > 0
            ? 'is-positive'
            : summary.netMonthlyCashflow < 0
            ? 'is-negative'
            : ''
        }">${formatCurrency(summary.netMonthlyCashflow)}</div>
        <div class="kpi-meta">
          <span>${formatCurrency(summary.monthlyIncome)} in · ${formatCurrency(
            summary.monthlySpending
          )} out</span>
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-label">
          <span>Average Expense</span>
          <i data-lucide="receipt"></i>
        </div>
        <div class="kpi-value">${formatCurrency(avgExpense)}</div>
        <div class="kpi-meta">
          <span>Across ${summary.expenseCount} expense transaction${
            summary.expenseCount === 1 ? '' : 's'
          }</span>
        </div>
      </article>
    </div>

    ${
      transactions.length === 0
        ? `
          <div class="surface-card">
            <div class="empty-state">
              <div class="empty-state-icon"><i data-lucide="bar-chart-3"></i></div>
              <h3 class="empty-state-title">No analytics data available</h3>
              <p class="empty-state-desc">Add income and expense transactions to generate dynamic charts and category breakdowns.</p>
              <button type="button" class="btn btn-primary" data-analytics-add="true">Add Transaction</button>
            </div>
          </div>
        `
        : `
          <!-- Monthly Income vs Expenses + Category-wise Breakdown -->
          <div class="grid-2">
            <section class="surface-card">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Monthly Income vs. Expenses</h3>
                  <p class="card-subtitle">6-month cashflow comparison ending ${escapeHtml(
                    monthLabel
                  )}</p>
                </div>
              </div>
              <div class="chart-canvas-wrap is-tall">
                <canvas id="chart-analytics-income-expense" aria-label="Monthly income versus expenses chart"></canvas>
              </div>
            </section>

            <section class="surface-card">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Category-wise Expense Breakdown</h3>
                  <p class="card-subtitle">Total spending per category (${escapeHtml(
                    breakdownScopeLabel
                  )})</p>
                </div>
              </div>
              ${
                activeBreakdown.length > 0
                  ? `<div class="chart-canvas-wrap is-tall"><canvas id="chart-analytics-category-bar" aria-label="Category-wise expense breakdown chart"></canvas></div>`
                  : `<div class="empty-state">
                      <div class="empty-state-icon"><i data-lucide="layers"></i></div>
                      <h4 class="empty-state-title">No expense categories yet</h4>
                      <p class="empty-state-desc">Record an expense to inspect category comparisons.</p>
                    </div>`
              }
            </section>
          </div>

          <!-- Spending Distribution Chart & Detailed Table -->
          <div class="grid-2">
            <section class="surface-card">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Spending Distribution</h3>
                  <p class="card-subtitle">Proportional share across categories (${escapeHtml(
                    breakdownScopeLabel
                  )})</p>
                </div>
              </div>
              ${
                activeBreakdown.length > 0
                  ? `<div class="chart-canvas-wrap is-tall"><canvas id="chart-analytics-distribution" aria-label="Spending distribution chart"></canvas></div>`
                  : `<div class="empty-state">
                      <div class="empty-state-icon"><i data-lucide="pie-chart"></i></div>
                      <h4 class="empty-state-title">No spending distribution</h4>
                      <p class="empty-state-desc">Add expense entries to view share percentages.</p>
                    </div>`
              }
            </section>

            <section class="surface-card">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Category Spend Summary</h3>
                  <p class="card-subtitle">${escapeHtml(breakdownScopeLabel)} ranked highest to lowest</p>
                </div>
              </div>
              ${
                activeBreakdown.length > 0
                  ? `
                    <div class="table-scroll">
                      <table class="data-table">
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th class="col-right">Entries</th>
                            <th class="col-right">Share</th>
                            <th class="col-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${activeBreakdown
                            .map(
                              (item) => `
                            <tr>
                              <td>
                                <span style="display:inline-flex;align-items:center;gap:8px;font-weight:500;">
                                  <span class="color-swatch" style="background-color:${item.color};"></span>
                                  <span>${escapeHtml(item.category)}</span>
                                </span>
                              </td>
                              <td class="col-right tabular-nums">${item.count}</td>
                              <td class="col-right tabular-nums">${item.percentage.toFixed(1)}%</td>
                              <td class="col-right amount-cell">${formatCurrency(item.total)}</td>
                            </tr>
                          `
                            )
                            .join('')}
                        </tbody>
                      </table>
                    </div>
                  `
                  : `<div class="empty-state">
                      <p class="empty-state-desc">No expense categories recorded.</p>
                    </div>`
              }
            </section>
          </div>
        `
    }
  `;

  const addBtn = container.querySelector('[data-analytics-add]');
  if (addBtn) {
    addBtn.addEventListener('click', () => handlers.onOpenAdd());
  }

  if (typeof window.Chart === 'function' && transactions.length > 0) {
    const incExpCanvas = container.querySelector('#chart-analytics-income-expense');
    if (incExpCanvas) {
      incomeVsExpenseChart = new window.Chart(incExpCanvas, {
        type: 'bar',
        data: {
          labels: monthlyTrend.map((m) => m.label),
          datasets: [
            {
              label: 'Income',
              data: monthlyTrend.map((m) => m.income),
              backgroundColor: '#16a34a',
              borderRadius: 5,
              maxBarThickness: 28,
            },
            {
              label: 'Expenses',
              data: monthlyTrend.map((m) => m.expense),
              backgroundColor: '#0f172a',
              borderRadius: 5,
              maxBarThickness: 28,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              align: 'end',
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                usePointStyle: false,
                color: '#475569',
                font: { family: 'Plus Jakarta Sans', size: 12 },
              },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
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

    const catBarCanvas = container.querySelector('#chart-analytics-category-bar');
    if (catBarCanvas && activeBreakdown.length > 0) {
      categoryBarChart = new window.Chart(catBarCanvas, {
        type: 'bar',
        data: {
          labels: activeBreakdown.map((c) => c.category),
          datasets: [
            {
              label: 'Spent',
              data: activeBreakdown.map((c) => c.total),
              backgroundColor: activeBreakdown.map((c) => c.color),
              borderRadius: 5,
              maxBarThickness: 24,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${formatCurrency(ctx.parsed.x)}`,
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              border: { display: false },
              grid: { color: '#f1f5f9' },
              ticks: {
                color: '#64748b',
                font: { family: 'IBM Plex Mono', size: 11 },
                callback: (val) => `$${val.toLocaleString()}`,
              },
            },
            y: {
              grid: { display: false },
              ticks: { color: '#0f172a', font: { family: 'Plus Jakarta Sans', size: 12 } },
            },
          },
        },
      });
    }

    const distCanvas = container.querySelector('#chart-analytics-distribution');
    if (distCanvas && activeBreakdown.length > 0) {
      distributionChart = new window.Chart(distCanvas, {
        type: 'doughnut',
        data: {
          labels: activeBreakdown.map((c) => c.category),
          datasets: [
            {
              data: activeBreakdown.map((c) => c.total),
              backgroundColor: activeBreakdown.map((c) => c.color),
              borderWidth: 2,
              borderColor: '#ffffff',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                padding: 14,
                color: '#475569',
                font: { family: 'Plus Jakarta Sans', size: 12 },
              },
            },
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
