import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import api from "@/lib/api";

// Seletor compacto de "Artigos relacionados" — mesmo padrão visual da
// mini-lista de dependências do TaskDialog.jsx (checkbox + título, caixa
// com scroll), reaproveitado aqui para ligar um Pedido/Fornecedor a um ou
// mais artigos do Centro de Conhecimento (related_article_ids).
export default function KnowledgeArticlePicker({ selectedIds = [], onChange, testIdPrefix = "knowledge-picker" }) {
  const [articles, setArticles] = useState([]);

  useEffect(() => {
    api.get("/knowledge/articles").then(({ data }) => setArticles(data)).catch(() => {});
  }, []);

  if (articles.length === 0) return null;

  const toggle = (id) => {
    const has = selectedIds.includes(id);
    onChange(has ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  return (
    <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
      {articles.map((a) => (
        <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
          <Checkbox
            data-testid={`${testIdPrefix}-${a.id}`}
            checked={selectedIds.includes(a.id)}
            onCheckedChange={() => toggle(a.id)}
            className="h-4 w-4"
          />
          <span className="flex-1 truncate text-foreground">{a.title}</span>
        </label>
      ))}
    </div>
  );
}
