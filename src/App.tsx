import { ConnectionList } from "./components/ConnectionList";

function App() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <ConnectionList />
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a connection to get started</p>
      </div>
    </div>
  );
}

export default App;
