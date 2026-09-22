import 'dotenv/config'
import { readFile, readdir } from 'node:fs/promises'
import { extname, basename, join } from 'node:path'
import process from 'node:process'
import { parse } from 'csv-parse/sync'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const usage = `
Usage:
  node scripts/import-budget.mjs --file <month.csv> --month <YYYY-MM> [options]
  node scripts/import-budget.mjs --input-dir <directory> [options]
  node scripts/import-budget.mjs --workbook <budget.xlsx> --audit [options]
  node scripts/import-budget.mjs --workbook <budget.xlsx> --import [options]

Options:
  --mapping <file>          JSON item name -> category mapping
  --start-balance <amount>  Starting balance (default: 0)
  --end-balance <amount>    Ending balance (default: 0)
  --workbook <file>         XLSX workbook with Month Year sheets
  --audit                   Inspect workbook and print an import report without writing
  --import                  Write an audited workbook import to Supabase
  --dry-run                 Validate and print rows without writing to Supabase
`

const args = process.argv.slice(2)

function option(name) {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function hasFlag(name) {
  return args.includes(name)
}

function fail(message) {
  throw new Error(`${message}\n${usage}`)
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

function parseAmount(value, field, rowNumber) {
  const cleaned = String(value ?? '').trim().replace(/[,$£€]/g, '')
  if (cleaned === '') return 0
  const amount = Number(cleaned)
  if (!Number.isFinite(amount)) fail(`Invalid ${field} amount on CSV row ${rowNumber}: "${value}"`)
  return amount
}

function parseWorkbookAmount(value, field, sheetName, rowNumber) {
  if (isBlank(value)) return 0
  const text = String(value).trim()
  if (/^(sb|n\/a|na|#n\/a)$/i.test(text)) return null
  const cleaned = text.replace(/[R,$£€\s]/g, '')
  const amount = Number(cleaned)
  return Number.isFinite(amount) ? amount : null
}

function normalizeMonth(value) {
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (!match) fail(`Month must be YYYY-MM or YYYY-MM-DD, received "${value}"`)
  const month = `${match[1]}-${match[2]}-01`
  const date = new Date(`${month}T00:00:00Z`)
  if (date.getUTCMonth() + 1 !== Number(match[2])) fail(`Invalid month: "${value}"`)
  return month
}

const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

function monthFromSheetName(sheetName) {
  if (normalize(sheetName) === 'january 2025 joined mbmed') return '2025-01-01'
  const match = String(sheetName).trim().match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (!match) return null
  const monthIndex = monthNames.indexOf(match[1].toLowerCase())
  if (monthIndex === -1) return null
  return `${match[2]}-${String(monthIndex + 1).padStart(2, '0')}-01`
}

function classifySheet(sheetName) {
  const month = monthFromSheetName(sheetName)
  if (!month) return { included: false, reason: 'Sheet name does not match Month Year naming' }
  if (month < '2022-01-01') return { included: false, month, reason: 'Before January 2022 start date' }
  if (['2026-10-01', '2026-11-01', '2026-12-01'].includes(month)) return { included: false, month, reason: 'Explicitly excluded 2026 month' }
  return { included: true, month }
}

function workbookRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false })
}

function parseWorkbookSheet(sheetName, sheet, month) {
  const rows = workbookRows(sheet)
  const legacyLayout = normalize(rows[19]?.[1]) === 'expenses'
  const columns = legacyLayout
    ? { startBalance: 3, endBalance: 4, expenseName: 1, expensePlanned: 3, expenseActual: 4, incomeName: 7, incomePlanned: 9, incomeActual: 10 }
    : { startBalance: 2, endBalance: 3, expenseName: 0, expensePlanned: 2, expenseActual: 3, incomeName: 6, incomePlanned: 8, incomeActual: 9 }
  const startBalanceValue = rows[16]?.[columns.startBalance]
  const endBalanceValue = rows[16]?.[columns.endBalance]
  const parsedStartBalance = parseWorkbookAmount(startBalanceValue, 'starting balance', sheetName, 17)
  const parsedEndBalance = parseWorkbookAmount(endBalanceValue, 'ending balance', sheetName, 17)
  const startBalance = parsedStartBalance ?? 0
  const endBalance = parsedEndBalance ?? 0
  const expenseRows = []
  const incomeRows = []
  let section = legacyLayout ? 'manual' : ''
  for (let index = 27; index < rows.length; index += 1) {
    const row = rows[index]
    const expenseName = String(row[columns.expenseName] ?? '').trim()
    const incomeName = String(row[columns.incomeName] ?? '').trim()
    if (normalize(expenseName) === 'debit orders') { section = 'debit_order'; continue }
    if (normalize(expenseName) === 'manual payments') { section = 'manual'; continue }
    if (expenseName && section && !['totals', 'expenses'].includes(normalize(expenseName))) {
      const actual = parseWorkbookAmount(row[columns.expenseActual], 'actual', sheetName, index + 1)
      const paymentSection = normalize(expenseName) === 'absa credit card' ? 'debit_order' : section
      expenseRows.push({ name: expenseName, lookupName: normalize(expenseName), section: paymentSection, planned: parseWorkbookAmount(row[columns.expensePlanned], 'planned', sheetName, index + 1) ?? 0, actual: actual ?? 0, actualProvided: !isBlank(row[columns.expenseActual]), actualUnavailable: !isBlank(row[columns.expenseActual]) && actual === null, rowNumber: index + 1 })
    }
    if (incomeName && !['income', 'totals'].includes(normalize(incomeName))) {
      const actual = parseWorkbookAmount(row[columns.incomeActual], 'actual', sheetName, index + 1)
      incomeRows.push({ name: incomeName, lookupName: normalize(incomeName), section: 'income', planned: parseWorkbookAmount(row[columns.incomePlanned], 'planned', sheetName, index + 1) ?? 0, actual: actual ?? 0, actualProvided: !isBlank(row[columns.incomeActual]), actualUnavailable: !isBlank(row[columns.incomeActual]) && actual === null, rowNumber: index + 1 })
    }
  }
  const combinedRows = new Map()
  for (const row of [...expenseRows, ...incomeRows]) {
    const key = `${row.lookupName}:${row.section}`
    const existing = combinedRows.get(key)
    if (!existing) combinedRows.set(key, { ...row })
    else {
      existing.planned += row.planned
      existing.actual += row.actual
      existing.actualProvided = existing.actualProvided && row.actualProvided
      existing.actualUnavailable = existing.actualUnavailable || row.actualUnavailable
    }
  }
  const rowsWithDuplicatesCombined = [...combinedRows.values()]
  return { sheetName, month, startBalance, endBalance, startBalanceValue, endBalanceValue, startBalanceWasDefaulted: parsedStartBalance === null, endBalanceWasDefaulted: parsedEndBalance === null, rows: rowsWithDuplicatesCombined, expenseRows: rowsWithDuplicatesCombined.filter((row) => row.section !== 'income'), incomeRows: rowsWithDuplicatesCombined.filter((row) => row.section === 'income') }
}

function loadWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true, cellFormula: true })
  const ignoredSheets = []
  const imports = []
  const seenMonths = new Set()
  for (const sheetName of workbook.SheetNames) {
    const classification = classifySheet(sheetName)
    if (!classification.included) { ignoredSheets.push({ sheetName, reason: classification.reason }); continue }
    if (seenMonths.has(classification.month)) fail(`Multiple workbook sheets resolve to month ${classification.month}`)
    seenMonths.add(classification.month)
    imports.push(parseWorkbookSheet(sheetName, workbook.Sheets[sheetName], classification.month))
  }
  if (imports.length === 0) fail(`No eligible Month Year sheets found in ${basename(filePath)}`)
  const expenseNames = new Set(imports.flatMap((item) => item.rows.filter((row) => row.section !== 'income').map((row) => row.lookupName)))
  const debitOrderNames = new Set(imports.flatMap((item) => item.rows.filter((row) => row.section === 'debit_order').map((row) => row.lookupName)))
  for (const currentImport of imports) {
    for (const row of currentImport.rows) {
      if (row.section !== 'income' && debitOrderNames.has(row.lookupName)) row.section = 'debit_order'
      if (row.section === 'income' && expenseNames.has(row.lookupName)) {
        row.name = `${row.name} (Income)`
        row.lookupName = `${row.lookupName} (income)`
      }
    }
  }
  return { imports, ignoredSheets }
}

