/**
 * budget.js
 * Feature 5: Budget Management calculations and view renderer.
 * Tracks monthly expenses against monthly limit, shows remaining budget,
 * utilization percentage, 80% warning, and >= 100% exceeded alert.
 */

import {
  calculateSummary,
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
  getCategoryBreakdown,
} from './transactions.js';

/**
 * Pure calculation helper for budget status.
 */
export function computeBudgetStatus(transactions, budget, activeMonth) {
  const monthlyLimit = Math.max(0, Number(budget?.monthlyLimit) || 0);
  const summary = calculateSummary(transactions, activeMonth);
  const monthlyExpenses = summary.monthlySpending;

  if (monthlyLimit <= 0) {
    return {
      hasBudget: false,
      monthlyLimit: 0,
      monthlyExpenses,
      remainingBudget: 0,
      utilizationPct: 0,
      clampedPct: 0,
      state: 'unset',
    };
  }

  const remainingBudget = monthlyLimit - monthlyExpenses;
  const utilizationPct = (monthlyExpenses / monthlyLimit) * 100;
  const clampedPct = Math.min(100, Math.max(0, utilizationPct));

  let state = 'nominal';
  if (utilizationPct >= 100) {
    state = 'exceeded';
  } else if (utilizationPct >= 80) {
    state = 'warning';
  }

  return {
    hasBudget: true,
    monthlyLimit,
    monthlyExpenses,
    remainingBudget,
    utilizationPct,
    clampedPct,
    state,
  };
}

