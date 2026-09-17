import { CanvasPage } from "./CanvasPage"
import { useCanvas } from "./useCanvas"
import { AgentPanel } from "@/integrations/agent/AgentPanel"

export default function CanvasRoute() {
  const vm = useCanvas()
  return <><CanvasPage {...vm} /><AgentPanel vm={vm} /></>
}
