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
    throw new Error("Pasted content is empty.");
  }

  // 1. Try to parse as JSON
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);

      // A. Object with cards key (e.g. full deck)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (Array.isArray(parsed.cards)) {
          return parseJsonArray(parsed.cards);
        }
        throw new Error("JSON object must contain a 'cards' array.");
      }

      // B. Direct array
      if (Array.isArray(parsed)) {
        return parseJsonArray(parsed);
      }
    } catch (err: any) {
      // If it started with JSON syntax but failed to parse, report JSON syntax error
      if (err.message && err.message.includes("JSON")) {
        throw new Error(`JSON syntax error: ${err.message}`);
      }
      throw err;
    }
  }

  // 2. If it's not JSON, parse as CSV / TSV / Separated text
  return parsePlainText(trimmed);
}

function parseJsonArray(arr: any[]): ParsedCard[] {
  if (arr.length === 0) {
    throw new Error("Data array is empty.");
  }

  return arr.map((item, index) => {
    // Check for two-element array: ["front", "back"] (Compact JSON)
    if (Array.isArray(item)) {
      if (item.length < 2) {
        throw new Error(`Card at index ${index} in JSON must have front and back: ${JSON.stringify(item)}`);
      }
      return {
        front: String(item[0]).trim(),
        back: String(item[1]).trim()
      };
    }

    // Check for object: { front: "...", back: "..." }
    if (item && typeof item === "object") {
      const front = item.front || item.awers || item.q;
      const back = item.back || item.rewers || item.a;

      if (!front || !back) {
        throw new Error(`Card at index ${index} in JSON must have 'front' and 'back' fields: ${JSON.stringify(item)}`);
      }

      return {
        front: String(front).trim(),
        back: String(back).trim()
      };
    }

    throw new Error(`Invalid element type at index ${index} in JSON.`);
  });
}

function parsePlainText(text: string): ParsedCard[] {
  const lines = text.split(/\r?\n/);
  const cards: ParsedCard[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    // Detect separator in priority order: Tab (\t), Semicolon (;), Pipe (|)
    let separator = "";
    if (line.includes("\t")) {
      separator = "\t";
    } else if (line.includes(";")) {
      separator = ";";
    } else if (line.includes("|")) {
      separator = "|";
    }

    if (!separator) {
      throw new Error(`Line ${i + 1} does not contain a valid separator (use tab, semicolon ';' or pipe '|'): "${line}"`);
    }

    const parts = line.split(separator);
    if (parts.length < 2) {
      throw new Error(`Line ${i + 1} must have both front and back separated by '${separator}'.`);
    }

    const front = parts[0].trim();
    // Join remaining parts in case the separator is inside the back text
    const back = parts.slice(1).join(separator).trim();

    if (!front || !back) {
      throw new Error(`Line ${i + 1} contains empty front or back.`);
    }

    cards.push({ front, back });
  }

  if (cards.length === 0) {
    throw new Error("No valid flashcard lines found.");
  }

  return cards;
}
