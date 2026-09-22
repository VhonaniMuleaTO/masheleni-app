import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Badge, Button, Card, SectionHeading, Table } from './ui'
import { supabase } from '../lib/supabase'

type Category = { id: string; name: string }
type BudgetItem = {
  id: string
  name: string
  type: 'expense' | 'income'
  category_id: string | null
  payment_method: 'debit_order' | 'manual'
  due_day: number | null
  is_active: boolean
  categories?: { name: string } | { name: string }[] | null
}

type ItemForm = {
  name: string
  type: BudgetItem['type']
  category_id: string
  payment_method: BudgetItem['payment_method']
  due_day: string
}

const emptyItem: ItemForm = { name: '', type: 'expense', category_id: '', payment_method: 'manual', due_day: '' }
const fieldClass = 'mt-1 min-h-11 w-full rounded-xl border border-ink/12 bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-amber-dark focus:ring-2 focus:ring-amber/20'

function getErrorMessage(error: { message?: string } | null, fallback: string) {
  return error?.message || fallback
}

function getCategoryName(categories: BudgetItem['categories']) {
  return (Array.isArray(categories) ? categories[0]?.name : categories?.name) ?? 'Uncategorized'
}

export function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function loadCategories() {
    setLoading(true)
    const { data, error: queryError } = await supabase.from('categories').select('id, name').order('name')
    if (queryError) setError(getErrorMessage(queryError, 'Could not load categories.'))
    else setCategories(data ?? [])
    setLoading(false)
  }

  useEffect(() => { void loadCategories() }, [])

  async function addCategory(event: FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) { setError('Category name is required.'); return }
    setSaving(true)
    setError('')
    const { error: insertError } = await supabase.from('categories').insert({ name: trimmedName })
    if (insertError) setError(getErrorMessage(insertError, 'Could not create category.'))
    else { setName(''); await loadCategories() }
    setSaving(false)
  }

  async function renameCategory(event: FormEvent, id: string) {
    event.preventDefault()
    const trimmedName = editingName.trim()
    if (!trimmedName) { setError('Category name is required.'); return }
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('categories').update({ name: trimmedName }).eq('id', id)
    if (updateError) setError(getErrorMessage(updateError, 'Could not rename category.'))
    else { setEditingId(null); await loadCategories() }
    setSaving(false)
  }

  async function deleteCategory(category: Category) {
    if (category.name.toLowerCase() === 'uncategorized') { setError('The Uncategorized category cannot be deleted.'); return }
    if (!window.confirm(`Delete ${category.name}? Items using it will move to Uncategorized.`)) return
    setSaving(true)
    setError('')
    let { data: uncategorized } = await supabase.from('categories').select('id').ilike('name', 'Uncategorized').maybeSingle()
    if (!uncategorized) {
      const result = await supabase.from('categories').insert({ name: 'Uncategorized' }).select('id').single()
      if (result.error) { setError(getErrorMessage(result.error, 'Could not create Uncategorized.')); setSaving(false); return }
      uncategorized = result.data
    }
    const { error: reassignError } = await supabase.from('budget_items').update({ category_id: uncategorized.id }).eq('category_id', category.id)
    if (reassignError) setError(getErrorMessage(reassignError, 'Could not reassign budget items.'))
    else {
      const { error: deleteError } = await supabase.from('categories').delete().eq('id', category.id)
      if (deleteError) setError(getErrorMessage(deleteError, 'Could not delete category.'))
      else await loadCategories()
    }
    setSaving(false)
  }

  return <div className="mx-auto max-w-[1100px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
    <div className="mb-8"><p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Workspace settings</p><h1 className="font-display text-3xl font-semibold tracking-[-0.06em] sm:text-4xl">Categories</h1><p className="mt-2 max-w-xl text-sm text-muted">Keep your spending groups tidy so every budget item has a useful home.</p></div>
    {error && <Card className="mb-5 border-coral/30 bg-coral/6"><p className="text-sm font-semibold text-coral-dark">{error}</p></Card>}
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit"><SectionHeading eyebrow="New category" title="Add a category" /><form onSubmit={addCategory} className="space-y-4"><label className="block text-sm font-semibold">Name<input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Subscriptions" /></label><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add category'}</Button></form></Card>
      <Card className="p-0"><div className="p-5 pb-2"><SectionHeading eyebrow="All categories" title={`${categories.length} categories`} /></div>{loading ? <p className="p-5 text-sm text-muted">Loading categories...</p> : categories.length === 0 ? <p className="p-5 text-sm text-muted">No categories yet.</p> : <Table><thead><tr className="border-y border-ink/8 text-[10px] font-bold uppercase tracking-[0.12em] text-muted"><th className="px-5 py-3">Name</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{categories.map((category) => <tr key={category.id} className="border-b border-ink/6 last:border-0"><td className="px-5 py-4">{editingId === category.id ? <form onSubmit={(event) => void renameCategory(event, category.id)} className="flex max-w-md gap-2"><input autoFocus className={fieldClass.replace('mt-1 ', '')} value={editingName} onChange={(event) => setEditingName(event.target.value)} /><Button type="submit" variant="dark" disabled={saving}>Save</Button></form> : <div className="flex items-center gap-2"><span className="text-sm font-semibold">{category.name}</span>{category.name.toLowerCase() === 'uncategorized' && <Badge>Fallback</Badge>}</div>}</td><td className="px-5 py-4 text-right">{editingId !== category.id && <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => { setEditingId(category.id); setEditingName(category.name); setError('') }}>Rename</Button>{category.name.toLowerCase() !== 'uncategorized' && <Button variant="ghost" className="text-coral-dark hover:bg-coral/8" onClick={() => void deleteCategory(category)}>Delete</Button>}</div>}</td></tr>)}</tbody></Table>}</Card>
    </div>
  </div>
}

