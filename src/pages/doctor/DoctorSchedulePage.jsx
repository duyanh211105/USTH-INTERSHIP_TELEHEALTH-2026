import { CalendarOff, Clock, Plus, Save, Send, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Toast from '../../components/Toast.jsx';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import useToast from '../../hooks/useToast.js';
import { createLeaveRequest, getMyAvailability, getMyLeaveRequests, saveMyAvailability } from '../../services/telehealthApi.js';

const weekdays = [
  ['1', 'Monday'],
  ['2', 'Tuesday'],
  ['3', 'Wednesday'],
  ['4', 'Thursday'],
  ['5', 'Friday'],
  ['6', 'Saturday'],
  ['0', 'Sunday'],
];

let sessionCounter = 0;

function createSession(overrides = {}) {
  sessionCounter += 1;
  return {
    clientId: `session-${sessionCounter}`,
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: 30,
    ...overrides,
  };
}

function defaultSchedule() {
  return weekdays.map(([weekday, label]) => ({
    weekday: Number(weekday),
    label,
    enabled: Number(weekday) >= 1 && Number(weekday) <= 5,
    sessions: [createSession()],
  }));
}

function toMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function buildScheduleFromApi(items) {
  const grouped = new Map();

  for (const item of items) {
    const weekday = Number(item.weekday);
    const sessions = grouped.get(weekday) || [];
    sessions.push(createSession({
      id: item.id,
      startTime: item.startTime,
      endTime: item.endTime,
      slotDuration: item.slotDuration,
    }));
    grouped.set(weekday, sessions);
  }

  return weekdays.map(([weekday, label]) => {
    const numericWeekday = Number(weekday);
    const sessions = (grouped.get(numericWeekday) || []).sort((a, b) => a.startTime.localeCompare(b.startTime));

    return {
      weekday: numericWeekday,
      label,
      enabled: sessions.length > 0,
      sessions: sessions.length > 0 ? sessions : [createSession()],
    };
  });
}

function validateSchedule(schedule) {
  for (const day of schedule.filter((item) => item.enabled)) {
    if (day.sessions.length === 0) {
      return `${day.label} needs at least one working session or should be disabled.`;
    }

    const sorted = [...day.sessions].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

    for (let index = 0; index < sorted.length; index += 1) {
      const session = sorted[index];

      if (toMinutes(session.endTime) <= toMinutes(session.startTime)) {
        return `${day.label} session ${index + 1} must end after it starts.`;
      }

      if (index > 0 && toMinutes(session.startTime) < toMinutes(sorted[index - 1].endTime)) {
        return `${day.label} sessions cannot overlap.`;
      }
    }
  }

  return '';
}

export default function DoctorSchedulePage() {
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveDate, setLeaveDate] = useState('2026-05-21');
  const [leaveReason, setLeaveReason] = useState('Holiday');
  const [leaveNote, setLeaveNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const { toast, showToast } = useToast();

  useEffect(() => {
    let isMounted = true;

    getMyAvailability()
      .then((items) => {
        if (isMounted && items.length > 0) {
          setSchedule(buildScheduleFromApi(items));
        }
      })
      .catch((error) => showToast(error.message || 'Unable to load doctor schedule.', 'error'));

    getMyLeaveRequests()
      .then((items) => {
        if (isMounted) {
          setLeaveRequests(items);
        }
      })
      .catch((error) => showToast(error.message || 'Unable to load leave requests.', 'error'));

    return () => {
      isMounted = false;
    };
  }, []);

  const enabledSchedule = useMemo(
    () =>
      schedule.flatMap((day) =>
        day.enabled
          ? day.sessions.map((session) => ({
              weekday: day.weekday,
              startTime: session.startTime,
              endTime: session.endTime,
              slotDuration: Number(session.slotDuration),
            }))
          : [],
      ),
    [schedule],
  );

  function updateDay(weekday, patch) {
    setSchedule((currentSchedule) => currentSchedule.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));
  }

  function updateSession(weekday, clientId, patch) {
    setSchedule((currentSchedule) =>
      currentSchedule.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              sessions: day.sessions.map((session) => (session.clientId === clientId ? { ...session, ...patch } : session)),
            }
          : day,
      ),
    );
  }

  function addSession(weekday) {
    setSchedule((currentSchedule) =>
      currentSchedule.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              enabled: true,
              sessions: [...day.sessions, createSession({ startTime: '13:00', endTime: '17:00' })],
            }
          : day,
      ),
    );
  }

  function removeSession(weekday, clientId) {
    setSchedule((currentSchedule) =>
      currentSchedule.map((day) => {
        if (day.weekday !== weekday) {
          return day;
        }

        const sessions = day.sessions.filter((session) => session.clientId !== clientId);
        return {
          ...day,
          enabled: sessions.length > 0 ? day.enabled : false,
          sessions: sessions.length > 0 ? sessions : [createSession()],
        };
      }),
    );
  }

  async function handleSaveSchedule(event) {
    event.preventDefault();

    const validationMessage = validateSchedule(schedule);
    if (validationMessage) {
      showToast(validationMessage, 'error');
      return;
    }

    setIsSaving(true);

    try {
      const saved = await saveMyAvailability(enabledSchedule);
      setSchedule(buildScheduleFromApi(saved));
      showToast('Schedule saved.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to save schedule.', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmitLeave(event) {
    event.preventDefault();
    setIsSubmittingLeave(true);

    try {
      const request = await createLeaveRequest({ date: leaveDate, reason: leaveReason, note: leaveNote });
      setLeaveRequests((currentItems) => [request, ...currentItems]);
      showToast('Leave request submitted.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to submit leave request.', 'error');
    } finally {
      setIsSubmittingLeave(false);
    }
  }

  return (
    <DashboardLayout role="doctor" title="Doctor Schedule" subtitle="Configure working sessions and request leave approval.">
      <div className="grid gap-5 xl:grid-cols-[1fr_380px] xl:gap-6">
        <Card>
          <CardHeader title="Working schedule" eyebrow="Slot generation" action={<Clock className="h-5 w-5 text-medical-600" aria-hidden="true" />} />
          <CardBody>
            <div className="mb-5">
              <Toast toast={toast} />
            </div>
            <form className="grid gap-3" onSubmit={handleSaveSchedule}>
              {schedule.map((day) => (
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4" key={day.weekday}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <input
                        checked={day.enabled}
                        className="h-4 w-4 rounded border-slate-300 text-medical-600 focus:ring-medical-500"
                        onChange={(event) => updateDay(day.weekday, { enabled: event.target.checked })}
                        type="checkbox"
                      />
                      {day.label}
                    </label>
                    <Button disabled={!day.enabled} onClick={() => addSession(day.weekday)} size="sm" type="button" variant="secondary">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add {day.label} session
                    </Button>
                  </div>

                  {day.enabled ? (
                    <div className="mt-4 grid gap-3">
                      {day.sessions.map((session, index) => {
                        const sessionNumber = index + 1;
                        return (
                          <div
                            className="grid gap-3 rounded-md border border-slate-100 bg-white p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
                            key={session.clientId}
                          >
                            <label>
                              <span className="text-xs font-semibold text-slate-500">{day.label} session {sessionNumber} start</span>
                              <input
                                aria-label={`${day.label} session ${sessionNumber} start`}
                                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                                onChange={(event) => updateSession(day.weekday, session.clientId, { startTime: event.target.value })}
                                type="time"
                                value={session.startTime}
                              />
                            </label>
                            <label>
                              <span className="text-xs font-semibold text-slate-500">{day.label} session {sessionNumber} end</span>
                              <input
                                aria-label={`${day.label} session ${sessionNumber} end`}
                                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                                onChange={(event) => updateSession(day.weekday, session.clientId, { endTime: event.target.value })}
                                type="time"
                                value={session.endTime}
                              />
                            </label>
                            <label>
                              <span className="text-xs font-semibold text-slate-500">{day.label} session {sessionNumber} duration</span>
                              <select
                                aria-label={`${day.label} session ${sessionNumber} duration`}
                                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                                onChange={(event) => updateSession(day.weekday, session.clientId, { slotDuration: Number(event.target.value) })}
                                value={session.slotDuration}
                              >
                                <option value={15}>15 min</option>
                                <option value={30}>30 min</option>
                                <option value={45}>45 min</option>
                                <option value={60}>60 min</option>
                              </select>
                            </label>
                            <div className="flex items-end">
                              <Button
                                aria-label={`Remove ${day.label} session ${sessionNumber}`}
                                onClick={() => removeSession(day.weekday, session.clientId)}
                                size="icon"
                                type="button"
                                variant="danger"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-md border border-slate-100 bg-white p-3 text-sm font-semibold text-slate-500">
                      Day disabled. No booking slots will be generated.
                    </div>
                  )}
                </div>
              ))}
              <Button className="w-full sm:w-auto" disabled={isSaving} type="submit">
                <Save className="h-4 w-4" aria-hidden="true" />
                {isSaving ? 'Saving schedule...' : 'Save schedule'}
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Leave requests" eyebrow="Approval workflow" action={<CalendarOff className="h-5 w-5 text-amber-700" aria-hidden="true" />} />
          <CardBody className="space-y-5">
            <form className="grid gap-4" onSubmit={handleSubmitLeave}>
              <label>
                <span className="text-sm font-semibold text-slate-700">Leave date</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                  onChange={(event) => setLeaveDate(event.target.value)}
                  type="date"
                  value={leaveDate}
                />
              </label>
              <label>
                <span className="text-sm font-semibold text-slate-700">Reason</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                  onChange={(event) => setLeaveReason(event.target.value)}
                  value={leaveReason}
                />
              </label>
              <label>
                <span className="text-sm font-semibold text-slate-700">Note</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                  onChange={(event) => setLeaveNote(event.target.value)}
                  value={leaveNote}
                />
              </label>
              <Button className="w-full" disabled={isSubmittingLeave} type="submit">
                <Send className="h-4 w-4" aria-hidden="true" />
                {isSubmittingLeave ? 'Submitting leave...' : 'Submit leave request'}
              </Button>
            </form>

            {leaveRequests.length === 0 ? (
              <EmptyState title="No leave requests submitted yet" description="Submit a leave request when you need an approved date to block booking slots." />
            ) : (
              <DataTable
                columns={[
                  { key: 'date', header: 'Date' },
                  { key: 'reason', header: 'Reason' },
                  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                ]}
                rows={leaveRequests}
                getRowKey={(row) => row.id}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </DashboardLayout>
  );
}
