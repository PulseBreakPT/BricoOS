import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, Eye, Ruler } from "lucide-react";
import api from "@/lib/api";

export const emptyCaixItem = { quantidade: 1, largura_mm: "", altura_mm: "", sentido_abertura: "" };

export const emptyCaixilharia = {
  tipo_pedido: "orcamento", produto: "janela", familia: "", sistema: "",
  material: "", material_ref: "", cor_aro: "", cor_folha: "",
  fechadura: "", muletas: "", estore: "",
  itens: [{ ...emptyCaixItem }], observacoes: "", data_entrega: "",
};

// Cache do catálogo — é estático por sessão, não vale a pena repetir o pedido.
let catalogCache = null;
export async function getCaixilhariaCatalog() {
  if (!catalogCache) {
    const { data } = await api.get("/caixilharia/catalog");
    catalogCache = data;
  }
  return catalogCache;
}

export function validateCaixilhariaSpec(spec) {
  if (!spec.familia || !spec.sistema) {
    return { ok: false, error: "Escolha o sistema (família e série)." };
  }
  const itens = [];
  for (const [i, it] of spec.itens.entries()) {
    const quantidade = parseInt(it.quantidade, 10);
    const largura = parseInt(it.largura_mm, 10);
    const altura = parseInt(it.altura_mm, 10);
    if (!quantidade || !largura || !altura) {
      return { ok: false, error: `Linha ${i + 1}: preencha quantidade, largura e altura (em mm).` };
    }
    itens.push({ quantidade, largura_mm: largura, altura_mm: altura, sentido_abertura: it.sentido_abertura || "" });
  }
  return { ok: true, itens };
}

export function caixilhariaLabels(catalog, spec) {
  const fam = catalog?.familias?.[spec.familia];
  return {
    produto: catalog?.produtos?.[spec.produto] || spec.produto,
    familia: fam?.label || "",
    sistema: fam?.sistemas?.[spec.sistema] || spec.sistema,
  };
}

export default function CaixilhariaForm({ catalog, spec, onChange }) {
  const set = (k, v) => onChange({ ...spec, [k]: v });

  const familias = Object.entries(catalog.familias).filter(([, f]) => f.produtos.includes(spec.produto));
  const isRede = spec.familia === "redes";

  const pickProduto = (p) => {
    // Ao mudar de produto, limpa família/sistema se deixarem de ser válidos.
    const fam = catalog.familias[spec.familia];
    const stillValid = fam && fam.produtos.includes(p);
    onChange({ ...spec, produto: p, familia: stillValid ? spec.familia : "", sistema: stillValid ? spec.sistema : "" });
  };

  const pickSistema = (famKey, sisKey) => onChange({ ...spec, familia: famKey, sistema: sisKey });

  const setItem = (idx, k, v) => onChange({
    ...spec, itens: spec.itens.map((it, i) => (i === idx ? { ...it, [k]: v } : it)),
  });
  const addItem = () => onChange({ ...spec, itens: [...spec.itens, { ...emptyCaixItem }] });
  const removeItem = (idx) => onChange({ ...spec, itens: spec.itens.filter((_, i) => i !== idx) });

  const totalUn = spec.itens.reduce((s, it) => s + (parseInt(it.quantidade, 10) || 0), 0);

  return (
    <div>
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
            className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold ${spec.tipo_pedido === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}
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
              className={`rounded-xl border px-2 py-2.5 text-xs font-bold ${spec.produto === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}
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
                  const active = spec.familia === famKey && spec.sistema === sisKey;
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
              <Select value={spec.material || "none"} onValueChange={(v) => set("material", v === "none" ? "" : v)}>
                <SelectTrigger data-testid="caix-material"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {Object.entries(catalog.materiais).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ref. do material</Label>
              <Input data-testid="caix-material-ref" value={spec.material_ref} onChange={(e) => set("material_ref", e.target.value)} placeholder="Ex.: vidro duplo 4+16+4" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cor do aro</Label>
              <Input data-testid="caix-cor-aro" value={spec.cor_aro} onChange={(e) => set("cor_aro", e.target.value)} placeholder="Ex.: Branco RAL 9016" />
            </div>
            <div className="space-y-1.5">
              <Label>Cor da folha</Label>
              <Input data-testid="caix-cor-folha" value={spec.cor_folha} onChange={(e) => set("cor_folha", e.target.value)} placeholder="Ex.: Branco RAL 9016" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Fechadura</Label>
              <Select value={spec.fechadura || "none"} onValueChange={(v) => set("fechadura", v === "none" ? "" : v)}>
                <SelectTrigger data-testid="caix-fechadura"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {Object.entries(catalog.fechaduras).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Muletas</Label>
              <Select value={spec.muletas || "none"} onValueChange={(v) => set("muletas", v === "none" ? "" : v)}>
                <SelectTrigger data-testid="caix-muletas"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {Object.entries(catalog.muletas).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estore</Label>
              <Select value={spec.estore || "none"} onValueChange={(v) => set("estore", v === "none" ? "" : v)}>
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
            {spec.itens.map((it, idx) => (
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
                  disabled={spec.itens.length === 1}
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
          <Textarea data-testid="caix-observacoes" value={spec.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} placeholder="Ex.: desenho do caixilho em anexo, pré-aro incluído..." />
        </div>
        <div className="space-y-1.5">
          <Label>Entrega pretendida</Label>
          <Input data-testid="caix-data-entrega" type="date" value={spec.data_entrega} onChange={(e) => set("data_entrega", e.target.value)} />
        </div>
      </div>
    </div>
  );
}
