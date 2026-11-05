import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import '@excalidraw/excalidraw/index.css'

type WhiteboardProps = {
  onDiagramChange: (elements: readonly ExcalidrawElement[]) => void
}

export default function Whiteboard({ onDiagramChange }: WhiteboardProps) {
  return (
    <div className="whiteboard">
      <Excalidraw
        handleKeyboardGlobally={false}
        onChange={onDiagramChange}
      />
    </div>
  )
}
