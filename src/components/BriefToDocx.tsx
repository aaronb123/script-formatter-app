'use client';

import { useState, useCallback } from 'react';
import { Packer } from 'docx';
import { saveAs } from 'file-saver';
import { parseBrief, generateActorScriptDocx, getFileName, ParsedBrief } from '@/lib/docxGenerator';

export default function BriefToDocx() {
  const [briefText, setBriefText] = useState('');
  const [parsedBrief, setParsedBrief] = useState<ParsedBrief | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleParse = useCallback(() => {
    if (!briefText.trim()) {
      alert('Please paste a marketing brief first.');
      return;
    }
    const parsed = parseBrief(briefText);
    setParsedBrief(parsed);
    setShowPreview(true);
  }, [briefText]);

  const handleGenerate = useCallback(async () => {
    if (!parsedBrief) {
      alert('Please parse the brief first.');
      return;
    }

    setIsGenerating(true);
    try {
      const doc = generateActorScriptDocx(parsedBrief);
      const blob = await Packer.toBlob(doc);
      const fileName = getFileName(parsedBrief.title);
      saveAs(blob, fileName);
    } catch (error) {
      console.error('Error generating document:', error);
      alert('Error generating document. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [parsedBrief]);

  const handleReset = useCallback(() => {
    setBriefText('');
    setParsedBrief(null);
    setShowPreview(false);
  }, []);

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">How to Use</h3>
        <ol className="list-decimal list-inside text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>Paste your marketing brief below</li>
          <li>Click &quot;Parse Brief&quot; to extract actor-relevant content</li>
          <li>Review the preview to ensure correct parsing</li>
          <li>Click &quot;Generate .docx&quot; to download the actor script</li>
        </ol>
      </div>

      {/* What Gets Stripped */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">Included (Actor-Relevant)</h4>
          <ul className="text-sm text-green-800 dark:text-green-200 space-y-1">
            <li>• Title / Campaign name</li>
            <li>• Reference video URL</li>
            <li>• Hook sections (HOOK 1:, HOOK 2:, etc.)</li>
            <li>• Speaker labels (HOST:, EXPERT:)</li>
            <li>• Dialogue (exact copy, no changes)</li>
            <li>• Stage directions [in brackets]</li>
          </ul>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <h4 className="font-semibold text-red-900 dark:text-red-100 mb-2">Stripped Out (Production-Only)</h4>
          <ul className="text-sm text-red-800 dark:text-red-200 space-y-1">
            <li>• Editor notes / instructions</li>
            <li>• B-roll instructions</li>
            <li>• Camera/shot directions</li>
            <li>• PACING sections</li>
            <li>• KILL THESE sections</li>
            <li>• Timecodes</li>
          </ul>
        </div>
      </div>

      {/* Brief Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Paste Marketing Brief
        </label>
        <textarea
          value={briefText}
          onChange={(e) => setBriefText(e.target.value)}
          className="w-full h-64 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
          placeholder={`Paste your marketing brief here...

Example format:

Product Launch Campaign - Spring 2026

Reference: https://example.com/reference-video

HOOK 1:

HOST:
Have you ever wondered why...

EXPERT:
That's a great question! Let me explain...

[Expert holds up product]

EXPERT:
This product has changed everything...`}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleParse}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Parse Brief
        </button>
        {parsedBrief && (
          <>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
            >
              {isGenerating ? 'Generating...' : 'Generate .docx'}
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              Reset
            </button>
          </>
        )}
      </div>

      {/* Preview */}
      {showPreview && parsedBrief && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">Preview (Actor Script Content)</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              File will be saved as: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{getFileName(parsedBrief.title)}</code>
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-900 max-h-96 overflow-y-auto">
            {/* Title */}
            <p className="text-xl font-bold mb-4">{parsedBrief.title}</p>

            {/* Reference */}
            {parsedBrief.referenceUrl && (
              <p className="text-sm mb-6">
                <span className="text-gray-600 dark:text-gray-400">Reference: </span>
                <span className="text-blue-600 dark:text-blue-400">{parsedBrief.referenceUrl}</span>
              </p>
            )}

            {/* Hooks */}
            {parsedBrief.hooks.map((hook, hookIndex) => (
              <div key={hookIndex} className="mb-6">
                {hook.label && (
                  <p className="font-bold text-lg mb-3">{hook.label}</p>
                )}

                {hook.content.map((block, blockIndex) => {
                  if (block.type === 'speaker') {
                    return (
                      <p key={blockIndex} className="font-bold text-center mt-4">
                        {block.text}:
                      </p>
                    );
                  }
                  if (block.type === 'dialogue') {
                    return (
                      <p key={blockIndex} className="text-center">
                        {block.text}
                      </p>
                    );
                  }
                  if (block.type === 'direction') {
                    return (
                      <p key={blockIndex} className="font-bold italic text-gray-600 dark:text-gray-400 text-sm">
                        {block.text}
                      </p>
                    );
                  }
                  return null;
                })}
              </div>
            ))}

            {parsedBrief.hooks.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 italic text-center py-8">
                No content parsed. Make sure your brief includes speaker labels (HOST:, EXPERT:) and dialogue.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Role Definitions */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">Role Definitions</h4>
        <ul className="text-sm text-yellow-800 dark:text-yellow-200 space-y-1">
          <li><strong>HOST</strong> = The interviewer / person asking questions</li>
          <li><strong>EXPERT</strong> = The knowledgeable person / leads conversation, delivers product recommendation</li>
        </ul>
      </div>
    </div>
  );
}
