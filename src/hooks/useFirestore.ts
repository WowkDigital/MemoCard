import { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  Timestamp,
  increment
} from 'firebase/firestore';
import { db } from '../firebase/config';

export interface Deck {
  id: string;
  name: string;
  description: string;
  createdAt: Timestamp | null;
  cardCount: number;
}

export interface Card {
  id: string;
  front: string;
  back: string;
  createdAt: Timestamp | null;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReview: Timestamp;
}

export function useFirestore(userId: string | undefined) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);

  // 1. Obserwowanie talii użytkownika w czasie rzeczywistym
  useEffect(() => {
    if (!userId) {
      setDecks([]);
      setLoadingDecks(false);
      return;
    }

    const decksRef = collection(db, 'users', userId, 'decks');
    const q = query(decksRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const decksList: Deck[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Deck[];
      setDecks(decksList);
      setLoadingDecks(false);
    }, (error) => {
      console.error("Error fetching decks:", error);
      setLoadingDecks(false);
    });

    return unsubscribe;
  }, [userId]);

  // 2. Dodawanie nowej talii
  const addDeck = async (name: string, description: string) => {
    if (!userId) return;
    try {
      const decksRef = collection(db, 'users', userId, 'decks');
      await addDoc(decksRef, {
        name,
        description,
        createdAt: serverTimestamp(),
        cardCount: 0
      });
    } catch (error) {
      console.error("Error adding deck:", error);
      throw error;
    }
  };

  // 3. Usuwanie talii
  const deleteDeck = async (deckId: string) => {
    if (!userId) return;
    try {
      const deckDocRef = doc(db, 'users', userId, 'decks', deckId);
      await deleteDoc(deckDocRef);
    } catch (error) {
      console.error("Error deleting deck:", error);
      throw error;
    }
  };

  // 4. Dodawanie nowej karty do talii
  const addCard = async (deckId: string, front: string, back: string) => {
    if (!userId) return;
    try {
      const cardsRef = collection(db, 'users', userId, 'decks', deckId, 'cards');
      const now = new Date();
      
      // Dodaj nową kartę z domyślnymi parametrami SRS
      await addDoc(cardsRef, {
        front,
        back,
        createdAt: serverTimestamp(),
        interval: 0, // Gotowa do natychmiastowej powtórki
        easeFactor: 2.5,
        repetitions: 0,
        nextReview: Timestamp.fromDate(now) // Ustawione na teraz
      });

      // Zwiększ licznik kart w talii
      const deckDocRef = doc(db, 'users', userId, 'decks', deckId);
      await updateDoc(deckDocRef, {
        cardCount: increment(1)
      });
    } catch (error) {
      console.error("Error adding card:", error);
      throw error;
    }
  };

  // 5. Usuwanie karty z talii
  const deleteCard = async (deckId: string, cardId: string) => {
    if (!userId) return;
    try {
      const cardDocRef = doc(db, 'users', userId, 'decks', deckId, 'cards', cardId);
      await deleteDoc(cardDocRef);

      // Zmniejsz licznik kart w talii
      const deckDocRef = doc(db, 'users', userId, 'decks', deckId);
      await updateDoc(deckDocRef, {
        cardCount: increment(-1)
      });
    } catch (error) {
      console.error("Error deleting card:", error);
      throw error;
    }
  };

  // 6. Subskrypcja wszystkich kart z danej talii
  const subscribeToCards = (deckId: string, callback: (cards: Card[]) => void) => {
    if (!userId) return () => {};
    const cardsRef = collection(db, 'users', userId, 'decks', deckId, 'cards');
    const q = query(cardsRef, orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const cardsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Card[];
      callback(cardsList);
    }, (error) => {
      console.error("Error fetching cards:", error);
    });
  };

  // 7. Aktualizacja parametrów SRS po ocenie fiszki (SuperMemo-2 SM-2)
  // quality: 1 (Again), 3 (Hard), 4 (Good), 5 (Easy)
  const scoreCard = async (deckId: string, cardId: string, currentCard: Card, quality: number) => {
    if (!userId) return;
    try {
      let nextRepetitions = currentCard.repetitions;
      let nextInterval = currentCard.interval;
      let nextEaseFactor = currentCard.easeFactor;

      if (quality < 4) {
        // Again lub Hard o niskiej ocenie powoduje reset powtórek
        nextRepetitions = 0;
        nextInterval = 1; // Powtórka jutro
      } else {
        // Poprawna odpowiedź (Good lub Easy)
        if (nextRepetitions === 0) {
          nextInterval = 1;
        } else if (nextRepetitions === 1) {
          nextInterval = 6;
        } else {
          nextInterval = Math.round(nextInterval * nextEaseFactor);
        }
        nextRepetitions += 1;
      }

      // Aktualizacja czynnika łatwości (easeFactor)
      nextEaseFactor = nextEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      if (nextEaseFactor < 1.3) {
        nextEaseFactor = 1.3;
      }

      // Obliczanie daty następnej powtórki
      const now = new Date();
      const nextReviewDate = new Date(now.getTime() + nextInterval * 24 * 60 * 60 * 1000);
      
      const cardDocRef = doc(db, 'users', userId, 'decks', deckId, 'cards', cardId);
      await updateDoc(cardDocRef, {
        repetitions: nextRepetitions,
        interval: nextInterval,
        easeFactor: Number(nextEaseFactor.toFixed(2)),
        nextReview: Timestamp.fromDate(nextReviewDate)
      });
    } catch (error) {
      console.error("Error scoring card:", error);
      throw error;
    }
  };

  return {
    decks,
    loadingDecks,
    addDeck,
    deleteDeck,
    addCard,
    deleteCard,
    subscribeToCards,
    scoreCard
  };
}
