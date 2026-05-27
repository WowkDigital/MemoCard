export interface ParsedCard {
  front: string;
  back: string;
}

/**
 * Intelligent parser that detects format (JSON array of objects, JSON array of arrays, or CSV/TSV plain text)
 * and returns a list of parsed cards.
 */
export function parseImportData(rawText: string): ParsedCard[] {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Wklejona zawartość jest pusta.");
  }

  // 1. Spróbuj sparsować jako JSON
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);

      // A. Obiekt z kluczem cards (np. pełna talia)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (Array.isArray(parsed.cards)) {
          return parseJsonArray(parsed.cards);
        }
        throw new Error("Obiekt JSON musi zawierać tablicę 'cards'.");
      }

      // B. Bezpośrednia tablica
      if (Array.isArray(parsed)) {
        return parseJsonArray(parsed);
      }
    } catch (err: any) {
      // Jeśli zaczynało się od JSONowych znaków, ale się nie sparsowało, zgłoś błąd parsowania JSON
      if (err.message && err.message.includes("JSON")) {
        throw new Error(`Błąd składni JSON: ${err.message}`);
      }
      throw err;
    }
  }

  // 2. Jeśli to nie JSON, parsujemy jako CSV / TSV / Tekst rozdzielany
  return parsePlainText(trimmed);
}

function parseJsonArray(arr: any[]): ParsedCard[] {
  if (arr.length === 0) {
    throw new Error("Tablica danych jest pusta.");
  }

  return arr.map((item, index) => {
    // Sprawdzenie tablicy dwuelementowej: ["awers", "rewers"] (Kompaktowy JSON)
    if (Array.isArray(item)) {
      if (item.length < 2) {
        throw new Error(`Karta na indeksie ${index} w JSON musi mieć awers i rewers: ${JSON.stringify(item)}`);
      }
      return {
        front: String(item[0]).trim(),
        back: String(item[1]).trim()
      };
    }

    // Sprawdzenie obiektu: { front: "...", back: "..." }
    if (item && typeof item === "object") {
      const front = item.front || item.awers || item.q;
      const back = item.back || item.rewers || item.a;

      if (!front || !back) {
        throw new Error(`Karta na indeksie ${index} w JSON musi mieć pola 'front'/'back' (lub 'awers'/'rewers'): ${JSON.stringify(item)}`);
      }

      return {
        front: String(front).trim(),
        back: String(back).trim()
      };
    }

    throw new Error(`Niepoprawny typ elementu na indeksie ${index} w JSON.`);
  });
}

function parsePlainText(text: string): ParsedCard[] {
  const lines = text.split(/\r?\n/);
  const cards: ParsedCard[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Pomiń puste linie

    // Wykrywanie separatora w kolejności priorytetu: Tabulator (\t), Średnik (;), Pionowa kreska (|)
    let separator = "";
    if (line.includes("\t")) {
      separator = "\t";
    } else if (line.includes(";")) {
      separator = ";";
    } else if (line.includes("|")) {
      separator = "|";
    }

    if (!separator) {
      throw new Error(`Linia ${i + 1} nie zawiera poprawnego separatora (użyj tabulatora, średnika ';' lub kreski '|'): "${line}"`);
    }

    const parts = line.split(separator);
    if (parts.length < 2) {
      throw new Error(`Linia ${i + 1} musi posiadać zarówno awers jak i rewers rozdzielone znakiem '${separator}'.`);
    }

    const front = parts[0].trim();
    // Połącz pozostałe części na wypadek gdyby separator występował w odpowiedzi
    const back = parts.slice(1).join(separator).trim();

    if (!front || !back) {
      throw new Error(`Linia ${i + 1} zawiera pusty awers lub rewers.`);
    }

    cards.push({ front, back });
  }

  if (cards.length === 0) {
    throw new Error("Nie znaleziono żadnych poprawnych linii z fiszkami.");
  }

  return cards;
}
