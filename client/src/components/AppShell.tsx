import { NavLink, Outlet } from 'react-router-dom';
import { Search, Image, Sparkles, Film, Settings } from 'lucide-react';
import WorkflowStepper from './WorkflowStepper';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const navItems: NavItem[] = [
  { to: '/', icon: Search, label: 'Scrape' },
  { to: '/select', icon: Image, label: 'Select Images' },
  { to: '/generate', icon: Sparkles, label: 'Generate' },
  { to: '/gallery', icon: Film, label: 'Gallery' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Sidebar - hidden on mobile */}
      <aside className="hidden md:flex flex-col w-16 bg-surface border-r border-zinc-800">
        <div className="flex items-center justify-center h-14 border-b border-zinc-800">
          <span className="text-accent font-bold text-lg" aria-hidden="true">U</span>
        </div>
        <nav className="flex-1 flex flex-col items-center gap-1 py-3" aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center justify-center w-10 h-10 rounded-lg transition-colors
                ${isActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-hover'
                }`
              }
              title={item.label}
              aria-label={item.label}
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Workflow stepper at top */}
        <WorkflowStepper />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Bottom nav - visible on mobile only */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 bg-surface border-t border-zinc-800 z-50"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md transition-colors
                ${isActive
                  ? 'text-accent'
                  : 'text-zinc-400 hover:text-zinc-200'
                }`
              }
              aria-label={item.label}
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
