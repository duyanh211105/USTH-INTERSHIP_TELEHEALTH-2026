import { ExternalLink, FileText, Trash2, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Toast from '../../components/Toast.jsx';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import useToast from '../../hooks/useToast.js';
import { createMedicalRecord, deleteMedicalRecord, getRecords, uploadMedicalDocument } from '../../services/telehealthApi.js';
import { mapRecordForView } from '../../services/viewMappers.js';

export default function MedicalRecordsPage() {
  const [records, setRecords] = useState([]);
  const [title, setTitle] = useState('New lab result');
  const [category, setCategory] = useState('Laboratory');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const inputRef = useRef(null);
  const { toast, showToast } = useToast();

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setLoadError('');
    getRecords()
      .then((items) => {
        if (isMounted) {
          setRecords(items.map(mapRecordForView));
        }
      })
      .catch((error) => {
        if (isMounted) {
          setRecords([]);
          setLoadError(error.message || 'Unable to load medical records.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleUpload() {
    if (!selectedFile) {
      showToast('Choose a PDF, JPG, or PNG before uploading.', 'warning');
      return;
    }

    setIsUploading(true);

    try {
      const record = await createMedicalRecord({ title, category, notes: 'Uploaded from patient dashboard' });
      const document = await uploadMedicalDocument(record.id, selectedFile);
      setRecords((currentRecords) => [
        mapRecordForView({
          ...record,
          documents: [document],
          type: selectedFile.type === 'application/pdf' ? 'PDF' : 'Image',
          size: `${Math.ceil(selectedFile.size / 1024)} KB`,
        }),
        ...currentRecords,
      ]);
      setSelectedFile(null);
      showToast('Upload successful.', 'success');
    } catch (error) {
      showToast(error.message || 'Upload failed. Please try again.', 'error');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDeleteRecord() {
    if (!deletingRecord) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteMedicalRecord(deletingRecord.id);
      setRecords((currentRecords) => currentRecords.filter((record) => Number(record.id) !== Number(deletingRecord.id)));
      setDeletingRecord(null);
      showToast('Medical record deleted.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to delete medical record.', 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <DashboardLayout role="patient" title="Medical Records" subtitle="Manage health documents for doctor review.">
      <div className="grid gap-5 xl:grid-cols-[390px_1fr] xl:gap-6">
        <Card>
          <CardHeader title="Upload record" eyebrow="Upload medical document" />
          <CardBody>
            <div className="mb-5">
              <Toast toast={toast} />
            </div>
            <EmptyState
              title="Drop PDF, JPG, or PNG"
              description={selectedFile ? `Selected file: ${selectedFile.name}` : 'Choose a medical document to upload into local MVP storage.'}
              footer={
                <div className="grid gap-2 text-left text-xs font-semibold text-slate-500 sm:grid-cols-2">
                  <div className="rounded-md border border-medical-100 bg-white px-3 py-2">Supported formats: PDF, JPG, PNG</div>
                  <div className="rounded-md border border-medical-100 bg-white px-3 py-2">Maximum file size: 10MB</div>
                </div>
              }
              action={
                <Button onClick={() => inputRef.current?.click()} type="button">
                  <UploadCloud className="h-4 w-4" aria-hidden="true" />
                  Choose file
                </Button>
              }
            />
            <input
              accept="application/pdf,image/jpeg,image/png"
              aria-label="Medical record file"
              className="sr-only"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              ref={inputRef}
              type="file"
            />
            <div className="mt-6 grid gap-4">
              <label>
                <span className="text-sm font-semibold text-slate-700">Record title</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
              </label>
              <label>
                <span className="text-sm font-semibold text-slate-700">Category</span>
                <select
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                  onChange={(event) => setCategory(event.target.value)}
                  value={category}
                >
                  <option>Laboratory</option>
                  <option>Radiology</option>
                  <option>Prescription</option>
                </select>
              </label>
              <Button className="w-full sm:w-auto" disabled={isUploading || !selectedFile} onClick={handleUpload}>
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
                {isUploading ? 'Uploading file...' : 'Upload selected file'}
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Uploaded records" action={<span className="text-sm font-semibold text-slate-500">{records.length} files</span>} />
          <CardBody>
            {isLoading ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
                Loading medical records...
              </div>
            ) : loadError ? (
              <EmptyState title="Unable to load medical records" description={loadError} />
            ) : records.length === 0 ? (
              <EmptyState title="No medical records uploaded yet" description="Upload a medical document so your doctor can review it during consultation." />
            ) : (
              <DataTable
                columns={[
                  {
                    key: 'title',
                    header: 'Record',
                    render: (row) => (
                      <div className="flex min-w-64 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-medical-50 text-medical-700">
                          <FileText className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{row.title}</p>
                          <p className="text-xs text-slate-500">{row.category}</p>
                          {row.documents?.filter((document) => document.mimeType?.startsWith('image/')).slice(0, 1).map((document) => (
                            <img
                              alt={document.originalName}
                              className="mt-3 h-20 w-32 rounded-md border border-slate-100 object-cover"
                              key={document.id}
                              src={document.url}
                            />
                          ))}
                        </div>
                      </div>
                    ),
                  },
                  { key: 'type', header: 'Type' },
                  { key: 'date', header: 'Date' },
                  { key: 'size', header: 'Size' },
                  {
                    key: 'actions',
                    header: 'Actions',
                    render: (row) => (
                      <div className="flex flex-wrap items-center gap-2">
                        {row.documents?.map((document) => (
                          <a
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-medical-200 hover:bg-medical-50 hover:text-medical-700"
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
                        <Button aria-label={`Delete ${row.title}`} onClick={() => setDeletingRecord(row)} size="sm" variant="danger">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete
                        </Button>
                      </div>
                    ),
                  },
                ]}
                rows={records}
                getRowKey={(row) => row.id}
              />
            )}
          </CardBody>
        </Card>
      </div>
      {deletingRecord ? (
        <ConfirmDialog
          title="Delete medical record"
          description={`Delete "${deletingRecord.title}" and remove its uploaded files.`}
          confirmLabel="Confirm delete record"
          isSubmitting={isDeleting}
          onCancel={() => setDeletingRecord(null)}
          onConfirm={handleDeleteRecord}
        />
      ) : null}
    </DashboardLayout>
  );
}
