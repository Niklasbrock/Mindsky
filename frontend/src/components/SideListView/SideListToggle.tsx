interface SideListToggleProps {
  isOpen: boolean;
  onClick: () => void;
}

export function SideListToggle({ isOpen, onClick }: SideListToggleProps) {
  return (
    <button
      onClick={onClick}
      className={`
        absolute bottom-24 right-6 w-12 h-12 rounded-full
        bg-white/90 shadow-lg z-10
        flex items-center justify-center
        hover:bg-white hover:scale-105 active:scale-95
        transition-all duration-200
        ${isOpen ? 'bg-sky-100' : ''}
      `}
      title={isOpen ? 'Close list view' : 'Open list view'}
    >
      {isOpen ? (
        // Right-pointing chevron (collapse icon)
        <svg className="w-6 h-6 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      ) : (
        // List bullet icon (three dots with lines)
        <svg className="w-6 h-6 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )}
    </button>
  );
}
