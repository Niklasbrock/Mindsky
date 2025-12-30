import { Modal } from './Modal';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  nightMode: boolean;
  onNightModeChange: (enabled: boolean) => void;
  soundEnabled: boolean;
  onSoundChange: (enabled: boolean) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
}

export function SettingsPanel({
  isOpen,
  onClose,
  nightMode,
  onNightModeChange,
  soundEnabled,
  onSoundChange,
  onExport,
  onImport,
  onReset,
}: SettingsPanelProps) {
  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        onImport(file);
      }
    };
    input.click();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="space-y-6">
        {/* Sound Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-800">Sound Effects</p>
            <p className="text-sm text-gray-500">Play sounds on completion</p>
          </div>
          <button
            onClick={() => onSoundChange(!soundEnabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              soundEnabled ? 'bg-sky-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                soundEnabled ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* Night Mode Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-800">Night Mode</p>
            <p className="text-sm text-gray-500">Darker sky colors</p>
          </div>
          <button
            onClick={() => onNightModeChange(!nightMode)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              nightMode ? 'bg-sky-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                nightMode ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* Divider */}
        <hr className="border-gray-200" />

        {/* Export/Import */}
        <div className="space-y-3">
          <p className="font-medium text-gray-800">Data Management</p>
          <div className="flex gap-3">
            <button
              onClick={onExport}
              className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Export JSON
            </button>
            <button
              onClick={handleImportClick}
              className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Import JSON
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Export your data for backup or import from a previous export.
          </p>
        </div>

        {/* Divider */}
        <hr className="border-gray-200" />

        {/* Danger Zone */}
        <div className="space-y-3">
          <p className="font-medium text-red-600">Danger Zone</p>
          <button
            onClick={onReset}
            className="w-full py-2 px-4 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
          >
            Reset All Data
          </button>
          <p className="text-xs text-gray-400">
            Delete all milestones, tasks, and subtasks. This cannot be undone.
          </p>
        </div>
      </div>
    </Modal>
  );
}
