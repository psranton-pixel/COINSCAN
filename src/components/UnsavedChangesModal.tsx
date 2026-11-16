import React from 'react';
import { AlertCircle } from 'lucide-react';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onConfirmDiscard: () => void;
  onKeepEditing: () => void;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  onConfirmDiscard,
  onKeepEditing,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onKeepEditing}
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-2xl p-5 shadow-2xl text-slate-100"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">Unsaved Changes</h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              You have unsaved edits to this coin record. If you leave now, your modifications will be discarded.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onKeepEditing}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700"
          >
            Keep Editing
          </button>
          <button
            type="button"
            onClick={onConfirmDiscard}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-md shadow-rose-950"
          >
            Discard Changes
          </button>
        </div>
      </div>
    </div>
  );
};
