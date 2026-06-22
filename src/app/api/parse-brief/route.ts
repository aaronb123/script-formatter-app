import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an expert at extracting actor scripts from marketing briefs.

Your job is to take a marketing brief and extract ONLY the content that an actor needs to perform.

INCLUDE (actor-relevant):
- Brand name (extract from "Client Name" field or document context)
- Title/campaign name (the script code like "MTRX_YH2_Ti_VSL6" or descriptive title)
- Reference video URL (first URL found, usually from "Video Reference" field)
- ALL character/speaker personas with their names and descriptions
- Wardrobe/outfit details for each character (extract from "Outfit", "Wardrobe", or clothing descriptions in the brief)
- Hook sections with their labels (HOOK 1:, HOOK 2:, etc.)
- Speaker labels using the character's ACTUAL NAME from the brief
- Dialogue - the actual spoken lines, exact 1:1 copy, no changes
- Stage directions that tell the actor what to physically do (e.g., [looks at camera], [holds product])

STRIP OUT (not actor-relevant):
- Editor notes / editor instructions (lines starting with > or containing "REMEMBER TO DO")
- B-roll instructions
- Camera/shot directions (angles, zooms, cuts, lighting descriptions)
- PACING sections
- KILL THESE sections
- Location descriptions (the actor already knows where they're shooting)
- Demographics/casting notes ("African american talent", "30-50 yrs old")
- Props lists
- Hypothesis sections
- General Mannerisms bullet points (actors know how to act)
- Any production-only notes, timecodes, or technical directions

CHARACTER NAME EXTRACTION (CRITICAL - read carefully):
1. Search the ENTIRE brief for character names. They often appear in:
   - "Speaker 1 HOST1: NAME" or "Speaker 1: NAME" patterns
   - Character description sections (e.g., "Host 1 - Sarah (Brand Ambassador)")
   - Casting notes mentioning names
   - Dialogue labels that use names instead of HOST 1/HOST 2
2. If the brief assigns actual names to speakers (e.g., "Sarah", "Mike", "Dr. Johnson"), you MUST use those names as speaker labels throughout the script instead of HOST 1/HOST 2.
3. Only fall back to HOST 1/HOST 2 if NO character names are found anywhere in the brief.
4. Be consistent - use the SAME name for each character across all hooks and the main script.

ROLE DEFINITIONS:
- The "Brand Ambassador" / "Advocate" / "Expert" = the person who KNOWS the product, delivers the main info, usually has the most lines
- The "Discoverer" / "Skeptic" / "Detractor" / "Guest" = the person LEARNING about the product, asks questions, expresses doubts

If the source script has roles swapped or inconsistent, NORMALIZE them but keep using their actual names.

SECTION BOUNDARIES (CRITICAL):
- Each HOOK section (Hook 1, Hook 2, Hook 3) is a SEPARATE mini-script
- Hooks are short - usually just 1-3 speaker exchanges
- When you see "Script" or "Base Script" - that's a NEW section (the main body)
- Keep Hook sections short and separate from the main Script section
- Each Hook typically ends after the opening exchange (1-2 lines per speaker max)

OUTPUT FORMAT:
Return a JSON object with this structure:
{
  "brand": "Brand name (e.g., Yucca Health)",
  "title": "Script title/code",
  "referenceUrl": "URL if found",
  "characterNotes": "Brief overall delivery notes if any (e.g., 'Conversational, friendly tone')",
  "wardrobe": [
    {
      "character": "CHARACTER NAME (matching a name from the characters array)",
      "details": "Full wardrobe/outfit description from the brief"
    }
  ],
  "characters": [
    {
      "name": "ACTUAL NAME from brief or HOST 1 if no name found",
      "role": "Brand Ambassador / Expert",
      "description": "Persona description - e.g., 'Knows the product inside out, energetic, advocates for the brand'"
    },
    {
      "name": "ACTUAL NAME from brief or HOST 2 if no name found",
      "role": "Discoverer / Skeptic",
      "description": "Persona description - e.g., 'Curious newcomer, asks tough questions, starts skeptical'"
    }
  ],
  "sections": [
    {
      "hook": "HOOK 1:" or "SCRIPT:" or "" for unlabeled sections,
      "lines": [
        { "type": "speaker", "text": "CHARACTER NAME (must match a name from the characters array)" },
        { "type": "dialogue", "text": "The actual line spoken" },
        { "type": "direction", "text": "[Stage direction in brackets]" }
      ]
    }
  ]
}

IMPORTANT: Create SEPARATE sections for:
- HOOK 1 (just the hook content)
- HOOK 2 (just the hook content)
- HOOK 3 (just the hook content)
- SCRIPT (the main body after hooks)

CRITICAL: All dialogue text must be an exact 1:1 copy of the source. No rewording, no paraphrasing, no corrections.
CRITICAL: The "characters" array MUST include ALL speakers found in the brief. Never omit a character. If there are 2 speakers, include 2 characters. If there are 3, include 3.
CRITICAL: Speaker labels in section lines MUST use the character's name from the "characters" array, NOT generic HOST 1/HOST 2 (unless no names were found).`;

export async function POST(req: NextRequest) {
  try {
    const { briefText } = await req.json();

    if (!briefText) {
      return NextResponse.json({ error: 'No brief text provided' }, { status: 400 });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-0-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Parse this marketing brief and extract the actor script. Return ONLY valid JSON, no other text.\n\n---\n\n${briefText}`
        }
      ],
      system: SYSTEM_PROMPT,
    });

    // Extract the text content
    const content = message.content[0];
    if (content.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response format' }, { status: 500 });
    }

    // Parse the JSON response
    let parsed;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(content.text);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content.text);
      return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error parsing brief:', error);
    return NextResponse.json(
      { error: 'Failed to parse brief. Please try again.' },
      { status: 500 }
    );
  }
}
