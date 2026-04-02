import { Bell } from "lucide-react";

interface AppHeaderProps {
  currentProjectName: string;
}

export function AppHeader({ currentProjectName }: AppHeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6 shrink-0 z-10">
      <div className="flex items-center gap-4 text-sm">
        <span className="font-medium text-gray-500">Workspace</span>
        <span className="text-gray-300">/</span>
        <span className="flex items-center gap-2 font-semibold text-gray-900">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          {currentProjectName}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative text-gray-400 hover:text-gray-600">
          <Bell size={18} />
          <span className="absolute right-0 top-0 h-2 w-2 rounded-full border-2 border-white bg-red-500" />
        </button>
      </div>
    </header>
  );
}