function workbookAudit(workbookData) {
  const itemMap = new Map()
  const ambiguousPaidRows = []
  const unavailableActualRows = []
  const balanceIssues = []
  for (const currentImport of workbookData.imports) {
    if (currentImport.startBalanceWasDefaulted) balanceIssues.push({ sheet: currentImport.sheetName, field: 'starting balance', value: currentImport.startBalanceValue, defaultedTo: 0 })
    if (currentImport.endBalanceWasDefaulted) balanceIssues.push({ sheet: currentImport.sheetName, field: 'ending balance', value: currentImport.endBalanceValue, defaultedTo: 0 })
    for (const row of currentImport.rows) {
      const item = itemMap.get(row.lookupName) ?? { name: row.name, months: [], sections: new Set(), actualMissing: 0, plannedTotal: 0, actualTotal: 0 }
      item.months.push(currentImport.month)
      item.sections.add(row.section)
      item.actualMissing += row.actualProvided ? 0 : 1
      item.plannedTotal += row.planned
      item.actualTotal += row.actual
      itemMap.set(row.lookupName, item)
      if (!row.actualProvided) ambiguousPaidRows.push({ sheet: currentImport.sheetName, row: row.rowNumber, item: row.name })
      if (row.actualUnavailable) unavailableActualRows.push({ sheet: currentImport.sheetName, row: row.rowNumber, item: row.name })
    }
  }
  const expenses = [...itemMap.values()].filter((item) => !item.sections.has('income')).map((item) => ({ ...item, sections: [...item.sections] }))
  const paymentMethodConflicts = expenses.filter((item) => item.sections.length > 1)
  return {
    acceptedSheets: workbookData.imports.map((item) => ({ sheetName: item.sheetName, month: item.month, rows: item.rows.length, expenses: item.expenseRows.length, income: item.incomeRows.length, startBalance: item.startBalance, endBalance: item.endBalance })),
    ignoredSheets: workbookData.ignoredSheets,
    expenses,
    paymentMethodConflicts,
    ambiguousPaidRows,
    unavailableActualRows,
    balanceIssues,
    paidStatus: { status: 'unpaid-default', detail: 'The workbook has no paid-status column; blank and text actual values are imported as actual 0 with paid false.' },
  }
}

