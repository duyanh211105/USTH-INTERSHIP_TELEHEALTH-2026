import Button from './Button.jsx';

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  children,
  isSubmitting = false,
  onCancel,
  onConfirm,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-slate-100 bg-white p-5 shadow-xl ring-1 ring-slate-950/[0.03] sm:p-6">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button disabled={isSubmitting} onClick={onCancel} type="button" variant="secondary">
            {cancelLabel}
          </Button>
          <Button disabled={isSubmitting} onClick={onConfirm} type="button" variant="danger">
            {isSubmitting ? 'Processing...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
