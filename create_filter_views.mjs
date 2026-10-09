const BASE = "https://centraldedados.dev.br";

const DNA_HPV_FILTER = "(dna_hpv_pep != '' AND dna_hpv_pep IS NOT NULL) OR (dna_hpv_gal != '' AND dna_hpv_gal IS NOT NULL)";
const SEM_CITO_FILTER = "(cito_lab = '' OR cito_lab IS NULL) AND (cito_pep = '' OR cito_pep IS NULL)";
// Out/2026 "Gestão de lista": universo = 3 colunas em branco (cito_lab, cito_pep, dna_hpv_gal)
// OU dna_hpv_gal preenchida em out/2026. As duas condições são disjuntas
// (gal em branco vs. gal preenchida) → total = count(*) do grupo.
const BLANK_3_FILTER = "(cito_lab = '' OR cito_lab IS NULL) AND (cito_pep = '' OR cito_pep IS NULL) AND (dna_hpv_gal = '' OR dna_hpv_gal IS NULL)";

// v_am53_consolidado: UMA query devolve total E semcito agrupados por
// unidade+equipe+microárea. Todas as dimensões do frontend (total/semCito
// por unidade, equipe, equipe+microárea e o filtro em cascata) são derivadas
// destas mesmas linhas — 1 request substitui as 3 views anteriores.
// Colunas na ordem do covering index idx_am53_ue_micro_rast.
// Filtro Outubro Rosa 2026: apenas registros cujo dna_hpv_gal cai em out/2026.
const OUTUBRO_2026_FILTER = "dna_hpv_gal >= '2026-10-01' AND dna_hpv_gal < '2026-11-01'";

const BASE_FIELDS = [
  { name: "id", type: "text", required: true, primaryKey: true },
  { name: "unidade", type: "text" },
  { name: "equipe", type: "text" },
  { name: "microarea", type: "text" },
  { name: "total", type: "number" }
];

const views = [
  {
    name: "v_am53_consolidado",
    fields: [...BASE_FIELDS, { name: "semcito", type: "number" }],
    query: `SELECT MIN(rowid) as id, unidade, equipe, microarea, count(*) as total, SUM(CASE WHEN (${SEM_CITO_FILTER}) THEN 1 ELSE 0 END) as semcito FROM amarcap53_pacientes WHERE unidade != '' AND equipe != '' AND (${DNA_HPV_FILTER}) GROUP BY unidade, equipe, microarea ORDER BY total DESC`
  },
  {
    // Outubro Rosa 2026 — "Gestão de lista":
    //   total    = registros com cito_lab, cito_pep e dna_hpv_gal em branco
    //              + registros com dna_hpv_gal em out/2026 (condições disjuntas)
    //   alcancado = cito_lab e cito_pep em branco E dna_hpv_gal em out/2026
    name: "v_am53_outubro_rosa",
    fields: [...BASE_FIELDS, { name: "alcancado", type: "number" }],
    query: `SELECT MIN(rowid) as id, unidade, equipe, microarea, count(*) as total, SUM(CASE WHEN (${SEM_CITO_FILTER}) AND (${OUTUBRO_2026_FILTER}) THEN 1 ELSE 0 END) as alcancado FROM amarcap53_pacientes WHERE unidade != '' AND equipe != '' AND ((${BLANK_3_FILTER}) OR (${OUTUBRO_2026_FILTER})) GROUP BY unidade, equipe, microarea ORDER BY total DESC`
  }
];

async function main() {
  const authResp = await fetch(`${BASE}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: "fabioferreoli@gmail.com", password: "@Ffo260480" })
  });
  if (!authResp.ok) {
    console.error("Auth failed:", authResp.status);
    process.exit(1);
  }
  const { token } = await authResp.json();
  const headers = { Authorization: token, "Content-Type": "application/json" };

  for (const view of views) {
    // Deletar view existente se houver
    try {
      await fetch(`${BASE}/api/collections/${view.name}`, { method: "DELETE", headers });
      console.log(`DELETED: ${view.name}`);
    } catch { /* ignore */ }

    try {
      const body = JSON.stringify({
        name: view.name,
        type: "view",
        viewQuery: view.query,
        fields: view.fields
      });
      const resp = await fetch(`${BASE}/api/collections`, {
        method: "POST",
        headers,
        body
      });
      if (resp.ok) {
        const data = await resp.json();
        console.log(`OK: ${data.name} (id=${data.id})`);
      } else {
        const err = await resp.text();
        console.error(`FAIL: ${view.name} - ${resp.status} - ${err}`);
      }
    } catch (e) {
      console.error(`ERROR: ${view.name} - ${e.message}`);
    }
  }

  // Verify
  console.log("\n--- Verifying ---");
  for (const view of views) {
    try {
      const resp = await fetch(`${BASE}/api/collections/${view.name}/records?perPage=5`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        console.log(`OK: ${view.name} - ${data.totalItems} total, ${data.items.length} sample`);
        if (data.items.length > 0) console.log(`  Sample:`, JSON.stringify(data.items[0]));
      } else {
        console.error(`FAIL: ${view.name} - ${resp.status}`);
      }
    } catch (e) {
      console.error(`ERROR: ${view.name} - ${e.message}`);
    }
  }
}

main();
