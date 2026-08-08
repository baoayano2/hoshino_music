import { CheckCircle2, Info, X } from 'lucide-react'

export type ToastItem = {
  id: string
  message: string
  tone: 'success' | 'info'
}

export function Toasts({ items, onDismiss }: { items: ToastItem[], onDismiss: (id: string) => void }) {
  return <div className="toast-stack" aria-live="polite">
    {items.map((toast) => <div className={`toast toast-${toast.tone}`} key={toast.id}>
      {toast.tone === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />}
      <span>{toast.message}</span>
      <button aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}><X size={15} /></button>
    </div>)}
  </div>
}
