import { useRef } from "react";
import { Upload, X } from "lucide-react";
import { resizeToBase64 } from "../lib/image";
import { GroupAvatar } from "./GroupAvatar";

interface IconPickerProps {
  name: string;
  color: string;
  icon: string | undefined;
  onChange: (icon: string | undefined) => void;
}

export function IconPicker({ name, color, icon, onChange }: IconPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await resizeToBase64(file, 64);
      onChange(b64);
    } catch {
      // ignore failed reads
    }
    e.target.value = "";
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
        <GroupAvatar name={name || "?"} color={color} icon={icon} size={40} />
        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Upload className="h-4 w-4 text-white" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
        >
          {icon ? "Change image" : "Upload image"}
        </button>
        {icon && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-xs text-destructive hover:text-destructive/80 transition-colors flex items-center gap-1 text-left"
          >
            <X className="h-3 w-3" />Remove
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
