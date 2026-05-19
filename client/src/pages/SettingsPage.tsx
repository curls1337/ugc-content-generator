import { useState, useCallback } from 'react';
import { useAppStore } from '../store';
import {
  Key,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { validateGeminiKey, validateScenarioKey } from '../api/client';
import type { ApiKeyEntry, GeminiModelChoice } from '@shared/types';

export default function SettingsPage() {
  const {
    geminiKeys,
    geminiModel,
    scenarioApiKey,
    scenarioApiSecret,
    scenarioKeyValid,
    setGeminiKeys,
    setGeminiModel,
    setScenarioApiKey,
    setScenarioApiSecret,
    setScenarioKeyValid,
  } = useAppStore();

  // Local state for Gemini keys textarea
  const [keysText, setKeysText] = useState(() =>
    geminiKeys.map((k) => k.key).join('\n')
  );
  const [isValidatingGemini, setIsValidatingGemini] = useState(false);

  // Local state for Scenario inputs
  const [localScenarioKey, setLocalScenarioKey] = useState(scenarioApiKey);
  const [localScenarioSecret, setLocalScenarioSecret] = useState(scenarioApiSecret);
  const [isValidatingScenario, setIsValidatingScenario] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [showScenarioKey, setShowScenarioKey] = useState(false);
  const [showScenarioSecret, setShowScenarioSecret] = useState(false);

  // Count valid keys
  const validKeyCount = geminiKeys.filter((k) => k.valid).length;
  const hasNoValidKeys = geminiKeys.length === 0 || validKeyCount === 0;

  // Parse keys from textarea
  const parseKeys = (text: string): string[] => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 20);
  };

  // Validate Gemini keys
  const handleValidateGemini = useCallback(async () => {
    const keys = parseKeys(keysText);
    if (keys.length === 0) {
      setGeminiKeys([]);
      return;
    }

    setIsValidatingGemini(true);

    const results: ApiKeyEntry[] = await Promise.all(
      keys.map(async (key) => {
        const data = await validateGeminiKey(key);
        return {
          key,
          valid: data.valid === true,
          lastChecked: Date.now(),
          lastError: data.valid ? undefined : data.error || 'Validation failed',
        };
      })
    );

    setGeminiKeys(results);
    setIsValidatingGemini(false);
  }, [keysText, setGeminiKeys]);

  // Validate Scenario credentials
  const handleValidateScenario = useCallback(async () => {
    const trimmedKey = localScenarioKey.trim();
    const trimmedSecret = localScenarioSecret.trim();

    if (!trimmedKey || !trimmedSecret) {
      setScenarioError('Both API Key and API Secret are required');
      return;
    }

    setIsValidatingScenario(true);
    setScenarioError(null);

    const data = await validateScenarioKey(trimmedKey, trimmedSecret);

    if (data.valid) {
      setScenarioApiKey(trimmedKey);
      setScenarioApiSecret(trimmedSecret);
      setScenarioKeyValid(true);
      setScenarioError(null);
    } else {
      setScenarioKeyValid(false);
      setScenarioError(data.error || 'Invalid credentials');
    }

    setIsValidatingScenario(false);
  }, [localScenarioKey, localScenarioSecret, setScenarioApiKey, setScenarioApiSecret, setScenarioKeyValid]);

  // Clear Scenario credentials
  const handleClearScenario = useCallback(() => {
    setLocalScenarioKey('');
    setLocalScenarioSecret('');
    setScenarioApiKey('');
    setScenarioApiSecret('');
    setScenarioKeyValid(false);
    setScenarioError(null);
  }, [setScenarioApiKey, setScenarioApiSecret, setScenarioKeyValid]);

  // Handle model change
  const handleModelChange = (model: GeminiModelChoice) => {
    setGeminiModel(model);
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Settings</h1>
        <p className="mt-1 text-zinc-400">Configure your API keys and preferences.</p>
      </div>

      {/* Warning banner when no valid keys */}
      {hasNoValidKeys && (
        <div
          className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30"
          role="alert"
        >
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-amber-300">No valid API keys configured</p>
            <p className="text-sm text-amber-400/80 mt-0.5">
              You need at least one valid Gemini API key and valid Scenario credentials to generate content.
            </p>
          </div>
        </div>
      )}

      {/* Gemini API Keys Section */}
      <section className="rounded-xl bg-surface border border-zinc-800 p-5" aria-labelledby="gemini-keys-heading">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-5 h-5 text-accent" aria-hidden="true" />
          <h2 id="gemini-keys-heading" className="text-lg font-medium text-zinc-100">
            Gemini API Keys
          </h2>
        </div>

        <p className="text-sm text-zinc-400 mb-3">
          Enter up to 20 API keys, one per line. Keys are rotated automatically to avoid rate limits.
        </p>

        <textarea
          className="w-full h-40 px-3 py-2 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm font-mono placeholder-zinc-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y"
          placeholder={"AIzaSy...\nAIzaSy...\nAIzaSy..."}
          value={keysText}
          onChange={(e) => setKeysText(e.target.value)}
          aria-label="Gemini API keys, one per line"
          spellCheck={false}
        />

        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handleValidateGemini}
            disabled={isValidatingGemini || parseKeys(keysText).length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isValidatingGemini ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Shield className="w-4 h-4" aria-hidden="true" />
            )}
            {isValidatingGemini ? 'Validating...' : 'Validate Keys'}
          </button>

          {geminiKeys.length > 0 && (
            <span className="text-sm text-zinc-400">
              {validKeyCount}/{geminiKeys.length} valid
            </span>
          )}
        </div>

        {/* Validation results */}
        {geminiKeys.length > 0 && (
          <div className="mt-4 space-y-2" aria-label="Key validation results">
            {geminiKeys.map((entry, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 px-3 py-2 rounded-md text-sm ${
                  entry.valid
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : 'bg-red-500/10 border border-red-500/20'
                }`}
              >
                {entry.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-zinc-300 break-all">
                    {entry.key.slice(0, 10)}...{entry.key.slice(-4)}
                  </span>
                  {entry.valid ? (
                    <span className="ml-2 text-emerald-400">✓ Valid</span>
                  ) : (
                    <span className="ml-2 text-red-400">✗ {entry.lastError || 'Invalid'}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Gemini Model Selector */}
      <section className="rounded-xl bg-surface border border-zinc-800 p-5" aria-labelledby="gemini-model-heading">
        <h2 id="gemini-model-heading" className="text-lg font-medium text-zinc-100 mb-3">
          Gemini Model
        </h2>
        <p className="text-sm text-zinc-400 mb-4">
          Select the Gemini model used for prompt generation.
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => handleModelChange('gemini-2.5-flash')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              geminiModel === 'gemini-2.5-flash'
                ? 'bg-accent text-white'
                : 'bg-bg border border-zinc-700 text-zinc-300 hover:border-zinc-500'
            }`}
            aria-pressed={geminiModel === 'gemini-2.5-flash'}
          >
            gemini-2.5-flash
          </button>
          <button
            onClick={() => handleModelChange('gemini-3.0-flash')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              geminiModel === 'gemini-3.0-flash'
                ? 'bg-accent text-white'
                : 'bg-bg border border-zinc-700 text-zinc-300 hover:border-zinc-500'
            }`}
            aria-pressed={geminiModel === 'gemini-3.0-flash'}
          >
            gemini-3.0-flash
          </button>
        </div>
      </section>

      {/* Scenario API Section */}
      <section className="rounded-xl bg-surface border border-zinc-800 p-5" aria-labelledby="scenario-heading">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-accent" aria-hidden="true" />
          <h2 id="scenario-heading" className="text-lg font-medium text-zinc-100">
            Scenario API
          </h2>
          {scenarioKeyValid && (
            <span className="ml-auto inline-flex items-center gap-1 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Valid
            </span>
          )}
          {!scenarioKeyValid && scenarioApiKey && (
            <span className="ml-auto inline-flex items-center gap-1 text-sm text-red-400">
              <XCircle className="w-4 h-4" aria-hidden="true" />
              Invalid
            </span>
          )}
        </div>

        <p className="text-sm text-zinc-400 mb-4">
          Enter your Scenario API credentials for image and video generation.
        </p>

        <div className="space-y-3">
          {/* API Key */}
          <div>
            <label htmlFor="scenario-key" className="block text-sm font-medium text-zinc-300 mb-1">
              API Key
            </label>
            <div className="relative">
              <input
                id="scenario-key"
                type={showScenarioKey ? 'text' : 'password'}
                className="w-full px-3 py-2 pr-10 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm font-mono placeholder-zinc-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="Enter Scenario API Key"
                value={localScenarioKey}
                onChange={(e) => setLocalScenarioKey(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowScenarioKey(!showScenarioKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-1"
                aria-label={showScenarioKey ? 'Hide API key' : 'Show API key'}
              >
                {showScenarioKey ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* API Secret */}
          <div>
            <label htmlFor="scenario-secret" className="block text-sm font-medium text-zinc-300 mb-1">
              API Secret
            </label>
            <div className="relative">
              <input
                id="scenario-secret"
                type={showScenarioSecret ? 'text' : 'password'}
                className="w-full px-3 py-2 pr-10 rounded-lg bg-bg border border-zinc-700 text-zinc-200 text-sm font-mono placeholder-zinc-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="Enter Scenario API Secret"
                value={localScenarioSecret}
                onChange={(e) => setLocalScenarioSecret(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowScenarioSecret(!showScenarioSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-1"
                aria-label={showScenarioSecret ? 'Hide API secret' : 'Show API secret'}
              >
                {showScenarioSecret ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Error message */}
          {scenarioError && (
            <p className="text-sm text-red-400 flex items-center gap-1.5">
              <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              {scenarioError}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleValidateScenario}
              disabled={isValidatingScenario || (!localScenarioKey.trim() && !localScenarioSecret.trim())}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isValidatingScenario ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Shield className="w-4 h-4" aria-hidden="true" />
              )}
              {isValidatingScenario ? 'Validating...' : 'Validate'}
            </button>

            <button
              onClick={handleClearScenario}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-bg border border-zinc-700 text-zinc-300 text-sm font-medium hover:border-zinc-500 hover:text-zinc-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              Clear
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
