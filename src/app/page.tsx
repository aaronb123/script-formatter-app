'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

const ActorScriptGenerator = dynamic(() => import('@/components/ActorScriptGenerator'), { ssr: false });

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">MTRX Actor Script Generator</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Paste Google Doc link → Download formatted .docx for actors
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <ActorScriptGenerator />
      </div>
    </main>
  );
}
