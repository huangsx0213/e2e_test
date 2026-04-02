import React, { useState } from "react";
import { ExecutionLog } from "@/shared/types";
import { X } from "lucide-react";

interface ExecutionLogsProps {
  logs: ExecutionLog[];
}

export const ExecutionLogs: React.FC<ExecutionLogsProps> = ({ logs }) => {
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  return (
    <>
      <div className="space-y-2 flex-1">
        {logs.map((log, idx) => (
          <div
            key={idx}
            className="animate-in fade-in slide-in-from-left-2 duration-200"
          >
            <div
              className={`flex gap-3 text-xs leading-relaxed ${log.status === "FAIL" ? "text-red-400" : "text-slate-400"}`}
            >
              <span className="text-slate-600 shrink-0 select-none w-16">
                [{new Date(log.timestamp).toLocaleTimeString().split(" ")[0]}]
              </span>
              <span
                className={
                  log.message.includes("🚀") || log.message.includes("🎬")
                    ? "text-blue-400 font-bold"
                    : log.message.includes("✅") ||
                        log.message.includes("Completed Successfully")
                      ? "text-emerald-400"
                      : log.message.includes("📦")
                        ? "text-purple-400"
                        : log.message.includes("🌐")
                          ? "text-cyan-400"
                          : log.message.includes("📊")
                            ? "text-yellow-400"
                            : ""
                }
              >
                {log.message}
              </span>
            </div>
            {log.screenshot && (
              <div className="ml-20 mt-2">
                <img
                  src={log.screenshot}
                  alt="Step screenshot"
                  className="rounded border border-slate-700 shadow-lg object-contain max-h-48 bg-slate-800 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setEnlargedImage(log.screenshot || null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Image Enlargement Modal */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-7xl max-h-full">
            <img
              src={enlargedImage}
              alt="Enlarged screenshot"
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setEnlargedImage(null)}
              className="absolute top-2 right-2 bg-white text-gray-800 rounded-full p-2 hover:bg-gray-200 transition-colors shadow-lg"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
