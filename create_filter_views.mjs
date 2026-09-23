const BASE = "https://centraldedados.dev.br";

const DNA_HPV_FILTER = "(dna_hpv_pep != '' AND dna_hpv_pep IS NOT NULL) OR (dna_hpv_gal != '' AND dna_hpv_gal IS NOT NULL)";

const views = [
  {
    name: "v_total_unidade_equipe",
    query: `SELECT MIN(rowid) as id, unidade, equipe, count(*) as total FROM amarcap53_pacientes WHERE unidade != '' AND equipe != '' AND (${DNA_HPV_FILTER}) GROUP BY unidade, equipe ORDER BY total DESC`
  },
  {
    name: "v_total_unidade_equipe_micro",
    query: `SELECT MIN(rowid) as id, unidade, equipe, microarea, count(*) as total FROM amarcap53_pacientes WHERE unidade != '' AND equipe != '' AND (${DNA_HPV_FILTER}) GROUP BY unidade, equipe, microarea ORDER BY total DESC`
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
          { name: "total", type: "number" }
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
