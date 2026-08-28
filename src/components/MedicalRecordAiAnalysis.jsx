import { Sparkles, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from './Button.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import {
  getMedicalRecordAiAnalysis,
  requestMedicalRecordAiAnalysis,
  reviewMedicalRecordAiAnalysis,
} from '../services/telehealthApi.js';

const statusLabels = {
  PENDING_REVIEW: 'Pending Doctor Review',
  ACCEPTED: 'Accepted by Doctor',
  EDITED: 'Edited by Doctor',
  REJECTED: 'Rejected by Doctor',
};

const statusStyles = {
  PENDING_REVIEW: 'bg-amber-50 text-amber-700 ring-amber-200',
  ACCEPTED: 'bg-mint-50 text-mint-700 ring-mint-200',
  EDITED: 'bg-medical-50 text-medical-700 ring-medical-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function normalizeAnalysisPayload(analysisRecord) {
  return analysisRecord?.analysis || analysisRecord?.analysisJson || analysisRecord?.analysis_json || {};
}

function normalizeReviewedPayload(analysisRecord) {
  return analysisRecord?.reviewedAnalysis || analysisRecord?.reviewed_analysis || analysisRecord?.reviewed_analysis_json || null;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function linesToArray(value) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToLines(value) {
  return normalizeArray(value).map(formatTextItem).filter(Boolean).join('\n');
}

function nullableText(value) {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

function ensureEditableRows(items, emptyRow) {
  const normalized = normalizeArray(items);
  return normalized.length > 0 ? normalized : [emptyRow];
}

function formatTextItem(item) {
  if (!item) {
    return '';
  }

  if (typeof item === 'string') {
    return item;
  }

  if (typeof item === 'object') {
    const parts = [
      item.name,
      item.medication,
      item.dosage,
      item.frequency,
      item.status,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' - ') : Object.values(item).filter(Boolean).join(' - ');
  }

  return String(item);
}

function createEditFormState(sourceAnalysis, doctorNotes = '') {
  return {
    summary: sourceAnalysis.summary || '',
    medicalHistory: arrayToLines(sourceAnalysis.medical_history),
    medications: arrayToLines(sourceAnalysis.medications),
    allergies: arrayToLines(sourceAnalysis.allergies),
    keyFindings: ensureEditableRows(sourceAnalysis.key_findings, { finding: '', source_text: '' }).map((item) => ({
      finding: item.finding || '',
      sourceText: item.source_text || '',
    })),
    abnormalValues: ensureEditableRows(sourceAnalysis.abnormal_values, {
      test: '',
      value: '',
      reference_range: '',
      source_text: '',
    }).map((item) => ({
      test: item.test || '',
      value: item.value || '',
      referenceRange: item.reference_range || '',
      sourceText: item.source_text || '',
    })),
    redFlags: ensureEditableRows(sourceAnalysis.red_flags, { finding: '', source_text: '' }).map((item) => ({
      finding: item.finding || '',
      sourceText: item.source_text || '',
    })),
    possibleConditions: ensureEditableRows(sourceAnalysis.possible_conditions, {
      condition: '',
      reasoning: '',
      source_text: '',
    }).map((item) => ({
      condition: item.condition || '',
      reasoning: item.reasoning || '',
      sourceText: item.source_text || '',
    })),
    suggestedQuestions: arrayToLines(sourceAnalysis.suggested_questions),
    suggestedFollowUp: arrayToLines(sourceAnalysis.suggested_follow_up),
    missingInformation: arrayToLines(sourceAnalysis.missing_information),
    doctorNotes,
  };
}

function formStateToAnalysis(formState) {
  return {
    summary: formState.summary.trim(),
    medical_history: linesToArray(formState.medicalHistory),
    medications: linesToArray(formState.medications),
    allergies: linesToArray(formState.allergies),
    key_findings: formState.keyFindings
      .filter((item) => item.finding.trim() && item.sourceText.trim())
      .map((item) => ({
        finding: item.finding.trim(),
        source_text: item.sourceText.trim(),
      })),
    abnormal_values: formState.abnormalValues
      .filter((item) => item.test.trim() && item.value.trim() && item.sourceText.trim())
      .map((item) => ({
        test: item.test.trim(),
        value: item.value.trim(),
        reference_range: nullableText(item.referenceRange),
        source_text: item.sourceText.trim(),
      })),
    red_flags: formState.redFlags
      .filter((item) => item.finding.trim() && item.sourceText.trim())
      .map((item) => ({
        finding: item.finding.trim(),
        source_text: item.sourceText.trim(),
      })),
    possible_conditions: formState.possibleConditions
      .filter((item) => item.condition.trim())
      .map((item) => ({
        condition: item.condition.trim(),
        reasoning: item.reasoning.trim(),
        source_text: nullableText(item.sourceText),
      })),
    suggested_questions: linesToArray(formState.suggestedQuestions),
    suggested_follow_up: linesToArray(formState.suggestedFollowUp),
    missing_information: linesToArray(formState.missingInformation),
  };
}

function getFriendlyError(error, context = 'analysis') {
  if (error.status === 401) {
    return 'Your session has expired. Please log in again.';
  }

  if (error.status === 403) {
    return 'You are not authorized to view this analysis.';
  }

  if (error.status === 404) {
    return context === 'load'
      ? 'AI analysis has not been generated for this record.'
      : 'No AI analysis is available for this record.';
  }

  if (error.status === 409) {
    return 'This analysis has already been reviewed and cannot be changed.';
  }

  if (error.status === 400 && context === 'review') {
    return 'Please check the edited analysis and try again.';
  }

  return 'AI analysis could not be completed. Please try again later.';
}

function StatusPill({ status }) {
  const normalized = status || 'PENDING_REVIEW';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusStyles[normalized] || statusStyles.PENDING_REVIEW}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {statusLabels[normalized] || normalized}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3">
      <h4 className="text-sm font-bold text-slate-950">{title}</h4>
      <div className="mt-2 text-sm leading-6 text-slate-700">{children}</div>
    </div>
  );
}

