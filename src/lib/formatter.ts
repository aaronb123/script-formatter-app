import { Script, ScriptLine, Character, ClaimIssue, PROBLEMATIC_CLAIMS } from './types';

export function formatCharacterName(name: string): string {
  return name.toUpperCase().trim();
}

export function formatDialogue(content: string): string {
  return content.trim();
}

export function formatDirection(content: string): string {
  return content.trim();
}

export function generateFormattedScript(script: Script): string {
  let output = '';

  // Header
  output += `${script.brandName.toUpperCase()}\n`;
  output += `"${script.title}"\n`;
  output += '\n';

  // Character list
  output += 'CHARACTERS:\n';
  script.characters.forEach(char => {
    output += `  ${formatCharacterName(char.name)} - ${char.roleDescription}\n`;
  });
  output += '\n';

  // Reference videos
  if (script.referenceVideos.length > 0) {
    output += 'REFERENCE VIDEOS:\n';
    script.referenceVideos.forEach(ref => {
      const typeLabel = ref.type === 'replication' ? '[REPLICATE EXACTLY]' : '[REFERENCE ONLY]';
      output += `  ${typeLabel} ${ref.url}\n`;
      if (ref.notes) {
        output += `    Notes: ${ref.notes}\n`;
      }
    });
    output += '\n';
  }

  // Location
  if (script.location) {
    output += `LOCATION: ${script.location}\n\n`;
  }

  // Script body
  output += '---\n\n';

  script.lines.forEach(line => {
    switch (line.type) {
      case 'scene_heading':
        output += `${line.content.toUpperCase()}\n\n`;
        break;
      case 'direction':
        output += `    ${formatDirection(line.content)}\n\n`;
        break;
      case 'parenthetical':
        output += `                    (${line.content})\n`;
        break;
      case 'dialogue':
        const character = script.characters.find(c => c.id === line.characterId);
        if (character) {
          output += `                    ${formatCharacterName(character.name)}\n`;
          output += `          ${formatDialogue(line.content)}\n\n`;
        }
        break;
    }
  });

  return output;
}

export function generateActorScript(script: Script, characterId: string): string {
  const character = script.characters.find(c => c.id === characterId);
  if (!character) return '';

  let output = '';

  // Header with brand and title (as requested in presentation)
  output += `BRAND: ${script.brandName.toUpperCase()}\n`;
  output += `SCRIPT: ${script.title}\n`;
  output += `\n`;
  output += `YOUR CHARACTER: ${formatCharacterName(character.name)}\n`;
  output += `ROLE: ${character.roleDescription}\n`;
  output += '\n';

  // Wardrobe if specified
  if (script.wardrobe[characterId]) {
    output += `WARDROBE: ${script.wardrobe[characterId]}\n\n`;
  }

  // Pronunciations
  if (script.pronunciations.length > 0) {
    output += 'PRONUNCIATIONS:\n';
    script.pronunciations.forEach(p => {
      output += `  ${p.word} = "${p.pronunciation}"\n`;
    });
    output += '\n';
  }

  // Reference videos (only reference type, not full details)
  const referenceVideos = script.referenceVideos.filter(v => v.type === 'reference');
  if (referenceVideos.length > 0) {
    output += 'REFERENCE FOR TONE/STYLE:\n';
    referenceVideos.forEach(ref => {
      output += `  ${ref.url}\n`;
    });
    output += '\n';
  }

  output += '---\n\n';
  output += 'YOUR LINES:\n\n';

  // Only include this character's lines with context
  let lineNumber = 1;
  script.lines.forEach((line, index) => {
    if (line.type === 'dialogue' && line.characterId === characterId) {
      // Check for preceding direction that applies to this character
      const prevLine = script.lines[index - 1];
      if (prevLine && prevLine.type === 'direction') {
        output += `  [${prevLine.content}]\n`;
      }

      output += `${lineNumber}. ${formatDialogue(line.content)}\n\n`;
      lineNumber++;
    }
  });

  return output;
}

export function checkClaims(script: Script): ClaimIssue[] {
  const issues: ClaimIssue[] = [];

  script.lines.forEach(line => {
    if (line.type === 'dialogue') {
      PROBLEMATIC_CLAIMS.forEach(claim => {
        if (claim.pattern.test(line.content)) {
          issues.push({
            lineId: line.id,
            issue: `Contains potentially problematic claim: "${line.content.match(claim.pattern)?.[0]}"`,
            suggestion: claim.suggestion,
            severity: 'warning'
          });
        }
        // Reset regex lastIndex
        claim.pattern.lastIndex = 0;
      });
    }
  });

  return issues;
}

export function parseRawScript(rawText: string, characters: Character[]): ScriptLine[] {
  const lines: ScriptLine[] = [];
  const textLines = rawText.split('\n');

  let currentCharacterId: string | undefined;

  textLines.forEach((textLine, index) => {
    const trimmed = textLine.trim();
    if (!trimmed) return;

    // Check if this is a character name line
    const upperTrimmed = trimmed.toUpperCase();
    const matchedChar = characters.find(c =>
      formatCharacterName(c.name) === upperTrimmed ||
      c.name.toUpperCase() === upperTrimmed
    );

    if (matchedChar) {
      currentCharacterId = matchedChar.id;
      return; // Don't add the character name as a line
    }

    // Check for scene heading (INT./EXT.)
    if (/^(INT\.|EXT\.|INT\/EXT\.)/.test(upperTrimmed)) {
      lines.push({
        id: `line-${index}`,
        type: 'scene_heading',
        content: trimmed
      });
      currentCharacterId = undefined;
      return;
    }

    // Check for parenthetical
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      lines.push({
        id: `line-${index}`,
        type: 'parenthetical',
        characterId: currentCharacterId,
        content: trimmed.slice(1, -1)
      });
      return;
    }

    // Check for direction (usually in italics or brackets in source)
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      lines.push({
        id: `line-${index}`,
        type: 'direction',
        content: trimmed.slice(1, -1)
      });
      currentCharacterId = undefined;
      return;
    }

    // Check for direction keywords
    const directionKeywords = ['enters', 'exits', 'picks up', 'puts down', 'holds', 'shows', 'gestures', 'looks at', 'turns to', 'walks', 'sits', 'stands'];
    const isDirection = directionKeywords.some(kw => trimmed.toLowerCase().includes(kw)) && !currentCharacterId;

    if (isDirection) {
      lines.push({
        id: `line-${index}`,
        type: 'direction',
        content: trimmed
      });
      return;
    }

    // Otherwise it's dialogue if we have a current character
    if (currentCharacterId) {
      lines.push({
        id: `line-${index}`,
        type: 'dialogue',
        characterId: currentCharacterId,
        content: trimmed
      });
    } else {
      // Treat as direction if no character context
      lines.push({
        id: `line-${index}`,
        type: 'direction',
        content: trimmed
      });
    }
  });

  return lines;
}

export function validateCharacterConsistency(scripts: Script[]): string[] {
  const issues: string[] = [];

  scripts.forEach(script => {
    const host1 = script.characters.find(c => c.id === 'host1' || c.name.toUpperCase().includes('HOST 1'));
    const host2 = script.characters.find(c => c.id === 'host2' || c.name.toUpperCase().includes('HOST 2'));

    if (host1 && host1.role !== 'brand_ambassador') {
      issues.push(`${script.title}: HOST 1 should always be the Brand Ambassador, but is set as ${host1.role}`);
    }

    if (host2 && host2.role !== 'discoverer') {
      issues.push(`${script.title}: HOST 2 should always be the Discoverer/Skeptic, but is set as ${host2.role}`);
    }
  });

  return issues;
}
