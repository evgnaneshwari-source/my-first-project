# ClearLedger — Expense Tracker

A minimalist, production-grade personal finance and expense tracking web application built strictly with **HTML5**, **CSS3**, and **Vanilla JavaScript** (ES Modules), using **Chart.js** and **Lucide Icons** via CDN and **LocalStorage** for client-side persistence.

## Project Structure

```text
expense-tracker/
├── index.html          # Semantic HTML5 shell, sidebar, topbar, view panels, and modals
├── css/
│   └── style.css       # CSS3 design system, responsive layout, tabular numerals, and alerts
├── js/
│   ├── app.js          # Application bootstrap, view routing, state sync, and UI events
│   ├── storage.js      # Centralized LocalStorage repository (API-ready CRUD interface)
│   ├── transactions.js # Pure financial calculations, validation, filters, and Transaction History
│   ├── dashboard.js    # Dashboard KPI cards, Chart.js overview charts, and recent entries
│   ├── analytics.js    # Income vs. expenses, category breakdown, distribution, and savings
│   └── budget.js       # Monthly budget threshold logic (80% warning, 100% exceeded alert)
└── assets/
    └── logo.svg        # Brand mark and favicon
```

## Module Overview

- **`js/storage.js`**: Centralizes all `localStorage` reads/writes (`getTransactions`, `saveTransaction`, `updateTransaction`, `deleteTransaction`, `getBudget`, `saveBudget`). Each function is structured so it can be swapped 1:1 with `fetch()` calls to an Express.js + SQL REST API later without touching UI modules.
- **`js/transactions.js`**: Houses pure calculation functions (`calculateSummary`, `getCategoryBreakdown`, `getMonthlyTrend`, `filterAndSortTransactions`, `validateTransactionInput`) completely independent of storage, plus the Transaction History table view and Add/Edit Transaction modal controller.
- **`js/dashboard.js`**: Renders dynamic KPI summary cards (`Total Balance = Total Income - Total Expenses`), Monthly Spending Overview bar chart, Expense Category Breakdown doughnut chart, and Recent Transactions table.
- **`js/analytics.js`**: Renders Total Savings, Highest Spending Category, Net Monthly Cashflow, Average Expense, Monthly Income vs. Expenses comparison chart, Category-wise horizontal bar chart, and Spending Distribution breakdown.
- **`js/budget.js`**: Computes monthly budget utilization (`monthlyExpenses / monthlyLimit`), remaining budget, and threshold state (`nominal`, `warning` at >= 80%, `exceeded` at >= 100%), along with a category budget impact table.
- **`js/app.js`**: Coordinates navigation between views, active month selection, confirmation dialogs, CSV export, mobile drawer controls, and toast notifications.

## Running Locally

### Option 1: Using the project dev server
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

### Option 2: Any static file server
Because the application uses native ES Modules (`<script type="module">`) and zero build-time framework dependencies, serve the project root over HTTP:
```bash
npx serve .
```
or with Python:
```bash
python3 -m http.server 8080
```
