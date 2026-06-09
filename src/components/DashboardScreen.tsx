import { useState, useEffect } from 'react';
import { Plus, FolderPlus, LogOut, BookOpen, Settings, X, Layers, RefreshCw, User as UserIcon, SlidersHorizontal, Database, Sparkles, Key } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import type { Deck, Card } from '../hooks/useFirestore';
import type { User } from 'firebase/auth';
import { parseImportData, extractMetadata } from '../utils/importParser';

declare const __APP_VERSION__: string;

interface DashboardScreenProps {
  user: User;
  onLogout: () => void;
  onSelectDeck: (deck: Deck) => void;
  onStartReview: (deck: Deck) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

export function DashboardScreen({
  user,
  onLogout,
  onSelectDeck,
  onStartReview,
  showToast
}: DashboardScreenProps) {
  const { decks, loadingDecks, addDeck, importDeck, cloneSharedDeck, getCardsOnce, getDueCount, healDeckStats } = useFirestore(user.uid);
  
  const [deckStats, setDeckStats] = useState<Record<string, { total: number; due: number; mastered: number; ease: string }>>({});
  const [expandedDecks, setExpandedDecks] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<string>(() => {
    return localStorage.getItem('memocard_sort_by') || 'recommended';
  });
  const [isSortOpen, setIsSortOpen] = useState(false);

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    localStorage.setItem('memocard_sort_by', newSort);
  };

