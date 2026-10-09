import React from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "./button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-800 bg-[#0F172A] p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 mb-4 border border-cyan-500/20 shadow-sm">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-400 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-6 rounded-full font-bold bg-white text-slate-950 hover:bg-slate-200" variant="default">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
