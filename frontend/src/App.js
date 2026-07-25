import "@/App.css";
import "@/lib/hapticToasts";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import PinGate from "@/components/PinGate";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Notes from "@/pages/Notes";
import Suppliers from "@/pages/Suppliers";
import Tasks from "@/pages/Tasks";
import Catalog from "@/pages/Catalog";
import Emails from "@/pages/Emails";
import Settings from "@/pages/Settings";
import Notifications from "@/pages/Notifications";
import { usePortraitLock } from "@/hooks/usePortraitLock";

// A antiga página "Hoje" fundiu-se com "Pedidos" em "/". Links antigos para
// /clientes (ex.: ?open=<id> em notificações guardadas) continuam a funcionar.
function LegacyClientesRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/", search: location.search }} replace />;
}

// Grupos de Tarefas deixou de ser uma página própria — vive agora dentro de
// Tarefas (botão "Grupos"). Links antigos para /grupos-tarefas continuam a
// funcionar, só que abrem "/tarefas" em vez de uma página dedicada.
function LegacyTaskGroupsRedirect() {
  return <Navigate to="/tarefas" replace />;
}

function App() {
  // App instalada (PWA) fica sempre em vertical — ver frontend/src/hooks/
  // usePortraitLock.js para o porquê e o comportamento em cada browser.
  usePortraitLock();
  return (
    <div className="App">
      {/* O PinGate envolve o Router inteiro: todas as rotas — atuais e futuras —
          só montam depois de o dispositivo estar verificado, e o utilizador fica
          no URL que tentou abrir. */}
      <PinGate>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Notes />} />
              <Route path="/clientes" element={<LegacyClientesRedirect />} />
              <Route path="/estatisticas" element={<Dashboard />} />
              <Route path="/fornecedores" element={<Suppliers />} />
              <Route path="/emails" element={<Emails />} />
              <Route path="/tarefas" element={<Tasks />} />
              <Route path="/grupos-tarefas" element={<LegacyTaskGroupsRedirect />} />
              <Route path="/catalogo-tecnico" element={<Catalog />} />
              <Route path="/definicoes" element={<Settings />} />
              <Route path="/notificacoes" element={<Notifications />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PinGate>
      {/* Sem richColors: o estilo "voz do sistema" (chrome grafite) vem do
          wrapper ui/sonner; os ícones de sucesso/erro mantêm a cor de LED. */}
      <Toaster position="top-center" closeButton />
    </div>
  );
}

export default App;
