import CodeMirror from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";

interface Props {
  value: string;
  onChange: (val: string) => void;
  onRun: () => void;
  loading?: boolean;
}

export function SqlEditor({ value, onChange, onRun, loading }: Props) {
  return (
    <div className="border rounded-md overflow-hidden">
      <CodeMirror
        value={value}
        height="140px"
        extensions={[sql()]}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
        }}
        className="text-sm"
      />
      <div className="flex items-center gap-2 px-3 py-2 border-t bg-muted/30">
        <button
          onClick={onRun}
          disabled={loading}
          className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Running..." : "▶ Run"}
        </button>
        <span className="text-xs text-muted-foreground">⌘↵ to run</span>
      </div>
    </div>
  );
}
