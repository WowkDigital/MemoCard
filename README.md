# MemoCard — Inteligentne Fiszki PWA

**MemoCard** to minimalistyczna, responsywna aplikacja progresywna (PWA) przeznaczona do szybkiej nauki słówek metodą powtórek rozłożonych (**SRS - Spaced Repetition System**) zintegrowana z **Google Firebase**.

Aplikacja działa w trybie **offline-first** — możesz uczyć się bez dostępu do sieci, a po odzyskaniu połączenia dane automatycznie zsynchronizują się z bazą danych w chmurze.

## 🚀 Główne Cechy

*   **Algorytm Spaced Repetition (SM-2)**: System dynamicznie dobiera terminy kolejnych powtórek na podstawie ocen trudności (Again, Hard, Good, Easy).
*   **Firebase Integration**: Logowanie przez Google lub profil tymczasowy (anonimowy). Baza Firestore do przechowywania talii i fiszek.
*   **Tryb Offline**: Pełna funkcjonalność bazy danych oraz interfejsu bez połączenia z internetem dzięki lokalnemu cache Firestore.
*   **Stylistyka Premium**: Nowoczesny design ze szklanymi elementami (Glassmorphism), ciemnym motywem oraz pełną animacją 3D obracania fiszek.
*   **PWA (Progressive Web App)**: Aplikacja gotowa do instalacji na ekranie głównym telefonu lub komputera jako natywna aplikacja.

---

## 🛠️ Stos Technologiczny

*   **Frontend**: React (z TypeScript) + Vite
*   **Baza Danych & Auth**: Google Firebase (Authentication, Cloud Firestore, Hosting)
*   **PWA**: `@vite-pwa/plugin` (Service Worker z mechanizmem autoUpdate)
*   **Ikony**: Lucide React
*   **Stylizacja**: Vanilla CSS

---

## ⚙️ Instrukcja Instalacji i Uruchomienia Lokalnego

### 1. Klonowanie i Instalacja Zależności
Zainstaluj pakiety npm w głównym folderze projektu:
```bash
npm install
```

### 2. Konfiguracja Środowiska Firebase
Utwórz plik `.env` w katalogu głównym projektu na podstawie szablonu `.env.example`:
```env
VITE_FIREBASE_API_KEY=twoj-api-key
VITE_FIREBASE_AUTH_DOMAIN=twoj-projekt.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=twoj-projekt
VITE_FIREBASE_STORAGE_BUCKET=twoj-projekt.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=twoj-sender-id
VITE_FIREBASE_APP_ID=twoj-app-id
```

### 3. Uruchomienie Serwera Lokalnego
Włącz lokalny serwer deweloperski Vite:
```bash
npm run dev
```
Aplikacja będzie dostępna pod adresem `http://localhost:5173/`.

---

## 📦 Publikacja (Firebase Hosting)

Aby zaktualizować kod i wrzucić nową wersję na serwer publiczny:

1. **Zbuduj pliki produkcyjne**:
   ```bash
   npm run build
   ```
2. **Uruchom wdrożenie**:
   ```bash
   npx firebase-tools deploy
   ```
Aplikacja zostanie opublikowana na: **`https://memocard-79e05.web.app`**

---

## 🔒 Bezpieczeństwo Firestore

Przed uruchomieniem upewnij się, że w konsoli Firebase Firestore wdrożyłeś reguły z pliku `firebase_rules.txt`. Pozwalają one zalogowanym użytkownikom na dostęp wyłącznie do własnych danych:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /decks/{deckId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
        match /cards/{cardId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }
    }
  }
}
```
