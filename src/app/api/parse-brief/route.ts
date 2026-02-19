import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an expert at extracting actor scripts from marketing briefs.

Your job is to take a marketing brief and extract ONLY the content that an actor needs to perform.

INCLUDE (actor-relevant):
- Brand name (extract from "Client Name" field or document context)
- Title/campaign name (the script code like "MTRX_YH2_Ti_VSL6" or descriptive title)
- Reference video URL (first URL found, usually from "Video Reference" field)
- Character notes about delivery tone/style (brief notes only, not full paragraphs)
- Hook sections with their labels (HOOK 1:, HOOK 2:, etc.)
- Speaker labels (HOST:, EXPERT:, HOST 1:, HOST 2:, etc.)
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
- Outfit/wardrobe descriptions
- Props lists
- Hypothesis sections
- General Mannerisms bullet points (actors know how to act)
- Any production-only notes, timecodes, or technical directions

ROLE DEFINITIONS (CRITICAL - enforce consistency):
- HOST 1 / HOST 1 MAIN / EXPERT = ALWAYS the "Brand Ambassador" / "Advocate" - the person who KNOWS the product, delivers the main info, usually has the most lines
- HOST 2 / GUEST = ALWAYS the "Discoverer" / "Skeptic" / "Detractor" - the person LEARNING about the product, asks questions, expresses doubts

If the source script has these roles swapped or inconsistent, NORMALIZE them:
- The character with product knowledge = HOST 1
- The character asking questions/skeptical = HOST 2

OUTPUT FORMAT:
Return a JSON object with this structure:
{
  "brand": "Brand name (e.g., Yucca Health)",
  "title": "Script title/code",
  "referenceUrl": "URL if found",
  "characterNotes": "Brief delivery notes if any (e.g., 'Conversational, friendly tone')",
  "sections": [
    {
      "hook": "HOOK 1:" or "" if no hook label,
      "lines": [
        { "type": "speaker", "text": "HOST 1" },
        { "type": "dialogue", "text": "The actual line spoken" },
        { "type": "direction", "text": "[Stage direction in brackets]" }
      ]
    }
  ]
}

CRITICAL: All dialogue text must be an exact 1:1 copy of the source. No rewording, no paraphrasing, no corrections.`;

export async function POST(req: NextRequest) {
  try {
    const { briefText } = await req.json();

    if (!briefText) {
      return NextResponse.json({ error: 'No brief text provided' }, { status: 400 });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
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
