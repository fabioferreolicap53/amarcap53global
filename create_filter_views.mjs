const BASE = "https://centraldedados.dev.br";

const DNA_HPV_FILTER = "(dna_hpv_pep != '' AND dna_hpv_pep IS NOT NULL) OR (dna_hpv_gal != '' AND dna_hpv_gal IS NOT NULL)";
const SEM_CITO_FILTER = "(cito_lab = '' OR cito_lab IS NULL) AND (cito_pep = '' OR cito_pep IS NULL)";

// v_am53_consolidado: UMA query devolve total E semcito agrupados por
// unidade+equipe+microárea. Todas as dimensões do frontend (total/semCito
// por unidade, equipe, equipe+microárea e o filtro em cascata) são derivadas
// destas mesmas linhas — 1 request substitui as 3 views anteriores.
// Colunas na ordem do covering index idx_am53_ue_micro_rast.
const views = [
  {
    name: "v_am53_consolidado",
    query: `SELECT MIN(rowid) as id, unidade, equipe, microarea, count(*) as total, SUM(CASE WHEN (${SEM_CITO_FILTER}) THEN 1 ELSE 0 END) as semcito FROM amarcap53_pacientes WHERE unidade != '' AND equipe != '' AND (${DNA_HPV_FILTER}) GROUP BY unidade, equipe, microarea ORDER BY total DESC`
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
        fields: [
          { name: "id", type: "text", required: true, primaryKey: true },
          { name: "unidade", type: "text" },
          { name: "equipe", type: "text" },
          { name: "microarea", type: "text" },
          { name: "total", type: "number" },
          { name: "semcito", type: "number" }
        ]
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
