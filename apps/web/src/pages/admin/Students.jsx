import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../../api/client';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';

const REQUIRED_COLUMNS = ['name', 'dob', 'class', 'division', 'guardianName', 'guardianPhone', 'feesStatus'];

export default function Students() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
const [search, setSearch] = useState('');
const [classFilter, setClassFilter] = useState('');
const [divisionFilter, setDivisionFilter] = useState('');
const [feesStatusFilter, setFeesStatusFilter] = useState('');
const [currentPage, setCurrentPage] = useState(1);
const pageSize = 20;

  const [importFile, setImportFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/students');
      setStudents(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportFile(file);
    setParsedData(null);
    setParseError(null);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });

        if (jsonData.length === 0) {
          setParseError('File is empty');
          return;
        }

        // Ensure all values are strings (SheetJS can parse numbers)
        const stringified = jsonData.map(row => {
          const clean = {};
          for (const [key, val] of Object.entries(row)) {
            clean[key] = val === null || val === undefined ? '' : String(val).trim();
          }
          return clean;
        });

        const actualColumns = Object.keys(stringified[0]);
        const missingColumns = REQUIRED_COLUMNS.filter(col => !actualColumns.includes(col));
        if (missingColumns.length > 0) {
          setParseError(`Invalid columns. Missing: ${missingColumns.join(', ')}. Expected: ${REQUIRED_COLUMNS.join(', ')}`);
          return;
        }

        setParsedData(stringified);
      } catch (err) {
        setParseError('Failed to parse file. Please ensure it is a valid Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    if (!parsedData) return;

    setImporting(true);
    setImportResult(null);

    try {
      const response = await api.post('/admin/students/import', { students: parsedData });
      setImportResult(response.data);
      setParsedData(null);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (response.data.imported > 0) {
        fetchStudents();
      }
    } catch (err) {
      setImportResult({
        imported: 0,
        skipped: parsedData.length,
        errors: [{ row: 0, reason: err.response?.data?.error || 'Import failed' }]
      });
    } finally {
      setImporting(false);
    }
  };

  const handleResetImport = () => {
    setImportFile(null);
    setParsedData(null);
    setParseError(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uniqueClasses = [...new Set(students.map(s => s.class?.split('-')[0]).filter(Boolean))].sort();
  const uniqueDivisions = [...new Set(students.map(s => s.class?.split('-')[1]).filter(Boolean))].sort();

  const filteredStudents = students.filter(s => {
    const matchSearch = !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.class?.toLowerCase().includes(search.toLowerCase());
    const matchClass = !classFilter || s.class?.startsWith(classFilter);
    const matchDivision = !divisionFilter || s.class?.endsWith(`-${divisionFilter}`);
    const matchFees = !feesStatusFilter || s.feesStatus === feesStatusFilter;
    return matchSearch && matchClass && matchDivision && matchFees;
  });

  const totalPages = Math.ceil(filteredStudents.length / pageSize);
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, classFilter, divisionFilter, feesStatusFilter]);

  const downloadCSV = () => {
    const headers = ['Name', 'Class', 'DOB', 'Guardian', 'Phone', 'Fees Status', 'Status'];
    const rows = filteredStudents.map(s => [
      s.name, s.class,
      s.dob ? new Date(s.dob).toLocaleDateString() : 'N/A',
      s.guardian?.name || 'N/A', s.guardian?.mobile || 'N/A',
      s.feesStatus || 'not_assigned', s.status
    ]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('Students List', 14, 15);
    doc.setFontSize(10);
    doc.text(`${filteredStudents.length} students`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [['Name', 'Class', 'DOB', 'Guardian', 'Phone', 'Fees Status', 'Status']],
      body: filteredStudents.map(s => [
        s.name,
        s.class,
        s.dob ? new Date(s.dob).toLocaleDateString() : 'N/A',
        s.guardian?.name || 'N/A',
        s.guardian?.mobile || 'N/A',
        s.feesStatus || 'not_assigned',
        s.status
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] }
    });
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students.pdf';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="layout-stack-lg">
      <div className="glass-panel panel-padded">
        <div className="flex-between" style={{ marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '5px' }}>Students</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {students.length} students registered
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search by name or class..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '200px' }}
            />
            <select className="form-input" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={{ width: '100px' }}>
              <option value="">All Classes</option>
              {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="form-input" value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} style={{ width: '110px' }}>
              <option value="">All Divisions</option>
              {uniqueDivisions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="form-input" value={feesStatusFilter} onChange={(e) => setFeesStatusFilter(e.target.value)} style={{ width: '130px' }}>
              <option value="">All Fees Status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="not_assigned">Not Assigned</option>
            </select>
            <button
              type="button"
              className="btn"
              onClick={() => fileInputRef.current?.click()}
            >
              Import Excel
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {error && <ErrorState message={error} />}

        {loading ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>Loading...</p>
        ) : filteredStudents.length === 0 ? (
          <EmptyState title="No Students" message="No students found. Import students via Excel to get started." />
        ) : (
          <>
          <div className="overflow-table">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '10px' }}>#</th>
                  <th style={{ padding: '10px' }}>Name</th>
                  <th style={{ padding: '10px' }}>Class</th>
                  <th style={{ padding: '10px' }}>DOB</th>
                  <th style={{ padding: '10px' }}>Guardian</th>
                  <th style={{ padding: '10px' }}>Phone</th>
                  <th style={{ padding: '10px' }}>Fees Status</th>
                  <th style={{ padding: '10px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedStudents.map((student, idx) => (
                  <tr key={student.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{(currentPage - 1) * pageSize + idx + 1}</td>
                    <td style={{ padding: '10px', fontWeight: 500 }}>{student.name}</td>
                    <td style={{ padding: '10px' }}>{student.class}</td>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>
                      {student.dob ? new Date(student.dob).toLocaleDateString() : 'N/A'}
                    </td>
                    <td style={{ padding: '10px' }}>{student.guardian?.name || 'N/A'}</td>
                    <td style={{ padding: '10px' }}>{student.guardian?.mobile || 'N/A'}</td>
                    <td style={{ padding: '10px' }}>
                      <span className={`badge ${student.feesStatus === 'paid' ? 'badge-success' : student.feesStatus === 'unpaid' ? 'badge-warning' : ''}`}
                        style={{ fontSize: '0.7rem', textTransform: 'capitalize' }}>
                        {student.feesStatus || 'not_assigned'}
                      </span>
                    </td>
                    <td style={{ padding: '10px' }}><StatusBadge status={student.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '15px' }}>
              <button type="button" className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                ← Previous
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Page {currentPage} of {totalPages} ({filteredStudents.length} students)
              </span>
              <button type="button" className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                Next →
              </button>
            </div>
          )}
      </>
        )}

      </div>

      {filteredStudents.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '15px' }}>
          <button type="button" className="btn btn-secondary" onClick={downloadCSV}>Download CSV</button>
          <button type="button" className="btn btn-secondary" onClick={downloadPDF}>Download PDF</button>
        </div>
      )}

      {parsedData && (
        <div className="glass-panel panel-padded">
          <div className="flex-between" style={{ marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '5px' }}>Import Preview</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {parsedData.length} students ready to import from {importFile?.name}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" className="btn btn-secondary" onClick={handleResetImport}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={handleConfirmImport} disabled={importing}>
                {importing ? 'Importing...' : 'Confirm Import'}
              </button>
            </div>
          </div>

          <div style={{ maxHeight: '400px', overflow: 'auto', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', background: 'rgba(15, 23, 42, 0.9)' }}>
                  <th style={{ padding: '10px', position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 1 }}>#</th>
                  <th style={{ padding: '10px', position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 1 }}>Name</th>
                  <th style={{ padding: '10px', position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 1 }}>Class</th>
                  <th style={{ padding: '10px', position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 1 }}>Division</th>
                  <th style={{ padding: '10px', position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 1 }}>DOB</th>
                  <th style={{ padding: '10px', position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 1 }}>Guardian</th>
                  <th style={{ padding: '10px', position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 1 }}>Phone</th>
                  <th style={{ padding: '10px', position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 1 }}>Fees</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                    <td style={{ padding: '10px' }}>{row.name}</td>
                    <td style={{ padding: '10px' }}>{row.class}</td>
                    <td style={{ padding: '10px' }}>{row.division}</td>
                    <td style={{ padding: '10px' }}>{row.dob}</td>
                    <td style={{ padding: '10px' }}>{row.guardianName}</td>
                    <td style={{ padding: '10px' }}>{row.guardianPhone}</td>
                    <td style={{ padding: '10px' }}>
                      <span className={`badge ${row.feesStatus === 'paid' ? 'badge-success' : 'badge-warning'}`}
                        style={{ fontSize: '0.65rem', textTransform: 'capitalize' }}>
                        {row.feesStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {parseError && (
        <div className="glass-panel panel-padded">
          <ErrorState message={parseError} />
          <button type="button" className="btn btn-secondary" onClick={handleResetImport} style={{ marginTop: '12px' }}>
            Try Again
          </button>
        </div>
      )}

      {importResult && (
        <div className="glass-panel panel-padded">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>Import Result</h3>
          <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
            <p><strong>Imported:</strong> <span style={{ color: 'var(--success)' }}>{importResult.imported}</span></p>
            <p><strong>Fees Assigned:</strong> <span style={{ color: 'var(--primary)' }}>{importResult.feesAssigned || 0}</span></p>
            <p><strong>Skipped:</strong> <span style={{ color: 'var(--error)' }}>{importResult.skipped}</span></p>
          </div>
          {importResult.errors.length > 0 && (
            <div>
              <p style={{ fontWeight: 500, marginBottom: '8px' }}>Errors:</p>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {importResult.errors.map((err, idx) => (
                  <p key={idx} style={{ fontSize: '0.8rem', color: 'var(--error)', marginBottom: '4px' }}>
                    Row {err.row}: {err.reason}
                  </p>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="btn btn-secondary" onClick={handleResetImport} style={{ marginTop: '12px' }}>
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
}