import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { SkyCanvas } from './components/SkyCanvas';
import { PlusCloudButton } from './components/PlusCloudButton';
import { CreateModal } from './components/CreateModal';
import { EditModal } from './components/EditModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { SettingsPanel } from './components/SettingsPanel';
import { SideListView, SideListToggle, type SideListViewHandle } from './components/SideListView';
import { ToastContainer } from './components/ToastContainer';
import { useSkyData } from './hooks/useSkyData';
import { useUndoStack } from './hooks/useUndoStack';
import { useModalState } from './hooks/useModalState';
import { useEntityHandlers } from './hooks/useEntityHandlers';
import { useToast } from './hooks/useToast';
import type { CloudNode, Milestone } from './types';
import type { SkyCanvasHandle } from './components/SkyCanvas';
import * as api from './services/api';
import { loadSettings, saveSettings, exportToJson, importFromJson, type Settings } from './services/storage';
import { audioService } from './services/audio';
import { debounce } from './utils/debounce';

function App() {
  const { data: skyData, loading, error, refresh } = useSkyData();
  const { toasts, removeToast, showError, showSuccess } = useToast();

  // Settings state
  const [settings, setSettings] = useState(() => loadSettings());

  // Modal and panel state (extracted hook)
  const {
    createModalOpen,
    editModalOpen,
    settingsOpen,
    listViewOpen,
    listViewWidth,
    createContext,
    selectedNode,
    confirmationModal,
    openCreateModal,
    closeCreateModal,
    openEditModal,
    closeEditModal,
    openSettings,
    closeSettings,
    toggleListView,
    setListViewWidth,
    openConfirmation,
    closeConfirmation,
    isAnyModalOpen,
  } = useModalState();

  // Focus state
  const [focusedNode, setFocusedNode] = useState<CloudNode | null>(null);

  // Undo system
  const { canUndo, canRedo, lastUndoAction, undo, redo, refreshStack: refreshUndoStack, loading: undoLoading } = useUndoStack();
  const [showUndoButton, setShowUndoButton] = useState(false);

  // Sky canvas ref for triggering dissolve animations
  const skyCanvasRef = useRef<SkyCanvasHandle>(null);
  const sideListRef = useRef<SideListViewHandle>(null);

  // Entity handlers (extracted to reduce App.tsx complexity)
  const {
    createMilestone,
    createTask,
    createSubtask,
    updateEntity,
    deleteEntity,
    completeEntity,
    uncompleteEntity,
    reassignEntity,
    reorderEntity,
  } = useEntityHandlers({
    refresh,
    refreshUndoStack,
    skyCanvasRef,
    setFocusedNode: () => setFocusedNode(null),
    showError,
  });

  // PERF: Debounce settings saves to avoid excessive localStorage writes
  const debouncedSaveSettings = useMemo(
    () => debounce((s: Settings) => saveSettings(s), 500),
    []
  );

  // Save settings when they change and sync audio service
  useEffect(() => {
    debouncedSaveSettings(settings);
    // Audio service updates immediately (no need to debounce)
    audioService.setEnabled(settings.soundEnabled);
  }, [settings, debouncedSaveSettings]);

  // Clean up debounced function on unmount
  useEffect(() => {
    return () => debouncedSaveSettings.cancel();
  }, [debouncedSaveSettings]);

  // ESC key handler to exit focus mode or close list view
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Priority: Modal > List View > Focus Mode
        if (isAnyModalOpen) {
          // Modals handle their own ESC
          return;
        }
        if (listViewOpen) {
          toggleListView();
          return;
        }
        if (focusedNode) {
          setFocusedNode(null);
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [focusedNode, isAnyModalOpen, listViewOpen, toggleListView]);

  // Resize SkyCanvas when side view opens/closes or width changes
  useEffect(() => {
    // Resize multiple times during the CSS transition (300ms)
    // to keep the canvas in sync with the container
    const resizeTimes = [0, 50, 100, 150, 200, 250, 300, 350];
    const timers = resizeTimes.map(delay =>
      setTimeout(() => skyCanvasRef.current?.resize(), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [listViewOpen, listViewWidth]);

  // Undo handler (now uses backend-driven undo)
  const handleUndo = useCallback(async () => {
    if (undoLoading) return;
    const success = await undo();
    if (success) {
      refresh();
    }
  }, [undo, undoLoading, refresh]);

  // Redo handler
  const handleRedo = useCallback(async () => {
    if (undoLoading) return;
    const success = await redo();
    if (success) {
      refresh();
    }
  }, [redo, undoLoading, refresh]);

  // Listen for undo/redo keyboard shortcuts
  useEffect(() => {
    const handleUndoRequest = () => {
      if (canUndo && !undoLoading) {
        handleUndo();
      }
    };

    const handleRedoRequest = () => {
      if (canRedo && !undoLoading) {
        handleRedo();
      }
    };

    window.addEventListener('undo-requested', handleUndoRequest);
    window.addEventListener('redo-requested', handleRedoRequest);
    return () => {
      window.removeEventListener('undo-requested', handleUndoRequest);
      window.removeEventListener('redo-requested', handleRedoRequest);
    };
  }, [canUndo, canRedo, undoLoading, handleUndo, handleRedo]);

  // Show undo button when there's an action to undo, auto-hide after 5s
  useEffect(() => {
    if (lastUndoAction) {
      setShowUndoButton(true);
      const timer = setTimeout(() => setShowUndoButton(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [lastUndoAction]);

  // Handle cloud click (focus mode)
  const handleCloudClick = useCallback((node: CloudNode) => {
    setFocusedNode(node);
  }, []);

  // Handle cloud right-click (edit mode)
  const handleCloudRightClick = useCallback((node: CloudNode) => {
    openEditModal(node);
  }, [openEditModal]);

  // Handle background click (unfocus)
  const handleBackgroundClick = useCallback(() => {
    setFocusedNode(null);
  }, []);

  // Handle plus button click
  const handlePlusClick = useCallback(() => {
    if (focusedNode) {
      if (focusedNode.type === 'milestone') {
        openCreateModal({ parentId: focusedNode.id, parentType: 'milestone' });
      } else if (focusedNode.type === 'task') {
        openCreateModal({ parentId: focusedNode.id, parentType: 'task' });
      } else {
        openCreateModal();
      }
    } else {
      openCreateModal();
    }
  }, [focusedNode, openCreateModal]);

  // Drag zone handlers (open confirmation modal)
  const handleCloudDeleteViaDrag = useCallback((cloudId: string, cloudType: string) => {
    openConfirmation('delete', cloudId, cloudType);
  }, [openConfirmation]);

  const handleCloudCompleteViaDrag = useCallback(async (cloudId: string, cloudType: string) => {
    // Only tasks and subtasks can be completed (not milestones)
    if (cloudType !== 'task' && cloudType !== 'subtask') return;

    // Complete directly without confirmation modal
    await completeEntity(cloudId, cloudType as 'task' | 'subtask');

    // Only exit focus if we completed the focused node itself
    if (focusedNode?.id === cloudId) {
      setFocusedNode(null);
    } else if (focusedNode) {
      // Child was completed - stay in focus but refresh layout
      skyCanvasRef.current?.refreshFocusLayout();
    }
  }, [completeEntity, focusedNode]);

  // Debounced milestone position save (to avoid API spam during physics settling)
  const positionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleMilestonePositionChange = useCallback((id: string, x: number, y: number) => {
    // Clear any pending save
    if (positionSaveTimerRef.current) {
      clearTimeout(positionSaveTimerRef.current);
    }
    // Debounce the save - wait 500ms after last position change
    positionSaveTimerRef.current = setTimeout(async () => {
      try {
        await api.updateMilestone(id, { x, y });
      } catch (err) {
        console.error('Failed to save milestone position:', err);
      }
    }, 500);
  }, []);

  // Confirmation modal handlers (delete and reset only - completion is done directly)
  const handleConfirmAction = useCallback(async () => {
    const { type, entityId, entityType } = confirmationModal;
    closeConfirmation();

    if (type === 'delete') {
      await deleteEntity(entityId, entityType as 'milestone' | 'task' | 'subtask');
    } else if (type === 'reset') {
      try {
        await api.resetSky();
        setFocusedNode(null);
        refresh();
        showSuccess('All data has been reset');
      } catch (err) {
        console.error('Failed to reset:', err);
        showError('Failed to reset data');
      }
    }
  }, [confirmationModal, closeConfirmation, deleteEntity, refresh, showError, showSuccess]);

  // Reset handler (opens confirmation modal)
  const handleReset = useCallback(() => {
    openConfirmation('reset', '', '');
  }, [openConfirmation]);

  // Settings handlers
  const handleExport = useCallback(() => {
    if (skyData) {
      exportToJson(skyData);
    }
  }, [skyData]);

  const handleImport = useCallback(async (file: File) => {
    try {
      const data = await importFromJson(file) as { milestones: unknown[] };
      if (!data.milestones || !Array.isArray(data.milestones)) {
        throw new Error('Invalid import file: missing milestones array');
      }
      const result = await api.importSky({ milestones: data.milestones as Milestone[] });
      showSuccess(`Imported ${result.milestoneCount} milestones, ${result.taskCount} tasks, ${result.subtaskCount} subtasks`);
      refresh();
    } catch (err) {
      showError('Failed to import: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }, [refresh, showSuccess, showError]);

  // Check if mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className={`w-full h-full relative ${settings.nightMode ? 'bg-slate-900' : 'bg-sky-500'}`}>
      {/* Sky viewport container - shrinks when list view is open on desktop */}
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{
          right: listViewOpen && !isMobile ? `${listViewWidth}px` : 0
        }}
      >
        {/* Sky Canvas (Pixi.js) */}
        <SkyCanvas
          ref={skyCanvasRef}
          className="absolute inset-0"
          skyData={skyData}
          focusedNode={focusedNode}
          onCloudClick={handleCloudClick}
          onCloudRightClick={handleCloudRightClick}
          onBackgroundClick={handleBackgroundClick}
          onCloudReassign={reassignEntity}
          onCloudDelete={handleCloudDeleteViaDrag}
          onCloudComplete={handleCloudCompleteViaDrag}
          onMilestonePositionChange={handleMilestonePositionChange}
          nightMode={settings.nightMode}
        />

        {/* Header overlay - pointer-events-none to allow drag-to-complete zone */}
        <header className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 pointer-events-none">
          <h1 className="text-2xl font-light text-white/90 tracking-wide drop-shadow-md">
            Mindsky
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  skyData ? 'bg-green-400' : error ? 'bg-red-400' : 'bg-yellow-400'
                }`}
              />
              <span className="text-sm text-white/70">
                {loading ? 'Loading...' : skyData ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <button
              onClick={openSettings}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors pointer-events-auto"
              title="Settings"
            >
              <svg className="w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Instructions overlay (shown when sky is empty) */}
        {skyData && skyData.milestones.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-white/70">
              <p className="text-xl mb-2">Your sky is clear</p>
              <p className="text-sm">Click the + button to add your first milestone</p>
            </div>
          </div>
        )}

        {/* Focus indicator */}
        {focusedNode && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg z-10">
            <span className="text-sm text-gray-700">
              Focused on: <strong>{('title' in focusedNode.entity) ? focusedNode.entity.title : ''}</strong>
              <span className="ml-2 text-gray-400 text-xs">
                ({focusedNode.type})
              </span>
            </span>
            <button
              onClick={() => setFocusedNode(null)}
              className="ml-3 text-gray-400 hover:text-gray-600 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Side List Toggle Button - ABOVE Plus button */}
        <SideListToggle
          isOpen={listViewOpen}
          onClick={toggleListView}
        />

        {/* Plus cloud button */}
        <PlusCloudButton
          onClick={handlePlusClick}
          onDragToTarget={async (type, x, y, targetId) => {
            // Create entity based on context
            try {
              if (type === 'milestone') {
                // Transform screen coords to world coords for milestone positioning
                const worldCoords = skyCanvasRef.current?.screenToWorld(x, y);
                await api.createMilestone({
                  title: 'New Milestone',
                  x: worldCoords?.x,
                  y: worldCoords?.y,
                });
                audioService.playClick();
              } else if (type === 'task' && targetId) {
                await api.createTask(targetId, { title: 'New Task' });
                audioService.playClick();
              } else if (type === 'subtask' && targetId) {
                await api.createSubtask(targetId, { title: 'New Subtask' });
                audioService.playClick();
              }
              refresh();
            } catch (err) {
              console.error('Failed to create via drag:', err);
            }
          }}
          getDropContext={(x, y) => {
            // Check SideListView first if it's open
            if (listViewOpen) {
              const sideListContext = sideListRef.current?.getDropContext(x, y);
              if (sideListContext) {
                return sideListContext;
              }
            }
            // Fall back to SkyCanvas
            return skyCanvasRef.current?.getDropContext(x, y) ?? null;
          }}
        />
      </div>

      {/* Side List View */}
      <SideListView
        ref={sideListRef}
        isOpen={listViewOpen}
        width={listViewWidth}
        onClose={toggleListView}
        onWidthChange={setListViewWidth}
        skyData={skyData}
        onComplete={completeEntity}
        onUncomplete={uncompleteEntity}
        onEdit={openEditModal}
        onReassign={reassignEntity}
        onReorder={reorderEntity}
        nightMode={settings.nightMode}
      />

      {/* Create modal */}
      <CreateModal
        isOpen={createModalOpen}
        onClose={closeCreateModal}
        parentId={createContext.parentId}
        parentType={createContext.parentType}
        onCreateMilestone={createMilestone}
        onCreateTask={createTask}
        onCreateSubtask={createSubtask}
      />

      {/* Edit modal */}
      <EditModal
        isOpen={editModalOpen}
        onClose={closeEditModal}
        node={selectedNode}
        onUpdate={updateEntity}
        onDelete={deleteEntity}
        onComplete={completeEntity}
        onUncomplete={uncompleteEntity}
      />

      {/* Settings panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={closeSettings}
        nightMode={settings.nightMode}
        onNightModeChange={(enabled) => setSettings(s => ({ ...s, nightMode: enabled }))}
        soundEnabled={settings.soundEnabled}
        onSoundChange={(enabled) => setSettings(s => ({ ...s, soundEnabled: enabled }))}
        onExport={handleExport}
        onImport={handleImport}
        onReset={handleReset}
      />

      {/* Confirmation modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onConfirm={handleConfirmAction}
        onCancel={closeConfirmation}
        title={confirmationModal.type === 'delete' ? 'Delete Item' : 'Reset All Data'}
        message={
          confirmationModal.type === 'delete'
            ? 'Are you sure you want to delete this item? This action cannot be undone.'
            : 'Are you sure you want to delete ALL milestones, tasks, and subtasks? This action cannot be undone.'
        }
        confirmText={confirmationModal.type === 'delete' ? 'Delete' : 'Reset All'}
        confirmStyle="danger"
      />

      {/* Floating undo/redo buttons */}
      {showUndoButton && (canUndo || canRedo) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-50 animate-in slide-in-from-bottom-4 duration-200">
          {canUndo && (
            <button
              onClick={handleUndo}
              disabled={undoLoading}
              className="bg-gray-800/90 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span>Undo</span>
              <span className="text-xs text-white/60">(Ctrl+Z)</span>
            </button>
          )}
          {canRedo && (
            <button
              onClick={handleRedo}
              disabled={undoLoading}
              className="bg-gray-800/90 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
              </svg>
              <span>Redo</span>
              <span className="text-xs text-white/60">(Ctrl+Y)</span>
            </button>
          )}
        </div>
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default App;
