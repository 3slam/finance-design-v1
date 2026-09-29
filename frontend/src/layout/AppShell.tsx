import LeftPanel from '../actors/LeftPanel.js';
import DetailsPanel from '../details/DetailsPanel.js';
import TimelineBar from '../timeline/TimelineBar.js';
import CenterPanel from './CenterPanel.js';
import TopBar from './TopBar.js';

export default function AppShell() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0 text-slate-100">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 shrink-0">
          <LeftPanel />
        </div>
        <div className="min-w-0 flex-1">
          <CenterPanel />
        </div>
        <div className="w-80 shrink-0">
          <DetailsPanel />
        </div>
      </div>
      <div className="h-56 shrink-0">
        <TimelineBar />
      </div>
    </div>
  );
}
