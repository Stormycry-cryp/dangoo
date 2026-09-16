import { installBenignErrorGuard } from "./lib/benignErrors"
import { Route, Routes } from "react-router-dom"
import HomeRoute from "./pages/Home/index.tsx"
import CanvasRoute from "./pages/Canvas/index.tsx"
import AdminRoute from "./pages/Admin/index.tsx"

// 应用最早求值处安装: 吞掉画布拖放时的 ResizeObserver loop 良性提示
installBenignErrorGuard()

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/canvas/:id" element={<CanvasRoute />} />
      <Route path="/admin" element={<AdminRoute />} />
      <Route path="*" element={<HomeRoute />} />
    </Routes>
  )
}

export default App
