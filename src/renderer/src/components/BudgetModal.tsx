import { GlassCard } from './GlassCard'

interface BudgetModalProps {
  categories: string[]
  monthKey: string
  budgets: Record<string, number>
  onBudgetChange: (category: string, amount: number) => void
  onClose: () => void
}

function formatMonthLabel(monthKey: string): string {
  return new Date(monthKey + '-01').toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

export function BudgetModal({ categories, monthKey, budgets, onBudgetChange, onClose }: BudgetModalProps): JSX.Element {
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleInputChange = (category: string, value: string): void => {
    const parsed = parseInt(value, 10)
    if (isNaN(parsed) || value === '') {
      onBudgetChange(category, 0)
    } else {
      onBudgetChange(category, parsed)
    }
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <GlassCard
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          margin: '0 16px',
          borderRadius: 16,
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>Edit Budgets</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{formatMonthLabel(monthKey)}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 16,
              borderRadius: 8,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Scrollable category list */}
        <div style={{ overflowY: 'auto', padding: '8px 20px 16px' }}>
          {categories.map((category) => (
            <div
              key={category}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '9px 0',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>{category}</span>
              <input
                type="number"
                min="0"
                step="1"
                className="budget-input"
                placeholder="—"
                value={budgets[category] ? budgets[category] : ''}
                onChange={(e) => handleInputChange(category, e.target.value)}
                style={{
                  width: 110,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 13,
                  textAlign: 'right',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
          ))}
          {categories.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
              No categories found. Load a file first.
            </p>
          )}
        </div>
      </GlassCard>
    </div>
  )
}
