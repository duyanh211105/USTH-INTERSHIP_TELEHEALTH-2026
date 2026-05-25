import { Activity, ArrowLeft, ArrowRight, Home, LockKeyhole, Mail, Phone, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import Toast from '../components/Toast.jsx';
import useToast from '../hooks/useToast.js';
import { registerPatient } from '../services/telehealthApi.js';

const initialForm = {
  full_name: '',
  email: '',
  password: '',
  phone: '',
  national_id: '',
  permanent_address: '',
};

function validateForm(form) {
  if (!form.full_name.trim()) {
    return 'Full name is required.';
  }

  if (!form.email.trim()) {
    return 'Email is required.';
  }

  if (!form.password) {
    return 'Password is required.';
  }

  if (!form.phone.trim()) {
    return 'Phone is required.';
  }

  if (!form.national_id.trim()) {
    return 'National ID is required.';
  }

  if (!/^0\d{8,11}$/.test(form.national_id.trim())) {
    return 'National ID must contain digits only, be 9-12 characters, and begin with 0.';
  }

  if (!form.permanent_address.trim()) {
    return 'Permanent address is required.';
  }

  return '';
}

export default function RegisterPage() {
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const { toast, showToast } = useToast();

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setSuccessMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validationError = validateForm(form);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    setIsSubmitting(true);
    setSuccessMessage('');

    try {
      await registerPatient({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim(),
        national_id: form.national_id.trim(),
        permanent_address: form.permanent_address.trim(),
      });
      setSuccessMessage('Registration successful. You can now log in with this patient account.');
      showToast('Patient account created.', 'success');
      setForm(initialForm);
    } catch (error) {
      showToast(error.message || 'Unable to create patient account.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f8fb] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-slate-100 bg-white p-6 shadow-soft sm:p-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-medical-600 text-white shadow-sm shadow-medical-600/30">
              <Activity className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-950">MediConnect</p>
              <p className="text-sm text-slate-500">Patient onboarding</p>
            </div>
          </div>

          <h1 className="max-w-2xl text-3xl font-bold text-slate-950 sm:text-4xl">Patient Registration</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Create a patient account with identity information so appointments, records, and consultation results can be
            linked to the correct person.
          </p>

          <div className="mt-8 rounded-lg border border-medical-100 bg-medical-50/60 p-4">
            <p className="text-sm font-bold text-medical-800">Identity validation</p>
            <p className="mt-2 text-sm leading-6 text-medical-700">
              National ID must use digits only, begin with 0, and contain 9 to 12 characters.
            </p>
          </div>

          <Link className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-medical-700 hover:text-medical-600" to="/login">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to sign in
          </Link>
        </section>

        <section className="rounded-lg border border-slate-100 bg-white p-6 shadow-soft sm:p-8">
          <div className="mb-5">
            <Toast toast={toast} />
            {successMessage ? (
              <p className="mt-3 rounded-lg border border-mint-100 bg-mint-50 px-4 py-3 text-sm font-semibold text-mint-600">
                {successMessage}
              </p>
            ) : null}
          </div>

          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label>
              <span className="text-sm font-semibold text-slate-700">Full name</span>
              <span className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 transition focus-within:border-medical-500 focus-within:ring-2 focus-within:ring-medical-100">
                <UserRound className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                  className="h-11 w-full bg-transparent text-sm text-slate-900 outline-none"
                  onChange={(event) => updateField('full_name', event.target.value)}
                  placeholder="Nguyen Van A"
                  value={form.full_name}
                />
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="text-sm font-semibold text-slate-700">Email</span>
                <span className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 transition focus-within:border-medical-500 focus-within:ring-2 focus-within:ring-medical-100">
                  <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input
                    className="h-11 w-full bg-transparent text-sm text-slate-900 outline-none"
                    onChange={(event) => updateField('email', event.target.value)}
                    placeholder="patient@example.com"
                    type="email"
                    value={form.email}
                  />
                </span>
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-700">Password</span>
                <span className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 transition focus-within:border-medical-500 focus-within:ring-2 focus-within:ring-medical-100">
                  <LockKeyhole className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input
                    className="h-11 w-full bg-transparent text-sm text-slate-900 outline-none"
                    onChange={(event) => updateField('password', event.target.value)}
                    placeholder="Create a password"
                    type="password"
                    value={form.password}
                  />
                </span>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="text-sm font-semibold text-slate-700">Phone</span>
                <span className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 transition focus-within:border-medical-500 focus-within:ring-2 focus-within:ring-medical-100">
                  <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input
                    className="h-11 w-full bg-transparent text-sm text-slate-900 outline-none"
                    onChange={(event) => updateField('phone', event.target.value)}
                    placeholder="0901234567"
                    value={form.phone}
                  />
                </span>
              </label>

              <label>
                <span className="text-sm font-semibold text-slate-700">National ID</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                  inputMode="numeric"
                  onChange={(event) => updateField('national_id', event.target.value)}
                  placeholder="0123456789"
                  value={form.national_id}
                />
              </label>
            </div>

            <label>
              <span className="text-sm font-semibold text-slate-700">Permanent address</span>
              <span className="mt-2 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 transition focus-within:border-medical-500 focus-within:ring-2 focus-within:ring-medical-100">
                <Home className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                <textarea
                  className="min-h-24 w-full bg-transparent text-sm text-slate-900 outline-none"
                  onChange={(event) => updateField('permanent_address', event.target.value)}
                  placeholder="123 Le Loi, District 1"
                  value={form.permanent_address}
                />
              </span>
            </label>

            <Button className="mt-2 w-full" size="lg" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account...' : 'Create patient account'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
