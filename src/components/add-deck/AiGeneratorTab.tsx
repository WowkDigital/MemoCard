import { useState } from 'react';
import { Sparkles, Key, Eye, EyeOff } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import type { User } from 'firebase/auth';

interface AiGeneratorTabProps {
  user: User;
  onBack: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
  isImporting: boolean;
  setIsImporting: (val: boolean) => void;
  setImportProgress: (progress: { current: number; total: number } | null) => void;
}

export function AiGeneratorTab({ 
  user, 
  onBack, 
  showToast, 
  isImporting, 
  setIsImporting, 
  setImportProgress 
}: AiGeneratorTabProps) {
  const { importDeck } = useFirestore(user.uid);

  // AI Generation states
  const [aiDeckName, setAiDeckName] = useState('');
  const [aiDeckDesc, setAiDeckDesc] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSourceText, setAiSourceText] = useState('');
  const [aiQuestionLangSelect, setAiQuestionLangSelect] = useState('polski');
  const [aiQuestionLang, setAiQuestionLang] = useState('polski');
  const [aiAnswerLangSelect, setAiAnswerLangSelect] = useState('angielski');
  const [aiAnswerLang, setAiAnswerLang] = useState('angielski');
  const [aiCardLength, setAiCardLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('google_ai_model') || 'gemini-2.5-flash');
  const [isCustomModel, setIsCustomModel] = useState(() => {
    const saved = localStorage.getItem('google_ai_model');
    if (!saved) return false;
    return !['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-pro-exp-02-05', 'gemini-1.5-flash', 'gemini-1.5-pro'].includes(saved);
  });
  const [aiCardCount, setAiCardCount] = useState<number | ''>(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedCards, setGeneratedCards] = useState<{ front: string; back: string; selected: boolean }[]>([]);

  // API Key config inside the AI tab
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem('google_ai_api_key') || '');
  const [tempApiKey, setTempApiKey] = useState('');
  const [showKeyField, setShowKeyField] = useState(false);
  const [showKeyText, setShowKeyText] = useState(false);

  const handleGenerateAICards = async () => {
    const apiKey = googleApiKey || localStorage.getItem('google_ai_api_key') || '';
    if (!apiKey) {
      showToast('Please set your Google AI API Key first.', 'error');
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
    const qLang = aiQuestionLangSelect === 'custom' ? aiQuestionLang : aiQuestionLangSelect;
    const aLang = aiAnswerLangSelect === 'custom' ? aiAnswerLang : aiAnswerLangSelect;
    const userPrompt = `Generate ${cardCount} flashcards for learning. 
Front language (Questions/Terms): ${qLang}
Back language (Answers/Explanations): ${aLang}
Card text length constraint: ${aiCardLength} (short = extremely concise single words or short phrases, medium = standard length sentences or definitions, long = detailed explanations and detailed answers)
Topic/Prompt: ${aiPrompt}
${aiSourceText ? `Use the following source text as the sole basis for the flashcards:\n${aiSourceText}` : ''}
Generate clear, educational questions/terms/phrases on the front and accurate, concise answers/translations/explanations on the back. Ensure the length of front and back conforms strictly to the requested card text length constraint.`;

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

      let cleanText = textContent.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```(?:json)?\n?/i, '').replace(/```$/, '').trim();
      }

      const parsed = JSON.parse(cleanText);
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
      onBack();
    } catch (err) {
      console.error(err);
      showToast('Failed to create AI deck.', 'error');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleSaveApiKey = (key: string) => {
    const trimmed = key.trim();
    setGoogleApiKey(trimmed);
    localStorage.setItem('google_ai_api_key', trimmed);
  };

  return (
    <div>
      {/* Inline API Key Management */}
      {!showKeyField && googleApiKey ? (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          background: 'rgba(255, 255, 255, 0.03)', 
          padding: '10px 14px', 
          borderRadius: '10px', 
          border: '1px solid var(--border-light)',
          marginBottom: '20px' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Google AI Key: <code style={{ color: 'var(--text-primary)' }}>••••••••{googleApiKey.slice(-6)}</code>
            </span>
          </div>
          <button 
            type="button" 
            className="btn btn-secondary" 
            style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem', height: 'auto' }}
            onClick={() => {
              setTempApiKey(googleApiKey);
              setShowKeyField(true);
            }}
          >
            Change Key
          </button>
        </div>
      ) : (
        <div className="glass" style={{ padding: '16px', marginBottom: '20px', border: '1px solid rgba(99, 102, 241, 0.3)', background: 'rgba(99, 102, 241, 0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="form-label" style={{ fontSize: '0.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Key size={14} style={{ color: 'var(--primary)' }} />
              Enter Google AI API Key
            </label>
            <a 
              href="https://aistudio.google.com/" 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'underline' }}
            >
              Get free AI key
            </a>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input 
                type={showKeyText ? "text" : "password"} 
                className="form-input" 
                placeholder="AIzaSy..." 
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowKeyText(!showKeyText)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {showKeyText ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button 
              type="button" 
              className="btn btn-primary" 
              style={{ width: 'auto', padding: '0 16px', height: '42px' }}
              onClick={() => {
                if (tempApiKey.trim()) {
                  handleSaveApiKey(tempApiKey);
                  setShowKeyField(false);
                  showToast('API Key saved!', 'success');
                } else {
                  showToast('Enter a valid API Key.', 'error');
                }
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {!googleApiKey ? (
        <div style={{ textAlign: 'center', padding: '24px 0', opacity: 0.6 }}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>Please save your API key above to use the AI Generator.</p>
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
                <label className="form-label" style={{ fontWeight: 600 }}>Input Prompt / Topic (Opisz jakiego typu karty chcesz wygenerować)</label>
                <textarea 
                  className="form-input" 
                  placeholder="e.g. Słownictwo angielskie na poziomie C1 z tematu 'Biznes i finanse'. Skup się na phrasal verbs i idiomach. Albo: Advanced React patterns, hooks and performance optimization concepts." 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  disabled={isGenerating}
                  required
                  style={{ minHeight: '100px', resize: 'vertical', fontSize: '0.9rem' }}
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
                  style={{ minHeight: '100px', resize: 'vertical', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <label className="form-label">AI Model</label>
                    <select 
                      className="form-input" 
                      value={isCustomModel ? 'custom' : aiModel}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setIsCustomModel(true);
                          setAiModel('gemini-2.0-flash-exp');
                        } else {
                          setIsCustomModel(false);
                          setAiModel(val);
                          localStorage.setItem('google_ai_model', val);
                        }
                      }}
                      disabled={isGenerating}
                      style={{ height: '42px', padding: '0 10px', background: 'var(--bg-input, rgba(255,255,255,0.05))', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
                    >
                      <option value="gemini-2.5-flash" style={{ background: '#1e1e24', color: '#fff' }}>Gemini 2.5 Flash</option>
                      <option value="gemini-2.5-pro" style={{ background: '#1e1e24', color: '#fff' }}>Gemini 2.5 Pro</option>
                      <option value="gemini-2.0-flash" style={{ background: '#1e1e24', color: '#fff' }}>Gemini 2.0 Flash</option>
                      <option value="gemini-2.0-pro-exp-02-05" style={{ background: '#1e1e24', color: '#fff' }}>Gemini 2.0 Pro (Exp)</option>
                      <option value="gemini-1.5-flash" style={{ background: '#1e1e24', color: '#fff' }}>Gemini 1.5 Flash</option>
                      <option value="gemini-1.5-pro" style={{ background: '#1e1e24', color: '#fff' }}>Gemini 1.5 Pro</option>
                      <option value="custom" style={{ background: '#1e1e24', color: '#fff' }}>Custom Model...</option>
                    </select>
                  </div>
                  {isCustomModel && (
                    <div>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. gemini-2.0-flash-exp" 
                        value={aiModel}
                        onChange={(e) => {
                          setAiModel(e.target.value);
                          localStorage.setItem('google_ai_model', e.target.value);
                        }}
                        disabled={isGenerating}
                        style={{ height: '36px', fontSize: '0.8rem' }}
                      />
                    </div>
                  )}
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
              </div>

              {/* Language & Length Settings */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Język pytań (Front)</label>
                  <select 
                    className="form-input" 
                    value={aiQuestionLangSelect}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAiQuestionLangSelect(val);
                      if (val !== 'custom') {
                        setAiQuestionLang(val);
                      }
                    }}
                    disabled={isGenerating}
                    style={{ height: '42px', padding: '0 10px', background: 'var(--bg-input, rgba(255,255,255,0.05))', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
                  >
                    <option value="polski" style={{ background: '#1e1e24', color: '#fff' }}>Polski</option>
                    <option value="angielski" style={{ background: '#1e1e24', color: '#fff' }}>Angielski</option>
                    <option value="custom" style={{ background: '#1e1e24', color: '#fff' }}>Inny...</option>
                  </select>
                  {aiQuestionLangSelect === 'custom' && (
                    <input 
                      type="text" 
                      className="form-input" 
                      style={{ marginTop: '6px', height: '36px', fontSize: '0.8rem' }}
                      placeholder="Wpisz język..." 
                      value={aiQuestionLang}
                      onChange={(e) => setAiQuestionLang(e.target.value)}
                      disabled={isGenerating}
                    />
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Język odpowiedzi (Back)</label>
                  <select 
                    className="form-input" 
                    value={aiAnswerLangSelect}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAiAnswerLangSelect(val);
                      if (val !== 'custom') {
                        setAiAnswerLang(val);
                      }
                    }}
                    disabled={isGenerating}
                    style={{ height: '42px', padding: '0 10px', background: 'var(--bg-input, rgba(255,255,255,0.05))', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
                  >
                    <option value="polski" style={{ background: '#1e1e24', color: '#fff' }}>Polski</option>
                    <option value="angielski" style={{ background: '#1e1e24', color: '#fff' }}>Angielski</option>
                    <option value="custom" style={{ background: '#1e1e24', color: '#fff' }}>Inny...</option>
                  </select>
                  {aiAnswerLangSelect === 'custom' && (
                    <input 
                      type="text" 
                      className="form-input" 
                      style={{ marginTop: '6px', height: '36px', fontSize: '0.8rem' }}
                      placeholder="Wpisz język..." 
                      value={aiAnswerLang}
                      onChange={(e) => setAiAnswerLang(e.target.value)}
                      disabled={isGenerating}
                    />
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Długość kart</label>
                  <select 
                    className="form-input" 
                    value={aiCardLength}
                    onChange={(e) => setAiCardLength(e.target.value as 'short' | 'medium' | 'long')}
                    disabled={isGenerating}
                    style={{ height: '42px', padding: '0 10px', background: 'var(--bg-input, rgba(255,255,255,0.05))', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
                  >
                    <option value="short" style={{ background: '#1e1e24', color: '#fff' }}>Short</option>
                    <option value="medium" style={{ background: '#1e1e24', color: '#fff' }}>Medium</option>
                    <option value="long" style={{ background: '#1e1e24', color: '#fff' }}>Long</option>
                  </select>
                </div>
              </div>

              {generationError && (
                <div style={{ color: 'var(--color-again)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⚠️ Error: {generationError}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1 }}
                  onClick={onBack}
                  disabled={isGenerating}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
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
                maxHeight: '400px', 
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
                          style={{ fontSize: '0.85rem', padding: '6px 8px', height: '32px' }}
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
                          style={{ fontSize: '0.85rem', padding: '6px 8px', height: '32px' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1 }}
                  onClick={() => setGeneratedCards([])}
                >
                  Back
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ flex: 2 }}
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
  );
}
