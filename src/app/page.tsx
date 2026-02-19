'use client';

import { useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Script,
  Character,
  ScriptLine,
  ReferenceVideo,
  ClaimIssue,
  DEFAULT_CHARACTERS,
} from '@/lib/types';
import {
  generateFormattedScript,
  generateActorScript,
  checkClaims,
  parseRawScript,
  formatCharacterName,
} from '@/lib/formatter';

// Dynamic import for BriefToDocx to avoid SSR issues with file-saver
const BriefToDocx = dynamic(() => import('@/components/BriefToDocx'), { ssr: false });

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'input' | 'formatted' | 'actor' | 'claims' | 'docx'>('input');

  // Use refs to maintain stable character IDs
  const characterIdMapRef = useRef<Map<string, string>>(new Map());

  const [script, setScript] = useState<Script>({
    id: generateId(),
    brandName: '',
    title: '',
    characters: DEFAULT_CHARACTERS.map(c => ({ ...c })),
    lines: [],
    referenceVideos: [],
    location: '',
    props: [],
    wardrobe: {},
    pronunciations: [],
  });

  const [rawScriptText, setRawScriptText] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState('');
  const [docLoaded, setDocLoaded] = useState(false);
  const [selectedActorId, setSelectedActorId] = useState<string>('host1');
  const [claimIssues, setClaimIssues] = useState<ClaimIssue[]>([]);
  const [newRefUrl, setNewRefUrl] = useState('');
  const [newRefType, setNewRefType] = useState<'reference' | 'replication'>('reference');
  const [newRefNotes, setNewRefNotes] = useState('');
  const [newPronWord, setNewPronWord] = useState('');
  const [newPronPronunciation, setNewPronPronunciation] = useState('');
  const [newProp, setNewProp] = useState('');

  // Get stable character ID - prevents name glitching
  const getStableCharacterId = useCallback((baseName: string): string => {
    const normalizedName = baseName.toLowerCase().trim();
    if (characterIdMapRef.current.has(normalizedName)) {
      return characterIdMapRef.current.get(normalizedName)!;
    }
    const newId = `char-${generateId()}`;
    characterIdMapRef.current.set(normalizedName, newId);
    return newId;
  }, []);

  // Update character name while preserving ID and role
  const updateCharacterName = useCallback((characterId: string, newName: string) => {
    setScript(prev => ({
      ...prev,
      characters: prev.characters.map(c =>
        c.id === characterId
          ? { ...c, name: newName }
          : c
      ),
    }));
  }, []);

  // Add a new character (always as 'other' role since host1/host2 are locked)
  const addCharacter = useCallback(() => {
    const newCharNum = script.characters.length + 1;
    const newChar: Character = {
      id: getStableCharacterId(`character${newCharNum}`),
      name: `CHARACTER ${newCharNum}`,
      role: 'other',
      roleDescription: 'Supporting character',
    };
    setScript(prev => ({
      ...prev,
      characters: [...prev.characters, newChar],
    }));
  }, [script.characters.length, getStableCharacterId]);

  // Remove a character (cannot remove host1 or host2)
  const removeCharacter = useCallback((characterId: string) => {
    if (characterId === 'host1' || characterId === 'host2') {
      alert('Cannot remove Host 1 or Host 2 - these are required characters.');
      return;
    }
    setScript(prev => ({
      ...prev,
      characters: prev.characters.filter(c => c.id !== characterId),
      lines: prev.lines.map(line =>
        line.characterId === characterId
          ? { ...line, characterId: undefined }
          : line
      ),
    }));
  }, []);

  // Fetch Google Doc content
  const fetchDoc = useCallback(async () => {
    if (!docUrl) {
      setDocError('Please paste a Google Docs link');
      return;
    }

    setDocLoading(true);
    setDocError('');

    try {
      const response = await fetch('/api/fetch-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: docUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        setDocError(data.error || 'Failed to fetch document');
        return;
      }

      setRawScriptText(data.text);
      setDocLoaded(true);
    } catch {
      setDocError('Failed to fetch document. Check your connection and try again.');
    } finally {
      setDocLoading(false);
    }
  }, [docUrl]);

  // Parse raw script text
  const parseScript = useCallback(() => {
    const parsedLines = parseRawScript(rawScriptText, script.characters);
    setScript(prev => ({
      ...prev,
      lines: parsedLines,
    }));

    // Auto-check claims after parsing
    const issues = checkClaims({ ...script, lines: parsedLines });
    setClaimIssues(issues);

    if (issues.length > 0) {
      setActiveTab('claims');
    } else {
      setActiveTab('formatted');
    }
  }, [rawScriptText, script]);

  // Add reference video
  const addReferenceVideo = useCallback(() => {
    if (!newRefUrl) return;

    const newRef: ReferenceVideo = {
      url: newRefUrl,
      type: newRefType,
      notes: newRefNotes,
    };

    setScript(prev => ({
      ...prev,
      referenceVideos: [...prev.referenceVideos, newRef],
    }));

    setNewRefUrl('');
    setNewRefNotes('');
  }, [newRefUrl, newRefType, newRefNotes]);

  // Remove reference video
  const removeReferenceVideo = useCallback((index: number) => {
    setScript(prev => ({
      ...prev,
      referenceVideos: prev.referenceVideos.filter((_, i) => i !== index),
    }));
  }, []);

  // Add pronunciation
  const addPronunciation = useCallback(() => {
    if (!newPronWord || !newPronPronunciation) return;

    setScript(prev => ({
      ...prev,
      pronunciations: [...prev.pronunciations, { word: newPronWord, pronunciation: newPronPronunciation }],
    }));

    setNewPronWord('');
    setNewPronPronunciation('');
  }, [newPronWord, newPronPronunciation]);

  // Remove pronunciation
  const removePronunciation = useCallback((index: number) => {
    setScript(prev => ({
      ...prev,
      pronunciations: prev.pronunciations.filter((_, i) => i !== index),
    }));
  }, []);

  // Update wardrobe for a character
  const updateWardrobe = useCallback((characterId: string, wardrobe: string) => {
    setScript(prev => ({
      ...prev,
      wardrobe: { ...prev.wardrobe, [characterId]: wardrobe },
    }));
  }, []);

  // Add prop
  const addProp = useCallback(() => {
    if (!newProp) return;
    setScript(prev => ({
      ...prev,
      props: [...prev.props, newProp],
    }));
    setNewProp('');
  }, [newProp]);

  // Remove prop
  const removeProp = useCallback((index: number) => {
    setScript(prev => ({
      ...prev,
      props: prev.props.filter((_, i) => i !== index),
    }));
  }, []);

  // Reset script
  const resetScript = useCallback(() => {
    if (confirm('Are you sure you want to reset? All data will be cleared.')) {
      setScript({
        id: generateId(),
        brandName: '',
        title: '',
        characters: DEFAULT_CHARACTERS.map(c => ({ ...c })),
        lines: [],
        referenceVideos: [],
        location: '',
        props: [],
        wardrobe: {},
        pronunciations: [],
      });
      setRawScriptText('');
      setClaimIssues([]);
      setActiveTab('input');
    }
  }, []);

  // Update line character assignment
  const updateLineCharacter = useCallback((lineId: string, characterId: string) => {
    setScript(prev => ({
      ...prev,
      lines: prev.lines.map(line =>
        line.id === lineId
          ? { ...line, characterId: characterId || undefined }
          : line
      ),
    }));
  }, []);

  // Update line content
  const updateLineContent = useCallback((lineId: string, content: string) => {
    setScript(prev => ({
      ...prev,
      lines: prev.lines.map(line =>
        line.id === lineId
          ? { ...line, content }
          : line
      ),
    }));
  }, []);

  // Update line type
  const updateLineType = useCallback((lineId: string, type: ScriptLine['type']) => {
    setScript(prev => ({
      ...prev,
      lines: prev.lines.map(line =>
        line.id === lineId
          ? { ...line, type, characterId: type === 'dialogue' ? line.characterId : undefined }
          : line
      ),
    }));
  }, []);

  // Copy formatted script
  const copyFormattedScript = useCallback(() => {
    const formatted = generateFormattedScript(script);
    navigator.clipboard.writeText(formatted);
    alert('Formatted script copied to clipboard!');
  }, [script]);

  // Copy actor script
  const copyActorScript = useCallback(() => {
    const actorScript = generateActorScript(script, selectedActorId);
    navigator.clipboard.writeText(actorScript);
    alert('Actor script copied to clipboard!');
  }, [script, selectedActorId]);

  // Run claims check
  const runClaimsCheck = useCallback(() => {
    const issues = checkClaims(script);
    setClaimIssues(issues);
    setActiveTab('claims');
  }, [script]);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">MTRX Script Formatter</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Professional script formatting with consistent character roles
            </p>
          </div>
          <button
            onClick={resetScript}
            className="px-4 py-2 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded-md hover:bg-red-50"
          >
            Reset All
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Script Info Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Script Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Brand Name *
              </label>
              <input
                type="text"
                value={script.brandName}
                onChange={(e) => setScript(prev => ({ ...prev, brandName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="e.g., Thompson Carter"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Script Title *
              </label>
              <input
                type="text"
                value={script.title}
                onChange={(e) => setScript(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="e.g., Product Discovery - Podcast Style"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Location
              </label>
              <input
                type="text"
                value={script.location}
                onChange={(e) => setScript(prev => ({ ...prev, location: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="e.g., Podcast Studio, Dentist Office"
              />
            </div>
          </div>
        </div>

        {/* Characters Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Characters</h2>
            <button
              onClick={addCharacter}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              + Add Character
            </button>
          </div>

          {/* Important rule reminder */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 mb-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Remember:</strong> HOST 1 is ALWAYS the Brand Ambassador/Expert. HOST 2 is ALWAYS the Discoverer/Skeptic.
              These roles are locked to ensure consistency across all scripts.
            </p>
          </div>

          <div className="space-y-3">
            {script.characters.map((character) => (
              <div
                key={character.id}
                className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md"
              >
                <div className="flex-1">
                  <input
                    type="text"
                    value={character.name}
                    onChange={(e) => updateCharacterName(character.id, e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-white font-mono uppercase"
                    placeholder="Character name"
                  />
                </div>
                <div className="flex-1">
                  <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                    character.role === 'brand_ambassador'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : character.role === 'discoverer'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200'
                  }`}>
                    {character.role === 'brand_ambassador' && '🎯 Brand Ambassador (HOST 1)'}
                    {character.role === 'discoverer' && '🔍 Discoverer/Skeptic (HOST 2)'}
                    {character.role === 'other' && '👤 Supporting Character'}
                  </span>
                </div>
                <div className="flex-1 text-sm text-gray-600 dark:text-gray-400">
                  {character.roleDescription}
                </div>
                {character.role === 'other' && (
                  <button
                    onClick={() => removeCharacter(character.id)}
                    className="px-2 py-1 text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Wardrobe Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Wardrobe</h2>
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md p-3 mb-4">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              <strong>Note:</strong> Ensure wardrobe matches the script requirements. If talent needs buttons/cuffs, don&apos;t specify a knitted sweater.
              Specific items (red slip dress, cowboy hat) must be sourced in advance.
            </p>
          </div>
          <div className="space-y-3">
            {script.characters.map((character) => (
              <div key={character.id} className="flex items-center gap-4">
                <span className="w-32 font-medium text-gray-700 dark:text-gray-300 uppercase text-sm">
                  {character.name}:
                </span>
                <input
                  type="text"
                  value={script.wardrobe[character.id] || ''}
                  onChange={(e) => updateWardrobe(character.id, e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="e.g., Business casual - button-down shirt with cuffs"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Props Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Props &amp; Products</h2>
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md p-3 mb-4">
            <p className="text-sm text-purple-800 dark:text-purple-200">
              <strong>Be explicit:</strong> Specify exact product SKUs, specific ingredients (shiitake mushrooms, not just &quot;mushrooms&quot;),
              and confirm product availability before the shoot.
            </p>
          </div>

          {script.props.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {script.props.map((prop, index) => (
                <span key={index} className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-sm">
                  {prop}
                  <button
                    onClick={() => removeProp(index)}
                    className="ml-1 text-purple-600 hover:text-purple-800"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <input
              type="text"
              value={newProp}
              onChange={(e) => setNewProp(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addProp()}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="e.g., Product bottle (SKU: ABC123), Shiitake mushrooms"
            />
            <button
              onClick={addProp}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              Add
            </button>
          </div>
        </div>

        {/* Reference Videos Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Reference Videos</h2>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 mb-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Reference vs Replication:</strong> Mark videos as &quot;Reference&quot; for general tone/vibe inspiration,
              or &quot;Replication&quot; if you want elements copied exactly.
            </p>
          </div>

          {/* Existing references */}
          {script.referenceVideos.length > 0 && (
            <div className="space-y-2 mb-4">
              {script.referenceVideos.map((ref, index) => (
                <div key={index} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                  <span className={`px-2 py-1 text-xs font-bold rounded ${
                    ref.type === 'replication'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200'
                  }`}>
                    {ref.type === 'replication' ? 'REPLICATE' : 'REFERENCE'}
                  </span>
                  <span className="flex-1 text-sm text-blue-600 dark:text-blue-400 truncate">{ref.url}</span>
                  {ref.notes && <span className="text-sm text-gray-500">({ref.notes})</span>}
                  <button
                    onClick={() => removeReferenceVideo(index)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new reference */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="url"
              value={newRefUrl}
              onChange={(e) => setNewRefUrl(e.target.value)}
              className="md:col-span-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Video URL"
            />
            <select
              value={newRefType}
              onChange={(e) => setNewRefType(e.target.value as 'reference' | 'replication')}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="reference">Reference (tone/vibe)</option>
              <option value="replication">Replication (copy exactly)</option>
            </select>
            <button
              onClick={addReferenceVideo}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add
            </button>
          </div>
          {newRefType === 'replication' && (
            <input
              type="text"
              value={newRefNotes}
              onChange={(e) => setNewRefNotes(e.target.value)}
              className="w-full mt-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="What specific elements should be replicated? (camera angles, framing, etc.)"
            />
          )}
        </div>

        {/* Pronunciations Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Pronunciations</h2>

          {script.pronunciations.length > 0 && (
            <div className="space-y-2 mb-4">
              {script.pronunciations.map((pron, index) => (
                <div key={index} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                  <span className="font-medium">{pron.word}</span>
                  <span className="text-gray-500">=</span>
                  <span className="text-green-600 dark:text-green-400">&quot;{pron.pronunciation}&quot;</span>
                  <button
                    onClick={() => removePronunciation(index)}
                    className="ml-auto text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <input
              type="text"
              value={newPronWord}
              onChange={(e) => setNewPronWord(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Word (e.g., GLP1)"
            />
            <input
              type="text"
              value={newPronPronunciation}
              onChange={(e) => setNewPronPronunciation(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Pronunciation (e.g., gee-el-pee-one)"
            />
            <button
              onClick={addPronunciation}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('input')}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                activeTab === 'input'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Script Input
            </button>
            <button
              onClick={() => setActiveTab('formatted')}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                activeTab === 'formatted'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Formatted Script
            </button>
            <button
              onClick={() => setActiveTab('actor')}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                activeTab === 'actor'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Actor Scripts
            </button>
            <button
              onClick={() => setActiveTab('claims')}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                activeTab === 'claims'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Claims Check {claimIssues.length > 0 && (
                <span className="ml-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-xs rounded-full">
                  {claimIssues.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('docx')}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                activeTab === 'docx'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Brief → .docx
            </button>
          </div>

          <div className="p-6">
            {/* Input Tab */}
            {activeTab === 'input' && (
              <div>
                {/* Google Doc URL Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Google Doc Link
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Paste a Google Docs link below. Make sure the doc is set to &quot;Anyone with the link can view&quot;.
                  </p>
                  <div className="flex gap-3">
                    <input
                      type="url"
                      value={docUrl}
                      onChange={(e) => { setDocUrl(e.target.value); setDocError(''); setDocLoaded(false); }}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="https://docs.google.com/document/d/your-doc-id/edit"
                    />
                    <button
                      onClick={fetchDoc}
                      disabled={docLoading}
                      className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {docLoading ? 'Loading...' : 'Pull Script'}
                    </button>
                  </div>
                  {docError && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{docError}</p>
                  )}
                  {docLoaded && !docError && (
                    <p className="mt-2 text-sm text-green-600 dark:text-green-400">✅ Script loaded from Google Doc</p>
                  )}
                </div>

                {/* Preview / Edit loaded content */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Script Content {docLoaded ? '(loaded from Doc — edit if needed)' : '(or paste manually)'}
                  </label>
                  <textarea
                    value={rawScriptText}
                    onChange={(e) => setRawScriptText(e.target.value)}
                    className="w-full h-96 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
                    placeholder={`Pull a script from Google Docs above, or paste directly here...

HOST 1
Hey everyone, welcome to today's episode!

HOST 2
Thanks for having me. I've been hearing a lot about this product.`}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={runClaimsCheck}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
                  >
                    Check Claims
                  </button>
                  <button
                    onClick={parseScript}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Parse & Format Script
                  </button>
                </div>
              </div>
            )}

            {/* Formatted Script Tab */}
            {activeTab === 'formatted' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Formatted Script</h3>
                  <button
                    onClick={copyFormattedScript}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Copy to Clipboard
                  </button>
                </div>

                {script.lines.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                    No script parsed yet. Go to &quot;Script Input&quot; to enter your script.
                  </p>
                ) : (
                  <div>
                    {/* Line editor */}
                    <div className="space-y-2 mb-6">
                      {script.lines.map((line) => (
                        <div key={line.id} className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                          <select
                            value={line.type}
                            onChange={(e) => updateLineType(line.id, e.target.value as ScriptLine['type'])}
                            className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-white"
                          >
                            <option value="dialogue">Dialogue</option>
                            <option value="direction">Direction</option>
                            <option value="parenthetical">Parenthetical</option>
                            <option value="scene_heading">Scene Heading</option>
                          </select>

                          {line.type === 'dialogue' && (
                            <select
                              value={line.characterId || ''}
                              onChange={(e) => updateLineCharacter(line.id, e.target.value)}
                              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-white"
                            >
                              <option value="">-- Select Character --</option>
                              {script.characters.map((char) => (
                                <option key={char.id} value={char.id}>
                                  {formatCharacterName(char.name)}
                                </option>
                              ))}
                            </select>
                          )}

                          <input
                            type="text"
                            value={line.content}
                            onChange={(e) => updateLineContent(line.id, e.target.value)}
                            className={`flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-600 dark:text-white ${
                              line.type === 'direction' ? 'italic text-gray-600 dark:text-gray-400' : ''
                            }`}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Preview */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Preview:</h4>
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                        {generateFormattedScript(script)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actor Scripts Tab */}
            {activeTab === 'actor' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Actor Script</h3>
                    <select
                      value={selectedActorId}
                      onChange={(e) => setSelectedActorId(e.target.value)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    >
                      {script.characters.map((char) => (
                        <option key={char.id} value={char.id}>
                          {formatCharacterName(char.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={copyActorScript}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Copy to Clipboard
                  </button>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 mb-4">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Actor scripts include: Brand name, script title, character role, wardrobe, pronunciations, and their lines only.
                    They exclude: location details, demographics, editor notes.
                  </p>
                </div>

                {script.lines.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                    No script parsed yet. Go to &quot;Script Input&quot; to enter your script.
                  </p>
                ) : (
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                    {generateActorScript(script, selectedActorId)}
                  </pre>
                )}
              </div>
            )}

            {/* Claims Check Tab */}
            {activeTab === 'claims' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Claims Check</h3>
                  <button
                    onClick={runClaimsCheck}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
                  >
                    Re-run Check
                  </button>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 mb-4">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Qualifiers to use:</strong> may, might, sometimes, often, could, can help, potentially, shown to
                  </p>
                </div>

                {claimIssues.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-2">✅</div>
                    <p className="text-green-600 dark:text-green-400 font-medium">No problematic claims detected!</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Your script appears to use appropriate qualifiers and avoid absolute claims.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {claimIssues.map((issue, index) => {
                      const line = script.lines.find(l => l.id === issue.lineId);
                      return (
                        <div
                          key={index}
                          className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md"
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-yellow-600 text-xl">⚠️</span>
                            <div className="flex-1">
                              <p className="font-medium text-yellow-800 dark:text-yellow-200">{issue.issue}</p>
                              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                                <strong>Suggestion:</strong> {issue.suggestion}
                              </p>
                              {line && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 italic">
                                  Line: &quot;{line.content}&quot;
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Brief to Docx Tab */}
            {activeTab === 'docx' && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Generate Actor Script (.docx) from Marketing Brief
                </h3>
                <BriefToDocx />
              </div>
            )}
          </div>
        </div>

        {/* Quick Reference Guide */}
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Reference Guide</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">Character Roles (LOCKED)</h3>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                <li><strong>HOST 1:</strong> Always Brand Ambassador/Expert</li>
                <li><strong>HOST 2:</strong> Always Discoverer/Skeptic</li>
                <li>You can rename them, but roles stay consistent</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">Script Formatting</h3>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                <li>Character names: ALL CAPS, centered</li>
                <li>Dialogue: Centered, own line</li>
                <li>Directions: Left-justified, italicized</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">Reference Videos</h3>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                <li><strong>Reference:</strong> General tone/vibe inspiration</li>
                <li><strong>Replication:</strong> Copy specific elements exactly</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">Claims to Avoid</h3>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                <li>&quot;patients&quot; → use &quot;clients&quot;</li>
                <li>&quot;lost X pounds&quot; → &quot;hit target weight&quot;</li>
                <li>&quot;cure&quot; → &quot;may help with&quot;</li>
                <li>&quot;guarantee&quot; → &quot;may&quot; or &quot;could&quot;</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
