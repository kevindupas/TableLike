import { useEffect, useRef, useState } from "react";
import {
  PlugZap,
  Plus,
  FolderPlus,
  Link,
  Pencil,
  Copy,
  ClipboardCopy,
  ArrowUpDown,
  Download,
  Upload,
  Trash2,
  ChevronRight,
  Check,
} from "lucide-react";
import { Connection, SortBy } from "../store/connections";

interface Props {
  conn: Connection;
  x: number;
  y: number;
  onClose: () => void;
  onConnect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onNewConnection: () => void;
  onNewGroup: () => void;
  onSortBy: (s: SortBy) => void;
  currentSort: SortBy;
  onImport: () => void;
  onExportAll: () => void;
  onExportGroup: () => void;
  onExportSingle: () => void;
}

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  action?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  submenu?: SubItem[];
}

interface SubItem {
  label: string;
  icon?: React.ReactNode;
  action?: () => void;
  disabled?: boolean;
}

export function ConnectionContextMenu({
  conn,
  x,
  y,
  onClose,
  onConnect,
  onEdit,
  onDuplicate,
  onDelete,
  onNewConnection,
  onNewGroup,
  onSortBy,
  currentSort,
  onImport,
  onExportAll,
  onExportGroup,
  onExportSingle,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setAdjustedPos({
      x: x + rect.width > vw ? x - rect.width : x,
      y: y + rect.height > vh ? y - rect.height : y,
    });
  }, [x, y]);

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

  function copyAsUrl() {
    const { type, username, host, port, database } = conn;
    const url =
      type === "sqlite"
        ? `sqlite://${database}`
        : `${type}://${username}@${host}:${port}/${database}`;
    navigator.clipboard.writeText(url).catch(() => {});
    onClose();
  }

  const items: MenuItem[] = [
    {
      label: "Connect",
      icon: <PlugZap className="h-3.5 w-3.5" />,
      action: () => { onConnect(); onClose(); },
    },
    { separator: true, label: "" },
    {
      label: "New",
      icon: <Plus className="h-3.5 w-3.5" />,
      submenu: [
        {
          label: "Connection",
          icon: <PlugZap className="h-3.5 w-3.5" />,
          action: () => { onNewConnection(); onClose(); },
        },
        {
          label: "Group",
          icon: <FolderPlus className="h-3.5 w-3.5" />,
          action: () => { onNewGroup(); onClose(); },
        },
        {
          label: "Connection from URL",
          icon: <Link className="h-3.5 w-3.5" />,
          disabled: true,
        },
      ],
    },
    {
      label: "Edit",
      icon: <Pencil className="h-3.5 w-3.5" />,
      action: () => { onEdit(); onClose(); },
    },
    {
      label: "Duplicate",
      icon: <Copy className="h-3.5 w-3.5" />,
      action: () => { onDuplicate(); onClose(); },
    },
    {
      label: "Copy as URL",
      icon: <ClipboardCopy className="h-3.5 w-3.5" />,
      action: copyAsUrl,
    },
    { separator: true, label: "" },
    {
      label: "Sort By",
      icon: <ArrowUpDown className="h-3.5 w-3.5" />,
      submenu: [
        {
          label: "Name",
          icon: currentSort === "name" ? <Check className="h-3.5 w-3.5" /> : undefined,
          action: () => { onSortBy(currentSort === "name" ? "none" : "name"); onClose(); },
        },
        {
          label: "Driver",
          icon: currentSort === "driver" ? <Check className="h-3.5 w-3.5" /> : undefined,
          action: () => { onSortBy(currentSort === "driver" ? "none" : "driver"); onClose(); },
        },
        {
          label: "Tag",
          icon: currentSort === "tag" ? <Check className="h-3.5 w-3.5" /> : undefined,
          action: () => { onSortBy(currentSort === "tag" ? "none" : "tag"); onClose(); },
        },
      ],
    },
    { separator: true, label: "" },
    {
      label: "Import Connection",
      icon: <Upload className="h-3.5 w-3.5" />,
      action: () => { onImport(); onClose(); },
    },
    {
      label: "Export Connection",
      icon: <Download className="h-3.5 w-3.5" />,
      submenu: [
        {
          label: "Export All",
          action: () => { onExportAll(); onClose(); },
        },
        {
          label: "Export this group",
          action: () => { onExportGroup(); onClose(); },
          disabled: !conn.groupId,
        },
        {
          label: "Export this connection",
          action: () => { onExportSingle(); onClose(); },
        },
      ],
    },
    { separator: true, label: "" },
    {
      label: "Delete",
      icon: <Trash2 className="h-3.5 w-3.5" />,
      danger: true,
      action: () => { onDelete(); onClose(); },
    },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-[100] min-w-52 bg-popover border border-border rounded-lg shadow-xl py-1 text-sm"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="my-1 border-t border-border/50" />;
        }

        if (item.submenu) {
          const isOpen = openSubmenu === item.label;
          return (
            <div
              key={item.label}
              className="relative"
              onMouseEnter={() => setOpenSubmenu(item.label)}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground transition-colors">
                {item.icon && <span className="text-muted-foreground">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {isOpen && (
                <div className="absolute left-full top-0 min-w-44 bg-popover border border-border rounded-lg shadow-xl py-1">
                  {item.submenu.map((sub) => (
                    <button
                      key={sub.label}
                      disabled={sub.disabled}
                      onClick={() => { sub.action?.(); }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {sub.icon
                        ? <span className="text-muted-foreground">{sub.icon}</span>
                        : <span className="w-3.5" />
                      }
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return (
          <button
            key={item.label}
            disabled={item.disabled}
            onClick={item.action}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              item.danger
                ? "text-destructive hover:bg-destructive/10"
                : "hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {item.icon && (
              <span className={item.danger ? "text-destructive" : "text-muted-foreground"}>
                {item.icon}
              </span>
            )}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
