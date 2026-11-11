# Granola Kid Finance

A phone-friendly finance tracker for The Granola Kid. It runs on GitHub Pages and reads and writes to a Google Sheet through a Google Apps Script web app.

## Pages

- `index.html`: Finance. Expenses, income, the Manager's Office (GST, reconciliation, profit, cash wave) and CSV/JSON export.
- `create-order.html`: Production Order.

## GST

New expenses get 5% GST by default. **Bank Fees** and **Debt Repayment** default to **No GST**. You can switch GST on or off for any single expense, both when you add it and when you edit it. Manager's Office → Data Checks flags:

- GST recorded on a fee, interest or loan payment
- $0 GST on a purchase (this is fine if the vendor didn't charge GST)

## Making changes

1. Make changes on a branch, not on `main`.
2. Before you push, run `node scripts/check.mjs`. The **Checks** GitHub Action runs the same checks on every pull request.
3. When you ship, bump `APP_VERSION` near the top of the script in `index.html`. If you change `create-order.html`, bump its footer version and `ORDER_VERSION` in `index.html` together.
4. Merge the pull request. GitHub Pages publishes `main`.

## Backend

The Google Apps Script code is in `backend/Code.gs`. See `backend/README.md` for how to deploy it. GitHub doesn't deploy it automatically, so you paste it into Apps Script yourself.
