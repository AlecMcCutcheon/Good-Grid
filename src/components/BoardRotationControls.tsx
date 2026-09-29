import type { BoardRotation } from '../game/boardView'

type Props = {
  rotation: BoardRotation
  direction: -1 | 1
  onRotate: (direction: -1 | 1) => void
  disabled?: boolean
}

export function BoardRotationButton({ rotation, direction, onRotate, disabled = false }: Props) {
  const clockwise = direction === 1
  const description = clockwise ? 'clockwise' : 'counterclockwise'

  return (
    <button
      className={`board-rotation-button board-rotation-button--${description}`}
      type="button"
      aria-label={`Rotate board ${description}; current orientation ${rotation * 90} degrees`}
      title={`Rotate board ${description}`}
      disabled={disabled}
      onClick={() => onRotate(direction)}
    >
      {clockwise ? '↷' : '↶'}
    </button>
  )
}
