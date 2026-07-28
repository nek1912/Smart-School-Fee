import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function FeeSetup() {
  const [feeStructures, setFeeStructures] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  
  // Form state
  const [form, setForm] = useState({
    name: '',
    amount: '',
    type: 'tuition',
    appliesTo: 'all',
    academicYearId: ''
  });
  
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Bulk Creation State
  const [bulkSelectedClasses, setBulkSelectedClasses] = useState([]);
  const [bulkComponents, setBulkComponents] = useState([{ name: '', amount: '', type: 'tuition' }]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const [bulkSuccess, setBulkSuccess] = useState(null);

  // Fetch initial data
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [yearsRes, structuresRes] = await Promise.all([
        axios.get('/api/academic-years', { headers }),
        axios.get('/api/fees/structures', { headers })
      ]);

      setAcademicYears(yearsRes.data);
      setFeeStructures(structuresRes.data);

      // Select default academic year if form is empty
      if (yearsRes.data.length > 0 && !form.academicYearId) {
        setForm(prev => ({ ...prev, academicYearId: yearsRes.data[0].id }));
      }

    } catch (err) {
      console.error(err);
      setError('Failed to fetch fee structures, academic years, or student rosters.');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleEditClick = (struct) => {
    setEditingId(struct.id);
    setForm({
      name: struct.name,
      amount: struct.amount,
      type: struct.type,
      appliesTo: struct.appliesTo,
      academicYearId: struct.academicYearId
    });
    setSuccess(null);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm({
      name: '',
      amount: '',
      type: 'tuition',
      appliesTo: 'all',
      academicYearId: academicYears[0]?.id || ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      if (editingId) {
        // Update (creates new version under the hood)
        await axios.put(`/api/fees/structures/${editingId}`, {
          name: form.name,
          amount: Number(form.amount),
          appliesTo: form.appliesTo
        }, { headers });
        setSuccess('Fee structure updated successfully! A new version has been generated.');
        setEditingId(null);
      } else {
        // Create new
        await axios.post('/api/fees/structures', {
          name: form.name,
          amount: Number(form.amount),
          type: form.type,
          appliesTo: form.appliesTo,
          academicYearId: Number(form.academicYearId)
        }, { headers });
        setSuccess('New fee structure created successfully!');
      }

      // Reset form fields
      setForm({
        name: '',
        amount: '',
        type: 'tuition',
        appliesTo: 'all',
        academicYearId: academicYears[0]?.id || ''
      });

      // Reload
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save fee structure.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkCreate = async (e) => {
    e.preventDefault();
    setBulkLoading(true);
    setBulkError(null);
    setBulkSuccess(null);

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      if (bulkSelectedClasses.length === 0) {
        throw new Error('Please select at least one class.');
      }

      if (bulkComponents.length === 0 || bulkComponents.some(c => !c.name || !c.amount)) {
        throw new Error('Each component must have a name and amount.');
      }

      const academicYearId = form.academicYearId || (academicYears[0]?.id);
      if (!academicYearId) {
        throw new Error('No academic year selected. Please create an academic year first.');
      }

      let created = 0;
      for (const cls of bulkSelectedClasses) {
        for (const component of bulkComponents) {
          await axios.post('/api/fees/structures', {
            name: `${component.name} - ${cls}`,
            amount: Number(component.amount),
            type: component.type,
            appliesTo: cls,
            academicYearId: Number(academicYearId)
          }, { headers });
          created++;
        }
      }

      setBulkSuccess(`Successfully created ${created} fee structure(s) across ${bulkSelectedClasses.length} class(es).`);
      setBulkSelectedClasses([]);
      setBulkComponents([{ name: '', amount: '', type: 'tuition' }]);
      fetchData();
    } catch (err) {
      setBulkError(err.response?.data?.error || err.message || 'Failed to create bulk fee structures.');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px', alignItems: 'start' }}>
      
      {/* Column 1: Forms */}
      <div className="layout-stack-lg">
        
        {/* CRUD Form */}
        <div className="glass-panel panel-compact">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '15px' }}>
          {editingId ? 'Edit Structure (Generates Version)' : 'Create Fee Structure'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
          {editingId 
            ? 'Modifying this structure will create a new audit version. Existing assignments will retain their version history.' 
            : 'Define a new fee component and target scope linked to an academic year.'}
        </p>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Structure Name</label>
            <input
              type="text"
              name="name"
              required
              className="form-input"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Tuition Fee - Class 10"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Academic Year</label>
            <select
              name="academicYearId"
              className="form-input"
              value={form.academicYearId}
              onChange={handleChange}
              disabled={editingId !== null} // Academic Year cannot be changed for an existing structure series
              style={{ background: 'rgba(15, 23, 42, 0.8)' }}
            >
              {academicYears.map(year => (
                <option key={year.id} value={year.id}>{year.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div className="form-group">
              <label className="form-label">Amount (INR)</label>
              <input
                type="number"
                name="amount"
                required
                className="form-input"
                value={form.amount}
                onChange={handleChange}
                placeholder="e.g. 50000"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Fee Type</label>
              <select
                name="type"
                className="form-input"
                value={form.type}
                onChange={handleChange}
                disabled={editingId !== null} // Type cannot be changed on edit
                style={{ background: 'rgba(15, 23, 42, 0.8)' }}
              >
                <option value="tuition">Tuition</option>
                <option value="transport">Transport</option>
                <option value="late_fee">Late Fee</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Applies To (Target Class/Scope)</label>
            <input
              type="text"
              name="appliesTo"
              required
              className="form-input"
              value={form.appliesTo}
              onChange={handleChange}
              placeholder="e.g. class_10, all, transport_route_a"
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button type="submit" className="btn" style={{ flex: 1 }} disabled={loading}>
              {loading ? 'Saving...' : editingId ? 'Update Structure' : 'Create Structure'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Bulk Class Creation Form */}
      <div className="glass-panel panel-compact">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '15px' }}>Bulk Create Fee for Classes</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
          Create fee structure components for multiple classes at once (Grade 1–10).
        </p>

        {bulkError && <div className="alert alert-error">{bulkError}</div>}
        {bulkSuccess && <div className="alert alert-success">{bulkSuccess}</div>}

        <form onSubmit={handleBulkCreate}>
          <div className="form-group">
            <label className="form-label">Select Classes</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'].map(cls => (
                <label key={cls} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={bulkSelectedClasses.includes(cls)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setBulkSelectedClasses([...bulkSelectedClasses, cls]);
                      } else {
                        setBulkSelectedClasses(bulkSelectedClasses.filter(c => c !== cls));
                      }
                    }}
                  />
                  {cls}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Fee Components</label>
            {bulkComponents.map((comp, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', marginBottom: '8px', alignItems: 'end' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={comp.name}
                    onChange={(e) => {
                      const updated = [...bulkComponents];
                      updated[index] = { ...updated[index], name: e.target.value };
                      setBulkComponents(updated);
                    }}
                    placeholder="e.g. Tuition"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Amount (INR)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={comp.amount}
                    onChange={(e) => {
                      const updated = [...bulkComponents];
                      updated[index] = { ...updated[index], amount: e.target.value };
                      setBulkComponents(updated);
                    }}
                    placeholder="e.g. 50000"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Type</label>
                  <select
                    className="form-input"
                    value={comp.type}
                    onChange={(e) => {
                      const updated = [...bulkComponents];
                      updated[index] = { ...updated[index], type: e.target.value };
                      setBulkComponents(updated);
                    }}
                    style={{ background: 'rgba(15, 23, 42, 0.8)' }}
                  >
                    <option value="tuition">Tuition</option>
                    <option value="transport">Transport</option>
                    <option value="late_fee">Late Fee</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.7rem', marginBottom: '1px' }}
                  onClick={() => {
                    if (bulkComponents.length > 1) {
                      setBulkComponents(bulkComponents.filter((_, i) => i !== index));
                    }
                  }}
                  disabled={bulkComponents.length <= 1}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '4px 12px' }}
              onClick={() => setBulkComponents([...bulkComponents, { name: '', amount: '', type: 'tuition' }])}
            >
              + Add Component
            </button>
          </div>

          <button type="submit" className="btn" style={{ width: '100%', marginTop: '10px' }} disabled={bulkLoading || bulkSelectedClasses.length === 0}>
            {bulkLoading ? 'Creating...' : `Create for ${bulkSelectedClasses.length} Class(es)`}
          </button>
        </form>
      </div>

      </div>

      {/* Version List Table */}
      <div className="glass-panel panel-compact">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '15px' }}>Active Fee Components</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
          Registered fee structures and version records stored in the system.
        </p>

        <div style={{ overflowX: 'auto' }}>
          {feeStructures.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              No fee structures registered yet. Create one on the left.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '12px' }}>Name</th>
                  <th style={{ padding: '12px' }}>Year</th>
                  <th style={{ padding: '12px' }}>Amount</th>
                  <th style={{ padding: '12px' }}>Type</th>
                  <th style={{ padding: '12px' }}>Scope</th>
                  <th style={{ padding: '12px' }}>Version</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {feeStructures.map(struct => (
                  <tr key={struct.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '12px', fontWeight: 500 }}>{struct.name}</td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      {struct.academicYear?.label || 'N/A'}
                    </td>
                    <td style={{ padding: '12px' }}>₹{Number(struct.amount).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '12px', textTransform: 'capitalize' }}>{struct.type}</td>
                    <td style={{ padding: '12px', fontFamily: 'monospace' }}>{struct.appliesTo}</td>
                    <td style={{ padding: '12px' }}>
                      <span className="badge badge-active" style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary)' }}>
                        v{struct.version}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                        onClick={() => handleEditClick(struct)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}
