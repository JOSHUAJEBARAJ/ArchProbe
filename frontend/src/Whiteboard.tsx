import { useRef } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import '@excalidraw/excalidraw/index.css'

type WhiteboardProps = {
  onDiagramChange: (elements: readonly ExcalidrawElement[]) => void
}

export default function Whiteboard({ onDiagramChange }: WhiteboardProps) {
  const elementsRef = useRef<readonly ExcalidrawElement[]>([])

  return (
    <section>
      <div style={{ height: '450px', border: '1px solid #ccc' }}>
        <Excalidraw
          onChange={(elements) => {
            elementsRef.current = elements
            onDiagramChange(elements)
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          const activeElements = elementsRef.current.filter(
            (element) => !element.isDeleted
          )
          const diagram = {
            elements: activeElements,
          }

          console.log('Diagram JSON:', JSON.stringify(diagram, null, 2))
        }}
      >
        Check diagram
      </button>
    </section>
  )
}
