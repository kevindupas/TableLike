import { useRef } from "react";
import { X } from "lucide-react";
import { useTabStore, Tab } from "../store/tabs";

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  if (tabs.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="flex items-end overflow-x-auto border-b bg-muted/20 shrink-0"
      style={{ scrollbarWidth: "none" }}
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onActivate={() => setActiveTab(tab.id)}
          onClose={() => closeTab(tab.id)}
        />
      ))}
    </div>
  );
}

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
}

function TabItem({ tab, isActive, onActivate, onClose }: TabItemProps) {
  return (
    <div
      className={`group flex items-center gap-1.5 px-3 py-2 border-r text-sm cursor-pointer shrink-0 select-none transition-colors ${
        isActive
          ? "bg-background text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
      }`}
      onClick={onActivate}
    >
      <span className="max-w-32 truncate">{tab.table}</span>
      {tab.loading && (
        <span className="text-xs text-muted-foreground animate-pulse">…</span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity ml-0.5 rounded"
        aria-label={`Close ${tab.table}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
