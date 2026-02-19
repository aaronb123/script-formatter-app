import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
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
];

// Check if a line should be stripped
function shouldStripLine(line: string): boolean {
  const trimmed = line.trim();
  return STRIP_PATTERNS.some(pattern => pattern.test(trimmed));
}

// Check if line is a speaker label
function isSpeakerLabel(line: string): string | null {
  const trimmed = line.trim();
  // Match patterns like "HOST:", "EXPERT:", "HOST 1:", etc.
  const match = trimmed.match(/^(HOST|EXPERT|SPEAKER|TALENT|ACTOR|INTERVIEWER|GUEST)(\s*\d*)?:?\s*$/i);
  if (match) {
    return trimmed.replace(/:?\s*$/, '').toUpperCase();
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
  // Or in parentheses for action directions
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    // Convert to brackets for consistency
    return `[${trimmed.slice(1, -1)}]`;
  }
  return null;
}

// Extract reference URL from brief
function extractReferenceUrl(text: string): string {
  const urlMatch = text.match(/(?:reference|ref|video|link)[\s:]*\n?\s*(https?:\/\/[^\s\n]+)/i);
  if (urlMatch) return urlMatch[1];

  // Try to find any URL
  const anyUrlMatch = text.match(/(https?:\/\/[^\s\n]+)/);
  return anyUrlMatch ? anyUrlMatch[1] : '';
}

// Extract title from brief
function extractTitle(text: string): string {
  const lines = text.split('\n').filter(l => l.trim());

  // Look for explicit title markers
  const titleMatch = text.match(/(?:title|campaign|script\s*name)[\s:]*\n?\s*([^\n]+)/i);
  if (titleMatch) return titleMatch[1].trim();

  // Otherwise use first non-empty line that's not a URL
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('http') && !shouldStripLine(trimmed)) {
      return trimmed;
    }
  }

  return 'Untitled Script';
}

export function parseBrief(briefText: string): ParsedBrief {
  const title = extractTitle(briefText);
  const referenceUrl = extractReferenceUrl(briefText);

  const lines = briefText.split('\n');
  const hooks: ParsedBrief['hooks'] = [];

  let currentHook: { label: string; content: BriefBlock[] } | null = null;
  let currentSpeaker: string | null = null;
  let collectingDialogue = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and stripped content
    if (!trimmed || shouldStripLine(trimmed)) {
      continue;
    }

    // Check for hook label
    const hookLabel = isHookLabel(trimmed);
    if (hookLabel) {
      if (currentHook) {
        hooks.push(currentHook);
      }
      currentHook = { label: hookLabel, content: [] };
      currentSpeaker = null;
      collectingDialogue = false;
      continue;
    }

    // If no hook started yet, create a default one
    if (!currentHook) {
      currentHook = { label: '', content: [] };
    }

    // Check for speaker label
    const speakerLabel = isSpeakerLabel(trimmed);
    if (speakerLabel) {
      currentSpeaker = speakerLabel;
      currentHook.content.push({
        type: 'speaker',
        speaker: currentSpeaker,
        text: currentSpeaker
      });
      collectingDialogue = true;
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

    // Otherwise it's dialogue (if we have a speaker) or skip
    if (currentSpeaker && collectingDialogue) {
      // Skip lines that look like production notes within dialogue
      if (!shouldStripLine(trimmed)) {
        currentHook.content.push({
          type: 'dialogue',
          speaker: currentSpeaker,
          text: trimmed
        });
      }
    }
  }

  // Don't forget the last hook
  if (currentHook && currentHook.content.length > 0) {
    hooks.push(currentHook);
  }

  return { title, referenceUrl, hooks };
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
  brief.hooks.forEach((hook, hookIndex) => {
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

    hook.content.forEach((block, blockIndex) => {
      if (block.type === 'speaker') {
        // Speaker label - 12pt Bold Center
        // Add spacing before if not the first block
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
            spacing: { before: 0, after: 100 },
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
