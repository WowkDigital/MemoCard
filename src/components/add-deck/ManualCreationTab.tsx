import React, { useState } from 'react';
import { useFirestore } from '../../hooks/useFirestore';
import type { User } from 'firebase/auth';

interface ManualCreationTabProps {
  user: User;
  onBack: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

export function ManualCreationTab({ user, onBack, showToast }: ManualCreationTabProps) {
  const { addDeck } = useFirestore(user.uid);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;

    setIsSubmitting(true);
    try {
      await addDeck(newDeckName.trim(), newDeckDesc.trim());
      showToast('New deck created!', 'success');
      onBack();
    } catch (err) {
      console.error(err);
      showToast('Failed to create deck.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleManualSubmit}>
      <div className="form-group">
        <label className="form-label">Deck name</label>
        <input 
          type="text" 
          className="form-input" 
          placeholder="e.g. English Vocabulary C1" 
          value={newDeckName}
          onChange={(e) => setNewDeckName(e.target.value)}
          required
          maxLength={50}
          autoFocus
        />
      </div>
      
      <div className="form-group">
        <label className="form-label">Description (optional)</label>
        <input 
          type="text" 
          className="form-input" 
          placeholder="e.g. Phrases from chapter 4" 
          value={newDeckDesc}
          onChange={(e) => setNewDeckDesc(e.target.value)}
          maxLength={100}
        />
      </div>

      <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
        <button 
          type="button" 
          className="btn btn-secondary" 
          style={{ flex: 1 }}
          onClick={onBack}
        >
          Cancel
        </button>
        <button 
          type="submit" 
          className="btn btn-primary" 
          style={{ flex: 2 }}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create Deck'}
        </button>
      </div>
    </form>
  );
}
