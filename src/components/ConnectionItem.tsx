import { Connection } from "../store/connections";

const DB_LABELS: Record<string, string> = {
  postgresql: "Pg",
  mysql: "My",
  sqlite: "Sl",
};

interface Props {
  connection: Connection;
  isActive: boolean;
  isConnected?: boolean;
  onClick: () => void;
}

export function ConnectionItem({ connection, isActive, isConnected, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-3 py-2 rounded-md text-left transition-colors ${
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      <div className="relative w-8 h-8 shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: connection.color }}
        >
          {DB_LABELS[connection.type]}
        </div>
        {isConnected && (
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
        )}
      </div>
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{connection.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {connection.type === "sqlite"
            ? connection.database
            : `${connection.host}:${connection.port}`}
        </div>
      </div>
    </button>
  );
}