export function BudgetItemsScreen() {
  const [items, setItems] = useState<BudgetItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [expenseForm, setExpenseForm] = useState<ItemForm>({ ...emptyItem, type: 'expense' })
  const [incomeForm, setIncomeForm] = useState<ItemForm>({ ...emptyItem, type: 'income' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingType, setEditingType] = useState<BudgetItem['type'] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function loadData() {
    setLoading(true)
    const [itemsResult, categoriesResult] = await Promise.all([
      supabase.from('budget_items').select('id, name, type, category_id, payment_method, due_day, is_active, categories(name)').order('is_active', { ascending: false }).order('name'),
      supabase.from('categories').select('id, name').order('name'),
    ])
    if (itemsResult.error || categoriesResult.error) setError(getErrorMessage(itemsResult.error || categoriesResult.error, 'Could not load budget items.'))
    else { setItems(itemsResult.data ?? []); setCategories(categoriesResult.data ?? []) }
    setLoading(false)
  }

  useEffect(() => { void loadData() }, [])

  function validateItem(form: ItemForm) {
    if (!form.name.trim()) return 'Item name is required.'
    if (!['debit_order', 'manual'].includes(form.payment_method)) return 'Payment method must be debit order or manual.'
    if (form.due_day !== '') {
      const dueDay = Number(form.due_day)
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return 'Due day must be a whole number from 1 to 31.'
    }
    return ''
  }

  async function ensureForwardEntries(budgetItemId: string) {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthsResult = await supabase.from('monthly_budgets').select('id').gte('month', currentMonth)
    if (monthsResult.error) return getErrorMessage(monthsResult.error, 'Could not load future monthly budgets.')
    if (!monthsResult.data?.length) return null
    const entries = monthsResult.data.map((monthlyBudget) => ({ monthly_budget_id: monthlyBudget.id, budget_item_id: budgetItemId, planned: 0, actual: 0, paid: false }))
    const entriesResult = await supabase.from('budget_entries').upsert(entries, { onConflict: 'monthly_budget_id,budget_item_id', ignoreDuplicates: true })
    return entriesResult.error ? getErrorMessage(entriesResult.error, 'Could not add the item to future monthly budgets.') : null
  }

  async function saveItem(event: FormEvent, type: BudgetItem['type'], form: ItemForm) {
    event.preventDefault()
    const validationError = validateItem(form)
    if (validationError) { setError(validationError); return }
    setSaving(true)
    setError('')
    const payload = { name: form.name.trim(), type, category_id: form.category_id || null, payment_method: form.payment_method, due_day: form.due_day === '' ? null : Number(form.due_day) }
    if (editingId) {
      const result = await supabase.from('budget_items').update(payload).eq('id', editingId)
      if (result.error) setError(getErrorMessage(result.error, 'Could not save budget item.'))
      else { setExpenseForm({ ...emptyItem, type: 'expense' }); setIncomeForm({ ...emptyItem, type: 'income' }); setEditingId(null); setEditingType(null); await loadData() }
    } else {
      const result = await supabase.from('budget_items').insert(payload).select('id').single()
      if (result.error) setError(getErrorMessage(result.error, 'Could not save budget item.'))
      else {
        const propagationError = await ensureForwardEntries(result.data.id)
        setExpenseForm({ ...emptyItem, type: 'expense' }); setIncomeForm({ ...emptyItem, type: 'income' }); setEditingId(null); setEditingType(null); await loadData()
        if (propagationError) setError(propagationError)
      }
    }
    setSaving(false)
  }

  function editItem(item: BudgetItem) {
    setEditingId(item.id)
    setEditingType(item.type)
    const itemForm = { name: item.name, type: item.type, category_id: item.category_id ?? '', payment_method: item.payment_method, due_day: item.due_day?.toString() ?? '' }
    if (item.type === 'expense') setExpenseForm(itemForm)
    else setIncomeForm(itemForm)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function toggleActive(item: BudgetItem) {
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('budget_items').update({ is_active: !item.is_active }).eq('id', item.id)
    if (updateError) setError(getErrorMessage(updateError, 'Could not update item status.'))
    else {
      const propagationError = !item.is_active ? await ensureForwardEntries(item.id) : null
      await loadData()
      if (propagationError) setError(propagationError)
    }
    setSaving(false)
  }

  async function deleteItem(item: BudgetItem) {
    if (!window.confirm(`Delete ${item.name}? This will remove it from every monthly budget.`)) return
    setSaving(true)
    setError('')
    const entriesResult = await supabase.from('budget_entries').delete().eq('budget_item_id', item.id)
    if (entriesResult.error) setError(getErrorMessage(entriesResult.error, 'Could not delete the item entries.'))
    else {
      const itemResult = await supabase.from('budget_items').delete().eq('id', item.id)
      if (itemResult.error) setError(getErrorMessage(itemResult.error, 'Could not delete budget item.'))
      else await loadData()
    }
    setSaving(false)
  }

  const expenseItems = items.filter((item) => item.type === 'expense')
  const incomeItems = items.filter((item) => item.type === 'income')
  function resetForms() {
    setExpenseForm({ ...emptyItem, type: 'expense' })
    setIncomeForm({ ...emptyItem, type: 'income' })
    setEditingId(null)
    setEditingType(null)
    setError('')
  }
  function renderForm(type: BudgetItem['type'], form: ItemForm, setForm: (form: ItemForm) => void, itemList: BudgetItem[], emptyMessage: string, includeDetails: boolean) {
    const isEditing = editingId !== null && editingType === type
    return <Card className="mb-6 p-0"><div className="p-5"><SectionHeading eyebrow={isEditing ? 'Edit item' : undefined} title={isEditing ? 'Update budget item' : type === 'income' ? 'ADD NEW INCOME' : 'ADD NEW EXPENSE'} /><form onSubmit={(event) => void saveItem(event, type, form)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><label className="block text-sm font-semibold lg:col-span-2">Name<input className={fieldClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={type === 'income' ? 'e.g. Salary' : 'e.g. Groceries'} /></label><label className="block text-sm font-semibold">Category<select className={fieldClass} value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>{type === 'expense' && <><label className="block text-sm font-semibold">Payment method<select className={fieldClass} value={form.payment_method} onChange={(event) => setForm({ ...form, payment_method: event.target.value as ItemForm['payment_method'] })}><option value="manual">Manual</option><option value="debit_order">Debit order</option></select></label><label className="block text-sm font-semibold">Due day <span className="font-normal text-muted">(optional)</span><input className={fieldClass} type="number" min="1" max="31" step="1" value={form.due_day} onChange={(event) => setForm({ ...form, due_day: event.target.value })} placeholder="1-31" /></label></>}<div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5"><Button type="submit" disabled={saving}>{saving ? 'Saving...' : isEditing ? 'Save changes' : type === 'income' ? 'Add income' : 'Add expense'}</Button>{isEditing && <Button type="button" variant="secondary" onClick={resetForms}>Cancel</Button>}</div></form></div>{renderTable(type === 'income' ? 'ALL INCOME' : 'ALL EXPENSES', itemList, emptyMessage, includeDetails)}</Card>
  }
  function renderLegacyTable(title: string, itemList: BudgetItem[], emptyMessage: string, includeDetails: boolean) {
    return <Card className="mb-6 p-0"><div className="p-5 pb-2"><SectionHeading title={title} /></div>{loading ? <p className="p-5 text-sm text-muted">Loading budget items...</p> : itemList.length === 0 ? <p className="p-5 text-sm text-muted">{emptyMessage}</p> : <Table><thead><tr className="border-y border-ink/8 text-[10px] font-bold uppercase tracking-[0.12em] text-muted"><th className="px-5 py-3">Item</th>{includeDetails && <><th className="px-3 py-3">Category</th><th className="px-3 py-3">Method</th><th className="px-3 py-3">Due day</th></>}<th className="px-3 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{itemList.map((item) => <tr key={item.id} className={`border-b border-ink/6 last:border-0 ${!item.is_active ? 'opacity-55' : ''}`}><td className="px-5 py-4 text-sm font-semibold">{item.name}</td>{includeDetails && <><td className="px-3 py-4 text-sm text-muted">{getCategoryName(item.categories)}</td><td className="px-3 py-4 text-sm text-muted">{item.payment_method === 'debit_order' ? 'Debit order' : 'Manual'}</td><td className="px-3 py-4 text-sm text-muted">{item.due_day ?? '—'}</td></>}<td className="px-3 py-4"><Badge tone={item.is_active ? 'positive' : 'warning'}>{item.is_active ? 'Active' : 'Inactive'}</Badge></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><Button variant="ghost" onClick={() => editItem(item)}>Edit</Button><Button variant="ghost" className={item.is_active ? 'text-coral-dark hover:bg-coral/8' : 'text-mint-dark hover:bg-mint/8'} onClick={() => void toggleActive(item)} disabled={saving}>{item.is_active ? 'Deactivate' : 'Activate'}</Button><Button variant="ghost" className="text-coral-dark hover:bg-coral/8" onClick={() => void deleteItem(item)} disabled={saving}>Delete</Button></div></td></tr>)}</tbody></Table>}</Card>
  }
  function renderTable(title: string, itemList: BudgetItem[], emptyMessage: string, _includeDetails: boolean) {
    void renderLegacyTable
    const isExpenseTable = title === 'ALL EXPENSES'
    return <div className="border-t border-ink/8"><div className="p-5 pb-2"><SectionHeading title={title} /></div>{loading ? <p className="p-5 text-sm text-muted">Loading budget items...</p> : itemList.length === 0 ? <p className="p-5 text-sm text-muted">{emptyMessage}</p> : <Table><thead><tr className="border-y border-ink/8 text-[10px] font-bold uppercase tracking-[0.12em] text-muted"><th className="px-5 py-3">Item</th><th className="px-3 py-3">Category</th>{isExpenseTable && <><th className="px-3 py-3">Method</th><th className="px-3 py-3">Due day</th></>}<th className="px-3 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{itemList.map((item) => <tr key={item.id} className={`border-b border-ink/6 last:border-0 ${!item.is_active ? 'opacity-55' : ''}`}><td className="px-5 py-4 text-sm font-semibold">{item.name}</td><td className="px-3 py-4 text-sm text-muted">{getCategoryName(item.categories)}</td>{isExpenseTable && <><td className="px-3 py-4 text-sm text-muted">{item.payment_method === 'debit_order' ? 'Debit order' : 'Manual'}</td><td className="px-3 py-4 text-sm text-muted">{item.due_day ?? '—'}</td></>}<td className="px-3 py-4"><Badge tone={item.is_active ? 'positive' : 'warning'}>{item.is_active ? 'Active' : 'Inactive'}</Badge></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><Button variant="ghost" onClick={() => editItem(item)}>Edit</Button><Button variant="ghost" className={item.is_active ? 'text-coral-dark hover:bg-coral/8' : 'text-mint-dark hover:bg-mint/8'} onClick={() => void toggleActive(item)} disabled={saving}>{item.is_active ? 'Deactivate' : 'Activate'}</Button><Button variant="ghost" className="text-coral-dark hover:bg-coral/8" onClick={() => void deleteItem(item)} disabled={saving}>Delete</Button></div></td></tr>)}</tbody></Table>}</div>
  }

  return <div className="mx-auto max-w-[1200px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
    <div className="mb-8"><h1 className="font-display text-3xl font-semibold uppercase tracking-[-0.06em] sm:text-4xl">BUDGET ITEMS</h1><p className="mt-2 max-w-xl text-sm text-muted">Manage recurring expenses and income without losing the history behind them.</p></div>
    {error && <Card className="mb-5 border-coral/30 bg-coral/6"><p className="text-sm font-semibold text-coral-dark">{error}</p></Card>}
    {renderForm('income', incomeForm, setIncomeForm, incomeItems, 'No income items yet.', false)}
    {renderForm('expense', expenseForm, setExpenseForm, expenseItems, 'No expense items yet.', true)}
  </div>
}
