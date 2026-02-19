import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
  PageOrientation,
} from 'docx';

export interface ParsedBrief {
  title: string;
  referenceUrl: string;
  hooks: {
    label: string;
    content: BriefBlock[];
  }[];
}

export interface BriefBlock {
  type: 'speaker' | 'dialogue' | 'direction';
  speaker?: string;
  text: string;
}

// Lines/patterns to strip out (not actor-relevant)
const STRIP_PATTERNS = [
  /^>/,  // Editor notes starting with >
  /^editor\s*notes?:?/i,
  /^editor\s*instructions?:?/i,
  /^b-?roll:?/i,
  /^camera:?/i,
  /^shot:?/i,
  /^angle:?/i,
  /^zoom:?/i,
  /^cut\s*to:?/i,
  /^pacing:?/i,
  /^kill\s*these?:?/i,
  /^production\s*notes?:?/i,
  /^timecode:?/i,
  /^\d{2}:\d{2}/,  // Timecodes like 00:15
  /^\/\//,  // Comments starting with //
  /^split\s*screen/i,
  /^headline:?/i,
  /^brief$/i,
  /^client\s*name:?/i,
  /^hypothesis:?/i,
  /^video\s*reference:?/i,
  /^creator\s*needed:?/i,
  /^location\s*\d*\s*[-:]?/i,
  /^outfit:?/i,
  /^lighting/i,
  /^camera\s*angles?:?/i,
  /^props?:?$/i,
  /^requirement:?/i,
  /^notes:?$/i,
  /^general\s*mannerisms:?/i,
  /^delivery:?/i,
  /^american\s*accent/i,
  /^host\s*\d+\s*[-:]\s*(let'?s|we|find|african|between)/i,  // Casting notes
  /^the\s*shot\s*is/i,  // Camera direction
  /^no$/i,  // Single word answers in brief
  /^mtrx_/i,  // Internal codes
  /^\*\s/,  // Bullet points in notes
  /remember\s*to\s*do/i,
  /add\s*in\s*a\s*before/i,
];

// Brief metadata keywords that indicate we're in a "Brief" section to skip
const BRIEF_SECTION_KEYWORDS = [
  'client name', 'hypothesis', 'video reference', 'creator needed',
  'location', 'outfit', 'lighting', 'camera angles', 'props',
  'requirement', 'notes', 'general mannerisms', 'delivery'
];

// Check if a line should be stripped
function shouldStripLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;

  // Check against strip patterns
  if (STRIP_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return true;
  }

  // Strip lines that are just URLs (not reference URLs at the start)
  if (/^https?:\/\//.test(trimmed) && trimmed.length > 50) {
    return true;
  }

  return false;
}

// Check if line is a speaker label (returns speaker name or null)
function extractSpeaker(line: string): { speaker: string; dialogue: string } | null {
  const trimmed = line.trim();

  // Pattern: "HOST 1:" or "EXPERT:" at start of line (label only)
  const labelOnlyMatch = trimmed.match(/^(HOST\s*\d*|EXPERT|SPEAKER\s*\d*|TALENT|ACTOR|INTERVIEWER|GUEST)\s*:?\s*$/i);
  if (labelOnlyMatch) {
    return { speaker: labelOnlyMatch[1].toUpperCase().replace(/\s+/g, ' '), dialogue: '' };
  }

  // Pattern: "HOST 1: dialogue here" or "HOST 1 dialogue here" (inline)
  const inlineMatch = trimmed.match(/^(HOST\s*\d*(?:\s*MAIN)?|EXPERT|SPEAKER\s*\d*|TALENT|ACTOR|HOST\s*\d+\s*:?)\s*[:\s]\s*(.+)$/i);
  if (inlineMatch && inlineMatch[2] && inlineMatch[2].length > 10) {
    const speaker = inlineMatch[1].toUpperCase().replace(/\s+/g, ' ').replace(/:$/, '').replace(/\s*MAIN$/, '');
    return { speaker, dialogue: inlineMatch[2].trim() };
  }

  return null;
}

