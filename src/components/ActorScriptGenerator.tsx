'use client';

import { useState, useCallback } from 'react';
import { Packer } from 'docx';
import { saveAs } from 'file-saver';
import { parseBrief, generateActorScriptDocx, getFileName, ParsedBrief } from '@/lib/docxGenerator';

type Status = 'idle' | 'fetching' | 'parsing' | 'ready' | 'generating' | 'done' | 'error';

export default function ActorScriptGenerator() {
  const [docUrl, setDocUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [parsedBrief, setParsedBrief] = useState<ParsedBrief | null>(null);
  const [rawText, setRawText] = useState('');

  const handleGenerate = useCallback(async () => {
    if (!docUrl.trim()) {
      setError('Please paste a Google Docs link');
      return;
    }

    setError('');
    setStatus('fetching');

    try {
      // Step 1: Fetch the Google Doc
      const response = await fetch('/api/fetch-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: docUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to fetch document. Make sure the doc is set to "Anyone with the link can view".');
        setStatus('error');
        return;
      }

      setRawText(data.text);
      setStatus('parsing');

      // Step 2: Parse the brief
      const parsed = parseBrief(data.text);
      setParsedBrief(parsed);

      if (parsed.hooks.length === 0) {
        setError('Could not find any content to parse. Make sure the doc has speaker labels (HOST:, EXPERT:) and dialogue.');
        setStatus('error');
        return;
      }

      setStatus('ready');
    } catch (err) {
      setError('Failed to fetch document. Check your connection and try again.');
      setStatus('error');
    }
  }, [docUrl]);

  const handleDownload = useCallback(async () => {
    if (!parsedBrief) return;

    setStatus('generating');

    try {
      const doc = generateActorScriptDocx(parsedBrief);
      const blob = await Packer.toBlob(doc);
      const fileName = getFileName(parsedBrief.title);
      saveAs(blob, fileName);
      setStatus('done');
    } catch (err) {
      setError('Error generating document. Please try again.');
      setStatus('error');
    }
  }, [parsedBrief]);

  const handleReset = useCallback(() => {
    setDocUrl('');
    setStatus('idle');
    setError('');
    setParsedBrief(null);
    setRawText('');
  }, []);

  return (
    <div className="space-y-6">
      {/* Step 1: Google Doc URL */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
            status === 'idle' ? 'bg-blue-600' : 'bg-green-600'
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
              Load Script
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {status === 'fetching' && (
          <div className="mt-4 flex items-center gap-3 text-blue-600 dark:text-blue-400">
            <div className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full"></div>
            <span>Fetching document...</span>
          </div>
        )}

        {status === 'parsing' && (
          <div className="mt-4 flex items-center gap-3 text-blue-600 dark:text-blue-400">
            <div className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full"></div>
            <span>Parsing content...</span>
          </div>
        )}
      </div>

      {/* Step 2: Preview & Download */}
      {(status === 'ready' || status === 'generating' || status === 'done') && parsedBrief && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold bg-blue-600">
              2
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Review & Download
            </h2>
          </div>

          {/* File name preview */}
          <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">File name:</p>
            <p className="font-mono font-semibold text-gray-900 dark:text-white">
              {getFileName(parsedBrief.title)}
            </p>
          </div>

          {/* Content preview */}
          <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Preview</p>
            </div>
            <div className="p-4 max-h-64 overflow-y-auto bg-white dark:bg-gray-800">
              <p className="text-xl font-bold mb-2">{parsedBrief.title}</p>
              {parsedBrief.referenceUrl && (
                <p className="text-sm text-gray-500 mb-4">Reference: {parsedBrief.referenceUrl}</p>
              )}
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {parsedBrief.hooks.length} hook section(s) • {' '}
                {parsedBrief.hooks.reduce((acc, h) => acc + h.content.filter(c => c.type === 'dialogue').length, 0)} dialogue line(s)
              </p>

              <div className="mt-4 space-y-3">
                {parsedBrief.hooks.slice(0, 2).map((hook, i) => (
                  <div key={i} className="text-sm">
                    {hook.label && <p className="font-bold">{hook.label}</p>}
                    {hook.content.slice(0, 4).map((block, j) => (
                      <p key={j} className={`${
                        block.type === 'speaker' ? 'font-bold text-center mt-2' :
                        block.type === 'direction' ? 'italic text-gray-500' :
                        'text-center'
                      }`}>
                        {block.type === 'speaker' ? `${block.text}:` : block.text}
                      </p>
                    ))}
                    {hook.content.length > 4 && (
                      <p className="text-gray-400 text-center">...</p>
                    )}
                  </div>
                ))}
                {parsedBrief.hooks.length > 2 && (
                  <p className="text-gray-400 text-center">+ {parsedBrief.hooks.length - 2} more hook(s)</p>
                )}
              </div>
            </div>
          </div>

          {/* Download button */}
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              disabled={status === 'generating'}
              className="flex-1 px-8 py-4 bg-green-600 text-white text-lg font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {status === 'generating' ? 'Generating...' : status === 'done' ? 'Download Again' : 'Download .docx'}
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-4 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Start Over
            </button>
          </div>

          {status === 'done' && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-green-700 dark:text-green-300 font-medium">
                ✅ Downloaded! Check your Downloads folder.
              </p>
            </div>
          )}
        </div>
      )}

      {/* What gets included/excluded */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">What the Actor Script Contains</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">✅ Included</p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Title / Campaign name</li>
              <li>• Reference video URL</li>
              <li>• Hook sections</li>
              <li>• Speaker labels (HOST:, EXPERT:)</li>
              <li>• Dialogue (exact copy)</li>
              <li>• Stage directions [in brackets]</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">❌ Stripped Out</p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Editor notes</li>
              <li>• B-roll instructions</li>
              <li>• Camera/shot directions</li>
              <li>• PACING sections</li>
              <li>• KILL THESE sections</li>
              <li>• Timecodes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
