/** Tipos para coleções AMARCAP53 no PocketBase — baseado no schema real */

export interface Amarcap53Paciente {
  id: string;
  created: string;
  updated: string;
  collectionId: string;
  collectionName: string;
  nome: string;
  cns: string;
  equipe: string;
  unidade: string;
  unidade_solicitante: string;
  microarea: number;
  grupo: string;
  idade: number;
  data_nascimento: string;
  cito_lab: string;
  cito_pep: string;
  dna_hpv_gal: string;
  dna_hpv_pep: string;
  [key: string]: string | number;
}

export interface Amarcap53Acompanhamento {
  id: string;
  created: string;
  updated: string;
  collectionId: string;
  collectionName: string;
  cns: string;
  paciente: string;
  profissional: string;
  data_busca: string;
  data_do_agendamento: string;
  tipo_busca: string;
  tipo_contato: string;
  situacao_pos_busca: string[];
  entraves_identificados: string[];
  entraves_informado_por: string;
  observacoes: string;
  [key: string]: string | string[] | number;
}

export interface BucketCount {
  label: string;
  count: number;
}

export interface EstatisticasData {
  porEquipe: BucketCount[];
  porUnidade: BucketCount[];
  porEquipeMicroarea: BucketCount[];
  totalGeral: number;
}

export type EstatisticasTab = "total" | "sem_cito";

/** Dados brutos das views para filtro cascata */
export interface FilterData {
  unidades: string[];
  equipes: Record<string, string[]>;
  microareas: Record<string, number[]>;
  totais: Record<string, number>;
}
