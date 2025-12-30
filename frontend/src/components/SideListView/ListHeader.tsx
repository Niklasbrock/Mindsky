import { useState } from 'react';
import type { SortBy, SortDirection } from '../../hooks/useListFilters';

interface ListHeaderProps {
  onClose: () => void;
  showCompleted: boolean;
  onShowCompletedChange: (show: boolean) => void;
  sortBy: SortBy;
  onSortByChange: (sort: SortBy) => void;
  sortDirection: SortDirection;
  onSortDirectionToggle: () => void;
  selectedTags: string[];
  availableTags: string[];
  onTagsChange: (tags: string[]) => void;
  nightMode?: boolean;
}

export function ListHeader({
  onClose,
  showCompleted,
  onShowCompletedChange,
  sortBy,
  onSortByChange,
  sortDirection,
  onSortDirectionToggle,
  selectedTags,
  availableTags,
  onTagsChange,
  nightMode = false,
}: ListHeaderProps) {
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  const sortOptions: { value: SortBy; label: string }[] = [
    { value: 'default', label: 'Default' },
    { value: 'dueDate', label: 'Due Date' },
    { value: 'importance', label: 'Importance' },
    { value: 'alphabetical', label: 'A-Z' },
    { value: 'createdAt', label: 'Created' },
  ];

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  return (
    <div className={`flex-shrink-0 border-b ${nightMode ? 'border-slate-600 bg-slate-800' : 'border-gray-200 bg-white'}`}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className={`text-lg font-medium ${nightMode ? 'text-gray-100' : 'text-gray-800'}`}>Tasks</h2>
        <button
          onClick={onClose}
          className={`p-1 rounded transition-colors ${nightMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
          title="Close list view"
        >
          <svg className={`w-5 h-5 ${nightMode ? 'text-gray-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Filter controls */}
      <div className="px-4 pb-3 flex flex-wrap gap-2 items-center">
        {/* Show completed toggle */}
        <button
          onClick={() => onShowCompletedChange(!showCompleted)}
          className={`
            text-xs px-3 py-1.5 rounded-full border transition-colors
            ${showCompleted
              ? (nightMode ? 'bg-sky-900/50 border-sky-600 text-sky-300' : 'bg-sky-50 border-sky-300 text-sky-700')
              : (nightMode ? 'bg-slate-700 border-slate-600 text-gray-300 hover:bg-slate-600' : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100')
            }
          `}
        >
          {showCompleted ? 'Hide Completed' : 'Show Completed'}
        </button>

        {/* Sort dropdown */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as SortBy)}
            className={`text-xs px-3 py-1.5 pr-8 rounded-full border focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none cursor-pointer ${
              nightMode
                ? 'bg-slate-700 border-slate-600 text-gray-200 hover:bg-slate-600'
                : 'bg-white border-gray-300 hover:bg-gray-50'
            }`}
          >
            {sortOptions.map(option => (
              <option key={option.value} value={option.value}>
                Sort: {option.label}
              </option>
            ))}
          </select>
          <svg className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${nightMode ? 'text-gray-400' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Sort direction toggle */}
        {sortBy !== 'default' && (
          <button
            onClick={onSortDirectionToggle}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              nightMode
                ? 'bg-slate-700 border-slate-600 text-gray-200 hover:bg-slate-600'
                : 'bg-white border-gray-300 hover:bg-gray-50'
            }`}
            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortDirection === 'asc' ? '↑' : '↓'}
          </button>
        )}

        {/* Tag filter */}
        {availableTags.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowTagDropdown(!showTagDropdown)}
              className={`
                text-xs px-3 py-1.5 rounded-full border transition-colors
                ${selectedTags.length > 0
                  ? (nightMode ? 'bg-purple-900/50 border-purple-600 text-purple-300' : 'bg-purple-50 border-purple-300 text-purple-700')
                  : (nightMode ? 'bg-slate-700 border-slate-600 text-gray-300 hover:bg-slate-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50')
                }
              `}
            >
              Tags {selectedTags.length > 0 && `(${selectedTags.length})`}
            </button>

            {showTagDropdown && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowTagDropdown(false)}
                />

                {/* Dropdown */}
                <div className={`absolute top-full left-0 mt-1 border rounded-lg shadow-lg z-20 min-w-[160px] max-h-[200px] overflow-y-auto ${
                  nightMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'
                }`}>
                  {availableTags.map(tag => (
                    <label
                      key={tag}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${nightMode ? 'hover:bg-slate-600' : 'hover:bg-gray-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tag)}
                        onChange={() => toggleTag(tag)}
                        className="rounded border-gray-300 text-sky-500 focus:ring-sky-500"
                      />
                      <span className={`text-sm ${nightMode ? 'text-gray-200' : 'text-gray-700'}`}>{tag}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
