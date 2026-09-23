const BASE = "https://centraldedados.dev.br";

// PocketBase views need: valid SQL, id column, and field definitions
// ROW_NUMBER() not supported in PB view validation - use MIN(rowid) instead
const views = [
  {
    name: "v_total_equipe",
    query: "SELECT MIN(rowid) as id, equipe, count(*) as total FROM amarcap53_pacientes WHERE equipe != '' GROUP BY equipe ORDER BY total DESC"
  },
  {
    name: "v_total_unidade",
    query: "SELECT MIN(rowid) as id, unidade, count(*) as total FROM amarcap53_pacientes WHERE unidade != '' GROUP BY unidade ORDER BY total DESC"
  },
  {
    name: "v_total_equipe_micro",
    query: "SELECT MIN(rowid) as id, equipe, microarea, count(*) as total FROM amarcap53_pacientes WHERE equipe != '' GROUP BY equipe, microarea ORDER BY total DESC"
  },
  {
    name: "v_semcito_equipe",
    query: "SELECT MIN(rowid) as id, equipe, count(*) as total FROM amarcap53_pacientes WHERE (cito_lab = '' OR cito_lab IS NULL) AND (cito_pep = '' OR cito_pep IS NULL) AND equipe != '' GROUP BY equipe ORDER BY total DESC"
  },
  {
    name: "v_semcito_unidade",
    query: "SELECT MIN(rowid) as id, unidade, count(*) as total FROM amarcap53_pacientes WHERE (cito_lab = '' OR cito_lab IS NULL) AND (cito_pep = '' OR cito_pep IS NULL) AND unidade != '' GROUP BY unidade ORDER BY total DESC"
  },
  {
    name: "v_semcito_equipe_micro",
    query: "SELECT MIN(rowid) as id, equipe, microarea, count(*) as total FROM amarcap53_pacientes WHERE (cito_lab = '' OR cito_lab IS NULL) AND (cito_pep = '' OR cito_pep IS NULL) AND equipe != '' GROUP BY equipe, microarea ORDER BY total DESC"
  }
];

async function main() {
  // Auth
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
    try {
      const body = JSON.stringify({
        name: view.name,
        type: "view",
        viewQuery: view.query,
        fields: [
          { name: "id", type: "text", required: true, primaryKey: true },
          { name: "equipe", type: "text" },
          { name: "unidade", type: "text" },
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
  console.log("\n--- Verifying views ---");
  for (const view of views) {
    try {
      const resp = await fetch(`${BASE}/api/collections/${view.name}/records?perPage=3`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        console.log(`VERIFY OK: ${view.name} - ${data.items.length} items (total: ${data.totalItems})`);
        if (data.items.length > 0) {
          console.log(`  Sample:`, JSON.stringify(data.items[0]));
        }
      } else {
        console.error(`VERIFY FAIL: ${view.name} - ${resp.status}`);
      }
    } catch (e) {
      console.error(`VERIFY ERROR: ${view.name} - ${e.message}`);
    }
  }
}

main();
