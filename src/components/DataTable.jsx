export default function DataTable({ columns, rows, getRowKey }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100 bg-white shadow-sm ring-1 ring-slate-950/[0.02]">
      <table className="w-full min-w-[720px] divide-y divide-slate-100 text-left text-sm">
        <thead className="bg-slate-50/90">
          <tr className="text-xs font-bold uppercase text-slate-500">
            {columns.map((column) => (
              <th className="whitespace-nowrap px-4 py-3.5 tracking-wide" key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr className="group bg-white text-slate-700 transition-colors duration-150 hover:bg-medical-50/40 focus-within:bg-medical-50/40" key={getRowKey ? getRowKey(row) : index}>
              {columns.map((column) => (
                <td className="whitespace-nowrap px-4 py-4 align-middle transition-colors duration-150 group-hover:text-slate-900" key={column.key}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
