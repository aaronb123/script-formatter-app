'use client';

import { useState, useCallback } from 'react';
import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  Packer,
  convertInchesToTwip,
  PageOrientation,
} from 'docx';
import { saveAs } from 'file-saver';

interface ParsedScript {
  brand: string;
  title: string;
  referenceUrl: string;
  characterNotes?: string;
  sections: {
    hook: string;
    lines: {
      type: 'speaker' | 'dialogue' | 'direction';
      text: string;
    }[];
  }[];
}

type Status = 'idle' | 'fetching' | 'parsing' | 'ready' | 'generating' | 'done' | 'error';

export default function ActorScriptGenerator() {
  const [docUrl, setDocUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [parsedScript, setParsedScript] = useState<ParsedScript | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!docUrl.trim()) {
      setError('Please paste a Google Docs link');
      return;
    }

    setError('');
    setStatus('fetching');

    try {
      // Step 1: Fetch the Google Doc
      const fetchResponse = await fetch('/api/fetch-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: docUrl }),
      });

      const fetchData = await fetchResponse.json();

      if (!fetchResponse.ok) {
        setError(fetchData.error || 'Failed to fetch document. Make sure the doc is set to "Anyone with the link can view".');
        setStatus('error');
        return;
      }

      setStatus('parsing');

      // Step 2: Use AI to parse the brief
      const parseResponse = await fetch('/api/parse-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefText: fetchData.text }),
      });

      const parseData = await parseResponse.json();

      if (!parseResponse.ok) {
        setError(parseData.error || 'Failed to parse document.');
        setStatus('error');
        return;
      }

      if (!parseData.sections || parseData.sections.length === 0) {
        setError('Could not find any script content. Make sure the doc has speaker labels (HOST:, EXPERT:) and dialogue.');
        setStatus('error');
        return;
      }

      setParsedScript(parseData);
      setStatus('ready');
    } catch (err) {
      console.error(err);
      setError('Failed to process document. Check your connection and try again.');
      setStatus('error');
    }
  }, [docUrl]);

  const generateDocx = useCallback((script: ParsedScript): Document => {
    const children: Paragraph[] = [];

    // Brand - 14pt Bold
    if (script.brand) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `BRAND: ${script.brand.toUpperCase()}`,
              bold: true,
              size: 28,
              font: 'Arial',
            }),
          ],
          alignment: AlignmentType.LEFT,
          spacing: { after: 100 },
        })
      );
    }

    // Title - 20pt Bold
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: script.title,
            bold: true,
            size: 40,
            font: 'Arial',
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { after: 300 },
      })
    );

    // Reference URL - 11pt
    if (script.referenceUrl) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Reference: ',
              size: 22,
              font: 'Arial',
            }),
            new TextRun({
              text: script.referenceUrl,
              size: 22,
              font: 'Arial',
            }),
          ],
          alignment: AlignmentType.LEFT,
          spacing: { after: 200 },
        })
      );
    }

    // Character notes - 11pt Italic
    if (script.characterNotes) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Tone: ',
              bold: true,
              size: 22,
              font: 'Arial',
            }),
            new TextRun({
              text: script.characterNotes,
              italics: true,
              size: 22,
              font: 'Arial',
            }),
          ],
          alignment: AlignmentType.LEFT,
          spacing: { after: 400 },
        })
      );
    }

    // Separator
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '─'.repeat(50),
            size: 22,
            font: 'Arial',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );

    // Process sections
    script.sections.forEach((section) => {
      // Hook label - 13pt Bold
      if (section.hook) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: section.hook,
                bold: true,
                size: 26,
                font: 'Arial',
              }),
            ],
            alignment: AlignmentType.LEFT,
            spacing: { before: 500, after: 300 },
          })
        );
      }

      // Lines
      let lastType: string | null = null;
      section.lines.forEach((line) => {
        if (line.type === 'speaker') {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line.text + ':',
                  bold: true,
                  size: 24,
                  font: 'Arial',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: {
                before: lastType === 'dialogue' ? 400 : 200,
                after: 0,
              },
            })
          );
        } else if (line.type === 'dialogue') {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line.text,
                  size: 24,
                  font: 'Arial',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 100, after: 100 },
            })
          );
        } else if (line.type === 'direction') {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line.text,
                  bold: true,
                  italics: true,
                  size: 22,
                  font: 'Arial',
                }),
              ],
              alignment: AlignmentType.LEFT,
              spacing: { before: 200, after: 200 },
            })
          );
        }
        lastType = line.type;
      });
    });

    return new Document({
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
  }, []);

  const handleDownload = useCallback(async () => {
    if (!parsedScript) return;

    setStatus('generating');

    try {
      const doc = generateDocx(parsedScript);
      const blob = await Packer.toBlob(doc);
      const fileName = `${parsedScript.title.replace(/[<>:"/\\|?*]/g, '').trim()}.docx`;
      saveAs(blob, fileName);
      setStatus('done');
    } catch (err) {
      console.error(err);
      setError('Error generating document. Please try again.');
      setStatus('error');
    }
  }, [parsedScript, generateDocx]);

  const handleReset = useCallback(() => {
    setDocUrl('');
    setStatus('idle');
    setError('');
    setParsedScript(null);
  }, []);

  return (
    <div className="space-y-6">
      {/* Step 1: Google Doc URL */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
            status === 'idle' || status === 'error' ? 'bg-blue-600' : 'bg-green-600'
          }`}>
            1
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Paste Google Doc Link
          </h2>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Make sure the doc is set to <strong>&quot;Anyone with the link can view&quot;</strong>
        </p>

        <div className="flex gap-3">
          <input
            type="url"
            value={docUrl}
            onChange={(e) => { setDocUrl(e.target.value); setError(''); }}
            disabled={status !== 'idle' && status !== 'error'}
            className="flex-1 px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
            placeholder="https://docs.google.com/document/d/..."
          />
          {(status === 'idle' || status === 'error') && (
            <button
              onClick={handleGenerate}
              className="px-8 py-3 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 whitespace-nowrap"
            >
              Generate Script
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {(status === 'fetching' || status === 'parsing') && (
          <div className="mt-4 flex items-center gap-3 text-blue-600 dark:text-blue-400">
            <div className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full"></div>
            <span>{status === 'fetching' ? 'Fetching document...' : 'AI parsing script (this may take a few seconds)...'}</span>
          </div>
        )}
      </div>

      {/* Step 2: Preview & Download */}
      {(status === 'ready' || status === 'generating' || status === 'done') && parsedScript && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold bg-green-600">
              2
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Review & Download
            </h2>
          </div>

          {/* Header info */}
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-1">
            {parsedScript.brand && (
              <p className="text-sm"><span className="font-semibold">Brand:</span> {parsedScript.brand}</p>
            )}
            <p className="font-semibold text-lg">{parsedScript.title}</p>
            {parsedScript.referenceUrl && (
              <p className="text-sm text-blue-600 dark:text-blue-400 truncate">{parsedScript.referenceUrl}</p>
            )}
            {parsedScript.characterNotes && (
              <p className="text-sm italic text-gray-600 dark:text-gray-400">Tone: {parsedScript.characterNotes}</p>
            )}
          </div>

          {/* Preview */}
          <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-100 dark:bg-gray-900 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Script Preview ({parsedScript.sections.length} section{parsedScript.sections.length !== 1 ? 's' : ''})
              </p>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto bg-white dark:bg-gray-800 font-mono text-sm">
              {parsedScript.sections.map((section, sIdx) => (
                <div key={sIdx} className="mb-4">
                  {section.hook && (
                    <p className="font-bold text-blue-600 dark:text-blue-400 mb-2">{section.hook}</p>
                  )}
                  {section.lines.map((line, lIdx) => (
                    <p
                      key={lIdx}
                      className={`${
                        line.type === 'speaker' ? 'font-bold text-center mt-3' :
                        line.type === 'direction' ? 'italic text-gray-500 text-xs' :
                        'text-center'
                      }`}
                    >
                      {line.type === 'speaker' ? `${line.text}:` : line.text}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Download button */}
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              disabled={status === 'generating'}
              className="flex-1 px-8 py-4 bg-green-600 text-white text-lg font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {status === 'generating' ? 'Generating...' : status === 'done' ? '✓ Download Again' : 'Download .docx'}
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-4 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Start Over
            </button>
          </div>

          {status === 'done' && (
            <p className="mt-4 text-green-600 dark:text-green-400 text-center">
              ✅ Downloaded! Check your Downloads folder.
            </p>
          )}
        </div>
      )}

      {/* What&apos;s included */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">What the Actor Script Contains</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-green-700 dark:text-green-400 mb-2">✅ Included</p>
            <ul className="text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Brand name + Script title</li>
              <li>• Reference video URL</li>
              <li>• Character/tone notes</li>
              <li>• Speaker labels (HOST, EXPERT)</li>
              <li>• Dialogue (exact copy)</li>
              <li>• Stage directions</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-red-700 dark:text-red-400 mb-2">❌ Stripped Out</p>
            <ul className="text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Location descriptions</li>
              <li>• Demographics/casting notes</li>
              <li>• Editor notes</li>
              <li>• B-roll instructions</li>
              <li>• Camera directions</li>
              <li>• Production notes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
