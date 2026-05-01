import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "./ui/button";

export function Toolbar() {
  const { theme, setTheme } = useTheme();

  const resolvedTheme = theme ?? "system";

  function cycleTheme() {
    if (resolvedTheme === "light") setTheme("dark");
    else if (resolvedTheme === "dark") setTheme("system");
    else setTheme("light");
  }

  return (
    <div className="h-9 border-b flex items-center justify-between px-3 shrink-0 bg-background">
      <span className="font-semibold text-sm tracking-tight">TableLike</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={cycleTheme}
        title={`Theme: ${resolvedTheme}`}
      >
        {resolvedTheme === "dark" ? (
          <Moon className="h-4 w-4" />
        ) : resolvedTheme === "light" ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Monitor className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
