import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Notes from "@/pages/Notes";
import Suppliers from "@/pages/Suppliers";
import Tasks from "@/pages/Tasks";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clientes" element={<Notes />} />
            <Route path="/fornecedores" element={<Suppliers />} />
            <Route path="/tarefas" element={<Tasks />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}

export default App;
