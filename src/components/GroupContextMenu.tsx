import { useEffect, useRef } from "react";
import {
  PlugZap,
  FolderPlus,
  Pencil,
  Download,
  Trash2,
  Plus,
} from "lucide-react";
import { ConnectionGroup } from "../store/connections";

interface Props {
  group: ConnectionGroup;
  x: number;
  y: number;
  onClose: () => void;
  onEdit: () => void;
  onNewConnection: () => void;
  onNewGroup: () => void;
  onExportGroup: () => void;
  onDelete: () => void;
}

export function GroupContextMenu({
  group: _group,
  x,
  y,
  onClose,
  onEdit,
  onNewConnection,
  onNewGroup,
  onExportGroup,
  onDelete,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Adjust position to stay in viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuW = 200;
  const menuH = 220;
  const left = x + menuW > vw ? x - menuW : x;
  const top = y + menuH > vh ? y - menuH : y;

  const items = [
    {
      label: "New Connection",
      icon: <PlugZap className="h-3.5 w-3.5" />,
      action: onNewConnection,
    },
    {
      label: "New Group",
      icon: <FolderPlus className="h-3.5 w-3.5" />,
      action: onNewGroup,
    },
    { separator: true },
    {
      label: "Edit Group",
      icon: <Pencil className="h-3.5 w-3.5" />,
      action: onEdit,
    },
    { separator: true },
    {
      label: "Export this group",
      icon: <Download className="h-3.5 w-3.5" />,
      action: onExportGroup,
    },
    { separator: true },
    {
      label: "Delete Group",
      icon: <Trash2 className="h-3.5 w-3.5" />,
      action: onDelete,
      danger: true,
    },
  ] as const;

  return (
    <div
      ref={ref}
      className="fixed z-[100] min-w-48 bg-popover border border-border rounded-lg shadow-xl py-1 text-sm"
      style={{ left, top }}
    >
      {items.map((item, i) => {
        if ("separator" in item) {
          return <div key={i} className="my-1 border-t border-border/50" />;
        }
        return (
          <button
            key={item.label}
            onClick={() => { item.action(); onClose(); }}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors ${
              "danger" in item && item.danger
                ? "text-destructive hover:bg-destructive/10"
                : "hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <span className={"danger" in item && item.danger ? "text-destructive" : "text-muted-foreground"}>
              {item.icon}
            </span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// Re-export Plus for convenience (used in parent for "New Connection in group" badge)
export { Plus };
