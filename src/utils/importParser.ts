export interface ParsedCard {
  front: string;
  back: string;
}

export interface ParseResult {
  name?: string;
  description?: string;
  cards: ParsedCard[];
}

/**
 * Extracts metadata (deck name and description) from raw import text.
 * Safe to run during typing/pasting since it does not throw errors.
 */
export function extractMetadata(rawText: string): { name?: string; description?: string } {
  const trimmed = rawText.trim();
  if (!trimmed) return {};

  // Try JSON first
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const name = parsed.name || parsed.deckName || parsed.title;
        const description = parsed.description || parsed.deckDescription || parsed.desc;
        return {
          name: name ? String(name).trim() : undefined,
          description: description ? String(description).trim() : undefined
        };
      }
    } catch (_) {}
  }

  // Fallback to plain text headers
  const lines = trimmed.split(/\r?\n/);
  let name: string | undefined = undefined;
  let description: string | undefined = undefined;
  
  const NAME_KEYS = /^(?:#|\/\/|;)?\s*(deck\s*name|name|deck\s*title|title)\s*[:=]\s*(.+)$/i;
  const DESC_KEYS = /^(?:#|\/\/|;)?\s*(deck\s*description|description|deck\s*desc|desc)\s*[:=]\s*(.+)$/i;

  for (let i = 0; i < Math.min(lines.length, 10); i++) { // only check first 10 lines
    const line = lines[i].trim();
    if (!line) continue;

    const nameMatch = line.match(NAME_KEYS);
    if (nameMatch) {
      name = nameMatch[2].trim();
      continue;
    }

    const descMatch = line.match(DESC_KEYS);
    if (descMatch) {
      description = descMatch[2].trim();
      continue;
    }

    // Stop if we find a card row or a line that doesn't look like metadata/comment
    if (!line.startsWith('#') && !line.startsWith('//') && !line.startsWith(';')) {
      if (line.includes(';') || line.includes('\t') || line.includes('|')) {
        break;
      }
    }
  }

  return { name, description };
}

/**
 * Intelligent parser that detects format (JSON array of objects, JSON array of arrays, or CSV/TSV plain text)
 * and returns a ParseResult containing a list of parsed cards and optional deck metadata.
 */
export function parseImportData(rawText: string): ParseResult {
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
        const name = parsed.name || parsed.deckName || parsed.title;
        const description = parsed.description || parsed.deckDescription || parsed.desc;
        if (Array.isArray(parsed.cards)) {
          return {
            name: name ? String(name).trim() : undefined,
            description: description ? String(description).trim() : undefined,
            cards: parseJsonArray(parsed.cards)
          };
        }
        throw new Error("JSON object must contain a 'cards' array.");
      }

      // B. Direct array
      if (Array.isArray(parsed)) {
        return {
          cards: parseJsonArray(parsed)
        };
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

function parsePlainText(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const cards: ParsedCard[] = [];
  let name: string | undefined = undefined;
  let description: string | undefined = undefined;
  
  let inMetadata = true;
  let startIndex = 0;

  const NAME_KEYS = /^(?:#|\/\/|;)?\s*(deck\s*name|name|deck\s*title|title)\s*[:=]\s*(.+)$/i;
  const DESC_KEYS = /^(?:#|\/\/|;)?\s*(deck\s*description|description|deck\s*desc|desc)\s*[:=]\s*(.+)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (inMetadata) {
        startIndex = i + 1;
      }
      continue;
    }

    if (inMetadata) {
      const nameMatch = line.match(NAME_KEYS);
      if (nameMatch) {
        name = nameMatch[2].trim();
        startIndex = i + 1;
        continue;
      }

      const descMatch = line.match(DESC_KEYS);
      if (descMatch) {
        description = descMatch[2].trim();
        startIndex = i + 1;
        continue;
      }

      // Skip lines that start with comment tags but are not recognized metadata keys
      if (line.startsWith('#') || line.startsWith('//') || line.startsWith(';')) {
        startIndex = i + 1;
        continue;
      }

      // Once we hit any normal line (e.g. without comment syntax), we exit metadata reading phase
      inMetadata = false;
    }
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    // Skip comments in the middle of card lines
    if (line.startsWith('#') || line.startsWith('//') || line.startsWith(';')) {
      continue;
    }

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

  return { name, description, cards };
}