function monthFromFilename(filePath) {
  const match = basename(filePath).match(/(\d{4}-\d{2})(?:-\d{2})?\.csv$/i)
  if (!match) fail(`Could not infer YYYY-MM from filename "${basename(filePath)}"; pass --month`)
  return normalizeMonth(match[1])
}

function readColumn(row, names) {
  const key = Object.keys(row).find((candidate) => names.includes(normalize(candidate)))
  return key ? row[key] : undefined
}

function parseCsv(text, filePath) {
  const rows = parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: true })
  return rows.map((row, index) => {
    const rowNumber = index + 2
    const name = String(readColumn(row, ['item name', 'item', 'name']) ?? '').trim()
    const section = normalize(readColumn(row, ['section', 'payment method', 'type']))
    if (!name) fail(`Missing item name in ${basename(filePath)} row ${rowNumber}`)
    if (!['debit_order', 'debit order', 'manual', 'manual payment', 'income'].includes(section)) {
      fail(`Invalid section "${section}" in ${basename(filePath)} row ${rowNumber}; expected debit_order, manual, or income`)
    }
    return {
      name,
      lookupName: normalize(name),
      section,
      planned: parseAmount(readColumn(row, ['planned', 'planned amount']), 'planned', rowNumber),
      actual: parseAmount(readColumn(row, ['actual', 'actual amount']), 'actual', rowNumber),
    }
  })
}

function itemDefinition(row) {
  return {
    type: row.section === 'income' ? 'income' : 'expense',
    payment_method: row.section === 'debit_order' || row.section === 'debit order' ? 'debit_order' : 'manual',
  }
}

