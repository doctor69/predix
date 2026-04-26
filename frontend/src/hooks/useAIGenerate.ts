import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export interface AISuggestion {
  question: string;
  category: string;
  resolutionSource: string;
  closingTime: string;   // ISO 8601
  resolutionTime: string; // ISO 8601
  rationale: string;
}

interface GenerateOptions {
  topic?: string;
  category?: string;
  count?: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://predix-api.predix.xyz';

export function useAIGenerate() {
  const { getAccessToken } = usePrivy();
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (opts: GenerateOptions = {}) => {
      setIsLoading(true);
      setError(null);
      setSuggestions([]);

      try {
        const token = await getAccessToken();
        const res = await fetch(`${API_URL}/api/agent/generate-questions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            topic: opts.topic || undefined,
            category: opts.category || undefined,
            count: opts.count ?? 5,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
        }

        const data = await res.json() as { questions: AISuggestion[] };
        setSuggestions(data.questions ?? []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'AI generation failed');
      } finally {
        setIsLoading(false);
      }
    },
    [getAccessToken],
  );

  return { generate, suggestions, isLoading, error };
}
