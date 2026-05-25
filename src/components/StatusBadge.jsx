const styles = {
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  CONFIRMED: 'bg-medical-50 text-medical-700 ring-medical-200',
  COMPLETED: 'bg-mint-50 text-mint-600 ring-mint-100',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-rose-200',
  ACTIVE: 'bg-mint-50 text-mint-600 ring-mint-100',
  INACTIVE: 'bg-slate-50 text-slate-600 ring-slate-200',
  DELETED: 'bg-rose-50 text-rose-700 ring-rose-200',
  HIGH: 'bg-rose-50 text-rose-700 ring-rose-200',
  NORMAL: 'bg-slate-50 text-slate-600 ring-slate-200',
};

export default function StatusBadge({ status }) {
  const normalized = status?.toUpperCase() || 'NORMAL';

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${styles[normalized] || styles.NORMAL}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );
}
