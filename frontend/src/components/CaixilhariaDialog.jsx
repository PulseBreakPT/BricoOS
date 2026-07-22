import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Trash2, AlertTriangle, Building2 } from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import CaixilhariaForm, {
  caixilhariaLabels, createEmptyCaixilharia, getCaixilhariaCatalog, normalizeCaixilhariaSpec,
  validateCaixilhariaSpec,
} from "@/components/CaixilhariaForm";

export default function CaixilhariaDialog({ open, onOpenChange, note, suppliers, onSaved }) {
  const [catalog, setCatalog] = useState(null);
  const [spec, setSpec] = useState(() => createEmptyCaixilharia());
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);

  const hasSpec = Boolean(note?.caixilharia);
  const bandSupplier = (suppliers || []).find((s) => /band/i.test(s.name || ""));
  const requestSummary = catalog ? caixilhariaLabels(catalog, spec) : null;

  useEffect(() => {
    if (!open) return;
    setSpec(note?.caixilharia ? normalizeCaixilhariaSpec(note.caixilharia) : createEmptyCaixilharia());
    getCaixilhariaCatalog()
      .then(setCatalog)
      .catch((e) => toast.error(getErrorMessage(e, "Erro ao carregar o catálogo de caixilharia")));
  }, [open, note]);

  const save = async () => {
    const v = validateCaixilhariaSpec(spec, catalog);
    if (!v.ok) { toast.error(v.error); return; }
    (v.warnings || []).forEach((warning) => toast.warning(warning));
    setSaving(true);
    try {
      await api.put(`/notes/${note.id}/caixilharia`, { ...normalizeCaixilhariaSpec(spec), linhas: v.linhas });
      toast.success("Especificação de caixilharia guardada");
      onSaved && onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao guardar a especificação"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (removing) return; // já há uma remoção em curso
    // Única ação destrutiva da app sem confirmação antes disto — Suppliers,
    // Notes, Tasks e TaskGroups pedem sempre confirmação para eliminar.
    if (!window.confirm("Remover a especificação de caixilharia deste pedido?")) return;
    setRemoving(true);
    try {
      await api.delete(`/notes/${note.id}/caixilharia`);
      toast.success("Especificação removida");
      onSaved && onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao remover a especificação"));
    } finally {
      setRemoving(false);
    }
  };

  const addBandSupplier = async () => {
    setAddingSupplier(true);
    try {
      let supplierId = bandSupplier?.id;
      if (!supplierId) {
        const { data } = await api.post("/suppliers", catalog.supplier);
        supplierId = data.id;
      }
      await api.put(`/notes/${note.id}`, { supplier_id: supplierId });
      toast.success("BandAluminios associado a este pedido");
      onSaved && onSaved();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao associar o fornecedor"));
    } finally {
      setAddingSupplier(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="caixilharia-dialog"
        className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[94vh] sm:w-full sm:max-w-5xl xl:max-w-6xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-3 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="pr-8 font-heading text-base font-extrabold tracking-tight sm:text-xl">
            Caixilharia à medida — BandAluminios
          </DialogTitle>
          <DialogDescription className="pr-8 text-xs text-muted-foreground sm:text-sm">
            Combine vários elementos e compare PVC com alumínio no mesmo pedido.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 py-3 sm:px-6 sm:py-5">
          {!catalog ? (
            <div className="flex justify-center py-10"><Spinner className="h-6 w-6 text-muted-foreground" /></div>
          ) : (
            <>
              <CaixilhariaForm catalog={catalog} spec={spec} onChange={setSpec} />

              {/* Fornecedor */}
              <div className="mt-5 flex flex-col gap-2 rounded-xl border border-border bg-muted/60 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 text-xs text-muted-foreground">
                    <p className="font-bold text-foreground">{catalog.supplier.name}</p>
                    <p className="truncate">{catalog.supplier.email} · {catalog.supplier.phone}</p>
                  </div>
                </div>
                {note?.supplier_id && bandSupplier && note.supplier_id === bandSupplier.id ? (
                  <span className="shrink-0 rounded-full bg-[var(--pastel-emerald-bg)] px-2.5 py-1 text-[11px] font-bold text-[color:var(--pastel-emerald-text)]">Associado ao pedido</span>
                ) : (
                  <Button data-testid="caix-add-supplier" size="sm" variant="outline" onClick={addBandSupplier} disabled={addingSupplier} className="h-8 shrink-0 rounded-lg text-xs">
                    {addingSupplier ? <Spinner className="mr-1 h-3.5 w-3.5" /> : null}
                    {bandSupplier ? "Associar a este pedido" : "Adicionar aos fornecedores"}
                  </Button>
                )}
              </div>

              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                Depois de guardar, o email na aba «Orçamentos» é gerado automaticamente no formato da ficha da BandAluminios.
              </p>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-card px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-6 sm:py-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-[10px] text-muted-foreground sm:hidden">
            <span className="truncate font-bold text-foreground">{requestSummary?.produto || "Pedido por preencher"}</span>
            <span className="shrink-0">{requestSummary?.option_count || 0} opção{requestSummary?.option_count === 1 ? "" : "ões"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button data-testid="caix-save" onClick={save} disabled={saving || !catalog} className="flex-1 rounded-xl">
              {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
              <span className="sm:hidden">Guardar</span>
              <span className="hidden sm:inline">{hasSpec ? "Guardar alterações" : "Guardar especificação"}</span>
            </Button>
            {hasSpec ? (
              <Button data-testid="caix-remove" variant="outline" disabled={removing} onClick={remove} className="rounded-xl border-red-200 text-red-600 hover:bg-[var(--pastel-red-bg)] hover:text-[color:var(--pastel-red-text)]">
                {removing ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