async function loadInputFiles() {
  const workbook = option('--workbook')
  if (workbook) return loadWorkbook(workbook)
  const file = option('--file')
  const inputDir = option('--input-dir')
  if ((file && inputDir) || (!file && !inputDir)) fail('Provide exactly one of --file or --input-dir')
  if (file) return [{ path: file, month: normalizeMonth(option('--month')) }]
  const entries = await readdir(inputDir, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.csv')
    .map((entry) => join(inputDir, entry.name))
  if (files.length === 0) fail(`No CSV files found in ${inputDir}`)
  return files.map((path) => ({ path, month: monthFromFilename(path) }))
}

async function loadMapping() {
  const mappingPath = option('--mapping')
  if (!mappingPath && !option('--workbook')) fail('Provide --mapping with the JSON item name to category mapping')
  if (!mappingPath) return new Map()
  const mapping = JSON.parse(await readFile(mappingPath, 'utf8'))
  return new Map(Object.entries(mapping).map(([name, category]) => [normalize(name), String(category).trim()]))
}

async function main() {
  const workbookPath = option('--workbook')
  let workbookData
  if (workbookPath) {
    workbookData = await loadInputFiles()
    const audit = workbookAudit(workbookData)
    console.log(JSON.stringify(audit, null, 2))
    if (hasFlag('--audit') || !hasFlag('--import')) return
    if (audit.paymentMethodConflicts.length) fail('Workbook import blocked: one or more items change payment method between months. Review paymentMethodConflicts in the audit before importing.')
  }
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) fail('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')

  const [loadedInput, mapping] = await Promise.all([workbookData ?? loadInputFiles(), loadMapping()])
  const inputFiles = workbookData ? loadedInput.imports : loadedInput
  const imports = []
  const seenMonths = new Set()
  for (const input of inputFiles) {
    if (seenMonths.has(input.month)) fail(`Multiple CSV files resolve to month ${input.month}`)
    seenMonths.add(input.month)
    const rows = workbookPath ? input.rows : parseCsv(await readFile(input.path, 'utf8'), input.path)
    const seenItems = new Set()
    for (const row of rows) {
      if (seenItems.has(row.lookupName)) fail(`Duplicate item "${row.name}" in ${workbookPath ? input.sheetName : basename(input.path)}`)
      seenItems.add(row.lookupName)
      if (!mapping.get(row.lookupName) && !workbookPath) fail(`No category mapping for "${row.name}"; add it to the mapping JSON`)
    }
    imports.push({ ...input, rows })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  if (hasFlag('--dry-run')) {
    console.log(JSON.stringify(imports, null, 2))
    return
  }

  const categoryIds = new Map()
  async function getCategoryId(categoryName) {
    const lookupName = normalize(categoryName)
    if (categoryIds.has(lookupName)) return categoryIds.get(lookupName)
    let { data, error } = await supabase.from('categories').select('id').eq('name', categoryName).maybeSingle()
    if (error) throw error
    if (!data) {
      ({ data, error } = await supabase.from('categories').insert({ name: categoryName }).select('id').single())
      if (error) throw error
    }
    categoryIds.set(lookupName, data.id)
    return data.id
  }

  const { data: existingItems, error: itemError } = await supabase
    .from('budget_items')
    .select('id, name, type, payment_method, category_id')
  if (itemError) throw itemError
  const itemsByName = new Map(existingItems.map((item) => [normalize(item.name), item]))

  for (const currentImport of imports) {
    const { data: monthlyBudget, error: monthError } = await supabase
      .from('monthly_budgets')
      .upsert({
        month: currentImport.month,
          start_balance: workbookPath ? currentImport.startBalance : parseAmount(option('--start-balance') ?? '0', 'start balance', 0),
          end_balance: workbookPath ? currentImport.endBalance : parseAmount(option('--end-balance') ?? '0', 'end balance', 0),
      }, { onConflict: 'month' })
      .select('id')
      .single()
    if (monthError) throw monthError

    const entries = []
    for (const row of currentImport.rows) {
      const definition = itemDefinition(row)
      const categoryId = await getCategoryId(mapping.get(row.lookupName) || 'Uncategorized')
      let item = itemsByName.get(row.lookupName)
      if (item && item.type !== definition.type) fail(`Item "${row.name}" has conflicting type in the database`)
      if (!item) {
        const { data, error } = await supabase.from('budget_items').insert({
          name: row.name,
          ...definition,
          category_id: categoryId,
        }).select('id, name, type, payment_method').single()
        if (error) throw error
        item = data
        itemsByName.set(row.lookupName, item)
      } else if (item.category_id !== categoryId || (workbookPath && item.payment_method !== definition.payment_method)) {
        const updates = { category_id: categoryId, ...(workbookPath ? { payment_method: definition.payment_method } : {}) }
        const { error } = await supabase.from('budget_items').update(updates).eq('id', item.id)
        if (error) throw error
        item.category_id = categoryId
        item.payment_method = definition.payment_method
      }
      entries.push({ monthly_budget_id: monthlyBudget.id, budget_item_id: item.id, planned: row.planned, actual: row.actual, paid: false })
    }
    const { error: entryError } = await supabase.from('budget_entries').upsert(entries, { onConflict: 'monthly_budget_id,budget_item_id' })
    if (entryError) throw entryError
    console.log(`Imported ${currentImport.month} (${entries.length} entries)`)
  }
}

main().catch((error) => {
  console.error(`Import failed: ${error.message}`)
  process.exitCode = 1
})