// Check if line is a hook label
function isHookLabel(line: string): string | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^HOOK\s*(\d+):?\s*$/i);
  if (match) {
    return `HOOK ${match[1]}:`;
  }
  return null;
}

// Check if line is a stage direction
function isStageDirection(line: string): string | null {
  const trimmed = line.trim();
  // Directions are typically in brackets
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed;
  }
  // Performance notes in parentheses like "(Skeptical, Curious)"
  if (/^\([A-Z][a-z]+,?\s*[A-Z]?[a-z]*\):?$/.test(trimmed)) {
    return `[${trimmed.slice(1, -1).replace(/:$/, '')}]`;
  }
  return null;
}

// Extract reference URL from brief
function extractReferenceUrl(text: string): string {
  // Look for reference URL near the top of the document
  const lines = text.split('\n').slice(0, 20);
  for (const line of lines) {
    const urlMatch = line.match(/(https?:\/\/[^\s\n]+)/);
    if (urlMatch) return urlMatch[1];
  }
  return '';
}

// Extract title from brief
function extractTitle(text: string): string {
  const lines = text.split('\n').filter(l => l.trim());

  // Look for a clear title (usually the first meaningful line that's not a URL or metadata)
  for (const line of lines.slice(0, 10)) {
    const trimmed = line.trim();
    // Skip URLs
    if (trimmed.startsWith('http')) continue;
    // Skip metadata
    if (/^(brief|client|hypothesis|reference|hook\s*\d)/i.test(trimmed)) continue;
    // Skip very short lines
    if (trimmed.length < 3) continue;
    // Skip lines with colons that look like metadata
    if (/^[A-Za-z\s]+:\s*$/.test(trimmed)) continue;

    // This looks like a title
    return trimmed;
  }

  return 'Untitled Script';
}

// Find where the actual script content starts (after the Brief section)
function findScriptStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    // Look for "Script" heading or first HOST/EXPERT line
    if (line === 'script' || /^host\s*\d*\s*:?\s+\w/.test(lines[i].trim())) {
      return i;
    }
  }
  return 0;
}

export function parseBrief(briefText: string): ParsedBrief {
  const title = extractTitle(briefText);
  const referenceUrl = extractReferenceUrl(briefText);

  const allLines = briefText.split('\n');
  const scriptStartIndex = findScriptStart(allLines);
  const lines = allLines.slice(scriptStartIndex);

  const hooks: ParsedBrief['hooks'] = [];
  let currentHook: { label: string; content: BriefBlock[] } = { label: '', content: [] };
  let currentSpeaker: string | null = null;
  let inBriefSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Detect Brief section start (skip until we're out)
    if (/^brief$/i.test(trimmed)) {
      inBriefSection = true;
      continue;
    }

    // Check if we're exiting Brief section (next Hook or Script section)
    if (inBriefSection) {
      if (/^(hook\s*\d+|script)$/i.test(trimmed)) {
        inBriefSection = false;
      } else {
        continue; // Skip Brief section content
      }
    }

    // Skip lines that should be stripped
    if (shouldStripLine(trimmed)) {
      continue;
    }

    // Check for hook label
    const hookLabel = isHookLabel(trimmed);
    if (hookLabel) {
      // Save previous hook if it has content
      if (currentHook.content.length > 0) {
        hooks.push(currentHook);
      }
      currentHook = { label: hookLabel, content: [] };
      currentSpeaker = null;
      continue;
    }

    // Check for stage direction
    const direction = isStageDirection(trimmed);
    if (direction) {
      currentHook.content.push({
        type: 'direction',
        text: direction
      });
      continue;
    }

    // Check for speaker (label only or inline with dialogue)
    const speakerMatch = extractSpeaker(trimmed);
    if (speakerMatch) {
      currentSpeaker = speakerMatch.speaker;
      currentHook.content.push({
        type: 'speaker',
        speaker: currentSpeaker,
        text: currentSpeaker
      });

      // If there's inline dialogue, add it
      if (speakerMatch.dialogue) {
        currentHook.content.push({
          type: 'dialogue',
          speaker: currentSpeaker,
          text: speakerMatch.dialogue
        });
      }
      continue;
    }

    // Otherwise it's dialogue (if we have a speaker)
    if (currentSpeaker) {
      // Additional filtering for dialogue lines
      const lowerTrimmed = trimmed.toLowerCase();

      // Skip metadata-looking lines even in dialogue context
      if (BRIEF_SECTION_KEYWORDS.some(kw => lowerTrimmed.startsWith(kw))) {
        continue;
      }

      // Skip single-word lines that look like headers
      if (trimmed.split(/\s+/).length === 1 && /^[A-Z]/.test(trimmed)) {
        continue;
      }

      currentHook.content.push({
        type: 'dialogue',
        speaker: currentSpeaker,
        text: trimmed
      });
    }
  }

  // Don't forget the last hook
  if (currentHook.content.length > 0) {
    hooks.push(currentHook);
  }

  // Filter out hooks that only have empty content or just speaker labels with no dialogue
  const filteredHooks = hooks.filter(hook => {
    const hasDialogue = hook.content.some(c => c.type === 'dialogue');
    return hasDialogue;
  });

  return { title, referenceUrl, hooks: filteredHooks };
}

