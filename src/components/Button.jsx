const variants = {
  primary: 'bg-medical-600 text-white shadow-sm shadow-medical-600/20 hover:bg-medical-700 hover:shadow-md hover:shadow-medical-600/20',
  secondary:
    'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-medical-200 hover:bg-medical-50 hover:text-medical-700 hover:shadow-md hover:shadow-medical-600/10',
  success: 'bg-mint-600 text-white shadow-sm shadow-mint-600/20 hover:bg-mint-500 hover:shadow-md hover:shadow-mint-600/20',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950',
  danger: 'border border-rose-100 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-200 hover:bg-rose-100 hover:shadow-md hover:shadow-rose-600/10',
};

const sizes = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
  icon: 'h-10 w-10 p-0',
};

export default function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-all duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-medical-500 focus-visible:ring-offset-2 active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none ${variants[variant]} ${sizes[size]} ${className}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
