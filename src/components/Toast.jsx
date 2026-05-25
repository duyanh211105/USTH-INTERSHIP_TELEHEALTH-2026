const tones = {
  success: 'border-mint-100 bg-mint-50 text-mint-600',
  error: 'border-rose-100 bg-rose-50 text-rose-700',
  warning: 'border-amber-100 bg-amber-50 text-amber-700',
  info: 'border-medical-100 bg-medical-50 text-medical-700',
};

export default function Toast({ toast }) {
  if (!toast?.message) {
    return null;
  }

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm font-semibold shadow-sm transition-all duration-200 ${tones[toast.type] || tones.info}`} role="status">
      {toast.message}
    </div>
  );
}
