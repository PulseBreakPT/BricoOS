import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Trash2, Plus, Loader2, AlertTriangle, Building2, Eye, Ruler,
} from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";

const emptyItem = { quantidade: 1, largura_mm: "", altura_mm: "", sentido_abertura: "" };

const emptySpec = {
  tipo_pedido: "orcamento", produto: "janela", familia: "", sistema: "",
  material: "", material_ref: "", cor_aro: "", cor_folha: "",
  fechadura: "", muletas: "", estore: "",
  itens: [{ ...emptyItem }], observacoes: "", data_entrega: "",
};

export default function CaixilhariaDialog({ open, onOpenChange, note, suppliers, onSaved }) {
  const [catalog, setCatalog] = useState(null);
  const [form, setForm] = useState(emptySpec);
  const [saving, setSaving] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const hasSpec = Boolean(note?.caixilharia);

  useEffect(() => {
    if (!open) return;
    setForm(note?.caixilharia
      ? { ...emptySpec, ...note.caixilharia, itens: (note.caixilharia.itens || []).map((i) => ({ ...i })) }
      : emptySpec);
    if (!catalog) {
      api.get("/caixilharia/catalog")
        .then(({ data }) => setCatalog(data))
        .catch((e) => toast.error(getErrorMessage(e, "Erro ao carregar o catálogo de caixilharia")));
    }
  }, [open, note, catalog]);

  if (!catalog && open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Caixilharia à medida</DialogTitle>
            <DialogDescription>A carregar o catálogo do fornecedor…</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        </DialogContent>
      </Dialog>
    );
  }
  if (!catalog) return null;

  const familias = Object.entries(catalog.familias).filter(([, f]) => f.produtos.includes(form.produto));
  const isRede = form.familia === "redes";
  const bandSupplier = (suppliers || []).find((s) => /band/i.test(s.name || ""));

  const pickProduto = (p) => {
    // Ao mudar de produto, limpa família/sistema se deixarem de ser válidos.
    setForm((f) => {
      const fam = catalog.familias[f.familia];
      const stillValid = fam && fam.produtos.includes(p);
      return { ...f, produto: p, familia: stillValid ? f.familia : "", sistema: stillValid ? f.sistema : "" };
    });
  };

  const pickSistema = (famKey, sisKey) => setForm((f) => ({ ...f, familia: famKey, sistema: sisKey }));

  const setItem = (idx, k, v) => setForm((f) => ({
    ...f, itens: f.itens.map((it, i) => (i === idx ? { ...it, [k]: v } : it)),
  }));
  const addItem = () => setForm((f) => ({ ...f, itens: [...f.itens, { ...emptyItem }] }));
  const removeItem = (idx) => setForm((f) => ({ ...f, itens: f.itens.filter((_, i) => i !== idx) }));

  const save = async () => {
    if (!form.familia || !form.sistema) { toast.error("Escolha o sistema (família e série)."); return; }
    const itens = [];
    for (const [i, it] of form.itens.entries()) {
      const quantidade = parseInt(it.quantidade, 10);
      const largura = parseInt(it.largura_mm, 10);
      const altura = parseInt(it.altura_mm, 10);
      if (!quantidade || !largura || !altura) {
        toast.error(`Linha ${i + 1}: preencha quantidade, largura e altura (em mm).`);
        return;
      }
      itens.push({ quantidade, largura_mm: largura, altura_mm: altura, sentido_abertura: it.sentido_abertura || "" });
    }
    setSaving(true);
    try {
      await api.put(`/notes/${note.id}/caixilharia`, { ...form, itens });
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
    try {
      await api.delete(`/notes/${note.id}/caixilharia`);
      toast.success("Especificação removida");
      onSaved && onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao remover a especificação"));
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

  const totalUn = form.itens.reduce((s, it) => s + (parseInt(it.quantidade, 10) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="caixilharia-dialog"
        className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[92vh] sm:w-full sm:max-w-2xl"
      >
        <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-4 sm:px-6">
          <DialogTitle className="font-heading text-lg font-bold tracking-tight sm:text-xl">
            Caixilharia à medida — BandAluminios
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Janelas, portas, portadas e redes mosquiteiras, conforme a ficha de pedido do fornecedor.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {/* Aviso oficial da ficha */}
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold uppercase tracking-wide text-amber-800">
            <Eye className="h-4 w-4 shrink-0" /> {catalog.aviso}
          </div>

          {/* Tipo de pedido */}
          <div className="mt-4 flex gap-2">
            {[["orcamento", "Orçamento"], ["encomenda", "Encomenda"]].map(([k, label]) => (
              <button
                key={k}
                data-testid={`caix-tipo-${k}`}
                onClick={() => set("tipo_pedido", k)}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold ${form.tipo_pedido === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Produto */}
          <div className="mt-4 space-y-1.5">
            <Label>Produto</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(catalog.produtos).map(([k, label]) => (
                <button
                  key={k}
                  data-testid={`caix-produto-${k}`}
                  onClick={() => pickProduto(k)}
                  className={`rounded-xl border px-2 py-2.5 text-xs font-bold ${form.produto === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sistema (famílias como na ficha, cabeçalho escuro + séries) */}
          <div className="mt-4 space-y-1.5">
            <Label>Sistema</Label>
            <div className="space-y-2">
              {familias.map(([famKey, fam]) => (
                <div key={famKey} className="overflow-hidden rounded-xl border border-slate-200">
                  <p className="bg-slate-900 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white">{fam.label}</p>
                  <div className="flex flex-wrap gap-1.5 bg-white p-2.5">
                    {Object.entries(fam.sistemas).map(([sisKey, sisLabel]) => {
                      const active = form.familia === famKey && form.sistema === sisKey;
                      return (
                        <button
                          key={sisKey}
                          data-testid={`caix-sistema-${sisKey}`}
                          onClick={() => pickSistema(famKey, sisKey)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
                        >
                          {sisLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Material / Perfil-Cor (não se aplica a redes) */}
          {!isRede ? (
            <>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Material</Label>
                  <Select value={form.material || "none"} onValueChange={(v) => set("material", v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="caix-material"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {Object.entries(catalog.materiais).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ref. do material</Label>
                  <Input data-testid="caix-material-ref" value={form.material_ref} onChange={(e) => set("material_ref", e.target.value)} placeholder="Ex.: vidro duplo 4+16+4" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Cor do aro</Label>
                  <Input data-testid="caix-cor-aro" value={form.cor_aro} onChange={(e) => set("cor_aro", e.target.value)} placeholder="Ex.: Branco RAL 9016" />
                </div>
                <div className="space-y-1.5">
                  <Label>Cor da folha</Label>
                  <Input data-testid="caix-cor-folha" value={form.cor_folha} onChange={(e) => set("cor_folha", e.target.value)} placeholder="Ex.: Branco RAL 9016" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Fechadura</Label>
                  <Select value={form.fechadura || "none"} onValueChange={(v) => set("fechadura", v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="caix-fechadura"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {Object.entries(catalog.fechaduras).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Muletas</Label>
                  <Select value={form.muletas || "none"} onValueChange={(v) => set("muletas", v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="caix-muletas"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {Object.entries(catalog.muletas).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Estore</Label>
                  <Select value={form.estore || "none"} onValueChange={(v) => set("estore", v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="caix-estore"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {Object.entries(catalog.estores).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : null}

          {/* Medidas */}
          <div className="mt-5 space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Ruler className="h-3.5 w-3.5" /> Medidas — em milímetros, vão visto por dentro
              {totalUn > 0 ? <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{totalUn} un</span> : null}
            </Label>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[3.5rem_1fr_1fr_1fr_2rem] gap-1.5 bg-slate-900 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white">
                <span>Quan.</span><span>Largura (mm)</span><span>Altura (mm)</span><span>Abertura</span><span />
              </div>
              <div className="space-y-1.5 bg-white p-2">
                {form.itens.map((it, idx) => (
                  <div key={idx} data-testid={`caix-item-${idx}`} className="grid grid-cols-[3.5rem_1fr_1fr_1fr_2rem] items-center gap-1.5">
                    <Input type="number" min={1} value={it.quantidade} onChange={(e) => setItem(idx, "quantidade", e.target.value)} className="h-9 px-2 font-mono text-sm" />
                    <Input type="number" min={50} value={it.largura_mm} onChange={(e) => setItem(idx, "largura_mm", e.target.value)} placeholder="1200" className="h-9 px-2 font-mono text-sm" />
                    <Input type="number" min={50} value={it.altura_mm} onChange={(e) => setItem(idx, "altura_mm", e.target.value)} placeholder="1400" className="h-9 px-2 font-mono text-sm" />
                    <Select value={it.sentido_abertura || "none"} onValueChange={(v) => setItem(idx, "sentido_abertura", v === "none" ? "" : v)}>
                      <SelectTrigger className="h-9 px-2 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {catalog.sentidos.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => removeItem(idx)}
                      disabled={form.itens.length === 1}
                      className="rounded-lg p-1.5 text-slate-300 hover:text-red-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button data-testid="caix-add-item" type="button" variant="outline" size="sm" onClick={addItem} className="mt-1 h-8 w-full rounded-lg text-xs">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar medida
                </Button>
              </div>
            </div>
          </div>

          {/* Observações + entrega */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_11rem]">
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea data-testid="caix-observacoes" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} placeholder="Ex.: desenho do caixilho em anexo, pré-aro incluído..." />
            </div>
            <div className="space-y-1.5">
              <Label>Entrega pretendida</Label>
              <Input data-testid="caix-data-entrega" type="date" value={form.data_entrega} onChange={(e) => set("data_entrega", e.target.value)} />
            </div>
          </div>

          {/* Fornecedor */}
          <div className="mt-5 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div className="min-w-0 text-xs text-slate-600">
                <p className="font-bold text-slate-900">{catalog.supplier.name}</p>
                <p className="truncate">{catalog.supplier.email} · {catalog.supplier.phone}</p>
              </div>
            </div>
            {note?.supplier_id && bandSupplier && note.supplier_id === bandSupplier.id ? (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">Associado ao pedido</span>
            ) : (
              <Button data-testid="caix-add-supplier" size="sm" variant="outline" onClick={addBandSupplier} disabled={addingSupplier} className="h-8 shrink-0 rounded-lg text-xs">
                {addingSupplier ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                {bandSupplier ? "Associar a este pedido" : "Adicionar aos fornecedores"}
              </Button>
            )}
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            Depois de guardar, o email na aba «Orçamentos» é gerado automaticamente no formato da ficha da BandAluminios.
          </p>
        </div>

        <div className="shrink-0 border-t border-slate-100 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Button data-testid="caix-save" onClick={save} disabled={saving} className="flex-1 rounded-xl">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {hasSpec ? "Guardar alterações" : "Guardar especificação"}
            </Button>
            {hasSpec ? (
              <Button data-testid="caix-remove" variant="outline" onClick={remove} className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
