import { Phone, Mail, Briefcase, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Dispatcher } from "../../types/dispatchers";

interface DispatcherCardProps {
  dispatcher: Dispatcher;
  onClick?: () => void;
}

function capitalizeWords(str: string) {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatLastLogin(raw: unknown) {
  if (!raw) return "Never";

  let d: Date;

  if (raw instanceof Date) {
    d = raw;
  } else if (typeof raw === "string") {
    d = new Date(raw);
  } else {
    d = new Date(String(raw));
  }

  if (isNaN(d.getTime())) {
    return "Never";
  }

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 5) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function DispatcherCard({ dispatcher, onClick }: DispatcherCardProps) {
    const navigate = useNavigate();
    const displayName = capitalizeWords(dispatcher.name);
    const lastLoginText = formatLastLogin(dispatcher.last_login);

    return (
        <div
            className="
            bg-zinc-900 border border-[#3a3a3f] rounded-lg p-5
            hover:border-zinc-500 hover:shadow-lg transition-all
            w-72 flex flex-col gap-4" 
        >
            <div className="flex items-start gap-3">
                <div className="relative">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg">
                    {dispatcher.name.charAt(0).toUpperCase()}
                </div>
                
                </div>

                <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold text-lg truncate">
                    {displayName}
                </h3>
                <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border `}
                >
                    title: 
                    {dispatcher.title}
                </span>
                </div>
            </div>

            <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Phone size={16} className="text-zinc-400 flex-shrink-0" />
                <span className="truncate">{dispatcher.phone}</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Mail size={16} className="text-zinc-400 flex-shrink-0" />
                <span className="truncate">{dispatcher.email}</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Briefcase size={16} className="text-zinc-400 flex-shrink-0" />
                <span className="truncate">{dispatcher.title}</span>
                </div>
                
                <div className="flex items-start gap-2 text-sm text-zinc-400 min-h-[1.2rem]">
                <div className="w-4 flex-shrink-0" /> 
                <p className="line-clamp-2 text-xs leading-relaxed">
                    {dispatcher.description}
                </p>
                </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-400 pt-2 border-t border-zinc-800">
                <Clock size={13} className="opacity-70" />
                <span>Last login: {lastLoginText}</span>
            </div>

            <div className="flex gap-2 mt-1">
                <button
                onClick={(e) => {
                        e.stopPropagation();
                        onClick?.();
                    }}
                    className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                View Details
                </button>
                
            </div>
        </div>
    );
}