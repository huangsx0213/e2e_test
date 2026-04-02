import { Loader2 } from "lucide-react";

export function AppLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-blue-600" size={40} />
        <p className="animate-pulse font-medium text-gray-500">
          Loading workspace data...
        </p>
      </div>
    </div>
  );
}
