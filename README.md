# React + TypeScript + Vite

## Deploy to GitHub Pages

This repository deploys automatically to GitHub Pages when changes are pushed to `main`. The workflow is in `.github/workflows/deploy.yml` and uses Vite's relative asset paths, so it works for both a repository site and a custom domain.

Before the first deployment:

1. In the GitHub repository, open **Settings > Secrets and variables > Actions**.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository secrets.
3. Open **Settings > Pages** and set **Source** to **GitHub Actions**.
4. Push to `main`, or run the **Deploy to GitHub Pages** workflow manually from the **Actions** tab.

The Supabase service-role key is only needed locally by the import script. Never add it as a `VITE_` variable or expose it to the Pages build.

## Historical budget import

### XLSX workbook audit

The importer can inspect a workbook whose monthly sheets are named `Month Year`:

```powershell
node scripts/import-budget.mjs --workbook .\data\Vees Monthly budget.xlsx --audit
```

The audit reports accepted months, ignored sheets, balances, unique expenses, payment-method conflicts, and actual-value findings. It ignores every sheet before January 2022, `October 2026`, `November 2026`, `December 2026`, and sheets that do not exactly match the `Month Year` convention. `January 2025 Joined MBMED` is explicitly treated as January 2025. The current workbook's other ignored sheets are `Venda Trip Dec 2023`, `Tiling Project July 2025`, and `Tiling Project December 2025`.

`Absa Credit Card` is normalized as a debit order even when it appears under manual payments in an older sheet.

Workbook imports initially assign every item to `Uncategorized`. The workbook has no paid-status column, so blank or text actual values are imported as `actual = 0` and `paid = false`. Unavailable starting or ending balances are imported as `0` and listed in the audit report. Items whose payment method changes between months block the import unless the rule is explicitly normalized.

```powershell
node scripts/import-budget.mjs --workbook .\data\Vees Monthly budget.xlsx --import
```

Do not use `--import` until the audit findings have been reviewed. The importer uses the workbook's starting and ending balances for each month and upserts existing monthly entries.

Copy `budget-category-mapping.example.json` to a local JSON file and fill in one `item name` to category entry for every CSV item. Keep the mapping file private if it contains personal data.

The importer expects CSV columns named `item name`, `planned`, `actual`, and `section`. Section values are `debit_order`, `manual`, or `income`. It uses the Supabase service-role key because the deployed RLS policies require an authenticated server-side client.

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`, then run one file with an explicit month:

```powershell
node scripts/import-budget.mjs --file .\csv\2025-01.csv --month 2025-01 --mapping .\budget-category-mapping.json
```

Or import a directory of files named `YYYY-MM.csv`:

```powershell
node scripts/import-budget.mjs --input-dir .\csv --mapping .\budget-category-mapping.json
```

Use `--start-balance` and `--end-balance` for month balances, and `--dry-run` to validate CSVs and mappings without writing data. Re-running a month upserts its monthly budget and entries.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
