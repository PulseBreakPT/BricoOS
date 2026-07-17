# Análise técnica BandAlumínios

O `bandaluminios_analysis.py` gera um índice Brico2 auditável a partir da
evidência estruturada em `bandaluminios_catalog.py`. O índice não é uma
certificação, uma classe normativa ou uma declaração de desempenho.

## Regras invioláveis

- Um dado ausente aparece como `Dados não encontrados em fontes oficiais.`
- Um conflito fica visível e não recebe pontuação.
- Uma classe antiga não é convertida sem correspondência oficial.
- Potenciais máximos do fabricante não são tratados como resultados da
  configuração fabricada pela BandAlumínios.
- Uf (aro), Ug (vidro) e Uw (vão completo) nunca são misturados.
- Um modelo novo entra imediatamente no catálogo, mas fica fora do ranking até
  ter os cinco eixos centrais comparáveis e fontes oficiais.

## Pontuações por característica

- Ar: `classe EN 12207 / 4 × 100`.
- Água: `pressão oficial / 600 Pa × 100`, limitada a 100. A interface avisa que
  classes Exxx podem superar 600 Pa e que 9A não é o máximo absoluto.
- Vento: menor valor entre o subíndice da pressão (classe/5) e o da deflexão
  (A/B/C). Quando existem várias amostras usa-se a pior classe publicada.
- Segurança: `classe RC / 6 × 100`.
- Uw e Rw: índice min–max relativo apenas entre dados oficiais comparáveis do
  catálogo. Como a norma não oferece uma escala fechada, este índice muda quando
  o catálogo muda.

Todos os cálculos, escalas, versões das normas e fontes são devolvidos pela API
e podem ser abertos na interface.

## Overall e ranking

Os cinco eixos centrais são térmica, ar, água, vento e acústica. Um modelo sem
qualquer um destes eixos não recebe Overall. O cálculo usa apenas eixos que
estejam disponíveis para todos os modelos elegíveis, preservando os pesos
relativos e impedindo que uma lacuna beneficie apenas um modelo.

O endpoint recalcula scores, categorias, ranking, percentis, medalhas,
vencedores e comparações em cada leitura. Os pesos e limites das categorias são
devolvidos em `methodology`, para que nenhuma regra fique escondida.

## Adicionar uma referência futura

1. Adicionar o modelo a `MODELS`, com a página oficial Band.
2. Pesquisar e registar apenas valores confirmados em `MODEL_EVIDENCE`.
3. Registar fontes adicionais do fabricante em `MANUFACTURER_SOURCES`, mantendo
   o respetivo escopo.
4. Registar divergências em `SOURCE_CONFLICTS`, sem escolher uma fonte de forma
   arbitrária.
5. Executar `python -m unittest discover -s backend -p 'test_*.py' -v`.

Se o passo 2 não estiver concluído, o motor mostra a referência na
`research_queue` e mantém o Overall bloqueado.
