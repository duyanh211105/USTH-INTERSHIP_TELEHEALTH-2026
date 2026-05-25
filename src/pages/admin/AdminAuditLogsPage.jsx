import { ChevronLeft, ChevronRight, Filter, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import { getAdminAuditLogs } from '../../services/telehealthApi.js';

const defaultFilters = {
  action: '',
  actorRole: '',
  startDate: '',
  endDate: '',
};

function formatDateTime(value) {
  if (!value) {
    return 'Time pending';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function metadataPreview(metadata) {
  const value = JSON.stringify(metadata || {});
  return value.length > 96 ? `${value.slice(0, 96)}...` : value;
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  function loadLogs(nextPage = pagination.page, nextFilters = appliedFilters) {
    setIsLoading(true);
    setError('');

    return getAdminAuditLogs({ ...nextFilters, page: nextPage, limit: pagination.limit })
      .then((data) => {
        setLogs(data.logs || []);
        setPagination(data.pagination || { page: nextPage, limit: 50, total: 0, totalPages: 1 });
      })
      .catch((loadError) => {
        setLogs([]);
        setError(loadError.message || 'Unable to load audit logs.');
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadLogs(1, appliedFilters);
  }, []);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function handleApplyFilters(event) {
    event.preventDefault();
    setAppliedFilters(filters);
    loadLogs(1, filters);
  }

  function handleClearFilters() {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    loadLogs(1, defaultFilters);
  }

  return (
    <DashboardLayout role="admin" title="Audit Logs" subtitle="Trace important admin, doctor, and patient actions.">
      <Card>
        <CardHeader
          title="Audit log filters"
          action={
            <span className="inline-flex items-center gap-2 rounded-full bg-medical-50 px-3 py-1 text-xs font-bold text-medical-700">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Admin only
            </span>
          }
        >
          Filter by action, actor role, and date range without loading all logs at once.
        </CardHeader>
        <CardBody>
          <form className="grid gap-4 lg:grid-cols-[1fr_180px_180px_180px_auto]" onSubmit={handleApplyFilters}>
            <label>
              <span className="text-sm font-semibold text-slate-700">Action type</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                onChange={(event) => updateFilter('action', event.target.value)}
                placeholder="appointment.created"
                value={filters.action}
              />
            </label>
            <label>
              <span className="text-sm font-semibold text-slate-700">Actor role</span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                onChange={(event) => updateFilter('actorRole', event.target.value)}
                value={filters.actorRole}
              >
                <option value="">All roles</option>
                <option value="admin">Admin</option>
                <option value="doctor">Doctor</option>
                <option value="patient">Patient</option>
                <option value="anonymous">Anonymous</option>
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold text-slate-700">Start date</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                onChange={(event) => updateFilter('startDate', event.target.value)}
                type="date"
                value={filters.startDate}
              />
            </label>
            <label>
              <span className="text-sm font-semibold text-slate-700">End date</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                onChange={(event) => updateFilter('endDate', event.target.value)}
                type="date"
                value={filters.endDate}
              />
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit" size="sm" disabled={isLoading}>
                <Filter className="h-4 w-4" aria-hidden="true" />
                Apply audit filters
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={handleClearFilters} disabled={isLoading}>
                Clear
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Audit log events"
          action={<span className="text-sm font-semibold text-slate-500">{pagination.total} total</span>}
        />
        <CardBody>
          {isLoading ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
              Loading audit logs...
            </div>
          ) : null}

          {!isLoading && error ? (
            <EmptyState title="Unable to load audit logs" description={error} />
          ) : null}

          {!isLoading && !error && logs.length === 0 ? (
            <EmptyState title="No audit logs found" description="Try adjusting the filters or date range." />
          ) : null}

          {!isLoading && !error && logs.length > 0 ? (
            <>
              <DataTable
                columns={[
                  { key: 'action', header: 'Action' },
                  { key: 'actorRole', header: 'Actor', render: (row) => <StatusBadge status={row.actorRole} /> },
                  {
                    key: 'entity',
                    header: 'Entity',
                    render: (row) => `${row.entityType}${row.entityId ? ` #${row.entityId}` : ''}`,
                  },
                  { key: 'createdAt', header: 'Timestamp', render: (row) => formatDateTime(row.createdAt) },
                  {
                    key: 'metadata',
                    header: 'Metadata',
                    render: (row) => <span className="whitespace-normal text-xs text-slate-500">{metadataPreview(row.metadata)}</span>,
                  },
                ]}
                rows={logs}
                getRowKey={(row) => row.id}
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-500">
                  Page {pagination.page} of {pagination.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    aria-label="Previous page"
                    disabled={isLoading || pagination.page <= 1}
                    onClick={() => loadLogs(pagination.page - 1)}
                    size="sm"
                    variant="secondary"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Previous
                  </Button>
                  <Button
                    aria-label="Next page"
                    disabled={isLoading || pagination.page >= pagination.totalPages}
                    onClick={() => loadLogs(pagination.page + 1)}
                    size="sm"
                    variant="secondary"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardBody>
      </Card>
    </DashboardLayout>
  );
}
