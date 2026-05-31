import { GraduationCap, LogIn, Sparkles } from 'lucide-react';

interface LoginScreenProps {
  onLoginGoogle: () => void;
  onLoginAnonymous: () => void;
  loading: boolean;
  error: string | null;
}

export function LoginScreen({ onLoginGoogle, onLoginAnonymous, loading, error }: LoginScreenProps) {
  return (
    <div className="login-container">
      <div className="login-card glass animate-fade-in">
        <div className="brand-icon">
          <GraduationCap size={40} />
        </div>
        
        <h1 className="login-title">MemoCard</h1>
        <p className="login-subtitle">
          Minimalist flashcard application utilizing the Spaced Repetition System (SRS). Learn efficiently, wherever you are.
        </p>

        {error && (
          <div className="btn btn-danger" style={{ marginBottom: '20px', cursor: 'default' }}>
            <span>Error: {error}</span>
          </div>
        )}

        <div className="login-buttons">
          <button 
            className="btn btn-primary" 
            onClick={onLoginGoogle}
            disabled={loading}
          >
            <LogIn size={20} />
            {loading ? 'Logging in...' : 'Sign in with Google'}
          </button>
          
          <button 
            className="btn btn-secondary" 
            onClick={onLoginAnonymous}
            disabled={loading}
          >
            <Sparkles size={20} />
            Try as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
