import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import '@excalidraw/excalidraw/index.css'

export type SavedDiagramSnapshot = {
  revision: number
  elements: readonly ExcalidrawElement[]
}

export default function SavedDiagram({ snapshot }: { snapshot: SavedDiagramSnapshot }) {
  if (snapshot.elements.length === 0) {
    return <p>This snapshot has an empty canvas.</p>
  }

  return (
    <div className="saved-diagram" aria-label={`Saved diagram revision ${snapshot.revision}`}>
      <Excalidraw
        initialData={{
          elements: snapshot.elements,
          scrollToContent: true,
          appState: { viewBackgroundColor: '#ffffff' },
        }}
        viewModeEnabled
        zenModeEnabled
        theme="light"
        handleKeyboardGlobally={false}
        autoFocus={false}
        aiEnabled={false}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            saveAsImage: false,
          },
        }}
      />
    </div>
  )
}
