import React, { useState } from 'react';
import { createWorker } from 'tesseract.js';

export default function OCRUpload({ docType, onOCRComplete }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [parsedData, setParsedData] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setOcrText('');
      setParsedData(null);
    }
  };

  // Helper to extract Name, DOB, and DocRef from raw text using regex
  const parseOCRText = (text) => {
    let name = null;
    let dob = null;
    let docRef = null;

    // Normalize text
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);

    // 1. Try to find DOB (e.g. DOB: 15/08/2012, Date of Birth: 15-08-2012, 15/08/2012)
    const dobRegex = /(?:DOB|Date of Birth|Birth|DOB:)\s*[:-]?\s*(\d{2}[/\-]\d{2}[/\-]\d{4})/i;
    const dobMatch = text.match(dobRegex);
    if (dobMatch) {
      const dobStr = dobMatch[1].replace(/-/g, '/'); // normalize separator
      const parts = dobStr.split('/');
      if (parts.length === 3) {
        // Assume format is DD/MM/YYYY
        dob = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
      }
    }

    // 2. Try to find Aadhaar number (12 digits, often formatted as xxxx xxxx xxxx)
    const aadhaarRegex = /(\d{4}\s\d{4}\s\d{4}|\d{12})/;
    const aadhaarMatch = text.match(aadhaarRegex);
    if (aadhaarMatch) {
      docRef = aadhaarMatch[1];
    }

    // 3. Try to guess name
    // On Aadhaar, the name is usually 1 or 2 lines above the gender line.
    // We search backwards from the gender line to find a line that looks like an English name.
    const genderIndex = lines.findIndex(line => /male|female|m\/f/i.test(line));
    if (genderIndex > 0) {
      for (let i = genderIndex - 1; i >= 0; i--) {
        const line = lines[i];
        // Clean line of non-alphanumeric chars except space
        const cleanLine = line.replace(/[^a-zA-Z\s]/g, '').replace(/\s+/g, ' ').trim();
        // If it's a valid English name (letters and spaces, length > 3) and not containing header keywords
        if (
          cleanLine.length > 3 &&
          /^[a-zA-Z\s]+$/.test(cleanLine) &&
          !/father|yob|dob|government|india|unique|identity|birth|date|issue/i.test(line)
        ) {
          // Strip short garbage prefix/suffix words (length <= 2, e.g. "ot") from the parsed name
          name = cleanLine.split(/\s+/).filter(w => w.length > 2).join(' ');
          break;
        }
      }
    }

    // Birth Certificate guessing name
    if (!name && docType === 'birth_certificate') {
      const nameIndex = lines.findIndex(line => /name of child|child name|name/i.test(line));
      if (nameIndex >= 0 && nameIndex < lines.length - 1) {
        name = lines[nameIndex + 1].replace(/[^a-zA-Z\s]/g, '').trim();
      }
    }

    return { name, dob, docRef };
  };

  const processOCR = async () => {
    if (!file) return;
    setLoading(true);
    setStatus('Initializing Tesseract OCR worker...');
    
    try {
      const worker = await createWorker('eng');
      setStatus('Running character recognition (OCR) on document...');
      
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      setOcrText(text);
      const parsed = parseOCRText(text);
      setParsedData(parsed);

      onOCRComplete({
        rawText: text,
        ...parsed
      });
      setStatus('OCR extraction completed successfully!');
    } catch (error) {
      console.error('OCR processing error:', error);
      setStatus('OCR Engine initialization failed (Network CDN block or Timeout). Please use Dev Demo Data below to test the workflow.');
    } finally {
      setLoading(false);
    }
  };

  // Development Mock Helper to simulate OCR inputs
  const loadDemoData = (type) => {
    let mockText = '';
    let mockParsed = {};

    if (type === 'match') {
      if (docType === 'aadhaar') {
        mockText = "GOVERNMENT OF INDIA\nRonak Ravtode\nDOB: 15/08/2012\nMale\nVID: 9988 7766 5544";
        mockParsed = { name: "Ronak Ravtode", dob: "2012-08-15", docRef: "9988 7766 5544" };
      } else {
        mockText = "BIRTH CERTIFICATE\nState of Maharashtra\nChild Name: Timmy Doe\nDate of Birth: 01/01/2020\nFather: John Doe";
        mockParsed = { name: "Timmy Doe", dob: "2020-01-01", docRef: "BC-998822" };
      }
    } else {
      // Mismatch
      if (docType === 'aadhaar') {
        mockText = "GOVERNMENT OF INDIA\nRonak R.\nDOB: 10/08/2012\nMale\nVID: 9988 7766 5544";
        mockParsed = { name: "Ronak R.", dob: "2012-08-10", docRef: "9988 7766 5544" };
      } else {
        mockText = "BIRTH CERTIFICATE\nState of Maharashtra\nChild Name: Tommy Doe\nDate of Birth: 05/01/2020\nFather: John Doe";
        mockParsed = { name: "Tommy Doe", dob: "2020-01-05", docRef: "BC-998822" };
      }
    }

    setOcrText(mockText);
    setParsedData(mockParsed);
    onOCRComplete({
      rawText: mockText,
      ...mockParsed
    });
    setStatus('Dev Demo Data loaded successfully!');
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', marginTop: '15px', background: 'rgba(255,255,255,0.02)' }}>
      <div className="layout-stack-sm">
        <div className="flex-between">
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            IDENTITY DOCUMENT OCR ({docType.toUpperCase()})
          </span>
          {file && (
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={processOCR}
              disabled={loading}
              style={{ padding: '6px 12px', fontSize: '0.75rem' }}
            >
              {loading ? 'Processing...' : 'Run OCR Scanner'}
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: preview ? '80px 1fr' : '1fr', gap: '15px', alignItems: 'center' }}>
          {preview && (
            <img 
              src={preview} 
              alt="Document Preview" 
              style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--glass-border)' }} 
            />
          )}
          
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileChange}
            disabled={loading}
            style={{ fontSize: '0.85rem', width: '100%' }}
          />
        </div>

        {status && (
          <p style={{ fontSize: '0.75rem', color: loading ? 'var(--secondary)' : 'var(--text-secondary)' }}>
            {status}
          </p>
        )}

        {/* Development Mock Tools */}
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--glass-border)' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
            🔧 DEVELOPMENT MOCKING ACTIONS:
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.7rem', border: '1px dashed var(--success)' }}
              onClick={() => loadDemoData('match')}
            >
              Simulate Match
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.7rem', border: '1px dashed var(--error)' }}
              onClick={() => loadDemoData('mismatch')}
            >
              Simulate Mismatch
            </button>
          </div>
        </div>

        {parsedData && (
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', fontSize: '0.8rem' }}>
            <span style={{ fontWeight: 'bold', display: 'block', color: 'var(--secondary)', marginBottom: '5px' }}>
              Extracted OCR Fields:
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
              <div><strong>Parsed Name:</strong> {parsedData.name || 'Not detected'}</div>
              <div><strong>Parsed DOB:</strong> {parsedData.dob || 'Not detected'}</div>
              <div style={{ gridColumn: 'span 2' }}>
                <strong>Doc Ref:</strong> {parsedData.docRef ? `**** **** ${parsedData.docRef.replace(/\s/g, '').slice(-4)}` : 'Not detected'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
