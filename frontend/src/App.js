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

// A antiga página "Hoje" fundiu-se com "Pedidos" em "/". Links antigos para
// /clientes (ex.: ?open=<id> em notificações guardadas) continuam a funcionar.
function LegacyClientesRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/", search: location.search }} replace />;
}

function App() {
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
              <Route path="/catalogo-tecnico" element={<Catalog />} />
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
