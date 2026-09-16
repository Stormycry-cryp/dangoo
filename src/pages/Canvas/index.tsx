import { CanvasPage } from "./CanvasPage"
import { useCanvas } from "./useCanvas"

export default function CanvasRoute() {
  const vm = useCanvas()
  return <CanvasPage {...vm} />
}
