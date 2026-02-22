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
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <GlassCard
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          margin: '0 16px',
        }}
      >
        {/* Modal header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
            Edit Budgets — {formatMonthLabel(monthKey)}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 20,
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
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
                padding: '10px 0',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <span style={{ color: 'var(--text-primary)', fontSize: 14 }}>{category}</span>
              <input
                type="number"
                min="0"
                step="1"
                className="budget-input"
                placeholder="—"
                value={budgets[category] ? budgets[category] : ''}
                onChange={(e) => handleInputChange(category, e.target.value)}
                style={{
                  width: 120,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'var(--text-primary)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 14,
                  textAlign: 'right',
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