function EmptyText({ children = 'No information provided.' }) {
  return <p className="text-sm font-semibold text-slate-500">{children}</p>;
}

function TextList({ items }) {
  const normalized = normalizeArray(items).map(formatTextItem).filter(Boolean);

  if (normalized.length === 0) {
    return <EmptyText />;
  }

  return (
    <ul className="space-y-1.5">
      {normalized.map((item, index) => (
        <li className="rounded-md bg-slate-50 px-3 py-2" key={`${item}-${index}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function Provenance({ label = 'Source', sourceText }) {
  if (!sourceText) {
    return <p className="mt-1 text-xs font-semibold text-slate-400">Source unavailable</p>;
  }

  return <p className="mt-1 text-xs font-semibold text-slate-500">{label}: {sourceText}</p>;
}

function FindingList({ items }) {
  const normalized = normalizeArray(items);

  if (normalized.length === 0) {
    return <EmptyText />;
  }

  return (
    <div className="space-y-2">
      {normalized.map((item, index) => (
        <div className="rounded-md bg-slate-50 px-3 py-2" key={`${item.finding}-${index}`}>
          <p className="font-semibold text-slate-900">{item.finding}</p>
          <Provenance label="Evidence" sourceText={item.source_text} />
        </div>
      ))}
    </div>
  );
}

function AbnormalValueList({ items }) {
  const normalized = normalizeArray(items);

  if (normalized.length === 0) {
    return <EmptyText />;
  }

  return (
    <div className="space-y-2">
      {normalized.map((item, index) => (
        <div className="rounded-md bg-slate-50 px-3 py-2" key={`${item.test}-${index}`}>
          <p className="font-semibold text-slate-900">{item.test}: {item.value}</p>
          {item.reference_range ? <p className="text-xs font-semibold text-slate-500">Reference range: {item.reference_range}</p> : null}
          <Provenance label="Evidence" sourceText={item.source_text} />
        </div>
      ))}
    </div>
  );
}

function PossibleConditionList({ items }) {
  const normalized = normalizeArray(items);

  if (normalized.length === 0) {
    return <EmptyText />;
  }

  return (
    <div className="space-y-2">
      {normalized.map((item, index) => (
        <div className="rounded-md border border-medical-100 bg-medical-50/40 px-3 py-2" key={`${item.condition}-${index}`}>
          <p className="font-semibold text-slate-900">{item.condition}</p>
          {item.reasoning ? <p className="mt-1 text-sm text-slate-700">{item.reasoning}</p> : null}
          <Provenance sourceText={item.source_text} />
        </div>
      ))}
    </div>
  );
}

function AnalysisContent({ analysis }) {
  return (
    <div className="space-y-3">
      <Section title="Clinical Summary">
        {analysis.summary ? <p>{analysis.summary}</p> : <EmptyText />}
      </Section>
      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Medical History">
          <TextList items={analysis.medical_history} />
        </Section>
        <Section title="Medications">
          <TextList items={analysis.medications} />
        </Section>
        <Section title="Allergies">
          <TextList items={analysis.allergies} />
        </Section>
        <Section title="Key Findings">
          <FindingList items={analysis.key_findings} />
        </Section>
      </div>
      <Section title="Abnormal Values">
        <AbnormalValueList items={analysis.abnormal_values} />
      </Section>
      <Section title="Red Flags">
        <FindingList items={analysis.red_flags} />
      </Section>
      <Section title="Possible Conditions — For Doctor Review">
        <PossibleConditionList items={analysis.possible_conditions} />
      </Section>
      <div className="grid gap-3 md:grid-cols-3">
        <Section title="Suggested Questions">
          <TextList items={analysis.suggested_questions} />
        </Section>
        <Section title="Suggested Follow-up">
          <TextList items={analysis.suggested_follow_up} />
        </Section>
        <Section title="Missing Information">
          <TextList items={analysis.missing_information} />
        </Section>
      </div>
    </div>
  );
}

function TextAreaField({ id, label, value, onChange, rows = 3 }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700" htmlFor={id}>
      {label}
      <textarea
        className="min-h-20 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-medical-400 focus:ring-2 focus:ring-medical-100"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        value={value}
      />
    </label>
  );
}

function InputField({ id, label, value, onChange }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700" htmlFor={id}>
      {label}
      <input
        className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-medical-400 focus:ring-2 focus:ring-medical-100"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function ReviewEditForm({
  formState,
  editError,
  isSubmitting,
  recordId,
  onCancel,
  onChange,
  onSubmit,
}) {
  const setValue = (key, value) => onChange({ ...formState, [key]: value });
  const setArrayValue = (key, index, field, value) => {
    const nextItems = formState[key].map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    ));
    onChange({ ...formState, [key]: nextItems });
  };

  return (
    <div className="rounded-lg border border-medical-100 bg-medical-50/30 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-950">Edit AI-Assisted Analysis</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Adjust the structured analysis for doctor review. This does not change the official diagnosis.
          </p>
        </div>
        <Button disabled={isSubmitting} onClick={onCancel} size="sm" variant="secondary">
          Cancel edit
        </Button>
      </div>

      {editError ? (
        <div className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {editError}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        <TextAreaField
          id={`ai-summary-${recordId}`}
          label="Clinical summary"
          onChange={(value) => setValue('summary', value)}
          value={formState.summary}
        />
        <div className="grid gap-3 md:grid-cols-3">
          <TextAreaField
            id={`ai-history-${recordId}`}
            label="Medical history"
            onChange={(value) => setValue('medicalHistory', value)}
            value={formState.medicalHistory}
          />
          <TextAreaField
            id={`ai-medications-${recordId}`}
            label="Medications"
            onChange={(value) => setValue('medications', value)}
            value={formState.medications}
          />
          <TextAreaField
            id={`ai-allergies-${recordId}`}
            label="Allergies"
            onChange={(value) => setValue('allergies', value)}
            value={formState.allergies}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {formState.keyFindings.map((item, index) => (
            <div className="grid gap-2 rounded-md border border-slate-100 bg-white p-3" key={`finding-${index}`}>
              <InputField
                id={`ai-key-finding-${recordId}-${index}`}
                label={`Key finding ${index + 1}`}
                onChange={(value) => setArrayValue('keyFindings', index, 'finding', value)}
                value={item.finding}
              />
              <InputField
                id={`ai-key-source-${recordId}-${index}`}
                label={`Key finding ${index + 1} source`}
                onChange={(value) => setArrayValue('keyFindings', index, 'sourceText', value)}
                value={item.sourceText}
              />
            </div>
          ))}

          {formState.possibleConditions.map((item, index) => (
            <div className="grid gap-2 rounded-md border border-slate-100 bg-white p-3" key={`condition-${index}`}>
              <InputField
                id={`ai-condition-${recordId}-${index}`}
                label={`Possible condition ${index + 1}`}
                onChange={(value) => setArrayValue('possibleConditions', index, 'condition', value)}
                value={item.condition}
              />
              <TextAreaField
                id={`ai-condition-reasoning-${recordId}-${index}`}
                label={`Supporting evidence for condition ${index + 1}`}
                onChange={(value) => setArrayValue('possibleConditions', index, 'reasoning', value)}
                rows={2}
                value={item.reasoning}
              />
              <InputField
                id={`ai-condition-source-${recordId}-${index}`}
                label={`Source text for condition ${index + 1}`}
                onChange={(value) => setArrayValue('possibleConditions', index, 'sourceText', value)}
                value={item.sourceText}
              />
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {formState.abnormalValues.map((item, index) => (
            <div className="grid gap-2 rounded-md border border-slate-100 bg-white p-3" key={`abnormal-${index}`}>
              <InputField
                id={`ai-abnormal-test-${recordId}-${index}`}
                label={`Abnormal value ${index + 1} test`}
                onChange={(value) => setArrayValue('abnormalValues', index, 'test', value)}
                value={item.test}
              />
              <InputField
                id={`ai-abnormal-value-${recordId}-${index}`}
                label={`Abnormal value ${index + 1}`}
                onChange={(value) => setArrayValue('abnormalValues', index, 'value', value)}
                value={item.value}
              />
              <InputField
                id={`ai-abnormal-range-${recordId}-${index}`}
                label={`Abnormal value ${index + 1} reference range`}
                onChange={(value) => setArrayValue('abnormalValues', index, 'referenceRange', value)}
                value={item.referenceRange}
              />
              <InputField
                id={`ai-abnormal-source-${recordId}-${index}`}
                label={`Abnormal value ${index + 1} source`}
                onChange={(value) => setArrayValue('abnormalValues', index, 'sourceText', value)}
                value={item.sourceText}
              />
            </div>
          ))}

          {formState.redFlags.map((item, index) => (
            <div className="grid gap-2 rounded-md border border-slate-100 bg-white p-3" key={`red-flag-${index}`}>
              <InputField
                id={`ai-red-flag-${recordId}-${index}`}
                label={`Red flag ${index + 1}`}
                onChange={(value) => setArrayValue('redFlags', index, 'finding', value)}
                value={item.finding}
              />
              <InputField
                id={`ai-red-flag-source-${recordId}-${index}`}
                label={`Red flag ${index + 1} source`}
                onChange={(value) => setArrayValue('redFlags', index, 'sourceText', value)}
                value={item.sourceText}
              />
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <TextAreaField
            id={`ai-questions-${recordId}`}
            label="Suggested questions"
            onChange={(value) => setValue('suggestedQuestions', value)}
            value={formState.suggestedQuestions}
          />
          <TextAreaField
            id={`ai-follow-up-${recordId}`}
            label="Suggested follow-up"
            onChange={(value) => setValue('suggestedFollowUp', value)}
            value={formState.suggestedFollowUp}
          />
          <TextAreaField
            id={`ai-missing-${recordId}`}
            label="Missing information"
            onChange={(value) => setValue('missingInformation', value)}
            value={formState.missingInformation}
          />
        </div>

        <TextAreaField
          id={`ai-edit-notes-${recordId}`}
          label="Doctor notes for edit"
          onChange={(value) => setValue('doctorNotes', value)}
          value={formState.doctorNotes}
        />

        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={isSubmitting} onClick={onSubmit}>
            {isSubmitting ? 'Saving edited analysis...' : 'Save edited analysis'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MedicalRecordAiAnalysis({ record, showToast }) {
  const [analysisRecord, setAnalysisRecord] = useState(null);
  const [loadState, setLoadState] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reviewAction, setReviewAction] = useState(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [doctorNotes, setDoctorNotes] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editFormState, setEditFormState] = useState(null);
  const [editError, setEditError] = useState('');
  const generationInFlightRef = useRef(false);
  const recordId = record?.id;

  useEffect(() => {
    if (!recordId) {
      return undefined;
    }

    let isMounted = true;
    setLoadState('loading');
    setErrorMessage('');
    setAnalysisRecord(null);
    setIsEditing(false);
    setEditFormState(null);

    getMedicalRecordAiAnalysis(recordId)
      .then((analysis) => {
        if (!isMounted) {
          return;
        }

        setAnalysisRecord(analysis);
        setDoctorNotes(analysis?.doctorNotes || '');
        setLoadState('loaded');
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        if (error.status === 404) {
          setLoadState('empty');
          setErrorMessage('');
          return;
        }

        setLoadState('error');
        setErrorMessage(getFriendlyError(error, 'load'));
      });

    return () => {
      isMounted = false;
    };
  }, [recordId]);

  const originalAnalysis = useMemo(() => normalizeAnalysisPayload(analysisRecord), [analysisRecord]);
  const reviewedAnalysis = useMemo(() => normalizeReviewedPayload(analysisRecord), [analysisRecord]);
  const displayAnalysis = analysisRecord?.status === 'EDITED' && reviewedAnalysis ? reviewedAnalysis : originalAnalysis;
  const isFinalStatus = ['ACCEPTED', 'EDITED', 'REJECTED'].includes(analysisRecord?.status);

  async function handleGenerateAnalysis() {
    if (!recordId || generationInFlightRef.current || isGenerating) {
      return;
    }

    generationInFlightRef.current = true;
    setIsGenerating(true);
    setErrorMessage('');

    try {
      const generatedAnalysis = await requestMedicalRecordAiAnalysis(recordId);
      setAnalysisRecord(generatedAnalysis);
      setDoctorNotes(generatedAnalysis?.doctorNotes || '');
      setLoadState('loaded');
      showToast?.('AI analysis is ready for doctor review.', 'success');
    } catch (error) {
      const message = getFriendlyError(error, 'analysis');
      setErrorMessage(message);
      showToast?.('Unable to generate AI analysis.', 'error');
    } finally {
      generationInFlightRef.current = false;
      setIsGenerating(false);
    }
  }

  function beginEdit() {
    setErrorMessage('');
    setEditError('');
    setEditFormState(createEditFormState(displayAnalysis, doctorNotes));
    setIsEditing(true);
  }

  async function submitReview(action) {
    if (!recordId || isReviewing) {
      return;
    }

    setIsReviewing(true);
    setErrorMessage('');

    try {
      const payload = {
        action,
        doctor_notes: doctorNotes,
      };
      const updatedAnalysis = await reviewMedicalRecordAiAnalysis(recordId, payload);
      setAnalysisRecord(updatedAnalysis);
      setDoctorNotes(updatedAnalysis?.doctorNotes || doctorNotes);
      showToast?.(`AI analysis ${action.toLowerCase()}ed.`, 'success');
    } catch (error) {
      const message = getFriendlyError(error, 'review');
      setErrorMessage(message);
      showToast?.('Unable to update AI analysis review.', 'error');
    } finally {
      setReviewAction(null);
      setIsReviewing(false);
    }
  }

  async function submitEdit() {
    if (!recordId || isReviewing || !editFormState) {
      return;
    }

    setEditError('');
    const reviewedPayload = formStateToAnalysis(editFormState);

    if (!reviewedPayload.summary) {
      setEditError('Clinical summary is required.');
      return;
    }

    setIsReviewing(true);

    try {
      const updatedAnalysis = await reviewMedicalRecordAiAnalysis(recordId, {
        action: 'EDIT',
        reviewed_analysis: reviewedPayload,
        doctor_notes: editFormState.doctorNotes,
      });
      setAnalysisRecord(updatedAnalysis);
      setDoctorNotes(updatedAnalysis?.doctorNotes || editFormState.doctorNotes);
      setIsEditing(false);
      setEditFormState(null);
      showToast?.('Edited analysis saved.', 'success');
    } catch (error) {
      const message = getFriendlyError(error, 'review');
      setEditError(message);
      showToast?.('Unable to save edited analysis.', 'error');
    } finally {
      setIsReviewing(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-medical-100 bg-medical-50/20 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-medical-600" aria-hidden="true" />
            <h3 className="text-sm font-bold text-slate-950">AI-Assisted Medical Record Analysis</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Decision-support only. This analysis does not create, replace, or update the official doctor diagnosis.
          </p>
        </div>
        {analysisRecord ? <StatusPill status={analysisRecord.status} /> : null}
      </div>

      {loadState === 'loading' ? (
        <div className="mt-3 rounded-md border border-slate-100 bg-white px-3 py-2 text-sm font-semibold text-slate-500">
          Loading AI analysis...
        </div>
      ) : null}

      {loadState === 'empty' ? (
        <div className="mt-3 rounded-md border border-slate-100 bg-white px-3 py-3">
          <p className="text-sm font-semibold text-slate-600">AI analysis has not been generated for this record.</p>
          <Button className="mt-3" disabled={isGenerating} onClick={handleGenerateAnalysis} size="sm">
            {isGenerating ? 'Generating AI analysis...' : 'Analyze with AI'}
          </Button>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {analysisRecord ? (
        <div className="mt-4 space-y-4">
          {analysisRecord.status === 'EDITED' && reviewedAnalysis ? (
            <>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  <h4 className="text-sm font-bold text-slate-800">Original AI Analysis</h4>
                </div>
                <AnalysisContent analysis={originalAnalysis} />
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-medical-600" aria-hidden="true" />
                  <h4 className="text-sm font-bold text-slate-800">Doctor-Reviewed Version</h4>
                </div>
                <AnalysisContent analysis={reviewedAnalysis} />
              </div>
            </>
          ) : (
            <AnalysisContent analysis={displayAnalysis} />
          )}

          {!isFinalStatus ? (
            <div className="rounded-lg border border-slate-100 bg-white p-3">
              <h4 className="text-sm font-bold text-slate-950">Doctor Review</h4>
              <label className="mt-3 grid gap-1.5 text-sm font-semibold text-slate-700" htmlFor={`ai-doctor-notes-${recordId}`}>
                Doctor notes
                <textarea
                  className="min-h-20 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-medical-400 focus:ring-2 focus:ring-medical-100"
                  id={`ai-doctor-notes-${recordId}`}
                  onChange={(event) => setDoctorNotes(event.target.value)}
                  value={doctorNotes}
                />
              </label>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button disabled={isReviewing} onClick={() => setReviewAction('ACCEPT')} size="sm" variant="success">
                  Accept
                </Button>
                <Button disabled={isReviewing} onClick={beginEdit} size="sm" variant="secondary">
                  Edit
                </Button>
                <Button disabled={isReviewing} onClick={() => setReviewAction('REJECT')} size="sm" variant="danger">
                  Reject
                </Button>
              </div>
            </div>
          ) : null}

          {isEditing && editFormState ? (
            <ReviewEditForm
              editError={editError}
              formState={editFormState}
              isSubmitting={isReviewing}
              onCancel={() => {
                setIsEditing(false);
                setEditFormState(null);
                setEditError('');
              }}
              onChange={setEditFormState}
              onSubmit={submitEdit}
              recordId={recordId}
            />
          ) : null}
        </div>
      ) : null}

      {reviewAction === 'ACCEPT' ? (
        <ConfirmDialog
          confirmLabel="Accept analysis"
          description="Accept this AI-assisted analysis for doctor review reference? This will not create or overwrite the official diagnosis."
          isSubmitting={isReviewing}
          onCancel={() => setReviewAction(null)}
          onConfirm={() => submitReview('ACCEPT')}
          title="Accept AI-Assisted Analysis"
        />
      ) : null}

      {reviewAction === 'REJECT' ? (
        <ConfirmDialog
          confirmLabel="Reject analysis"
          description="Reject this AI-assisted analysis? The stored analysis will remain available for auditability and will not modify the official record."
          isSubmitting={isReviewing}
          onCancel={() => setReviewAction(null)}
          onConfirm={() => submitReview('REJECT')}
          title="Reject AI-Assisted Analysis"
        />
      ) : null}
    </div>
  );
}
