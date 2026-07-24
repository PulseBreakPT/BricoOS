// Capitalização automática do nome do cliente — primeira letra de cada
// palavra em maiúscula, exceto partículas de nomes compostos (da/de/do/
// das/dos/e) quando não são a primeira palavra. Comprimento da string
// nunca muda (só a capitalização de cada letra), por isso quem chama isto
// num campo de texto pode preservar a posição do cursor tal e qual.

const NAME_PARTICLES = new Set(["da", "de", "do", "das", "dos", "e"]);

function capitalizeWord(word) {
  const lower = word.toLocaleLowerCase("pt-PT");
  return lower.charAt(0).toLocaleUpperCase("pt-PT") + lower.slice(1);
}

// Versão "ao vivo" — preserva os espaços exatamente como foram escritos
// (nunca colapsa nem apara), para não estragar o cursor a meio de escrever
// um espaço antes da palavra seguinte.
export function capitalizeName(value) {
  const str = String(value ?? "");
  const tokens = str.match(/[^\s]+|\s+/g) || [];
  let wordIndex = 0;
  return tokens.map((tok) => {
    if (/^\s+$/.test(tok)) return tok;
    const isFirstWord = wordIndex === 0;
    wordIndex += 1;
    const lower = tok.toLocaleLowerCase("pt-PT");
    // A primeira palavra começa sempre por maiúscula, mesmo que coincida
    // com uma partícula (ex.: alguém chamado só "Da" no início do nome).
    if (!isFirstWord && NAME_PARTICLES.has(lower)) return lower;
    return capitalizeWord(tok);
  }).join("");
}

// Versão final (onBlur) — apara espaços nas pontas e colapsa espaços
// repetidos a um só, depois capitaliza. A versão "ao vivo" não faz isto
// enquanto se escreve, para não impedir escrever um espaço a seguir a
// outro por engano sem o campo "comer" a tecla.
export function normalizeName(value) {
  const collapsed = String(value ?? "").trim().replace(/\s+/g, " ");
  return capitalizeName(collapsed);
}
