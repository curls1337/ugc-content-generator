import { useLocation } from 'react-router-dom';
import { Check } from 'lucide-react';

interface Step {
  label: string;
  path: string;
}

const steps: Step[] = [
  { label: 'Scrape', path: '/' },
  { label: 'Select', path: '/select' },
  { label: 'Generate', path: '/generate' },
  { label: 'Gallery', path: '/gallery' },
];

export default function WorkflowStepper() {
  const location = useLocation();

  const currentIndex = steps.findIndex((step) => step.path === location.pathname);

  return (
    <nav
      aria-label="Workflow progress"
      className="flex items-center gap-2 px-6 py-3 border-b border-zinc-800"
    >
      {steps.map((step, index) => {
        const isCompleted = currentIndex > index;
        const isCurrent = currentIndex === index;

        return (
          <div key={step.path} className="flex items-center">
            <div className="flex items-center gap-1.5">
              {/* Step indicator */}
              <span
                className={`
                  flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium
                  ${isCompleted ? 'bg-accent text-white' : ''}
                  ${isCurrent ? 'bg-accent/20 text-accent ring-2 ring-accent' : ''}
                  ${!isCompleted && !isCurrent ? 'bg-zinc-800 text-zinc-500' : ''}
                `}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>

              {/* Step label */}
              <span
                className={`
                  text-sm font-medium
                  ${isCurrent ? 'text-zinc-100' : ''}
                  ${isCompleted ? 'text-zinc-300' : ''}
                  ${!isCompleted && !isCurrent ? 'text-zinc-500' : ''}
                `}
              >
                {step.label}
              </span>
            </div>

            {/* Connector */}
            {index < steps.length - 1 && (
              <div
                className={`
                  w-8 h-px mx-2
                  ${isCompleted ? 'bg-accent' : 'bg-zinc-700'}
                `}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
