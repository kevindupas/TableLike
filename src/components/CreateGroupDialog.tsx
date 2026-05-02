import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const GROUP_COLORS = [
  "#6b7280", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
  "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, color: string) => void;
}

export function CreateGroupDialog({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(GROUP_COLORS[0]);

  if (!open) return null;

  function handleCreate() {
    if (!name.trim()) return;
    onCreate(name.trim(), color);
    setName("");
    setColor(GROUP_COLORS[0]);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background border rounded-xl shadow-2xl w-80 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-medium">New Group</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Group name</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="My group"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <div className="flex flex-wrap gap-2">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-between px-4 py-3 border-t">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="px-4 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
