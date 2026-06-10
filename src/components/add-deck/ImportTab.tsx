import { useState } from 'react';
import { useFirestore } from '../../hooks/useFirestore';
import { parseImportData, extractMetadata } from '../../utils/importParser';
import type { User } from 'firebase/auth';

interface ImportTabProps {
  user: User;
  onBack: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
  isImporting: boolean;
  setIsImporting: (val: boolean) => void;
  setImportProgress: (progress: { current: number; total: number } | null) => void;
}

export function ImportTab({ 
  user, 
  onBack, 
  showToast, 
  isImporting, 
  setIsImporting, 
  setImportProgress 
}: ImportTabProps) {
  const { importDeck } = useFirestore(user.uid);
  const [importName, setImportName] = useState('');
  const [importDesc, setImportDesc] = useState('');
  const [importJSON, setImportJSON] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);

    const text = importJSON.trim();
    if (!text) {
      setImportError('Please paste data to import.');
      return;
    }

    setIsImporting(true);
    try {
      const parsed = parseImportData(text);
      const finalName = importName.trim() || parsed.name || '';
      const finalDesc = importDesc.trim() || parsed.description || '';

      if (!finalName) {
        throw new Error('Please provide a deck name (either fill the name field or include it at the beginning of the pasted data).');
      }

      setImportProgress({ current: 0, total: parsed.cards.length });
      await importDeck(finalName, finalDesc, parsed.cards, (progress) => {
        setImportProgress({ current: progress, total: parsed.cards.length });
      });

      showToast('New deck with flashcards imported!', 'success');
      onBack();
    } catch (err) {
      const error = err as Error;
      console.error(error);
      setImportError(error.message || 'Invalid data format.');
      showToast('Failed to import deck.', 'error');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  return (
    <form onSubmit={handleImportSubmit}>
      <div className="form-row-grid">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Deck name</label>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Provide if not in data" 
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            maxLength={50}
            disabled={isImporting}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Deck description</label>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Provide if not in data" 
            value={importDesc}
            onChange={(e) => setImportDesc(e.target.value)}
            maxLength={100}
            disabled={isImporting}
          />
        </div>
      </div>

      <div className="form-group" style={{ marginTop: '16px' }}>
        <label className="form-label">Paste data (JSON, CSV, Excel)</label>
        <textarea 
          className="form-input" 
          style={{ minHeight: '150px', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
          placeholder="Paste JSON array, CSV data (separated by ;) or copied columns from Excel..."
          value={importJSON}
          onChange={(e) => {
            const val = e.target.value;
            setImportJSON(val);
            const meta = extractMetadata(val);
            if (meta.name) setImportName(meta.name);
            if (meta.description) setImportDesc(meta.description);
          }}
          required
          disabled={isImporting}
        />
      </div>

      {importError && (
        <div style={{ color: 'var(--color-again)', fontSize: '0.85rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>⚠️ {importError}</span>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <span className="form-label" style={{ marginBottom: '6px', fontSize: '0.8rem' }}>Allowed data formats (optional metadata at the beginning):</span>
        <pre style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '12px', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', color: 'var(--text-secondary)' }}>
{`// 1. Plain text / CSV with optional Metadata (Recommended)
# name: Spanish Vocabulary
# description: Common words and phrases
Hola;Hello
Gracias;Thank you

// 2. Compact JSON with optional Metadata
{
  "name": "Spanish Vocabulary",
  "description": "Common words and phrases",
  "cards": [
    ["Hola", "Hello"],
    ["Gracias", "Thank you"]
  ]
}

// 3. Simple Card List (no metadata)
Hola;Hello
Gracias;Thank you`}
        </pre>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button 
          type="button" 
          className="btn btn-secondary" 
          style={{ flex: 1 }}
          onClick={onBack}
          disabled={isImporting}
        >
          Cancel
        </button>
        <button 
          type="submit" 
          className="btn btn-primary" 
          style={{ flex: 2 }}
          disabled={isImporting}
        >
          {isImporting ? 'Importing...' : 'Import Deck'}
        </button>
      </div>
    </form>
  );
}
