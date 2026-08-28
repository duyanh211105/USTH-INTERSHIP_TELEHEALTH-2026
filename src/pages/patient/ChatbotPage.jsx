import { AlertTriangle, Bot, CalendarPlus, CheckCircle2, Clock3, RotateCcw, Send, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import { getStoredUser } from '../../services/apiClient.js';
import { createSymptomSummary, getAppointments, getDoctors, getDoctorSlots } from '../../services/telehealthApi.js';
import { addDaysToLocalDate, getCurrentLocalDate } from '../../utils/appointmentDateTime.js';

const safetyDisclaimer =
  'This chatbot does not provide diagnosis or prescription. It only collects information and helps navigate the system.';

const baseQuestions = [
  { key: 'mainSymptom', label: 'Main symptom', prompt: 'What symptoms are you experiencing?' },
  { key: 'duration', label: 'Duration', prompt: 'How long have you had these symptoms?' },
  { key: 'fever', label: 'Fever', prompt: 'Do you have fever?' },
  { key: 'medication', label: 'Medication', prompt: 'Are you taking any medication?' },
  { key: 'allergies', label: 'Allergies', prompt: 'Do you have allergies?' },
  { key: 'previousHistory', label: 'Previous medical history', prompt: 'Do you have previous medical history?' },
];

const conditionalQuestionSets = [
  {
    match: ['fever', 'temperature', 'high temp'],
    questions: [
      { key: 'temperature', label: 'Temperature', prompt: 'What is your temperature?' },
      { key: 'chills', label: 'Chills', prompt: 'Do you have chills?' },
      { key: 'cough', label: 'Cough', prompt: 'Do you have cough?' },
    ],
  },
  {
    match: ['headache', 'migraine'],
    questions: [
      { key: 'headacheSeverity', label: 'Headache severity', prompt: 'What is your headache pain level from 1-10?' },
      { key: 'nauseaVomiting', label: 'Nausea or vomiting', prompt: 'Do you have nausea or vomiting?' },
      { key: 'lightSensitivity', label: 'Light sensitivity', prompt: 'Do you have light sensitivity?' },
    ],
  },
  {
    match: ['chest pain', 'chest tightness'],
    questions: [
      { key: 'chestPainSeverity', label: 'Chest pain severity', prompt: 'What is your chest pain level from 1-10?' },
      { key: 'shortnessOfBreath', label: 'Shortness of breath', prompt: 'Do you have shortness of breath?' },
      { key: 'painRadiation', label: 'Pain radiation', prompt: 'Does the pain radiate to your arm or jaw?' },
    ],
  },
  {
    match: ['stomach pain', 'abdominal pain', 'belly pain'],
    questions: [
      { key: 'stomachLocation', label: 'Pain location', prompt: 'Where is the stomach pain located?' },
      { key: 'vomitingDiarrhea', label: 'Vomiting or diarrhea', prompt: 'Do you have vomiting or diarrhea?' },
      { key: 'foodPoisoning', label: 'Food poisoning possibility', prompt: 'Do you suspect food poisoning?' },
    ],
  },
];

const emergencyText =
  'Please seek immediate emergency medical care. This chatbot cannot provide emergency diagnosis or treatment.';

function nowLabel() {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

function includesAny(text, keywords) {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function classifyIntent(message) {
  const text = message.toLowerCase();

  if (isEmergencyText(text)) return 'emergency_warning';
  if (includesAny(text, ['cancel', 'cancellation'])) return 'cancellation_help';
  if (includesAny(text, ['upload', 'medical record', 'file type', 'pdf', 'jpg', 'png'])) return 'upload_help';
  if (includesAny(text, ['book appointment', 'book an appointment', 'booking', 'choose doctor'])) return 'booking_help';
  if (includesAny(text, ['my appointments', 'upcoming appointment', 'booking status', 'appointment status'])) return 'appointment_status';
  if (includesAny(text, ['doctor available', 'doctors available', 'available today', 'available tomorrow', 'work', 'schedule', 'slot'])) {
    return 'doctor_schedule';
  }
  if (includesAny(text, ['symptom', 'fever', 'headache', 'chest pain', 'stomach pain', 'abdominal pain', 'cough', 'fatigue', 'pain', 'nausea', 'vomiting', 'i have', 'i feel'])) {
    return 'symptom_report';
  }

  return 'unknown';
}

function isEmergencyText(text) {
  return includesAny(text, [
    'difficulty breathing',
    'cannot breathe',
    'unconscious',
    'passed out',
    'stroke',
    'face droop',
    'slurred speech',
    'one side weakness',
    'severe chest pain',
  ]);
}

function buildQuestions(mainSymptom) {
  const conditionalQuestions = conditionalQuestionSets
    .filter((set) => includesAny(mainSymptom, set.match))
    .flatMap((set) => set.questions);

  return [baseQuestions[0], ...conditionalQuestions, ...baseQuestions.slice(1)];
}

function extractNumber(value) {
  const match = String(value || '').match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function buildConditionalAnswers(answers, questions) {
  return questions
    .filter((question) => !baseQuestions.some((baseQuestion) => baseQuestion.key === question.key))
    .reduce((result, question) => ({
      ...result,
      [question.label]: answers[question.key] || '',
    }), {});
}

function detectRedFlags(answers) {
  const allText = Object.values(answers).join(' ').toLowerCase();
  const flags = [];
  const chestSeverity = extractNumber(answers.chestPainSeverity);
  const headacheSeverity = extractNumber(answers.headacheSeverity);
  const temperature = extractNumber(answers.temperature);

  if (includesAny(answers.mainSymptom || '', ['chest pain', 'chest tightness']) && includesAny(answers.shortnessOfBreath || allText, ['yes', 'shortness', 'difficulty breathing'])) {
    flags.push('chest pain with shortness of breath');
  }
  if (includesAny(allText, ['difficulty breathing', 'cannot breathe'])) flags.push('difficulty breathing');
  if (includesAny(answers.mainSymptom || allText, ['chest pain']) && (chestSeverity >= 7 || includesAny(allText, ['severe chest pain']))) {
    flags.push('severe chest pain');
  }
  if (temperature >= 39.5 || includesAny(allText, ['very high fever', 'high fever 40', '104 fever', '103 fever'])) flags.push('very high fever');
  if (includesAny(answers.mainSymptom || allText, ['headache']) && (headacheSeverity >= 8 || includesAny(allText, ['severe headache']))) {
    flags.push('severe headache');
  }
  if (includesAny(allText, ['stroke', 'face droop', 'slurred speech', 'one side weakness', 'numbness on one side'])) {
    flags.push('stroke-like symptoms');
  }
  if (includesAny(allText, ['unconscious', 'passed out'])) flags.push('unconsciousness');

  return [...new Set(flags)];
}

function buildSymptomSummary(answers, questions) {
  const conditionalAnswers = buildConditionalAnswers(answers, questions);
  const severity = answers.chestPainSeverity || answers.headacheSeverity || '';
  const redFlags = detectRedFlags(answers);
  const priority = redFlags.length > 0 ? 'HIGH' : 'NORMAL';
  const feverInfo = [
    answers.fever,
    answers.temperature ? `Temperature: ${answers.temperature}` : '',
    answers.chills ? `Chills: ${answers.chills}` : '',
    answers.cough ? `Cough: ${answers.cough}` : '',
  ].filter(Boolean).join('. ');
  const conditionalText = Object.entries(conditionalAnswers)
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('. ');
  const doctorSummary = [
    `Patient reports ${answers.mainSymptom} for ${answers.duration}.`,
    severity ? `Severity: ${severity}.` : '',
    `Fever: ${feverInfo || answers.fever}.`,
    `Current medication: ${answers.medication}.`,
    `Allergies: ${answers.allergies}.`,
    `Previous medical history: ${answers.previousHistory}.`,
    conditionalText ? `Follow-up answers: ${conditionalText}.` : '',
    `Priority: ${priority}.`,
    redFlags.length > 0 ? `Red flags: ${redFlags.join(', ')}.` : 'Red flags: none reported.',
  ].filter(Boolean).join(' ');

  return {
    mainSymptom: answers.mainSymptom,
    duration: answers.duration,
    severity,
    fever: answers.fever,
    temperature: answers.temperature || '',
    medication: answers.medication,
    allergies: answers.allergies,
    previousHistory: answers.previousHistory,
    conditionalAnswers,
    redFlags,
    priority,
    doctorSummary,
    narrative: doctorSummary,
  };
}

function nextDateFromMessage(message) {
  const today = getCurrentLocalDate();

  if (message.toLowerCase().includes('tomorrow')) {
    return addDaysToLocalDate(today, 1);
  }

  return today;
}

export default function ChatbotPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    { type: 'bot', text: 'Hello. I can collect symptoms or help you use the telehealth system.', timestamp: nowLabel() },
    { type: 'bot', text: baseQuestions[0].prompt, timestamp: nowLabel() },
  ]);
  const [mode, setMode] = useState('Symptom Assistant');
  const [draftAnswer, setDraftAnswer] = useState('');
  const [session, setSession] = useState({
    active: true,
    questions: baseQuestions,
    index: 0,
    answers: {},
  });
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const currentQuestion = session.questions[session.index];
  const progressLabel = session.active
    ? `Question ${Math.min(session.index + 1, session.questions.length)} of ${session.questions.length}`
    : summary
      ? 'Complete'
      : 'Ready';

  const summaryRows = useMemo(() => {
    if (!summary) return [];

    return [
      ['Duration', summary.duration],
      ['Severity', summary.severity || 'Not provided'],
      ['Fever info', [summary.fever, summary.temperature].filter(Boolean).join(' - ') || 'Not provided'],
      ['Medication', summary.medication],
      ['Allergies', summary.allergies],
      ['Previous medical history', summary.previousHistory],
    ];
  }, [summary]);

  function appendMessage(type, text) {
    setMessages((currentMessages) => [...currentMessages, { type, text, timestamp: nowLabel() }]);
  }

  function restartSymptomFlow() {
    setMode('Symptom Assistant');
    setSession({ active: true, questions: baseQuestions, index: 0, answers: {} });
    setSummary(null);
    setDraftAnswer('');
    setMessages([
      { type: 'bot', text: 'Symptom collection restarted.', timestamp: nowLabel() },
      { type: 'bot', text: baseQuestions[0].prompt, timestamp: nowLabel() },
    ]);
  }

  async function completeSymptomFlow(nextAnswers, questions) {
    const generatedSummary = buildSymptomSummary(nextAnswers, questions);
    const user = getStoredUser();

    setSummary(generatedSummary);
    setSession((currentSession) => ({ ...currentSession, active: false, answers: nextAnswers }));
    appendMessage('bot', 'Thank you. Your structured symptom summary is ready for the doctor to review before consultation.');

    try {
      await createSymptomSummary({
        patientId: user?.id,
        mainSymptom: generatedSummary.mainSymptom,
        duration: generatedSummary.duration,
        severity: generatedSummary.severity,
        fever: generatedSummary.fever,
        temperature: generatedSummary.temperature,
        medication: generatedSummary.medication,
        allergies: generatedSummary.allergies,
        previousHistory: generatedSummary.previousHistory,
        conditionalAnswers: generatedSummary.conditionalAnswers,
        redFlags: generatedSummary.redFlags,
        priority: generatedSummary.priority,
        doctorSummary: generatedSummary.doctorSummary,
        summary: generatedSummary.narrative,
      });
    } catch {
      appendMessage('bot', 'I saved the summary on screen, but the API request failed. Please try again later if it does not appear for your doctor.');
    }
  }

  function processSymptomAnswer(answer) {
    const activeQuestion = currentQuestion || baseQuestions[0];
    let questions = session.questions;
    const nextAnswers = { ...session.answers, [activeQuestion.key]: answer };
    let nextIndex = session.index + 1;

    if (activeQuestion.key === 'mainSymptom') {
      questions = buildQuestions(answer);
      nextIndex = 1;
    }

    const immediateFlags = detectRedFlags(nextAnswers);
    if (immediateFlags.length > 0 && includesAny(answer, ['difficulty breathing', 'unconscious', 'stroke', 'severe chest pain'])) {
      appendMessage('bot', emergencyText);
    }

    if (nextIndex >= questions.length) {
      completeSymptomFlow(nextAnswers, questions);
      return;
    }

    setSession({ active: true, questions, index: nextIndex, answers: nextAnswers });
    appendMessage('bot', questions[nextIndex].prompt);
  }

  async function respondToSystemIntent(intent, text) {
    setMode('System Assistant');
    setIsLoading(true);

    try {
      if (intent === 'doctor_schedule') {
        const doctors = await getDoctors();
        const date = nextDateFromMessage(text);
        const doctorsWithSlots = await Promise.all(
          doctors.slice(0, 3).map(async (doctor) => {
            const slots = await getDoctorSlots(doctor.id, date).catch(() => []);
            return `${doctor.name} (${doctor.specialty || 'Telehealth'}): ${slots.length > 0 ? slots.slice(0, 3).map((slot) => slot.time).join(', ') : 'no available slots'} on ${date}`;
          }),
        );
        appendMessage('bot', doctorsWithSlots.length > 0 ? doctorsWithSlots.join('\n') : 'No active doctors are available right now.');
        return;
      }

      if (intent === 'appointment_status') {
        const appointments = await getAppointments();
        appendMessage(
          'bot',
          appointments.length > 0
            ? appointments.map((appointment) => `${appointment.patientName || 'Patient'} with ${appointment.doctorName || 'Doctor'} on ${appointment.scheduledDate} ${appointment.scheduledTime}: ${appointment.status}`).join('\n')
            : 'You do not have appointments yet.',
        );
        return;
      }

      const responseByIntent = {
        booking_help: 'To book an appointment, go to Book Appointment, choose doctor, choose an available date and slot, then submit the request.',
        upload_help: 'To upload medical records, go to Medical Records, click Choose File, select a PDF, JPG, PNG file, then upload it. Maximum file size is 10MB.',
        cancellation_help: 'To cancel an appointment, open your appointment list or dashboard, click Cancel, and provide a cancellation reason if required.',
        unknown: 'I can help with symptoms, doctor schedules, appointments, booking, uploads, or cancellations. Please try one of those quick actions.',
      };
      appendMessage('bot', responseByIntent[intent] || responseByIntent.unknown);
    } catch {
      appendMessage('bot', 'I could not reach the telehealth system right now. Please try again in a moment.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMessage(text) {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    appendMessage('patient', trimmedText);
    setDraftAnswer('');

    if (session.active) {
      const intent = classifyIntent(trimmedText);

      if (session.index === 0 && intent !== 'symptom_report' && intent !== 'emergency_warning') {
        setSession((currentSession) => ({ ...currentSession, active: false }));
        await respondToSystemIntent(intent, trimmedText);
        return;
      }

      if (intent === 'emergency_warning' && session.index === 0) {
        setSession((currentSession) => ({ ...currentSession, active: false }));
        setMode('System Assistant');
        appendMessage('bot', emergencyText);
        return;
      }

      setMode('Symptom Assistant');
      processSymptomAnswer(trimmedText);
      return;
    }

    const intent = classifyIntent(trimmedText);
    if (intent === 'symptom_report') {
      setMode('Symptom Assistant');
      const questions = buildQuestions(trimmedText);
      const nextAnswers = { mainSymptom: trimmedText };
      setSession({ active: true, questions, index: 1, answers: nextAnswers });
      setSummary(null);
      appendMessage('bot', questions[1]?.prompt || baseQuestions[1].prompt);
      return;
    }

    if (intent === 'emergency_warning') {
      setMode('System Assistant');
      appendMessage('bot', emergencyText);
      return;
    }

    await respondToSystemIntent(intent, trimmedText);
  }

  function handleSubmit(event) {
    event.preventDefault();
    handleMessage(draftAnswer);
  }

  function handleQuickAction(action) {
    if (action === 'symptoms') {
      restartSymptomFlow();
      return;
    }

    const quickMessages = {
      schedule: 'Which doctors are available today?',
      appointments: 'What are my appointments?',
      upload: 'What file types can I upload?',
      booking: 'How do I book an appointment?',
    };
    handleMessage(quickMessages[action]);
  }

  return (
    <DashboardLayout role="patient" title="Symptom Chatbot" subtitle="Intent-based symptom collection and system assistance.">
      <div className="grid gap-5 xl:grid-cols-[1fr_380px] xl:gap-6">
        <Card>
          <CardHeader
            title="Chat-style assistant"
            eyebrow={mode}
            action={<span className="rounded-full bg-medical-50 px-3 py-1 text-xs font-bold text-medical-700">{progressLabel}</span>}
          >
            {safetyDisclaimer}
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => handleQuickAction('symptoms')}>Report symptoms</Button>
              <Button size="sm" variant="secondary" onClick={() => handleQuickAction('schedule')}>Check doctor schedule</Button>
              <Button size="sm" variant="secondary" onClick={() => handleQuickAction('appointments')}>My appointments</Button>
              <Button size="sm" variant="secondary" onClick={() => handleQuickAction('upload')}>Upload help</Button>
              <Button size="sm" variant="secondary" onClick={() => handleQuickAction('booking')}>Booking help</Button>
            </div>

            <div className="max-h-[560px] space-y-5 overflow-y-auto rounded-lg bg-slate-50/60 p-4">
              {messages.map((message, index) => {
                const isBot = message.type === 'bot';

                return (
                  <div
                    className={`flex items-end gap-3 ${isBot ? 'justify-start' : 'flex-row-reverse justify-start'}`}
                    key={`${message.type}-${index}`}
                  >
                    {isBot ? (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-medical-50 text-medical-700 ring-1 ring-medical-100">
                        <Bot className="h-4 w-4" aria-hidden="true" />
                      </div>
                    ) : null}
                    <div
                      className={`max-w-[min(82%,42rem)] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-6 shadow-sm ${
                        isBot
                          ? 'rounded-bl-sm bg-white text-slate-700 ring-1 ring-slate-100'
                          : 'rounded-br-sm bg-medical-600 text-white'
                      }`}
                    >
                      <p>{message.text}</p>
                      <p className={`mt-1 text-[11px] font-semibold ${isBot ? 'text-slate-400' : 'text-medical-100'}`}>{message.timestamp}</p>
                    </div>
                    {!isBot ? (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint-50 text-mint-600 ring-1 ring-mint-100">
                        <UserRound className="h-4 w-4" aria-hidden="true" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <Clock3 className="h-4 w-4 animate-pulse text-medical-600" aria-hidden="true" />
                  Assistant is checking the system...
                </div>
              ) : null}
            </div>

            <form className="flex gap-3 rounded-lg border border-slate-200 bg-white p-2 shadow-sm focus-within:border-medical-500 focus-within:ring-2 focus-within:ring-medical-100" onSubmit={handleSubmit}>
              <input
                className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
                disabled={isLoading}
                onChange={(event) => setDraftAnswer(event.target.value)}
                placeholder={isLoading ? 'Assistant is checking...' : 'Type your answer'}
                value={draftAnswer}
              />
              <Button size="icon" type="submit" aria-label="Send answer" disabled={isLoading || !draftAnswer.trim()}>
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Structured Summary" action={<CheckCircle2 className="h-5 w-5 text-mint-600" aria-hidden="true" />} />
          <CardBody className="space-y-4">
            <div className="rounded-lg border border-medical-100 bg-medical-50/80 p-4">
              <p className="text-xs font-bold uppercase text-medical-700">Mode</p>
              <p className="mt-2 text-lg font-bold text-slate-950">{mode}</p>
              <p className="mt-2 text-sm leading-6 text-medical-700">{safetyDisclaimer}</p>
            </div>

            {summary ? (
              <>
                <div className="rounded-lg border border-medical-100 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-medical-700">Main symptom</p>
                      <p className="mt-2 text-lg font-bold text-slate-950">{summary.mainSymptom}</p>
                    </div>
                    <StatusBadge status={summary.priority} />
                  </div>
                </div>
                <div className="grid gap-3">
                  {summaryRows.map(([label, value]) => (
                    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3" key={label}>
                      <p className="text-xs font-semibold text-slate-500">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
                {summary.redFlags.length > 0 ? (
                  <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                    <div className="mb-2 flex items-center gap-2 font-bold">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      Red flags
                    </div>
                    {summary.redFlags.join(', ')}
                  </div>
                ) : null}
                <div className="rounded-lg border border-mint-100 bg-mint-50 p-4 text-sm leading-6 text-mint-700">{summary.doctorSummary}</div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <Button className="w-full" variant="secondary" onClick={restartSymptomFlow}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Restart Chat
                  </Button>
                  <Button className="w-full" onClick={() => navigate('/patient/book')}>
                    <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                    Book Appointment
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-sm font-semibold text-slate-700">{progressLabel}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Complete symptom collection to generate a doctor-facing summary with priority and red flag checks.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </DashboardLayout>
  );
}
