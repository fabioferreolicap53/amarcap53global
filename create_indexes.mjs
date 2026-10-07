const BASE = "https://centraldedados.dev.br";

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

  // Buscar collection atual
  const colResp = await fetch(`${BASE}/api/collections/amarcap53_pacientes`, { headers });
  if (!colResp.ok) {
    console.error("Collection fetch failed:", colResp.status);
    process.exit(1);
  }
  const collection = await colResp.json();

  // Índices para acelerar views SQL (prefixo am53_ para evitar conflito com outras coleções)
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_am53_dna_pep ON amarcap53_pacientes(dna_hpv_pep) WHERE dna_hpv_pep != ''",
    "CREATE INDEX IF NOT EXISTS idx_am53_dna_gal ON amarcap53_pacientes(dna_hpv_gal) WHERE dna_hpv_gal != ''",
    "CREATE INDEX IF NOT EXISTS idx_am53_cito_lab ON amarcap53_pacientes(cito_lab)",
    "CREATE INDEX IF NOT EXISTS idx_am53_cito_pep ON amarcap53_pacientes(cito_pep)",
    "CREATE INDEX IF NOT EXISTS idx_am53_equipe ON amarcap53_pacientes(equipe)",
    "CREATE INDEX IF NOT EXISTS idx_am53_unidade ON amarcap53_pacientes(unidade)",
    "CREATE INDEX IF NOT EXISTS idx_am53_eq_micro ON amarcap53_pacientes(equipe, microarea)",
    "CREATE INDEX IF NOT EXISTS idx_am53_un_eq ON amarcap53_pacientes(unidade, equipe)",
    "CREATE INDEX IF NOT EXISTS idx_am53_dna_eq ON amarcap53_pacientes(equipe, dna_hpv_pep, dna_hpv_gal, cito_lab, cito_pep)",
    "CREATE INDEX IF NOT EXISTS idx_am53_dna_un ON amarcap53_pacientes(unidade, dna_hpv_pep, dna_hpv_gal, cito_lab, cito_pep)",
    // Índice COBRE a view v_am53_consolidado: as colunas do GROUP BY vêm
    // primeiro (elimina o sort temporário) e todos os campos filtrados/agregados
    // estão no índice (covering — nenhuma leitura da tabela).
    "CREATE INDEX IF NOT EXISTS idx_am53_ue_micro_rast ON amarcap53_pacientes(unidade, equipe, microarea, dna_hpv_pep, dna_hpv_gal, cito_lab, cito_pep)",
  ];

  const patchResp = await fetch(`${BASE}/api/collections/amarcap53_pacientes`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ indexes })
  });

  if (patchResp.ok) {
    console.log("OK: Índices aplicados com sucesso");
    console.log(`  ${indexes.length} índices criados`);
  } else {
    const err = await patchResp.text();
    console.error("FAIL:", patchResp.status, err);
    process.exit(1);
  }

  // ── amarcap53_acompanhamentos ──
  // idx_acomp_cns: cruzamento paciente <-> acompanhamento por CNS (texto),
  // usado quando não há relação direta disponível.
  const acompIndexes = [
    "CREATE INDEX IF NOT EXISTS idx_am53_acomp_cns ON amarcap53_acompanhamentos(cns)",
  ];
  const patchAcomp = await fetch(`${BASE}/api/collections/amarcap53_acompanhamentos`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ indexes: acompIndexes })
  });
  if (patchAcomp.ok) {
    console.log("OK: Índices de acompanhamentos aplicados");
  } else {
    console.error("FAIL acompanhamentos:", patchAcomp.status, await patchAcomp.text());
  }

  // Verificar
  console.log("\n--- Verificando collection ---");
  const verifyResp = await fetch(`${BASE}/api/collections/amarcap53_pacientes`, { headers });
  if (verifyResp.ok) {
    const data = await verifyResp.json();
    console.log(`Records: ${data.totalItems || "?"}`);
    if (data.indexes) {
      console.log(`Indexes: ${data.indexes.length}`);
      data.indexes.forEach(i => console.log(`  - ${i}`));
    }
  }
}

main();
