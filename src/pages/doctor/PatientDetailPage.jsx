import { ExternalLink, FileText, HeartPulse, NotebookText, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import DataTable from '../../components/DataTable.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import {
  getAppointments,
  getConsultations,
  getPatient,
  getRecords,
  getSymptomsForPatient,
} from '../../services/telehealthApi.js';
import { mapAppointmentForView, mapRecordForView } from '../../services/viewMappers.js';

function isImageDocument(document) {
  return document.mimeType?.startsWith('image/');
}

function formatDate(value) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function EmptyPanel({ children }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3 text-sm font-semibold text-slate-500">
      {children}
    </div>
  );
}

function getRouteAccessMessage(error) {
  if (error.status === 403) {
    return 'You do not have permission to access this resource.';
  }

  if (error.status === 404) {
    return 'Patient or appointment not found.';
  }

  return error.message || 'Unable to load patient detail.';
}

export default function PatientDetailPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [records, setRecords] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [symptoms, setSymptoms] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const numericPatientId = Number(patientId);
  const patientAppointments = useMemo(
    () => appointments.filter((appointment) => Number(appointment.patientId) === numericPatientId),
    [appointments, numericPatientId],
  );
  const activeAppointment = patientAppointments[0] || null;
  const visibleRecords = useMemo(
    () => records.filter((record) => Number(record.patientId) === numericPatientId),
    [numericPatientId, records],
  );
  const patientConsultations = useMemo(
    () => consultations
      .filter((consultation) => Number(consultation.patientId) === numericPatientId)
      .map((consultation) => ({
        ...consultation,
        date: formatDate(consultation.createdAt),
        doctor: consultation.doctorName,
        diagnosis: consultation.diagnosis,
        status: 'COMPLETED',
      })),
    [consultations, numericPatientId],
  );
  const latestSymptom = symptoms[0] || null;
  const latestSymptomSummary = latestSymptom?.doctorSummary || latestSymptom?.summary || 'No symptom summary submitted yet.';

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setPageError('');
    Promise.all([
      getPatient(patientId),
      getAppointments(),
      getRecords(),
      getSymptomsForPatient(patientId).catch(() => []),
      getConsultations().catch(() => []),
    ])
      .then(([patient, appointmentItems, recordItems, symptomItems, consultationItems]) => {
        if (!isMounted) {
          return;
        }

        setProfile(patient);
        setAppointments(appointmentItems.map(mapAppointmentForView));
        setRecords(recordItems.map(mapRecordForView));
        setSymptoms(symptomItems);
        setConsultations(consultationItems);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setProfile(null);
        setAppointments([]);
        setRecords([]);
        setSymptoms([]);
        setConsultations([]);

        if (error.status === 403 || error.status === 404) {
          navigate('/doctor', {
            replace: true,
            state: {
              doctorWorkflowMessage: getRouteAccessMessage(error),
              doctorWorkflowType: 'error',
            },
          });
          return;
        }

        setPageError(getRouteAccessMessage(error));
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [navigate, patientId]);

  return (
    <DashboardLayout role="doctor" title="Patient Detail" subtitle="Review submitted symptoms, records, and prior consultation history.">
      {isLoading ? (
        <Card>
          <CardBody>
            <EmptyPanel>Loading patient detail...</EmptyPanel>
          </CardBody>
        </Card>
      ) : null}

      {!isLoading && pageError ? (
        <Card>
          <CardHeader title={pageError} />
          <CardBody>
            <p className="text-sm leading-6 text-slate-600">
              This patient either does not exist or is not assigned to your doctor account.
            </p>
            <Link className="mt-4 inline-flex" to="/doctor">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
          </CardBody>
        </Card>
      ) : null}

      {!isLoading && !pageError && profile ? (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr] xl:gap-6">
          <Card>
            <CardHeader title="Patient profile" />
            <CardBody>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-medical-50 text-medical-700">
                  <UserRound className="h-10 w-10" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-xl font-bold text-slate-950">{profile.name}</h2>
                <p className="text-sm text-slate-500">Patient account</p>
              </div>
              <dl className="mt-6 grid gap-3 text-sm">
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <dt className="font-semibold text-slate-500">Email</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{profile.email}</dd>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <dt className="font-semibold text-slate-500">Phone</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{profile.phone || 'Not provided'}</dd>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <dt className="font-semibold text-slate-500">Permanent address</dt>
                  <dd className="mt-1 leading-6 text-slate-700">{profile.permanentAddress || 'Not provided'}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Appointment reason"
                action={
                  activeAppointment ? (
                    <Link to={`/doctor/consultation/${activeAppointment.id}`}>
                      <Button size="sm">
                        <NotebookText className="h-4 w-4" aria-hidden="true" />
                        Write note
                      </Button>
                    </Link>
                  ) : null
                }
              />
              <CardBody>
                {activeAppointment ? (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge status={activeAppointment.status} />
                      <p className="text-sm font-semibold text-slate-500">{activeAppointment.date} - {activeAppointment.time}</p>
                    </div>
                    <p className="mt-4 rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm leading-6 text-slate-700">
                      {activeAppointment.reason}
                    </p>
                  </>
                ) : (
                  <EmptyPanel>No active appointment found for this patient.</EmptyPanel>
                )}
              </CardBody>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2 xl:gap-6">
              <Card>
                <CardHeader title="Symptom summary" action={<HeartPulse className="h-5 w-5 text-rose-500" aria-hidden="true" />} />
                <CardBody className="space-y-4">
                  {latestSymptom ? (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge status={latestSymptom.priority || 'NORMAL'} />
                        <p className="text-sm font-semibold text-slate-500">{latestSymptom.mainSymptom}</p>
                      </div>
                      {latestSymptom.redFlags?.length > 0 ? (
                        <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                          <p className="text-xs font-bold uppercase text-amber-700">Red flags</p>
                          <p className="mt-2 text-sm leading-6 text-amber-800">{latestSymptom.redFlags.join(', ')}</p>
                        </div>
                      ) : null}
                      {latestSymptom.conditionalAnswers && Object.keys(latestSymptom.conditionalAnswers).length > 0 ? (
                        <div className="grid gap-2">
                          {Object.entries(latestSymptom.conditionalAnswers).map(([label, value]) => (
                            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3" key={label}>
                              <p className="text-xs font-semibold text-slate-500">{label}</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <p className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm leading-6 text-slate-700">{latestSymptomSummary}</p>
                    </>
                  ) : (
                    <p className="text-sm leading-6 text-slate-700">{latestSymptomSummary}</p>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Medical records" action={<FileText className="h-5 w-5 text-medical-600" aria-hidden="true" />} />
                <CardBody className="space-y-3">
                  {visibleRecords.length === 0 ? (
                    <EmptyPanel>No medical records uploaded yet.</EmptyPanel>
                  ) : null}

                  {visibleRecords.slice(0, 3).map((record) => (
                    <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3" key={record.id}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{record.title}</p>
                          <p className="text-xs text-slate-500">{record.category} - {record.date}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{record.type}</span>
                      </div>

                      {record.documents.filter(isImageDocument).slice(0, 2).map((document) => (
                        <img
                          alt={document.originalName}
                          className="mt-3 h-28 w-full rounded-md border border-slate-100 object-cover"
                          key={document.id}
                          src={document.url}
                        />
                      ))}

                      {record.documents.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {record.documents.map((document) => (
                            <a
                              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:border-medical-200 hover:bg-medical-50 hover:text-medical-700"
                              download={document.mimeType === 'application/pdf' ? document.originalName : undefined}
                              href={document.url}
                              key={document.id}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              Open {document.originalName}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs font-semibold text-slate-500">No files uploaded for this record.</p>
                      )}
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader title="Previous consultation history" />
              <CardBody>
                {patientConsultations.length === 0 ? (
                  <EmptyPanel>No consultation history yet.</EmptyPanel>
                ) : (
                  <DataTable
                    columns={[
                      { key: 'date', header: 'Date' },
                      { key: 'doctor', header: 'Doctor' },
                      { key: 'diagnosis', header: 'Diagnosis' },
                      { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                    ]}
                    rows={patientConsultations}
                    getRowKey={(row) => row.id}
                  />
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