export function renderBudgetView(container, state, handlers) {
  const { transactions, budget, activeMonth } = state;
  const status = computeBudgetStatus(transactions, budget, activeMonth);
  const monthLabel = formatMonthLabel(activeMonth);
  const categoryBreakdown = getCategoryBreakdown(transactions, 'expense', activeMonth);

  let bannerHtml = '';
  if (!status.hasBudget) {
    bannerHtml = `
      <div class="alert-banner" role="status">
        <i data-lucide="info"></i>
        <div>
          <h3 class="alert-banner-title">No Monthly Budget Configured</h3>
          <p class="alert-banner-desc">
            Set a monthly spending limit below to track utilization, receive an early warning at 80%, and catch overspending immediately.
          </p>
        </div>
      </div>
    `;
  } else if (status.state === 'exceeded') {
    const overBy = Math.abs(status.remainingBudget);
    bannerHtml = `
      <div class="alert-banner is-exceeded" role="alert">
        <i data-lucide="alert-octagon"></i>
        <div>
          <h3 class="alert-banner-title">Alert: Monthly Budget Exceeded (${status.utilizationPct.toFixed(
            1
          )}%)</h3>
          <p class="alert-banner-desc">
            Spending for ${escapeHtml(monthLabel)} has exceeded your ${formatCurrency(
      status.monthlyLimit
    )} limit by <strong>${formatCurrency(overBy)}</strong>.
          </p>
        </div>
      </div>
    `;
  } else if (status.state === 'warning') {
    bannerHtml = `
      <div class="alert-banner is-warning" role="alert">
        <i data-lucide="alert-triangle"></i>
        <div>
          <h3 class="alert-banner-title">Warning: Approaching Budget Limit (${status.utilizationPct.toFixed(
            1
          )}%)</h3>
          <p class="alert-banner-desc">
            You have used over 80% of your ${formatCurrency(
              status.monthlyLimit
            )} budget for ${escapeHtml(monthLabel)}. Only <strong>${formatCurrency(
      status.remainingBudget
    )}</strong> remains.
          </p>
        </div>
      </div>
    `;
  } else {
    bannerHtml = `
      <div class="alert-banner is-nominal" role="status">
        <i data-lucide="check-circle-2"></i>
        <div>
          <h3 class="alert-banner-title">On Track: Within Monthly Budget (${status.utilizationPct.toFixed(
            1
          )}%)</h3>
          <p class="alert-banner-desc">
            You have <strong>${formatCurrency(
              status.remainingBudget
            )}</strong> remaining for ${escapeHtml(monthLabel)} before reaching your ${formatCurrency(
      status.monthlyLimit
    )} budget.
          </p>
        </div>
      </div>
    `;
  }

  const progressFillClass =
    status.state === 'exceeded'
      ? 'is-exceeded'
      : status.state === 'warning'
      ? 'is-warning'
      : '';

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Budget Management</h2>
        <p class="section-subtitle">Configure your monthly spending cap and monitor real-time utilization for ${escapeHtml(
          monthLabel
        )}.</p>
      </div>
    </div>

    ${bannerHtml}

    <div class="budget-layout">
      <!-- Set Monthly Budget Form -->
      <section class="surface-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Set Monthly Budget</h3>
            <p class="card-subtitle">Applies to monthly expense tracking across your workspace.</p>
          </div>
        </div>

        <form id="budget-form" class="form-group" style="gap: 14px;" novalidate>
          <div class="form-group">
            <label for="budget-limit-input" class="form-label">Monthly Spending Limit ($)</label>
            <input
              type="number"
              id="budget-limit-input"
              class="input-control mono-input"
              placeholder="e.g., 3200.00"
              step="0.01"
              min="1"
              value="${status.hasBudget ? status.monthlyLimit : ''}"
              required
            />
            <span id="err-budget-limit" class="field-error" role="alert"></span>
          </div>

          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <button type="submit" class="btn btn-primary">
              <i data-lucide="save"></i>
              <span>Save Budget</span>
            </button>
          </div>
        </form>
      </section>

      <!-- Budget Utilization Progress Card -->
      <section class="surface-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Utilization Overview (${escapeHtml(monthLabel)})</h3>
            <p class="card-subtitle">Warning triggers at 80% · Exceeded alert triggers at 100%</p>
          </div>
          <span class="tabular-nums" style="font-size: 18px; font-weight: 600;">
            ${status.hasBudget ? `${status.utilizationPct.toFixed(1)}%` : '0.0%'}
          </span>
        </div>

        <div class="progress-track" role="progressbar" aria-valuenow="${Math.round(
          status.utilizationPct
        )}" aria-valuemin="0" aria-valuemax="100" aria-label="Monthly budget utilization">
          <div class="progress-fill ${progressFillClass}" style="width: ${status.clampedPct}%;"></div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted);">
          <span>0%</span>
          <span>80% Warning Threshold</span>
          <span>100% Limit</span>
        </div>

        <div class="budget-metrics-row">
          <div>
            <div class="budget-metric-label">Monthly Budget</div>
            <div class="budget-metric-val">${formatCurrency(status.monthlyLimit)}</div>
          </div>
          <div>
            <div class="budget-metric-label">Monthly Expenses</div>
            <div class="budget-metric-val">${formatCurrency(status.monthlyExpenses)}</div>
          </div>
          <div>
            <div class="budget-metric-label">${
              status.remainingBudget < 0 ? 'Over Budget By' : 'Remaining Budget'
            }</div>
            <div class="budget-metric-val ${
              !status.hasBudget
                ? ''
                : status.remainingBudget < 0
                ? 'is-danger'
                : 'is-income'
            }">
              ${
                status.hasBudget
                  ? formatCurrency(Math.abs(status.remainingBudget))
                  : '$0.00'
              }
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Category Contributions to Monthly Budget -->
    <section class="surface-card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Category Impact on ${escapeHtml(monthLabel)} Budget</h3>
          <p class="card-subtitle">Breakdown of expenses contributing to this month's budget consumption</p>
        </div>
      </div>
      ${
        categoryBreakdown.length > 0
          ? `
            <div class="table-scroll">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th class="col-right">Transactions</th>
                    <th class="col-right">Amount Spent</th>
                    <th class="col-right">Share of Spending</th>
                    <th class="col-right">% of Monthly Budget</th>
                  </tr>
                </thead>
                <tbody>
                  ${categoryBreakdown
                    .map((item) => {
                      const pctOfBudget =
                        status.hasBudget && status.monthlyLimit > 0
                          ? `${((item.total / status.monthlyLimit) * 100).toFixed(1)}%`
                          : '—';
                      return `
                        <tr>
                          <td>
                            <span style="display:inline-flex;align-items:center;gap:8px;font-weight:500;">
                              <span class="color-swatch" style="background-color:${item.color};"></span>
                              <span>${escapeHtml(item.category)}</span>
                            </span>
                          </td>
                          <td class="col-right tabular-nums">${item.count}</td>
                          <td class="col-right amount-cell">${formatCurrency(item.total)}</td>
                          <td class="col-right tabular-nums">${item.percentage.toFixed(1)}%</td>
                          <td class="col-right tabular-nums">${pctOfBudget}</td>
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
              <div class="empty-state-icon"><i data-lucide="wallet"></i></div>
              <h4 class="empty-state-title">No expenses recorded in ${escapeHtml(monthLabel)}</h4>
              <p class="empty-state-desc">Once you record expenses for this month, each category's budget impact will appear here.</p>
            </div>
          `
      }
    </section>
  `;

  const form = container.querySelector('#budget-form');
  const limitInput = container.querySelector('#budget-limit-input');
  const limitErr = container.querySelector('#err-budget-limit');

  limitInput.addEventListener('input', () => {
    limitInput.classList.remove('is-invalid');
    limitErr.textContent = '';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = Number(limitInput.value);
    if (!limitInput.value || Number.isNaN(val) || val <= 0) {
      limitInput.classList.add('is-invalid');
      limitErr.textContent = 'Enter a valid monthly budget greater than 0.';
      return;
    }
    if (val > 100000000) {
      limitInput.classList.add('is-invalid');
      limitErr.textContent = 'Budget cannot exceed 100,000,000.';
      return;
    }

    handlers.onSaveBudget(val);
  });

  if (window.lucide) window.lucide.createIcons();
}
