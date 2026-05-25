import { FilePlus2 } from 'lucide-react';

export default function EmptyState({ title, description, action, footer }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-medical-200 bg-gradient-to-b from-medical-50/80 to-white px-5 py-8 text-center shadow-sm sm:px-6 sm:py-10">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-medical-600 shadow-sm ring-1 ring-medical-100">
        <FilePlus2 className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="text-base font-bold text-slate-950">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      {footer ? <div className="mt-4 w-full max-w-sm">{footer}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
