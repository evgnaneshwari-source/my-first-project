/**
 * subscriptions.js
 * Feature: Subscription Tracker
 * Manages recurring subscriptions, billing cycles (monthly/yearly),
 * renewal countdowns, 7-day payment reminder alerts, unused subscription reviews,
 * and spending analytics.
 */

import { SUBSCRIPTION_CATEGORIES, getTodayISO } from './storage.js';
import { escapeHtml, formatCurrency, formatDateDisplay } from './transactions.js';

export const SUBSCRIPTION_COLORS = {
  Entertainment: '#7c3aed',
  Education: '#4f46e5',
  Shopping: '#0891b2',
  Fitness: '#0f766e',
  Software: '#2563eb',
  Utilities: '#d97706',
  Other: '#64748b',
};

let subscriptionDoughnutChart = null;

function destroySubscriptionCharts() {
  if (subscriptionDoughnutChart) {
    subscriptionDoughnutChart.destroy();
    subscriptionDoughnutChart = null;
  }
}

/**
 * Calculates days remaining until the given renewal date (YYYY-MM-DD).
 */
export function getDaysUntilRenewal(isoDate) {
  if (!isoDate) return 0;
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = target.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Formats a friendly countdown label for renewal dates.
 */
export function formatRenewalCountdown(days) {
  if (days === 0) return 'Renews today';
  if (days === 1) return 'Renews tomorrow';
  if (days > 1 && days <= 7) return `Renews in ${days} days`;
  if (days > 7) return `In ${days} days`;
  const past = Math.abs(days);
  return `${past} day${past === 1 ? '' : 's'} overdue`;
}

/**
 * Returns equivalent monthly and yearly costs for a subscription.
 */
export function getSubscriptionCostRates(sub) {
  const amt = Number(sub.amount) || 0;
  if (sub.billing_cycle === 'yearly') {
    return {
      monthlyRate: amt / 12,
      yearlyRate: amt,
      displayCost: `${formatCurrency(amt)}/yr`,
      monthlyEquivalent: `${formatCurrency(amt / 12)}/mo`,
    };
  }
  return {
    monthlyRate: amt,
    yearlyRate: amt * 12,
    displayCost: `${formatCurrency(amt)}/mo`,
    monthlyEquivalent: null,
  };
}

/**
 * Summary calculations for subscriptions.
 */
export function calculateSubscriptionSummary(subscriptions) {
  let monthlyTotal = 0;
  let activeCount = 0;
  let cancelledCount = 0;
  let expiredCount = 0;
  const upcomingRenewals = [];
  const unusedSubs = [];

  for (const sub of subscriptions) {
    if (sub.status === 'active') {
      activeCount += 1;
      const { monthlyRate } = getSubscriptionCostRates(sub);
      monthlyTotal += monthlyRate;

      const days = getDaysUntilRenewal(sub.renewal_date);
      if (days >= 0 && days <= 7) {
        upcomingRenewals.push({ ...sub, daysUntil: days });
      }

      if (sub.is_unused) {
        unusedSubs.push({ ...sub, monthlyRate });
      }
    } else if (sub.status === 'cancelled') {
      cancelledCount += 1;
    } else if (sub.status === 'expired') {
      expiredCount += 1;
    }
  }

  upcomingRenewals.sort((a, b) => a.daysUntil - b.daysUntil);

  const yearlyTotal = monthlyTotal * 12;
  const unusedMonthlySavings = unusedSubs.reduce((acc, s) => acc + s.monthlyRate, 0);

  return {
    monthlyTotal,
    yearlyTotal,
    activeCount,
    cancelledCount,
    expiredCount,
    totalCount: subscriptions.length,
    upcomingRenewals,
    unusedSubs,
    unusedMonthlySavings,
    unusedYearlySavings: unusedMonthlySavings * 12,
  };
}

/**
 * Computes category breakdown for active subscriptions (by monthly equivalent).
 */
export function getSubscriptionCategoryBreakdown(subscriptions) {
  const map = new Map();
  let grandMonthly = 0;

  for (const sub of subscriptions) {
    if (sub.status !== 'active') continue;
    const { monthlyRate } = getSubscriptionCostRates(sub);
    grandMonthly += monthlyRate;

    const existing = map.get(sub.category) || { category: sub.category, totalMonthly: 0, count: 0 };
    existing.totalMonthly += monthlyRate;
    existing.count += 1;
    map.set(sub.category, existing);
  }

  return Array.from(map.values())
    .sort((a, b) => b.totalMonthly - a.totalMonthly)
    .map((entry) => ({
      ...entry,
      percentage: grandMonthly > 0 ? (entry.totalMonthly / grandMonthly) * 100 : 0,
      color: SUBSCRIPTION_COLORS[entry.category] || '#64748b',
    }));
}

/**
 * Filter and sort subscriptions in memory.
 */
export function filterAndSortSubscriptions(subscriptions, filters) {
  const search = (filters.search || '').trim().toLowerCase();
  const category = filters.category || 'all';
  const status = filters.status || 'all';
  const sortBy = filters.sortBy || 'renewal-asc';

  const filtered = subscriptions.filter((sub) => {
    if (status === 'unused') {
      if (!sub.is_unused || sub.status !== 'active') return false;
    } else if (status !== 'all' && sub.status !== status) {
      return false;
    }

    if (category !== 'all' && sub.category !== category) return false;

    if (search) {
      const hay = `${sub.name} ${sub.description} ${sub.category} ${sub.billing_cycle}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    const rateA = getSubscriptionCostRates(a).monthlyRate;
    const rateB = getSubscriptionCostRates(b).monthlyRate;

    switch (sortBy) {
      case 'renewal-desc':
        return b.renewal_date.localeCompare(a.renewal_date);
      case 'cost-desc':
        return rateB - rateA;
      case 'cost-asc':
        return rateA - rateB;
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'renewal-asc':
      default:
        return a.renewal_date.localeCompare(b.renewal_date);
    }
  });

  return filtered;
}

/* ==========================================================================
   Subscription View Renderer
   ========================================================================== */

const subFilters = {
  search: '',
  category: 'all',
  status: 'all',
  sortBy: 'renewal-asc',
};

export function renderSubscriptionsView(container, state, handlers) {
  destroySubscriptionCharts();

  const { subscriptions = [] } = state;
  const summary = calculateSubscriptionSummary(subscriptions);
  const categoryBreakdown = getSubscriptionCategoryBreakdown(subscriptions);
  const filtered = filterAndSortSubscriptions(subscriptions, subFilters);

  const allCategories = Array.from(
    new Set([...SUBSCRIPTION_CATEGORIES, ...subscriptions.map((s) => s.category)])
  ).sort();

  // 1. Upcoming Renewals Alert Banner (Next 7 days)
  let upcomingBannerHtml = '';
  if (summary.upcomingRenewals.length > 0) {
    const totalDue = summary.upcomingRenewals.reduce((sum, s) => sum + Number(s.amount), 0);
    upcomingBannerHtml = `
      <div class="alert-banner is-warning" role="alert">
        <i data-lucide="bell-ring"></i>
        <div style="flex: 1;">
          <h3 class="alert-banner-title">
            Payment Reminder: ${summary.upcomingRenewals.length} Renewal${
              summary.upcomingRenewals.length === 1 ? '' : 's'
            } Due in Next 7 Days (${formatCurrency(totalDue)} Total)
          </h3>
          <p class="alert-banner-desc">
            ${summary.upcomingRenewals
              .map(
                (s) =>
                  `<strong>${escapeHtml(s.name)}</strong> (${formatCurrency(s.amount)} — ${formatRenewalCountdown(
                    s.daysUntil
                  )})`
              )
              .join(' · ')}
          </p>
        </div>
      </div>
    `;
  }

  // 2. Unused Subscriptions Alert Banner
  let unusedBannerHtml = '';
  if (summary.unusedSubs.length > 0) {
    unusedBannerHtml = `
      <div class="alert-banner is-exceeded" role="alert">
        <i data-lucide="alert-triangle"></i>
        <div style="flex: 1;">
          <h3 class="alert-banner-title">
            Unused Subscriptions Alert: Save up to ${formatCurrency(
              summary.unusedMonthlySavings
            )}/mo (${formatCurrency(summary.unusedYearlySavings)}/yr)
          </h3>
          <p class="alert-banner-desc">
            You marked ${summary.unusedSubs.length} active subscription${
              summary.unusedSubs.length === 1 ? '' : 's'
            } as unused: ${summary.unusedSubs.map((s) => `<strong>${escapeHtml(s.name)}</strong>`).join(', ')}.
            Review them for cancellation to reduce recurring expenses.
          </p>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Subscription Tracker</h2>
        <p class="section-subtitle">Manage recurring services, monitor renewal dates, track monthly & yearly costs, and identify unused subscriptions.</p>
      </div>
      <button type="button" id="btn-open-add-sub" class="btn btn-primary">
        <i data-lucide="plus"></i>
        <span>Add Subscription</span>
      </button>
    </div>

    ${upcomingBannerHtml}
    ${unusedBannerHtml}

    <!-- 4 KPI Cards -->
    <div class="kpi-grid">
      <article class="kpi-card">
        <div class="kpi-label">
          <span>Monthly Recurring Cost</span>
          <i data-lucide="repeat"></i>
        </div>
        <div class="kpi-value">${formatCurrency(summary.monthlyTotal)}</div>
        <div class="kpi-meta">
          <span>Normalized monthly recurring commitments</span>
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-label">
          <span>Yearly Subscription Cost</span>
          <i data-lucide="calendar"></i>
        </div>
        <div class="kpi-value is-positive">${formatCurrency(summary.yearlyTotal)}</div>
        <div class="kpi-meta">
          <span>Projected annual expense on active services</span>
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-label">
          <span>Active Subscriptions</span>
          <i data-lucide="check-circle-2"></i>
        </div>
        <div class="kpi-value">${summary.activeCount}</div>
        <div class="kpi-meta">
          <span>${summary.cancelledCount} cancelled · ${summary.expiredCount} expired</span>
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-label">
          <span>Renewing Within 7 Days</span>
          <i data-lucide="clock"></i>
        </div>
        <div class="kpi-value ${summary.upcomingRenewals.length > 0 ? 'is-negative' : ''}">
          ${summary.upcomingRenewals.length}
        </div>
        <div class="kpi-meta">
          <span>${
            summary.upcomingRenewals.length > 0
              ? 'Upcoming payments requiring review'
              : 'No renewals due this week'
          }</span>
        </div>
      </article>
    </div>

    <!-- Charts & Analytics Grid -->
    <div class="grid-dashboard-charts">
      <section class="surface-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Subscription Spending by Category</h3>
            <p class="card-subtitle">Monthly equivalent breakdown across categories</p>
          </div>
        </div>
        ${
          categoryBreakdown.length > 0
            ? `
              <div class="chart-canvas-wrap" style="height: 200px;">
                <canvas id="chart-subs-categories" aria-label="Subscription category breakdown chart"></canvas>
              </div>
              <ul class="breakdown-list">
                ${categoryBreakdown
                  .map(
                    (item) => `
                  <li class="breakdown-item">
                    <span class="breakdown-left">
                      <span class="color-swatch" style="background-color: ${item.color};"></span>
                      <span class="breakdown-name">${escapeHtml(item.category)} (${item.count})</span>
                    </span>
                    <span class="breakdown-right">
                      <span class="breakdown-share">${item.percentage.toFixed(1)}%</span>
                      <span class="breakdown-amount">${formatCurrency(item.totalMonthly)}/mo</span>
                    </span>
                  </li>
                `
                  )
                  .join('')}
              </ul>
            `
            : `
              <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="pie-chart"></i></div>
                <h4 class="empty-state-title">No active subscriptions</h4>
                <p class="empty-state-desc">Add a recurring subscription to visualize category spend.</p>
              </div>
            `
        }
      </section>

      <section class="surface-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Upcoming Renewal Schedule</h3>
            <p class="card-subtitle">Next scheduled payments in chronological order</p>
          </div>
        </div>
        ${
          summary.activeCount > 0
            ? `
              <ul class="breakdown-list" style="margin-top: 8px;">
                ${subscriptions
                  .filter((s) => s.status === 'active')
                  .sort((a, b) => a.renewal_date.localeCompare(b.renewal_date))
                  .slice(0, 5)
                  .map((sub) => {
                    const days = getDaysUntilRenewal(sub.renewal_date);
                    const isUrgent = days >= 0 && days <= 7;
                    const isOverdue = days < 0;
                    const toneColor = isOverdue
                      ? 'var(--danger)'
                      : isUrgent
                      ? 'var(--warning)'
                      : 'var(--text-secondary)';
                    return `
                      <li class="breakdown-item" style="padding: 10px 0;">
                        <span class="breakdown-left">
                          <i data-lucide="${isUrgent ? 'alert-circle' : 'calendar'}" style="color: ${toneColor}; width: 16px; height: 16px;"></i>
                          <div>
                            <div style="font-weight: 600; font-size: 13.5px;">${escapeHtml(sub.name)}</div>
                            <div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(sub.category)} · ${escapeHtml(sub.billing_cycle)}</div>
                          </div>
                        </span>
                        <span class="breakdown-right" style="text-align: right;">
                          <div style="font-family: var(--font-mono); font-weight: 600;">${formatCurrency(sub.amount)}</div>
                          <div style="font-size: 11.5px; font-weight: 500; color: ${toneColor};">
                            ${formatRenewalCountdown(days)}
                          </div>
                        </span>
                      </li>
                    `;
                  })
                  .join('')}
              </ul>
            `
            : `
              <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="calendar-clock"></i></div>
                <h4 class="empty-state-title">No upcoming renewals</h4>
                <p class="empty-state-desc">Your scheduled renewal timeline will appear here.</p>
              </div>
            `
        }
      </section>
    </div>

    <!-- Subscriptions List & Filter Surface -->
    <div class="surface-card">
      <div class="toolbar">
        <div class="toolbar-filters">
          <div class="search-input-wrap">
            <i data-lucide="search"></i>
            <label for="filter-sub-search" class="sr-only">Search subscriptions</label>
            <input
              type="search"
              id="filter-sub-search"
              class="input-control"
              placeholder="Search service, notes, category..."
              value="${escapeHtml(subFilters.search)}"
            />
          </div>

          <label for="filter-sub-status" class="sr-only">Filter by status</label>
          <select id="filter-sub-status" class="select-control select-compact">
            <option value="all" ${subFilters.status === 'all' ? 'selected' : ''}>All Statuses</option>
            <option value="active" ${subFilters.status === 'active' ? 'selected' : ''}>Active Only</option>
            <option value="unused" ${subFilters.status === 'unused' ? 'selected' : ''}>Unused / Flagged</option>
            <option value="cancelled" ${subFilters.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            <option value="expired" ${subFilters.status === 'expired' ? 'selected' : ''}>Expired</option>
          </select>

          <label for="filter-sub-category" class="sr-only">Filter by category</label>
          <select id="filter-sub-category" class="select-control select-compact">
            <option value="all" ${subFilters.category === 'all' ? 'selected' : ''}>All Categories</option>
            ${allCategories
              .map(
                (cat) =>
                  `<option value="${escapeHtml(cat)}" ${
                    subFilters.category === cat ? 'selected' : ''
                  }>${escapeHtml(cat)}</option>`
              )
              .join('')}
          </select>

          <label for="filter-sub-sort" class="sr-only">Sort subscriptions</label>
          <select id="filter-sub-sort" class="select-control select-compact">
            <option value="renewal-asc" ${subFilters.sortBy === 'renewal-asc' ? 'selected' : ''}>Renewal: Soonest First</option>
            <option value="renewal-desc" ${subFilters.sortBy === 'renewal-desc' ? 'selected' : ''}>Renewal: Furthest First</option>
            <option value="cost-desc" ${subFilters.sortBy === 'cost-desc' ? 'selected' : ''}>Cost: High to Low</option>
            <option value="cost-asc" ${subFilters.sortBy === 'cost-asc' ? 'selected' : ''}>Cost: Low to High</option>
            <option value="name-asc" ${subFilters.sortBy === 'name-asc' ? 'selected' : ''}>Name: A to Z</option>
          </select>
        </div>

        ${
          subFilters.search || subFilters.category !== 'all' || subFilters.status !== 'all'
            ? `<button type="button" id="btn-reset-sub-filters" class="btn btn-ghost">Reset Filters</button>`
            : ''
        }
      </div>

      <div class="summary-strip">
        <span>Showing <strong>${filtered.length}</strong> of <strong>${subscriptions.length}</strong> subscriptions</span>
        <span aria-hidden="true">·</span>
        <span>Active Monthly Spend: <strong>${formatCurrency(summary.monthlyTotal)}</strong></span>
        <span aria-hidden="true">·</span>
        <span>Active Yearly Spend: <strong style="color: var(--income);">${formatCurrency(summary.yearlyTotal)}</strong></span>
      </div>

      <div id="subs-table-region">
        ${renderSubscriptionsTableRows(filtered, subscriptions.length === 0, handlers)}
      </div>
    </div>
  `;

  // Wire Add button
  container.querySelector('#btn-open-add-sub')?.addEventListener('click', () => {
    handlers.onOpenAddSubscription();
  });

  const emptyAddBtn = container.querySelector('[data-empty-add-sub]');
  if (emptyAddBtn) {
    emptyAddBtn.addEventListener('click', () => handlers.onOpenAddSubscription());
  }

  // Wire Table Actions
  wireTableActionListeners(container, handlers);

  // Wire Filters
  const searchInput = container.querySelector('#filter-sub-search');
  const statusSelect = container.querySelector('#filter-sub-status');
  const catSelect = container.querySelector('#filter-sub-category');
  const sortSelect = container.querySelector('#filter-sub-sort');
  const resetBtn = container.querySelector('#btn-reset-sub-filters');

  searchInput.addEventListener('input', (e) => {
    subFilters.search = e.target.value;
    const nextFiltered = filterAndSortSubscriptions(subscriptions, subFilters);
    const tableRegion = container.querySelector('#subs-table-region');
    tableRegion.innerHTML = renderSubscriptionsTableRows(nextFiltered, subscriptions.length === 0, handlers);
    wireTableActionListeners(container, handlers);
    if (window.lucide) window.lucide.createIcons();
  });

  statusSelect.addEventListener('change', (e) => {
    subFilters.status = e.target.value;
    renderSubscriptionsView(container, state, handlers);
  });

  catSelect.addEventListener('change', (e) => {
    subFilters.category = e.target.value;
    renderSubscriptionsView(container, state, handlers);
  });

  sortSelect.addEventListener('change', (e) => {
    subFilters.sortBy = e.target.value;
    renderSubscriptionsView(container, state, handlers);
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      subFilters.search = '';
      subFilters.category = 'all';
      subFilters.status = 'all';
      subFilters.sortBy = 'renewal-asc';
      renderSubscriptionsView(container, state, handlers);
    });
  }

  // Render Category Doughnut Chart
  if (typeof window.Chart === 'function' && categoryBreakdown.length > 0) {
    const canvas = container.querySelector('#chart-subs-categories');
    if (canvas) {
      subscriptionDoughnutChart = new window.Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: categoryBreakdown.map((c) => c.category),
          datasets: [
            {
              data: categoryBreakdown.map((c) => c.totalMonthly),
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
                  return ` ${ctx.label}: ${formatCurrency(ctx.parsed)}/mo (${pct}%)`;
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

function renderSubscriptionsTableRows(rows, isEntirelyEmpty, handlers) {
  if (rows.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i data-lucide="${isEntirelyEmpty ? 'repeat' : 'search-x'}"></i>
        </div>
        <h3 class="empty-state-title">
          ${isEntirelyEmpty ? 'No subscriptions tracked yet' : 'No matching subscriptions found'}
        </h3>
        <p class="empty-state-desc">
          ${
            isEntirelyEmpty
              ? 'Add your recurring services (Netflix, Spotify, Amazon Prime, gym memberships, etc.) to monitor renewals and total monthly spend.'
              : 'Try adjusting your search query, status, or category filter.'
          }
        </p>
        ${
          isEntirelyEmpty
            ? `<button type="button" class="btn btn-primary" data-empty-add-sub="true">Add First Subscription</button>`
            : ''
        }
      </div>
    `;
  }

  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Subscription</th>
            <th>Category</th>
            <th>Billing Cycle & Cost</th>
            <th>Next Renewal</th>
            <th>Status</th>
            <th>Unused?</th>
            <th class="col-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((sub) => {
              const { displayCost, monthlyEquivalent } = getSubscriptionCostRates(sub);
              const days = getDaysUntilRenewal(sub.renewal_date);
              const isUrgent = sub.status === 'active' && days >= 0 && days <= 7;
              const isOverdue = sub.status === 'active' && days < 0;

              const statusColor =
                sub.status === 'active'
                  ? 'var(--income)'
                  : sub.status === 'cancelled'
                  ? 'var(--text-muted)'
                  : 'var(--danger)';

              const statusLabel =
                sub.status === 'active'
                  ? 'Active'
                  : sub.status === 'cancelled'
                  ? 'Cancelled'
                  : 'Expired';

              const countdownClass = isOverdue
                ? 'is-negative'
                : isUrgent
                ? 'is-warning'
                : '';

              return `
                <tr data-id="${escapeHtml(sub.id)}">
                  <td>
                    <div class="txn-title-cell">
                      <span class="txn-title-text">${escapeHtml(sub.name)}</span>
                      ${
                        sub.description
                          ? `<span class="txn-desc-text" title="${escapeHtml(sub.description)}">${escapeHtml(
                              sub.description
                            )}</span>`
                          : ''
                      }
                    </div>
                  </td>
                  <td>
                    <span style="display:inline-flex;align-items:center;gap:6px;font-weight:500;">
                      <span class="color-swatch" style="background-color: ${
                        SUBSCRIPTION_COLORS[sub.category] || '#64748b'
                      };"></span>
                      <span>${escapeHtml(sub.category)}</span>
                    </span>
                  </td>
                  <td>
                    <div style="font-family: var(--font-mono); font-weight: 600;">
                      ${escapeHtml(displayCost)}
                    </div>
                    ${
                      monthlyEquivalent
                        ? `<div style="font-size: 11.5px; color: var(--text-muted); font-family: var(--font-mono);">${escapeHtml(
                            monthlyEquivalent
                          )}</div>`
                        : ''
                    }
                  </td>
                  <td>
                    <div class="tabular-nums" style="font-weight: 500;">${escapeHtml(
                      formatDateDisplay(sub.renewal_date)
                    )}</div>
                    <div style="font-size: 11.5px; font-weight: 600; color: ${
                      isOverdue ? 'var(--danger)' : isUrgent ? '#d97706' : 'var(--text-muted)'
                    };">
                      ${formatRenewalCountdown(days)}
                    </div>
                  </td>
                  <td>
                    <span class="type-label" style="color: ${statusColor};">
                      <i data-lucide="${
                        sub.status === 'active'
                          ? 'check-circle'
                          : sub.status === 'cancelled'
                          ? 'slash'
                          : 'x-circle'
                      }"></i>
                      <span>${statusLabel}</span>
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn btn-ghost"
                      style="padding: 4px 8px; font-size: 12px; ${
                        sub.is_unused
                          ? 'background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-border);'
                          : 'color: var(--text-muted);'
                      }"
                      data-action="toggle-unused"
                      data-id="${escapeHtml(sub.id)}"
                      title="${sub.is_unused ? 'Marked as unused. Click to unflag.' : 'Click to flag as unused.'}"
                    >
                      <i data-lucide="${sub.is_unused ? 'alert-triangle' : 'bookmark'}"></i>
                      <span>${sub.is_unused ? 'Unused' : 'Used'}</span>
                    </button>
                  </td>
                  <td class="col-right">
                    <div class="row-actions">
                      <button
                        type="button"
                        class="icon-btn"
                        data-action="edit-sub"
                        data-id="${escapeHtml(sub.id)}"
                        aria-label="Edit ${escapeHtml(sub.name)}"
                        title="Edit subscription"
                      >
                        <i data-lucide="pencil"></i>
                      </button>
                      <button
                        type="button"
                        class="icon-btn is-danger"
                        data-action="delete-sub"
                        data-id="${escapeHtml(sub.id)}"
                        aria-label="Delete ${escapeHtml(sub.name)}"
                        title="Delete subscription"
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
}

function wireTableActionListeners(container, handlers) {
  container.querySelectorAll('[data-action="edit-sub"]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onEditSubscription(btn.dataset.id));
  });

  container.querySelectorAll('[data-action="delete-sub"]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onDeleteSubscription(btn.dataset.id));
  });

  container.querySelectorAll('[data-action="toggle-unused"]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onToggleUnused(btn.dataset.id));
  });
}

/* ==========================================================================
   Add / Edit Subscription Modal Controller
   ========================================================================== */

export function createSubscriptionModalController({ onSave }) {
  const modal = document.getElementById('subscription-modal');
  const form = document.getElementById('subscription-form');
  const modalTitle = document.getElementById('subscription-modal-title');
  const modalSubtitle = document.getElementById('subscription-modal-subtitle');
  const submitBtn = document.getElementById('subscription-submit-btn');

  const idInput = document.getElementById('sub-id');
  const nameInput = document.getElementById('sub-name');
  const amountInput = document.getElementById('sub-amount');
  const cycleInput = document.getElementById('sub-cycle');
  const catSelect = document.getElementById('sub-category');
  const renewalInput = document.getElementById('sub-renewal-date');
  const statusSelect = document.getElementById('sub-status');
  const unusedCheckbox = document.getElementById('sub-unused');
  const descInput = document.getElementById('sub-description');

  const btnMonthly = document.getElementById('sub-cycle-monthly');
  const btnYearly = document.getElementById('sub-cycle-yearly');
  const closeBtn = document.getElementById('subscription-modal-close');
  const cancelBtn = document.getElementById('subscription-modal-cancel');

  function populateCategories(selectedCategory = '') {
    catSelect.innerHTML = [
      `<option value="">Select a category</option>`,
      ...SUBSCRIPTION_CATEGORIES.map(
        (cat) =>
          `<option value="${escapeHtml(cat)}" ${
            selectedCategory === cat ? 'selected' : ''
          }>${escapeHtml(cat)}</option>`
      ),
    ].join('');
  }

  function setBillingCycle(cycle) {
    const normalized = cycle === 'yearly' ? 'yearly' : 'monthly';
    cycleInput.value = normalized;
    btnMonthly.classList.toggle('is-active', normalized === 'monthly');
    btnMonthly.setAttribute('aria-pressed', String(normalized === 'monthly'));
    btnYearly.classList.toggle('is-active', normalized === 'yearly');
    btnYearly.setAttribute('aria-pressed', String(normalized === 'yearly'));
  }

  function clearErrors() {
    ['name', 'amount', 'category', 'renewal-date'].forEach((field) => {
      const errEl = document.getElementById(`err-sub-${field}`);
      const inputEl = document.getElementById(`sub-${field}`);
      if (errEl) errEl.textContent = '';
      if (inputEl) inputEl.classList.remove('is-invalid');
    });
  }

  function showErrors(errors) {
    Object.entries(errors).forEach(([field, msg]) => {
      const errEl = document.getElementById(`err-sub-${field}`);
      const inputEl = document.getElementById(`sub-${field}`);
      if (errEl) errEl.textContent = msg;
      if (inputEl) inputEl.classList.add('is-invalid');
    });
  }

  function openForCreate() {
    clearErrors();
    form.reset();
    idInput.value = '';
    setBillingCycle('monthly');
    populateCategories('');
    renewalInput.value = getTodayISO();
    statusSelect.value = 'active';
    unusedCheckbox.checked = false;
    modalTitle.textContent = 'Add Subscription';
    modalSubtitle.textContent = 'Track a new recurring subscription service.';
    submitBtn.textContent = 'Save Subscription';
    modal.hidden = false;
    nameInput.focus();
    if (window.lucide) window.lucide.createIcons();
  }

  function openForEdit(sub) {
    clearErrors();
    idInput.value = sub.id;
    nameInput.value = sub.name;
    amountInput.value = sub.amount;
    setBillingCycle(sub.billing_cycle);
    populateCategories(sub.category);
    renewalInput.value = sub.renewal_date;
    statusSelect.value = sub.status || 'active';
    unusedCheckbox.checked = Boolean(sub.is_unused);
    descInput.value = sub.description || '';
    modalTitle.textContent = 'Edit Subscription';
    modalSubtitle.textContent = 'Update details of this recurring subscription.';
    submitBtn.textContent = 'Update Subscription';
    modal.hidden = false;
    nameInput.focus();
    if (window.lucide) window.lucide.createIcons();
  }

  function close() {
    modal.hidden = true;
    clearErrors();
  }

  btnMonthly.addEventListener('click', () => setBillingCycle('monthly'));
  btnYearly.addEventListener('click', () => setBillingCycle('yearly'));
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  [nameInput, amountInput, catSelect, renewalInput].forEach((el) => {
    el.addEventListener('input', () => {
      el.classList.remove('is-invalid');
      const errEl = document.getElementById(`err-${el.id}`);
      if (errEl) errEl.textContent = '';
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();

    const errors = {};
    const name = nameInput.value.trim();
    const amount = Number(amountInput.value);
    const category = catSelect.value;
    const renewal_date = renewalInput.value;

    if (!name) errors.name = 'Please enter a subscription name.';
    if (!amountInput.value || Number.isNaN(amount) || amount <= 0) {
      errors.amount = 'Enter a valid amount greater than 0.';
    }
    if (!category) errors.category = 'Please select a category.';
    if (!renewal_date || !/^\d{4}-\d{2}-\d{2}$/.test(renewal_date)) {
      errors['renewal-date'] = 'Select a valid renewal date.';
    }

    if (Object.keys(errors).length > 0) {
      showErrors(errors);
      return;
    }

    onSave({
      id: idInput.value ? idInput.value : undefined,
      name,
      amount,
      billing_cycle: cycleInput.value,
      category,
      renewal_date,
      status: statusSelect.value,
      is_unused: unusedCheckbox.checked,
      description: descInput.value.trim(),
    });

    close();
  });

  return {
    openForCreate,
    openForEdit,
    close,
  };
}
