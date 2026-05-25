import {
  Activity,
  Bot,
  CalendarPlus,
  ClipboardList,
  CalendarClock,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import { getStoredUser } from '../services/apiClient.js';

const navigation = {
  patient: [
    { label: 'Dashboard', to: '/patient', icon: Home },
    { label: 'Symptom Chatbot', to: '/patient/chatbot', icon: Bot },
    { label: 'Book Appointment', to: '/patient/book', icon: CalendarPlus },
    { label: 'Medical Records', to: '/patient/records', icon: FileText },
    { label: 'Consultation Result', to: '/patient/result', icon: ClipboardList },
  ],
  doctor: [
    { label: 'Dashboard', to: '/doctor', icon: Stethoscope },
    { label: 'Schedule', to: '/doctor/schedule', icon: CalendarClock },
  ],
  admin: [
    { label: 'Dashboard', to: '/admin', icon: LayoutDashboard },
    { label: 'Doctor Management', to: '/admin/doctors', icon: Stethoscope },
    { label: 'Audit Logs', to: '/admin/audit-logs', icon: ScrollText },
    { label: 'System Health', to: '/admin', icon: ShieldCheck },
  ],
};

const people = {
  patient: { name: 'Patient User', subtitle: 'Patient account' },
  doctor: { name: 'Doctor User', subtitle: 'Doctor account' },
  admin: { name: 'Admin User', subtitle: 'System admin' },
};

function SidebarLink({ item }) {
  const Icon = item.icon;

  return (
    <NavLink
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-medical-500 focus-visible:ring-offset-2 ${
          isActive
            ? 'bg-medical-600 text-white shadow-sm shadow-medical-600/25'
            : 'text-slate-500 hover:-translate-y-0.5 hover:bg-medical-50/70 hover:text-medical-700'
        }`
      }
      to={item.to}
      end={item.to === '/patient' || item.to === '/doctor' || item.to === '/admin'}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}

export default function DashboardLayout({ role, title, subtitle, children, actions }) {
  const navItems = navigation[role];
  const storedUser = getStoredUser();
  const roleSubtitles = {
    patient: 'Patient account',
    doctor: storedUser?.specialty || 'Doctor account',
    admin: 'System admin',
  };
  const user = storedUser?.role === role
    ? { name: storedUser.name, subtitle: roleSubtitles[role] }
    : people[role];

  return (
    <div className="min-h-screen bg-[#f5f8fb]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-100 bg-white px-5 py-6 shadow-[12px_0_36px_rgba(28,78,121,0.04)] lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-medical-600 text-white shadow-sm shadow-medical-600/30">
            <Activity className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-950">MediConnect</p>
            <p className="text-xs font-medium text-slate-500">Telehealth System</p>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-5">
          <p className="mb-3 px-3 text-xs font-bold uppercase text-slate-400">Workspace</p>
          <nav className="space-y-1" aria-label={`${role} navigation`}>
            {navItems.map((item) => (
              <SidebarLink item={item} key={item.label} />
            ))}
          </nav>
        </div>

        <div className="mt-auto rounded-lg border border-slate-100 bg-slate-50/80 p-4 shadow-sm">
          <Avatar name={user.name} subtitle={user.subtitle} />
          <NavLink to="/login">
            <Button className="mt-4 w-full" variant="secondary" size="sm">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Switch role
            </Button>
          </NavLink>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/90 px-4 py-4 shadow-sm shadow-slate-200/40 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <Button className="lg:hidden" variant="secondary" size="icon" aria-label="Open navigation">
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">{title}</h1>
                <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {actions}
              <Avatar name={user.name} subtitle={user.subtitle} />
            </div>
          </div>
          <nav className="mx-auto mt-4 flex max-w-[1440px] gap-2 overflow-x-auto pb-1 lg:hidden" aria-label="Mobile navigation">
            {navItems.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  `shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-medical-500 focus-visible:ring-offset-2 ${
                    isActive ? 'bg-medical-600 text-white shadow-sm shadow-medical-600/20' : 'bg-slate-100 text-slate-600 hover:-translate-y-0.5 hover:bg-medical-50 hover:text-medical-700'
                  }`
                }
                to={item.to}
                key={item.label}
                end={item.to === '/patient' || item.to === '/doctor' || item.to === '/admin'}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
