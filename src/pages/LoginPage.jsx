import { Activity, ArrowRight, LockKeyhole, Phone, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { login } from '../services/telehealthApi.js';

const demoRoles = [
  { label: 'Patient Demo', phone: '0900000001', icon: UserRound, color: 'bg-medical-50 text-medical-700' },
  { label: 'Doctor Demo', phone: '0900000002', icon: Stethoscope, color: 'bg-mint-50 text-mint-600' },
  { label: 'Admin Demo', phone: '0123456789', icon: ShieldCheck, color: 'bg-amber-50 text-amber-700' },
];

const routeByRole = {
  patient: '/patient',
  doctor: '/doctor',
  department_head: '/admin/doctors',
  hospital_director: '/admin/doctors',
  admin: '/admin',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('0900000001');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(nextPhone = phone, nextPassword = password) {
    setError('');
    setIsSubmitting(true);

    try {
      const data = await login(nextPhone, nextPassword);
      navigate(routeByRole[data.user.role] || '/patient');
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f8fb] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-lg border border-slate-100 bg-white p-6 shadow-soft sm:p-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-medical-600 text-white shadow-sm shadow-medical-600/30">
              <Activity className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-950">MediConnect</p>
              <p className="text-sm text-slate-500">Frontend demo</p>
            </div>
          </div>

          <h1 className="max-w-2xl text-3xl font-bold text-slate-950 sm:text-4xl">
            Telehealth Consultation and Medical Record Management System
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            A clean dashboard experience for patients, doctors, and administrators to manage asynchronous
            telehealth consultations with medical records and consultation notes.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {demoRoles.map((role) => {
              const Icon = role.icon;

              return (
                <button
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-medical-200 hover:bg-medical-50/40 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-medical-500 focus-visible:ring-offset-2"
                  key={role.label}
                  onClick={() => handleLogin(role.phone, 'password123')}
                  type="button"
                >
                  <span className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${role.color}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{role.label}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-slate-100 bg-white p-6 shadow-soft sm:p-8">
          <h2 className="text-xl font-bold text-slate-950">Sign in</h2>
          <p className="mt-2 text-sm text-slate-500">Use a demo role or sign in with a registered account.</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleLogin();
            }}
          >
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Phone number</span>
              <span className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 transition focus-within:border-medical-500 focus-within:ring-2 focus-within:ring-medical-100">
                <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                  className="h-11 w-full bg-transparent text-sm text-slate-900 outline-none"
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="0900000001"
                  type="tel"
                  value={phone}
                />
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Password</span>
              <span className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 transition focus-within:border-medical-500 focus-within:ring-2 focus-within:ring-medical-100">
                <LockKeyhole className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                  className="h-11 w-full bg-transparent text-sm text-slate-900 outline-none"
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                />
              </span>
            </label>

            {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}

            <Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            New patient?{' '}
            <Link className="font-semibold text-medical-700 hover:text-medical-600" to="/register">
              Create patient account
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