  const toggleSortDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSortOpen(prev => !prev);
  };

  useEffect(() => {
    if (!isSortOpen) return;
    const handleClose = () => setIsSortOpen(false);
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, [isSortOpen]);

  const sortOptions = [
    { value: 'recommended', label: 'Study (Suggested)', icon: '💡' },
    { value: 'due-desc', label: 'Due Reviews (Most)', icon: '📅' },
    { value: 'total-desc', label: 'Card Count (Most)', icon: '📚' },
    { value: 'name-asc', label: 'Name (A-Z)', icon: '🔤' },
    { value: 'name-desc', label: 'Name (Z-A)', icon: '🔤' },
    { value: 'created-desc', label: 'Newest', icon: '🆕' },
    { value: 'created-asc', label: 'Oldest', icon: '⏳' },
  ];

  const currentOption = sortOptions.find(o => o.value === sortBy) || sortOptions[0];

  const toggleDeckExpand = (deckId: string) => {
    setExpandedDecks(prev => ({
      ...prev,
      [deckId]: !prev[deckId]
    }));
  };

  useEffect(() => {
    if (loadingDecks || decks.length === 0) return;

    decks.forEach((deck) => {
      if (deck.isShared) {
        setDeckStats(prev => ({
          ...prev,
          [deck.id]: {
            total: deck.cardCount || 0,
            due: 0,
            mastered: 0,
            ease: '2.50'
          }
        }));
        return;
      }

      // Check if deck has the precalculated stats
      const hasStatsInDeck = deck.easeCount !== undefined && deck.masteredCount !== undefined;

      if (hasStatsInDeck) {
        // Fetch ONLY the count of due cards (uses server-side aggregation - extremely cheap and fast!)
        getDueCount(deck.id).then((due) => {
          const total = deck.cardCount || 0;
          const mastered = deck.masteredCount || 0;
          const easeCount = deck.easeCount || 0;
          const totalEase = deck.totalEaseFactor || 0;
          const ease = easeCount > 0 ? (totalEase / easeCount).toFixed(2) : '2.50';

          setDeckStats(prev => ({
            ...prev,
            [deck.id]: { total, due, mastered, ease }
          }));
        }).catch((err) => {
          console.error("Error fetching due count:", err);
        });
      } else {
        // Fallback for old/unmigrated decks: fetch cards, calculate stats, and trigger background self-healing/migration
        getCardsOnce(deck.id, (loadedCards: Card[]) => {
          const total = loadedCards.length;
          let due = 0;
          let mastered = 0;
          let totalEase = 0;
          let easeCount = 0;
          const now = new Date();

          loadedCards.forEach(card => {
            if (card.nextReview) {
              const reviewDate = typeof card.nextReview.toDate === 'function' 
                ? card.nextReview.toDate() 
                : new Date((card.nextReview as unknown as { seconds: number }).seconds * 1000);
              if (reviewDate <= now) {
                due++;
              }
            } else {
              due++;
            }

            if (card.repetitions > 0 && card.interval >= 7) {
              mastered++;
            }

            if (card.easeFactor) {
              totalEase += card.easeFactor;
              easeCount++;
            }
          });

          const ease = easeCount > 0 ? (totalEase / easeCount).toFixed(2) : '2.50';

          setDeckStats(prev => ({
            ...prev,
            [deck.id]: { total, due, mastered, ease }
          }));

          // Self-heal/migrate the deck metadata doc in Firestore
          healDeckStats(deck.id, {
            masteredCount: mastered,
            easeCount: easeCount,
            totalEaseFactor: totalEase
          });
        });
      }
    });
  }, [decks, loadingDecks, getDueCount, getCardsOnce, healDeckStats]);


  const forceUpdateApp = async () => {
    // Unregister service workers
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      } catch (e) {
        console.error('Error unregistering service worker:', e);
      }
    }
    // Clear caches
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      } catch (e) {
        console.error('Error clearing cache:', e);
      }
    }
    // Force reload from server bypassing cache
    window.location.reload();
  };

  const getDeckCreationDateStr = (deck: Deck): string => {
    if (!deck.createdAt) return 'Unknown';
    let date: Date;
    if (typeof deck.createdAt.toDate === 'function') {
      date = deck.createdAt.toDate();
    } else {
      const ca = deck.createdAt as unknown as { seconds?: number } | Date;
      if (ca instanceof Date) {
        date = ca;
      } else if (ca && typeof ca === 'object' && 'seconds' in ca && typeof ca.seconds === 'number') {
        date = new Date(ca.seconds * 1000);
      } else {
        date = new Date(ca as unknown as string);
      }
    }
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Universal Add Deck Modal states
  const [showAddDeckModal, setShowAddDeckModal] = useState(false);
  const [addDeckMode, setAddDeckMode] = useState<'manual' | 'import' | 'ai'>('manual');
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI Deck generation states
  const [aiDeckName, setAiDeckName] = useState('');
  const [aiDeckDesc, setAiDeckDesc] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSourceText, setAiSourceText] = useState('');
  const [aiLanguage, setAiLanguage] = useState('English');
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('google_ai_model') || 'gemini-2.5-flash');
  const [aiCardCount, setAiCardCount] = useState<number | ''>(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedCards, setGeneratedCards] = useState<{ front: string; back: string; selected: boolean }[]>([]);

  // API key state (synced with localStorage)
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem('google_ai_api_key') || '');

  // App settings states
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Sync key when modal opens
  useEffect(() => {
    if (showSettingsModal || showAddDeckModal) {
      setGoogleApiKey(localStorage.getItem('google_ai_api_key') || '');
    }
  }, [showSettingsModal, showAddDeckModal]);
  const [questionFontSize, setQuestionFontSize] = useState<number>(() => {
    const val = localStorage.getItem('memocard_question_font_size');
    return val ? parseInt(val, 10) : 28;
  });
  const [answerFontSize, setAnswerFontSize] = useState<number>(() => {
    const val = localStorage.getItem('memocard_answer_font_size');
    return val ? parseInt(val, 10) : 28;
  });
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const [showStudyDetails, setShowStudyDetails] = useState<boolean>(() => {
    return localStorage.getItem('memocard_show_study_details') === 'true';
  });

  // JSON import states
  const [importName, setImportName] = useState('');
  const [importDesc, setImportDesc] = useState('');
  const [importJSON, setImportJSON] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneProgress, setCloneProgress] = useState<{ current: number; total: number } | null>(null);

  const handleSelectDeckClick = async (deck: Deck) => {
    if (deck.isShared && deck.ownerId) {
      setIsCloning(true);
      setCloneProgress({ current: 0, total: deck.cardCount || 0 });
      try {
        await cloneSharedDeck(deck.ownerId, deck.id, (progress) => {
          setCloneProgress({ current: progress, total: deck.cardCount || 0 });
        });
        const clonedDeck = { ...deck, isShared: false, ownerId: user.uid };
        showToast('Deck cloned successfully!', 'success');
        onSelectDeck(clonedDeck);
      } catch (err) {
        console.error(err);
        showToast('Failed to clone deck.', 'error');
      } finally {
        setIsCloning(false);
        setCloneProgress(null);
      }
    } else {
      onSelectDeck(deck);
    }
  };

  const handleStartReviewClick = async (deck: Deck) => {
    if (deck.isShared && deck.ownerId) {
      setIsCloning(true);
      setCloneProgress({ current: 0, total: deck.cardCount || 0 });
      try {
        await cloneSharedDeck(deck.ownerId, deck.id, (progress) => {
          setCloneProgress({ current: progress, total: deck.cardCount || 0 });
        });
        const clonedDeck = { ...deck, isShared: false, ownerId: user.uid };
        showToast('Deck cloned successfully!', 'success');
        onStartReview(clonedDeck);
      } catch (err) {
        console.error(err);
        showToast('Failed to clone deck for studying.', 'error');
      } finally {
        setIsCloning(false);
        setCloneProgress(null);
      }
    } else {
      onStartReview(deck);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;
    
    setIsSubmitting(true);
    try {
      await addDeck(newDeckName.trim(), newDeckDesc.trim());
      showToast('New deck created!', 'success');
      setNewDeckName('');
      setNewDeckDesc('');
      setShowAddDeckModal(false);
    } catch (err) {
      console.error(err);
      showToast('Failed to create deck.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

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
      // Universal parsing
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
      setImportJSON('');
      setImportName('');
      setImportDesc('');
      setShowAddDeckModal(false);
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

  const handleGenerateAICards = async () => {
    const apiKey = localStorage.getItem('google_ai_api_key') || '';
    if (!apiKey) {
      showToast('Please set your Google AI API Key in settings first.', 'error');
      return;
    }
    if (!aiPrompt.trim() && !aiSourceText.trim()) {
      showToast('Please enter a topic or paste source text.', 'error');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedCards([]);

    const cardCount = typeof aiCardCount === 'number' ? Math.max(1, Math.min(100, aiCardCount)) : 10;
    const userPrompt = `Generate ${cardCount} flashcards for learning. 
Target Language for cards (both front and back): ${aiLanguage}
Topic/Prompt: ${aiPrompt}
${aiSourceText ? `Use the following source text as the sole basis for the flashcards:\n${aiSourceText}` : ''}
Generate clear, educational questions/terms/phrases on the front and accurate, concise answers/translations/explanations on the back.`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: userPrompt
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            cards: {
              type: "ARRAY",
              description: "List of generated flashcards",
              items: {
                type: "OBJECT",
                properties: {
                  front: { type: "STRING", description: "Question, term, or prompt on the front side of the flashcard." },
                  back: { type: "STRING", description: "Answer, translation, or definition on the back side of the flashcard." }
                },
                required: ["front", "back"]
              }
            }
          },
          required: ["cards"]
        }
      }
    };

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textContent) {
        throw new Error('Received empty response from Google AI.');
      }

      const parsed = JSON.parse(textContent);
      if (!parsed.cards || !Array.isArray(parsed.cards)) {
        throw new Error('Response does not contain a valid cards array.');
      }

      interface AICard {
        front?: string;
        back?: string;
      }

      const formattedCards = (parsed.cards as AICard[]).map((c) => ({
        front: String(c.front || '').trim(),
        back: String(c.back || '').trim(),
        selected: true,
      })).filter((c) => c.front && c.back);

      if (formattedCards.length === 0) {
        throw new Error('Google AI did not generate any valid cards.');
      }

      setGeneratedCards(formattedCards);
      showToast(`Successfully generated ${formattedCards.length} cards!`, 'success');
    } catch (err) {
      const error = err as Error;
      console.error("AI Generation Error:", error);
      setGenerationError(error.message || 'An unknown error occurred during generation.');
      showToast('AI Generation failed.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveGeneratedDeck = async () => {
    const selected = generatedCards.filter(c => c.selected && c.front.trim() && c.back.trim());
    if (selected.length === 0) {
      showToast('Please select at least one card.', 'error');
      return;
    }
    const finalName = aiDeckName.trim() || aiPrompt.trim() || 'AI Generated Deck';
    const finalDesc = aiDeckDesc.trim() || `Generated by AI for topic: ${aiPrompt}`;

    setIsImporting(true);
    setImportProgress({ current: 0, total: selected.length });
    try {
      await importDeck(finalName, finalDesc, selected, (progress) => {
        setImportProgress({ current: progress, total: selected.length });
      });
      showToast('AI deck created successfully!', 'success');
      // Reset form
      setAiDeckName('');
      setAiDeckDesc('');
      setAiPrompt('');
      setAiSourceText('');
      setGeneratedCards([]);
      setShowAddDeckModal(false);
    } catch (err) {
      console.error(err);
      showToast('Failed to create AI deck.', 'error');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  // Sort decks dynamically based on selected criteria
  const sortedDecks = [...decks].sort((a, b) => {
    if (sortBy === 'recommended') {
      const dueA = deckStats[a.id]?.due ?? 0;
      const dueB = deckStats[b.id]?.due ?? 0;
      
      // 1. Decks with due cards first (more due cards first)
      if (dueA > 0 && dueB === 0) return -1;
      if (dueB > 0 && dueA === 0) return 1;
      if (dueA > 0 && dueB > 0 && dueA !== dueB) {
        return dueB - dueA;
      }
      
      // 2. If no due cards, check unmastered cards (total - mastered)
      const totalA = deckStats[a.id]?.total ?? a.cardCount ?? 0;
      const totalB = deckStats[b.id]?.total ?? b.cardCount ?? 0;
      
      // Decks with 0 cards go to the bottom
      if (totalA === 0 && totalB > 0) return 1;
      if (totalB === 0 && totalA > 0) return -1;
      
      const masteredA = deckStats[a.id]?.mastered ?? 0;
      const masteredB = deckStats[b.id]?.mastered ?? 0;
      const unmasteredA = totalA - masteredA;
      const unmasteredB = totalB - masteredB;
      
      if (unmasteredA !== unmasteredB) {
        return unmasteredB - unmasteredA;
      }
      
      // 3. Sort by ease factor ascending (lower ease = more difficult = study first)
      const easeA = parseFloat(deckStats[a.id]?.ease ?? '2.50');
      const easeB = parseFloat(deckStats[b.id]?.ease ?? '2.50');
      if (easeA !== easeB) {
        return easeA - easeB;
      }
    }
    
    if (sortBy === 'due-desc') {
      const dueA = deckStats[a.id]?.due ?? 0;
      const dueB = deckStats[b.id]?.due ?? 0;
      if (dueA !== dueB) return dueB - dueA;
    }
    
    if (sortBy === 'total-desc') {
      const totalA = deckStats[a.id]?.total ?? a.cardCount ?? 0;
      const totalB = deckStats[b.id]?.total ?? b.cardCount ?? 0;
      if (totalA !== totalB) return totalB - totalA;
    }

    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name);
    }

    if (sortBy === 'name-desc') {
      return b.name.localeCompare(a.name);
    }

    const getMs = (deck: Deck) => {
      if (!deck.createdAt) return 0;
      if (typeof deck.createdAt.toDate === 'function') return deck.createdAt.toDate().getTime();
      const ca = deck.createdAt as unknown as { seconds?: number } | Date;
      if (ca instanceof Date) return ca.getTime();
      if (ca && typeof ca === 'object' && 'seconds' in ca && typeof ca.seconds === 'number') return ca.seconds * 1000;
      return new Date(ca as unknown as string).getTime();
    };

    if (sortBy === 'created-desc') {
      return getMs(b) - getMs(a);
    }

    if (sortBy === 'created-asc') {
      return getMs(a) - getMs(b);
    }

    // Default secondary sort: own first, then shared
    if (a.isShared && !b.isShared) return 1;
    if (!a.isShared && b.isShared) return -1;
    
    return a.name.localeCompare(b.name);
  });

  const totalDecks = decks.length;
  const totalCards = decks.reduce((sum, d) => sum + (deckStats[d.id]?.total ?? d.cardCount ?? 0), 0);
  const totalDue = decks.reduce((sum, d) => sum + (deckStats[d.id]?.due ?? 0), 0);
  const totalMastered = decks.reduce((sum, d) => sum + (deckStats[d.id]?.mastered ?? d.masteredCount ?? 0), 0);
  const totalEaseFactor = decks.reduce((sum, d) => sum + (d.totalEaseFactor ?? 0), 0);
  const totalEaseCount = decks.reduce((sum, d) => sum + (d.easeCount ?? 0), 0);
  const avgEase = totalEaseCount > 0 ? (totalEaseFactor / totalEaseCount).toFixed(2) : '2.50';
  const masteryRate = totalCards > 0 ? Math.round((totalMastered / totalCards) * 100) : 0;

  return (
    <div className="container">
      {/* Header */}
      <header className="app-header">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={24} style={{ color: 'var(--primary)' }} />
          <span>MemoCard</span>
          <button 
            className="app-version" 
            onClick={forceUpdateApp}
            title="Force reload & check for update"
            style={{ 
              fontSize: '0.7rem', 
              color: 'var(--text-primary)', 
              background: 'rgba(99, 102, 241, 0.15)', 
              padding: '2px 6px', 
              borderRadius: '4px',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.3)';
              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
            }}
          >
            v{__APP_VERSION__}
            <RefreshCw size={10} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            className="settings-btn" 
            onClick={() => setShowSettingsModal(true)} 
            title="Ustawienia aplikacji"
          >
            <Settings size={18} />
          </button>
          <div 
            className="user-avatar" 
            title={user.isAnonymous ? 'Guest Account' : user.email || ''}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '32px', 
              height: '32px', 
              borderRadius: '50%', 
              background: user.isAnonymous ? 'rgba(255, 255, 255, 0.05)' : 'rgba(99, 102, 241, 0.15)',
              border: `1px solid ${user.isAnonymous ? 'var(--border-light)' : 'rgba(99, 102, 241, 0.3)'}`,
              color: user.isAnonymous ? 'var(--text-secondary)' : 'var(--primary)',
              cursor: 'pointer'
            }}
          >
            <UserIcon size={16} />
          </div>
          <button className="logout-btn" onClick={onLogout} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        {/* Global Stats Dashboard */}
        {decks.length > 0 && (
          <div className="stats-dashboard glass" style={{
            padding: '20px',
            borderRadius: '16px',
            marginBottom: '24px',
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%)',
            border: '1px solid var(--border-light)',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} style={{ color: 'var(--primary)' }} />
              Globalne Statystyki Nauki
            </h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '16px'
            }}>
              {/* Stat 1: Total Decks */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Liczba talii</span>
                <strong style={{ fontSize: '1.6rem', color: 'var(--text-primary)', fontWeight: 700 }}>{totalDecks}</strong>
              </div>

              {/* Stat 2: Total Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Unikalne fiszki</span>
                <strong style={{ fontSize: '1.6rem', color: 'var(--primary)', fontWeight: 700 }}>{totalCards}</strong>
              </div>

              {/* Stat 3: Due Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Do powtórki</span>
                <strong style={{ fontSize: '1.6rem', color: totalDue > 0 ? 'var(--color-again)' : 'var(--color-easy)', fontWeight: 700 }}>
                  {totalDue}
                </strong>
              </div>

              {/* Stat 4: Mastered Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Opanowane fiszki</span>
                <strong style={{ fontSize: '1.6rem', color: 'var(--color-easy)', fontWeight: 700 }}>
                  {totalMastered} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>({masteryRate}%)</span>
                </strong>
              </div>

              {/* Stat 5: Avg Ease */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Średni wskaźnik łatwości</span>
                <strong style={{ fontSize: '1.6rem', color: '#c084fc', fontWeight: 700 }}>{avgEase}</strong>
              </div>
            </div>

            {totalCards > 0 && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  <span>Poziom Opanowania Materiału</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-easy)' }}>{masteryRate}% ({totalMastered} z {totalCards})</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ 
                    width: `${masteryRate}%`, 
                    height: '100%', 
                    background: 'linear-gradient(90deg, var(--primary) 0%, var(--color-easy) 100%)',
                    borderRadius: '3px',
                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}></div>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="section-title">
          <h2>Your Decks</h2>
          <div className="section-actions" style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="btn btn-primary" 
              style={{ width: 'auto', padding: '8px 16px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => {
                setAddDeckMode('manual');
                setShowAddDeckModal(true);
              }}
            >
              <Plus size={16} />
              Add Deck
            </button>
          </div>
        </div>

        {/* Sorting Toolbar */}
        {decks.length > 0 && (
          <div className="sort-bar" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
            padding: '8px 12px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-light)',
            borderRadius: '12px',
            fontSize: '0.85rem',
            position: 'relative'
          }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
              <SlidersHorizontal size={14} style={{ color: 'var(--primary)' }} />
              Sortowanie
            </span>
            
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={toggleSortDropdown}
                className="glass"
                style={{
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  transition: 'all 0.2s ease',
                  userSelect: 'none',
                  fontWeight: 500
                }}
              >
                <span>{currentOption.icon}</span>
                <span>{currentOption.label}</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.7, marginLeft: '4px' }}>▼</span>
              </button>

              {isSortOpen && (
                <div 
                  className="glass animate-fade-in"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    zIndex: 100,
                    minWidth: '220px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-light)',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(16px)',
                    background: 'rgba(15, 23, 42, 0.95)'
                  }}
                >
                  {sortOptions.map((opt) => {
                    const isSelected = opt.value === sortBy;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          handleSortChange(opt.value);
                          setIsSortOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                          color: isSelected ? 'var(--primary)' : 'var(--text-primary)',
                          fontSize: '0.85rem',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          fontWeight: isSelected ? 600 : 400
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <span>{opt.icon}</span>
                        <span style={{ flex: 1 }}>{opt.label}</span>
                        {isSelected && <span style={{ color: 'var(--primary)', fontSize: '0.75rem' }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {loadingDecks ? (
          <div className="loading-spinner"></div>
        ) : decks.length === 0 ? (
          <div className="empty-state glass">
            <FolderPlus size={48} className="empty-icon" />
            <p className="empty-text">You do not have any flashcard decks yet.</p>
            <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => { setAddDeckMode('manual'); setShowAddDeckModal(true); }}>
              Create your first deck
            </button>
          </div>
        ) : (
          <div className="deck-list">
            {sortedDecks.map((deck) => {
              const isExpanded = !!expandedDecks[deck.id];
              return (
                <div 
                  key={deck.id} 
                  className="deck-card glass" 
                  onClick={() => toggleDeckExpand(deck.id)}
                  style={{ 
                    padding: '12px 16px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '10px',
                    alignItems: 'stretch',
                    cursor: 'pointer'
                  }}
                >
                  <div className="deck-info" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left', minWidth: 0 }}>
                    {/* Row 1: Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, width: '100%' }}>
                      <span className="deck-name" style={{ 
                        fontSize: '1.05rem',
                        lineHeight: '1.2',
                        fontWeight: 600,
                        flex: 1,
                        minWidth: 0,
                        ...(isExpanded ? {
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        } : {
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        })
                      }}>{deck.name}</span>
                      {deck.isShared && (
                        <span className="card-badge" style={{ 
                          background: 'rgba(99, 102, 241, 0.1)', 
                          color: '#a5b4fc', 
                          fontSize: '0.7rem', 
                          border: '1px solid rgba(99, 102, 241, 0.2)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}>
                          Shared
                        </span>
                      )}
                      {(deckStats[deck.id]?.due ?? 0) > 0 && (
                        <span className="review-badge" style={{ 
                          background: 'rgba(239, 68, 68, 0.15)', 
                          color: '#f87171', 
                          fontSize: '0.7rem', 
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          animation: 'pulse 2s infinite ease-in-out'
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
                          Do nauki
                        </span>
                      )}
                    </div>
                    
                    {/* Row 2: Description */}
                    {deck.description && (
                      <span className="deck-desc" style={{ 
                        fontSize: '0.8rem',
                        lineHeight: '1.3',
                        color: 'var(--text-secondary)',
                        width: '100%',
                        ...(isExpanded ? {
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        } : {
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        })
                      }}>{deck.description}</span>
                    )}
                  </div>
                  
                  {/* Bottom Row: Stats and Action Buttons */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    gap: '12px',
                    width: '100%'
                  }}>
                    {/* Row 3: Parameters "30/1/0/2.47" */}
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      flexWrap: 'wrap',
                      gap: '4px', 
                      fontSize: '0.8rem', 
                      color: 'var(--text-muted)',
                      lineHeight: '1',
                      minWidth: 0
                    }}>
                      <strong style={{ color: 'var(--primary)' }}>{deckStats[deck.id]?.total ?? deck.cardCount}</strong>
                      <span style={{ opacity: 0.3 }}>/</span>
                      <strong style={{ color: (deckStats[deck.id]?.due ?? 0) > 0 ? 'var(--color-again)' : 'var(--text-muted)' }}>{deckStats[deck.id]?.due ?? 0}</strong>
                      <span style={{ opacity: 0.3 }}>/</span>
                      <strong style={{ color: 'var(--color-easy)' }}>{deckStats[deck.id]?.mastered ?? 0}</strong>
                      <span style={{ opacity: 0.3 }}>/</span>
                      <strong style={{ color: '#c084fc' }}>{deckStats[deck.id]?.ease ?? '2.50'}</strong>
                      {deck.createdAt && (
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'inline-flex',
                          alignItems: 'center',
                          minWidth: 0
                        }}>
                          <span style={{ opacity: 0.3, marginLeft: '4px', marginRight: '4px' }}>•</span>
                          Created: {getDeckCreationDateStr(deck)}
                        </span>
                      )}
                    </div>
                    
                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      {isExpanded ? (
                        <>
                          <button 
                            className="btn btn-secondary" 
                            style={{ 
                              padding: '0 12px', 
                              height: '36px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              borderRadius: '8px', 
                              fontSize: '0.8rem',
                              width: 'auto'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectDeckClick(deck);
                            }}
                            title="Dodawanie, edycja i generowanie fiszek przez AI"
                          >
                            <Sparkles size={14} style={{ color: 'var(--primary)' }} />
                            <span>Zarządzaj & AI</span>
                          </button>
                          <button 
                            className="btn btn-primary" 
                            style={{ 
                              padding: '0 12px', 
                              height: '36px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              borderRadius: '8px', 
                              fontSize: '0.8rem',
                              width: 'auto'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartReviewClick(deck);
                            }}
                            disabled={(deckStats[deck.id]?.total ?? deck.cardCount) === 0}
                          >
                            <BookOpen size={14} />
                            <span>Ucz się</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectDeckClick(deck);
                            }}
                            title="Zarządzaj fiszkami i AI"
                          >
                            <Sparkles size={14} style={{ color: 'var(--primary)' }} />
                          </button>
                          <button 
                            className="btn btn-primary" 
                            style={{ padding: '0', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartReviewClick(deck);
                            }}
                            disabled={(deckStats[deck.id]?.total ?? deck.cardCount) === 0}
                            title={(deckStats[deck.id]?.total ?? deck.cardCount) === 0 ? "Brak kart do nauki" : "Rozpocznij naukę"}
                          >
                            <BookOpen size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>


      {/* Universal Add Deck Modal */}
      {showAddDeckModal && (
        <div className="modal-overlay" onClick={() => { if (!isGenerating && !isImporting) setShowAddDeckModal(false); }}>
          <div className="modal-content glass animate-fade-in" style={{ maxWidth: addDeckMode === 'ai' && generatedCards.length > 0 ? '700px' : '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderPlus size={20} style={{ color: 'var(--primary)' }} />
                Add New Deck
              </h3>
              <button className="close-btn" onClick={() => setShowAddDeckModal(false)} disabled={isGenerating || isImporting}>
                <X size={20} />
              </button>
            </div>

            {/* Tab Navigation */}
            <div style={{
              display: 'flex',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '10px',
              padding: '3px',
              marginBottom: '20px'
            }}>
              <button 
                type="button"
                onClick={() => setAddDeckMode('manual')}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: addDeckMode === 'manual' ? 'var(--primary)' : 'transparent',
                  color: addDeckMode === 'manual' ? 'white' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Manual
              </button>
              <button 
                type="button"
                onClick={() => setAddDeckMode('import')}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: addDeckMode === 'import' ? 'var(--primary)' : 'transparent',
                  color: addDeckMode === 'import' ? 'white' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                JSON/CSV Import
              </button>
              <button 
                type="button"
                onClick={() => setAddDeckMode('ai')}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: addDeckMode === 'ai' ? 'var(--primary)' : 'transparent',
                  color: addDeckMode === 'ai' ? 'white' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                AI Generator
              </button>
            </div>

            {/* MANUAL MODE */}
            {addDeckMode === 'manual' && (
              <form onSubmit={handleSubmit}>
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

                <div className="form-actions" style={{ marginTop: '24px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ width: 'auto' }}
                    onClick={() => setShowAddDeckModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ width: 'auto' }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Deck'}
                  </button>
                </div>
              </form>
            )}

            {/* IMPORT MODE */}
            {addDeckMode === 'import' && (
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
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Paste data (JSON, CSV, Excel)</label>
                  <textarea 
                    className="form-input" 
                    style={{ minHeight: '120px', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
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
                  />
                </div>

                {importError && (
                  <div style={{ color: 'var(--color-again)', fontSize: '0.85rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚠️ {importError}</span>
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <span className="form-label" style={{ marginBottom: '4px' }}>Allowed data formats (optional metadata at the beginning):</span>
                  <pre style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', color: 'var(--text-secondary)' }}>
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

                <div className="form-actions" style={{ marginTop: '24px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ width: 'auto' }}
                    onClick={() => setShowAddDeckModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ width: 'auto' }}
                    disabled={isImporting}
                  >
                    {isImporting ? 'Importing...' : 'Import Deck'}
                  </button>
                </div>
              </form>
            )}

            {/* AI GENERATOR MODE */}
            {addDeckMode === 'ai' && (
              <div>
                {!googleApiKey ? (
                  <div className="glass" style={{ padding: '24px', textAlign: 'center', border: '1px solid rgba(99, 102, 241, 0.3)', background: 'rgba(99, 102, 241, 0.02)', borderRadius: '12px' }}>
                    <Key size={32} style={{ color: 'var(--primary)', marginBottom: '12px' }} />
                    <p style={{ margin: '0 0 12px 0', fontSize: '0.95rem' }}>
                      Google AI API Key is missing.
                    </p>
                    <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                      Please configure your Google AI API Key in the application settings (gear icon in the top right corner) before using the AI Generator.
                    </p>
                    <button 
                      type="button" 
                      className="btn btn-primary" 
                      style={{ width: 'auto', margin: '0 auto' }}
                      onClick={() => {
                        setShowAddDeckModal(false);
                        setShowSettingsModal(true);
                      }}
                    >
                      Go to Settings
                    </button>
                  </div>
                ) : (
                  <div>
                    {generatedCards.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="form-row-grid">
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Deck name (optional)</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              placeholder="e.g. Spanish Basics" 
                              value={aiDeckName}
                              onChange={(e) => setAiDeckName(e.target.value)}
                              disabled={isGenerating}
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Description (optional)</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              placeholder="e.g. Travel vocabulary" 
                              value={aiDeckDesc}
                              onChange={(e) => setAiDeckDesc(e.target.value)}
                              disabled={isGenerating}
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label className="form-label">Topic or Subject</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="e.g. Basic French food phrases, Git commands, Capital cities" 
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            disabled={isGenerating}
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Source text (optional)</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Generate cards directly from text</span>
                          </label>
                          <textarea 
                            className="form-input" 
                            placeholder="Paste your notes, article, or documentation here..." 
                            value={aiSourceText}
                            onChange={(e) => setAiSourceText(e.target.value)}
                            disabled={isGenerating}
                            style={{ minHeight: '80px', resize: 'vertical', fontSize: '0.85rem' }}
                          />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">AI Model</label>
                            <select 
                              className="form-input" 
                              value={aiModel}
                              onChange={(e) => {
                                setAiModel(e.target.value);
                                localStorage.setItem('google_ai_model', e.target.value);
                              }}
                              disabled={isGenerating}
                              style={{ height: '42px', padding: '0 10px', background: 'var(--bg-input, rgba(255,255,255,0.05))', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
                            >
                              <option value="gemini-2.5-flash" style={{ background: '#1e1e24', color: '#fff' }}>Gemini 2.5 Flash</option>
                              <option value="gemini-2.5-pro" style={{ background: '#1e1e24', color: '#fff' }}>Gemini 2.5 Pro</option>
                            </select>
                          </div>

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Number of Cards</label>
                            <input 
                              type="number" 
                              className="form-input" 
                              value={aiCardCount}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                  setAiCardCount('');
                                } else {
                                  const parsed = parseInt(val, 10);
                                  setAiCardCount(isNaN(parsed) ? '' : parsed);
                                }
                              }}
                              onBlur={() => {
                                if (aiCardCount === '' || aiCardCount < 1) {
                                  setAiCardCount(1);
                                } else if (aiCardCount > 100) {
                                  setAiCardCount(100);
                                }
                              }}
                              min={1}
                              max={100}
                              disabled={isGenerating}
                            />
                          </div>

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Target Language</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              value={aiLanguage}
                              onChange={(e) => setAiLanguage(e.target.value)}
                              placeholder="e.g. English, Polish"
                              disabled={isGenerating}
                            />
                          </div>
                        </div>

                        {generationError && (
                          <div style={{ color: 'var(--color-again)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>⚠️ Error: {generationError}</span>
                          </div>
                        )}

                        <div className="form-actions" style={{ marginTop: '12px' }}>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ width: 'auto' }}
                            onClick={() => setShowAddDeckModal(false)}
                            disabled={isGenerating}
                          >
                            Cancel
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-primary" 
                            style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
                            onClick={handleGenerateAICards}
                            disabled={isGenerating}
                          >
                            {isGenerating ? (
                              <>
                                <span className="spinner-inline" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Sparkles size={16} />
                                Generate
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* AI GENERATED PREVIEW SECTION */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            Review generated flashcards ({generatedCards.length})
                          </span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>
                            {generatedCards.filter(c => c.selected).length} selected
                          </span>
                        </div>

                        <div style={{ 
                          maxHeight: '280px', 
                          overflowY: 'auto', 
                          border: '1px solid var(--border-light)', 
                          borderRadius: '8px',
                          background: 'rgba(0,0,0,0.2)',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}>
                          {generatedCards.map((card, idx) => (
                            <div key={idx} style={{ 
                              display: 'flex', 
                              gap: '10px', 
                              alignItems: 'flex-start',
                              background: 'rgba(255,255,255,0.02)',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              border: '1px solid rgba(255,255,255,0.04)'
                            }}>
                              <input 
                                type="checkbox"
                                checked={card.selected}
                                onChange={() => {
                                  const copy = [...generatedCards];
                                  copy[idx].selected = !copy[idx].selected;
                                  setGeneratedCards(copy);
                                }}
                                style={{ width: '16px', height: '16px', marginTop: '12px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                              />
                              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>FRONT</label>
                                  <input 
                                    type="text" 
                                    className="form-input" 
                                    value={card.front}
                                    onChange={(e) => {
                                      const copy = [...generatedCards];
                                      copy[idx].front = e.target.value;
                                      setGeneratedCards(copy);
                                    }}
                                    style={{ fontSize: '0.8rem', padding: '6px 8px', height: '32px' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>BACK</label>
                                  <input 
                                    type="text" 
                                    className="form-input" 
                                    value={card.back}
                                    onChange={(e) => {
                                      const copy = [...generatedCards];
                                      copy[idx].back = e.target.value;
                                      setGeneratedCards(copy);
                                    }}
                                    style={{ fontSize: '0.8rem', padding: '6px 8px', height: '32px' }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="form-actions">
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ width: 'auto' }}
                            onClick={() => setGeneratedCards([])}
                          >
                            Back to Settings
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-primary" 
                            style={{ width: 'auto' }}
                            onClick={handleSaveGeneratedDeck}
                            disabled={isImporting || generatedCards.filter(c => c.selected).length === 0}
                          >
                            {isImporting ? 'Saving...' : `Create Deck & Save (${generatedCards.filter(c => c.selected).length})`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import / Clone Progress Overlay */}
      {(isImporting || isCloning) && (
        <div className="progress-overlay">
          <div className="progress-card glass">
            <div className="progress-spinner-container">
              <div className="progress-spinner"></div>
              <Database className="progress-icon" size={28} />
            </div>
            
            <div className="progress-info">
              <h3 className="progress-title">
                {isImporting ? 'Importing cards...' : 'Cloning deck...'}
              </h3>
              <p className="progress-subtitle">
                Saving data to Firestore. Please do not close the application.
              </p>
            </div>

            {((isImporting && importProgress) || (isCloning && cloneProgress)) && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <span className="progress-percentage">
                  {Math.round(
                    ((isImporting ? importProgress?.current : cloneProgress?.current) || 0) /
                    ((isImporting ? importProgress?.total : cloneProgress?.total) || 1) * 100
                  )}%
                </span>
                <div className="progress-bar-wrapper">
                  <div 
                    className="progress-bar-fill-animated"
                    style={{ 
                      width: `${Math.round(
                        ((isImporting ? importProgress?.current : cloneProgress?.current) || 0) /
                        ((isImporting ? importProgress?.total : cloneProgress?.total) || 1) * 100
                      )}%` 
                    }}
                  ></div>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {isImporting ? importProgress?.current : cloneProgress?.current} / {isImporting ? importProgress?.total : cloneProgress?.total} cards
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* App Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content glass animate-fade-in" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={20} style={{ color: 'var(--primary)' }} />
                Application Settings
              </h3>
              <button className="close-btn" onClick={() => setShowSettingsModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Question Font Size Slider */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Question font size</label>
                  <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>{questionFontSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="16" 
                  max="48" 
                  value={questionFontSize} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setQuestionFontSize(val);
                    localStorage.setItem('memocard_question_font_size', String(val));
                  }}
                  style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
              </div>

              {/* Answer Font Size Slider */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Answer font size</label>
                  <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>{answerFontSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="16" 
                  max="48" 
                  value={answerFontSize} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setAnswerFontSize(val);
                    localStorage.setItem('memocard_answer_font_size', String(val));
                  }}
                  style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
              </div>

              {/* Show Study Details Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ paddingRight: '16px' }}>
                  <label className="form-label" style={{ marginBottom: '2px', cursor: 'pointer', display: 'block' }}>Show SRS details on buttons</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.8, margin: 0, lineHeight: '1.3' }}>Displays time to next review and change in ease factor (SM-2).</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={showStudyDetails} 
                  onChange={(e) => {
                    const val = e.target.checked;
                    setShowStudyDetails(val);
                    localStorage.setItem('memocard_show_study_details', String(val));
                  }}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
                />
              </div>

              {/* Google AI API Key Input */}
              <div className="form-group" style={{ marginBottom: 0, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
                <label className="form-label" style={{ marginBottom: '6px' }}>Google AI API Key</label>
                <input 
                  type="password" 
                  value={googleApiKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGoogleApiKey(val);
                    localStorage.setItem('google_ai_api_key', val.trim());
                  }}
                  placeholder="AIzaSy..."
                  className="form-control"
                  style={{ width: '100%' }}
                />
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.7, marginTop: '4px', marginBottom: 0 }}>
                  Used for deck generation with Gemini AI models.
                </p>
              </div>

              {/* Visualization of the card */}
              <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
                <span className="form-label" style={{ marginBottom: '10px' }}>Card preview</span>
                
                {/* Tabs to select Front / Back preview */}
                <div style={{
                  display: 'flex',
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '10px',
                  padding: '3px',
                  marginBottom: '12px'
                }}>
                  <button 
                    type="button"
                    onClick={() => setPreviewSide('front')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: previewSide === 'front' ? 'var(--primary)' : 'transparent',
                      color: previewSide === 'front' ? 'white' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Question (Front)
                  </button>
                  <button 
                    type="button"
                    onClick={() => setPreviewSide('back')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: previewSide === 'back' ? 'var(--primary)' : 'transparent',
                      color: previewSide === 'back' ? 'white' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Answer (Back)
                  </button>
                </div>

                {/* Card Container Preview */}
                <div 
                  className={`flashcard-container ${previewSide === 'back' ? 'is-flipped' : ''}`}
                  style={{ 
                    height: 'auto', 
                    minHeight: '200px', 
                    marginBottom: 0, 
                    pointerEvents: 'none'
                  }}
                >
                  <div className="flashcard-inner" style={{ height: 'auto', minHeight: 'inherit' }}>
                    {previewSide === 'front' ? (
                      /* Front preview */
                      <div className="flashcard-face flashcard-front" style={{ minHeight: '200px', height: 'auto', padding: '20px' }}>
                        <span className="flashcard-text" style={{ fontSize: `${questionFontSize}px` }}>
                          What is the capital of France?
                        </span>
                      </div>
                    ) : (
                      /* Back preview */
                      <div className="flashcard-face flashcard-back" style={{ minHeight: '200px', height: 'auto', padding: '20px', paddingTop: '45px' }}>
                        <div style={{
                          position: 'absolute',
                          top: '12px',
                          left: '12px',
                          right: '12px',
                          fontSize: '0.75rem',
                          color: 'var(--text-secondary)',
                          opacity: 0.7,
                          textAlign: 'center',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                          paddingBottom: '4px',
                          fontStyle: 'italic'
                        }}>
                          What is the capital of France?
                        </div>
                        <span className="flashcard-text" style={{ fontSize: `${answerFontSize}px` }}>
                          Paris (Paris) - it is the largest city and the capital of France, located on the Seine river.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: '10px' }}>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ width: '100%' }}
                  onClick={() => setShowSettingsModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