export function generateActorScriptDocx(brief: ParsedBrief): Document {
  const children: Paragraph[] = [];

  // Title - 20pt Bold Left
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: brief.title,
          bold: true,
          size: 40, // 20pt = 40 half-points
          font: 'Arial',
        }),
      ],
      alignment: AlignmentType.LEFT,
      spacing: { after: 400 },
    })
  );

  // Reference URL - 11pt Regular Left
  if (brief.referenceUrl) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Reference: ',
            size: 22, // 11pt
            font: 'Arial',
          }),
          new TextRun({
            text: brief.referenceUrl,
            size: 22,
            font: 'Arial',
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { after: 600 },
      })
    );
  }

  // Process each hook
  brief.hooks.forEach((hook) => {
    // Hook label - 13pt Bold Left (with extra spacing before)
    if (hook.label) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: hook.label,
              bold: true,
              size: 26, // 13pt
              font: 'Arial',
            }),
          ],
          alignment: AlignmentType.LEFT,
          spacing: { before: 600, after: 300 },
        })
      );
    }

    // Process content blocks
    let lastType: string | null = null;

    hook.content.forEach((block) => {
      if (block.type === 'speaker') {
        // Speaker label - 12pt Bold Center
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: block.text + ':',
                bold: true,
                size: 24, // 12pt
                font: 'Arial',
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: {
              before: lastType === 'dialogue' || lastType === 'direction' ? 400 : 200,
              after: 0
            },
          })
        );
      } else if (block.type === 'dialogue') {
        // Dialogue - 12pt Regular Center
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: block.text,
                size: 24, // 12pt
                font: 'Arial',
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 100 },
          })
        );
      } else if (block.type === 'direction') {
        // Stage direction - 11pt Bold+Italic Left
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: block.text,
                bold: true,
                italics: true,
                size: 22, // 11pt
                font: 'Arial',
              }),
            ],
            alignment: AlignmentType.LEFT,
            spacing: { before: 200, after: 200 },
          })
        );
      }

      lastType = block.type;
    });
  });

  // Create the document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(8.5),
              height: convertInchesToTwip(11),
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children,
      },
    ],
  });

  return doc;
}

export function getFileName(title: string): string {
  // Clean the title for use as filename
  return title
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
    .replace(/\s+/g, ' ')         // Normalize whitespace
    .trim()
    + '.docx';
}
