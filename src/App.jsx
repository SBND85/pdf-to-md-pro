import React, { useState, useRef } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import Tesseract from 'tesseract.js';
import TurndownService from 'turndown';
import { Upload, FileText, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

// Configure PDF.js worker locally
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  hr: '---'
});

// Helper to group PDF items into lines based on Y coordinate
const groupItemsIntoLines = (items) => {
  const lines = {};
  items.forEach(item => {
    const y = Math.round(item.transform[5]);
    if (!lines[y]) lines[y] = [];
    lines[y].push(item);
  });
  
  // Sort lines by Y descending (top to bottom)
  const sortedY = Object.keys(lines).sort((a, b) => b - a);
  
  return sortedY.map(y => {
    // Sort items within each line by X ascending
    return lines[y].sort((a, b) => a.transform[4] - b.transform[4])
      .map(item => item.str)
      .join(' ')
      .trim();
  }).filter(line => line.length > 0);
};

export default function App() {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const onFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setMarkdown('');
      setError(null);
    } else {
      setError('Please select a valid PDF file.');
    }
  };

  const extractTextWithOCR = async (pdfPage) => {
    const viewport = pdfPage.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await pdfPage.render({ canvasContext: context, viewport }).promise;
    
    // Convert canvas to image for Tesseract
    const imageData = canvas.toDataURL('image/png');
    
    const { data: { text } } = await Tesseract.recognize(imageData, 'eng+kor', {
      logger: m => {
        if (m.status === 'recognizing text') {
          // Sub-progress within page
        }
      }
    });
    
    return text;
  };

  const processPDF = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setError(null);
    let fullMarkdown = '';

    try {
      setStatus('Loading PDF...');
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;

      for (let i = 1; i <= numPages; i++) {
        setStatus(`Processing page ${i} of ${numPages}...`);
        const page = await pdf.getPage(i);
        
        // 1. Try standard text extraction with layout awareness
        const textContent = await page.getTextContent();
        const lines = groupItemsIntoLines(textContent.items);
        let pageMarkdown = '';

        if (lines.length > 5) {
          // Heuristic-based formatting
          pageMarkdown = lines.map(line => {
             const trimmedLine = line.trim();
             // Header detection (simple: short line, no trailing period)
             if (trimmedLine.length < 60 && !trimmedLine.endsWith('.') && !trimmedLine.endsWith(',')) {
               return `## ${trimmedLine}`;
             }
             // Bullet point detection
             if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-')) {
               return `- ${trimmedLine.substring(1).trim()}`;
             }
             return trimmedLine;
          }).join('\n\n');
        } else {
          // 2. If text is sparse, assume it might be an image/scanned page and use OCR
          setStatus(`Using OCR for page ${i}...`);
          const ocrText = await extractTextWithOCR(page);
          pageMarkdown = ocrText;
        }

        fullMarkdown += `### Page ${i}\n\n${pageMarkdown}\n\n---\n\n`;
        setProgress((i / numPages) * 100);
      }

      setMarkdown(fullMarkdown);
      setStatus('Successfully converted!');
    } catch (err) {
      console.error(err);
      setError('An error occurred during conversion: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadMarkdown = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name.replace('.pdf', '')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container">
      <header>
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          PDF to Markdown Pro
        </motion.h1>
        <p className="subtitle">High-quality PDF conversion with OCR support</p>
      </header>

      <main className="main-content">
        <section className="card">
          <div 
            className="upload-zone"
            onClick={() => fileInputRef.current.click()}
          >
            <Upload className="upload-icon" />
            <p>{file ? file.name : "Click or drag PDF here"}</p>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".pdf"
              onChange={onFileChange}
            />
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button 
              className="btn btn-primary" 
              onClick={processPDF}
              disabled={!file || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FileText size={18} />
                  Convert to Markdown
                </>
              )}
            </button>

            {isProcessing && (
              <div className="progress-container">
                <div className="status-badge status-loading">
                  <Loader2 size={14} className="animate-spin" />
                  {status}
                </div>
                <div className="progress-bar">
                  <motion.div 
                    className="progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {!isProcessing && markdown && (
              <div className="status-badge status-success">
                <CheckCircle2 size={14} />
                {status}
              </div>
            )}

            {error && (
              <div className="status-badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                <AlertCircle size={14} />
                {error}
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Preview</h3>
            <button 
              className="btn btn-primary" 
              onClick={downloadMarkdown}
              disabled={!markdown}
              style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
            >
              <Download size={16} />
              Download .md
            </button>
          </div>
          <div className="preview-area">
            {markdown || "Converted content will appear here..."}
          </div>
        </section>
      </main>
    </div>
  );
}
