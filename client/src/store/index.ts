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

      setProductData: (data: ProductData | null) => set({ productData: data }),
      setSelectedImages: (images: string[]) => set({ selectedImages: images }),
      toggleImageSelection: (imageUrl: string) => {
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
      setScrapeLoading: (loading: boolean) => set({ isScrapingLoading: loading }),
      setScrapeError: (error: string | null) => set({ scrapeError: error }),

      // Generation slice - initial state
      ...initialGenerationState,

      setMode: (mode: 'image' | 'video') => set({ mode }),
      setVideoDuration: (duration: number) => set({ videoDuration: duration }),
      setPrompts: (prompts: string[]) => set({ prompts }),
      setAnalysis: (analysis: ProductAnalysis | null) => set({ analysis }),
      setActiveJobId: (jobId: string | null) => set({ activeJobId: jobId }),
      setJobStatus: (status: JobStatus | null) => set({ jobStatus: status }),
      setIsGenerating: (generating: boolean) => set({ isGenerating: generating }),
      setGenerateError: (error: string | null) => set({ generateError: error }),

      // Gallery slice
      sessions: [],
      addSession: (session: GenerationSession) =>
        set((state: AppStore) => ({ sessions: [session, ...state.sessions] })),

      // Settings slice
      geminiKeys: [],
      geminiModel: 'gemini-2.5-flash' as GeminiModelChoice,
      scenarioApiKey: '',
      scenarioApiSecret: '',
      scenarioKeyValid: false,
      setGeminiKeys: (keys: ApiKeyEntry[]) => set({ geminiKeys: keys }),
      setGeminiModel: (model: GeminiModelChoice) => set({ geminiModel: model }),
      setScenarioApiKey: (key: string) => set({ scenarioApiKey: key }),
      setScenarioApiSecret: (secret: string) => set({ scenarioApiSecret: secret }),
      setScenarioKeyValid: (valid: boolean) => set({ scenarioKeyValid: valid }),

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
