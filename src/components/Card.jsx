export default function Card({ children, className = '', as: Component = 'section' }) {
  return (
    <Component className={`overflow-hidden rounded-lg border border-slate-100/90 bg-white shadow-soft ring-1 ring-slate-950/[0.02] transition-shadow duration-200 ${className}`}>
      {children}
    </Component>
  );
}

export function CardHeader({ title, eyebrow, action, children }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 lg:px-6">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-semibold text-medical-600">{eyebrow}</p> : null}
        <h2 className="text-base font-bold leading-6 text-slate-950">{title}</h2>
        {children ? <p className="mt-1 text-sm text-slate-500">{children}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ children, className = '' }) {
  return <div className={`p-4 sm:p-5 lg:p-6 ${className}`}>{children}</div>;
}
