import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ProductData,
  ProductAnalysis,
  JobStatus,
  GenerationSession,
  ApiKeyEntry,
  GeminiModelChoice,
} from '@shared/types';

export interface AppStore {
  // Product slice
  productData: ProductData | null;
  selectedImages: string[];
  isScrapingLoading: boolean;
  scrapeError: string | null;
  setProductData: (data: ProductData | null) => void;
  setSelectedImages: (images: string[]) => void;
  toggleImageSelection: (imageUrl: string) => void;
  setScrapeLoading: (loading: boolean) => void;
  setScrapeError: (error: string | null) => void;

  // Generation slice
  mode: 'image' | 'video';
  videoDuration: number;
  prompts: string[];
  analysis: ProductAnalysis | null;
  activeJobId: string | null;
  jobStatus: JobStatus | null;
  isGenerating: boolean;
  generateError: string | null;
  setMode: (mode: 'image' | 'video') => void;
  setVideoDuration: (duration: number) => void;
  setPrompts: (prompts: string[]) => void;
  setAnalysis: (analysis: ProductAnalysis | null) => void;
  setActiveJobId: (jobId: string | null) => void;
  setJobStatus: (status: JobStatus | null) => void;
  setIsGenerating: (generating: boolean) => void;
  setGenerateError: (error: string | null) => void;

  // Gallery slice
  sessions: GenerationSession[];
  addSession: (session: GenerationSession) => void;

  // Settings slice (persisted to localStorage)
  geminiKeys: ApiKeyEntry[];
  geminiModel: GeminiModelChoice;
  scenarioApiKey: string;
  scenarioApiSecret: string;
  scenarioKeyValid: boolean;
  setGeminiKeys: (keys: ApiKeyEntry[]) => void;
  setGeminiModel: (model: GeminiModelChoice) => void;
  setScenarioApiKey: (key: string) => void;
  setScenarioApiSecret: (secret: string) => void;
  setScenarioKeyValid: (valid: boolean) => void;

  // Reset actions
  resetProduct: () => void;
  resetGeneration: () => void;
}

const initialProductState = {
  productData: null as ProductData | null,
  selectedImages: [] as string[],
  isScrapingLoading: false,
  scrapeError: null as string | null,
};

const initialGenerationState = {
  mode: 'image' as const,
  videoDuration: 5,
  prompts: [] as string[],
  analysis: null as ProductAnalysis | null,
  activeJobId: null as string | null,
  jobStatus: null as JobStatus | null,
  isGenerating: false,
  generateError: null as string | null,
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Product slice - initial state
      ...initialProductState,

      setProductData: (data) => set({ productData: data }),
      setSelectedImages: (images) => set({ selectedImages: images }),
      toggleImageSelection: (imageUrl) => {
        const { selectedImages } = get();
        const isSelected = selectedImages.includes(imageUrl);

        if (isSelected) {
          // Prevent going below 1 selected image
          if (selectedImages.length <= 1) return;
          set({ selectedImages: selectedImages.filter((url) => url !== imageUrl) });
        } else {
          // Prevent going above 10 selected images
          if (selectedImages.length >= 10) return;
          set({ selectedImages: [...selectedImages, imageUrl] });
        }
      },
      setScrapeLoading: (loading) => set({ isScrapingLoading: loading }),
      setScrapeError: (error) => set({ scrapeError: error }),

      // Generation slice - initial state
      ...initialGenerationState,

      setMode: (mode) => set({ mode }),
      setVideoDuration: (duration) => set({ videoDuration: duration }),
      setPrompts: (prompts) => set({ prompts }),
      setAnalysis: (analysis) => set({ analysis }),
      setActiveJobId: (jobId) => set({ activeJobId: jobId }),
      setJobStatus: (status) => set({ jobStatus: status }),
      setIsGenerating: (generating) => set({ isGenerating: generating }),
      setGenerateError: (error) => set({ generateError: error }),

      // Gallery slice
      sessions: [],
      addSession: (session) =>
        set((state) => ({ sessions: [session, ...state.sessions] })),

      // Settings slice
      geminiKeys: [],
      geminiModel: 'gemini-2.5-flash',
      scenarioApiKey: '',
      scenarioApiSecret: '',
      scenarioKeyValid: false,
      setGeminiKeys: (keys) => set({ geminiKeys: keys }),
      setGeminiModel: (model) => set({ geminiModel: model }),
      setScenarioApiKey: (key) => set({ scenarioApiKey: key }),
      setScenarioApiSecret: (secret) => set({ scenarioApiSecret: secret }),
      setScenarioKeyValid: (valid) => set({ scenarioKeyValid: valid }),

      // Reset actions
      resetProduct: () => set(initialProductState),
      resetGeneration: () => set(initialGenerationState),
    }),
    {
      name: 'ugc-app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Persist settings slice
        geminiKeys: state.geminiKeys,
        geminiModel: state.geminiModel,
        scenarioApiKey: state.scenarioApiKey,
        scenarioApiSecret: state.scenarioApiSecret,
        scenarioKeyValid: state.scenarioKeyValid,
        // Persist gallery sessions
        sessions: state.sessions,
      }),
    }
  )
);
