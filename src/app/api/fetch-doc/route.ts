import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }

    // Extract the Google Doc ID and optional tab ID from various URL formats
    const docId = extractDocId(url);
    if (!docId) {
      return NextResponse.json(
        { error: 'Invalid Google Docs URL. Please use a link like: https://docs.google.com/document/d/YOUR_DOC_ID/edit' },
        { status: 400 }
      );
    }

    // Extract tab ID if present (e.g., ?tab=t.akkh1zelbl96)
    const tabId = extractTabId(url);

    // Fetch the doc as plain text using Google's export URL
    let exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    if (tabId) {
      exportUrl += `&tab=${tabId}`;
    }
    const response = await fetch(exportUrl);

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Document not found. Check the URL is correct.' },
          { status: 404 }
        );
      }
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { error: 'Document is not publicly accessible. Set sharing to "Anyone with the link can view".' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: `Failed to fetch document (status ${response.status})` },
        { status: response.status }
      );
    }

    const text = await response.text();

    return NextResponse.json({ text, docId });
  } catch (error) {
    console.error('Error fetching doc:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document. Please check the URL and try again.' },
      { status: 500 }
    );
  }
}

function extractDocId(url: string): string | null {
  // Match patterns:
  // https://docs.google.com/document/d/DOC_ID/edit
  // https://docs.google.com/document/d/DOC_ID/
  // https://docs.google.com/document/d/DOC_ID
  const patterns = [
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function extractTabId(url: string): string | null {
  // Match ?tab=t.xxxxx or &tab=t.xxxxx
  const match = url.match(/[?&]tab=(t\.[a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
