import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Notes from "@/pages/Notes";
import Suppliers from "@/pages/Suppliers";
import Tasks from "@/pages/Tasks";
import Catalog from "@/pages/Catalog";

// A antiga página "Hoje" fundiu-se com "Pedidos" em "/". Links antigos para
// /clientes (ex.: ?open=<id> em notificações guardadas) continuam a funcionar.
function LegacyClientesRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/", search: location.search }} replace />;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Notes />} />
            <Route path="/clientes" element={<LegacyClientesRedirect />} />
            <Route path="/estatisticas" element={<Dashboard />} />
            <Route path="/fornecedores" element={<Suppliers />} />
            <Route path="/tarefas" element={<Tasks />} />
            <Route path="/catalogo-tecnico" element={<Catalog />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}

export default App;
