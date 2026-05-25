export default function Avatar({ name, src, size = 'md', subtitle }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const dimensions = size === 'lg' ? 'h-14 w-14 text-base' : 'h-10 w-10 text-sm';

  return (
    <div className="flex items-center gap-3">
      {src ? (
        <img className={`${dimensions} rounded-full object-cover`} src={src} alt={`${name} avatar`} />
      ) : (
        <div
          className={`${dimensions} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-medical-100 to-mint-100 font-bold text-medical-700 shadow-sm ring-1 ring-white/70`}
          aria-hidden="true"
        >
          {initials}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
        {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}
