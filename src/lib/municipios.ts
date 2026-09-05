/** 16 municípios do Amapá — catálogo seed, extensível. */
export const AMAPA_MUNICIPIOS = [
  { nome: "Macapá", ibge: "1600303" },
  { nome: "Santana", ibge: "1600600" },
  { nome: "Laranjal do Jari", ibge: "1600279" },
  { nome: "Oiapoque", ibge: "1600501" },
  { nome: "Mazagão", ibge: "1600402" },
  { nome: "Porto Grande", ibge: "1600535" },
  { nome: "Pedra Branca do Amapari", ibge: "1600154" },
  { nome: "Vitória do Jari", ibge: "1600808" },
  { nome: "Tartarugalzinho", ibge: "1600709" },
  { nome: "Amapá", ibge: "1600105" },
  { nome: "Calçoene", ibge: "1600204" },
  { nome: "Ferreira Gomes", ibge: "1600238" },
  { nome: "Cutias", ibge: "1600212" },
  { nome: "Itaubal", ibge: "1600253" },
  { nome: "Serra do Navio", ibge: "1600055" },
  { nome: "Pracuúba", ibge: "1600550" },
] as const;

export const CLASSIFICACAO_OPERACAO = [
  "estruturada",
  "em_implantacao",
  "fragil",
  "sem_estrutura",
] as const;

export type ClassificacaoOperacao = (typeof CLASSIFICACAO_OPERACAO)[number];

export type PessoaContato = {
  nome: string;
  telefone: string;
  base: string;
};

export type MunicipioBlock = {
  id: string;
  municipio: string;
  uf: string;
  ibge?: string;
  responsavelPolitico: PessoaContato;
  coordenadorCampanha: PessoaContato;
  estruturaLocal: string;
  aliados: string;
  capacidadeMobilizacao: string;
  agendaPactuada: string;
  situacaoEleitoral: string;
  necessidades: string;
  classificacao: ClassificacaoOperacao | "";
};

export function emptyPessoa(): PessoaContato {
  return { nome: "", telefone: "", base: "" };
}

export function emptyMunicipioBlock(partial?: Partial<MunicipioBlock>): MunicipioBlock {
  return {
    id: partial?.id || cryptoRandomId(),
    municipio: partial?.municipio || "",
    uf: partial?.uf || "AP",
    ibge: partial?.ibge,
    responsavelPolitico: partial?.responsavelPolitico || emptyPessoa(),
    coordenadorCampanha: partial?.coordenadorCampanha || emptyPessoa(),
    estruturaLocal: partial?.estruturaLocal || "",
    aliados: partial?.aliados || "",
    capacidadeMobilizacao: partial?.capacidadeMobilizacao || "",
    agendaPactuada: partial?.agendaPactuada || "",
    situacaoEleitoral: partial?.situacaoEleitoral || "",
    necessidades: partial?.necessidades || "",
    classificacao: partial?.classificacao || "",
  };
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `mun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function seedAmapaMunicipioBlocks(): MunicipioBlock[] {
  return AMAPA_MUNICIPIOS.map((m) =>
    emptyMunicipioBlock({
      municipio: m.nome,
      uf: "AP",
      ibge: m.ibge,
    }),
  );
}

export function isPessoaFilled(p: PessoaContato | null | undefined) {
  if (!p) return false;
  return Boolean(p.nome?.trim() || p.telefone?.trim() || p.base?.trim());
}

/** Município “operacionalmente preenchido”: nome + classificação + ao menos um responsável. */
export function isMunicipioBlockFilled(block: MunicipioBlock) {
  if (!block.municipio?.trim()) return false;
  if (!block.classificacao) return false;
  return isPessoaFilled(block.responsavelPolitico) || isPessoaFilled(block.coordenadorCampanha);
}

export function municipioBlocksProgress(blocks: MunicipioBlock[]) {
  const total = blocks.length;
  const filled = blocks.filter(isMunicipioBlockFilled).length;
  return {
    total,
    filled,
    percent: total ? Math.round((filled / total) * 100) : 0,
  };
}

export function parseMunicipioBlocks(raw: unknown): MunicipioBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = (item ?? {}) as Partial<MunicipioBlock>;
    return emptyMunicipioBlock({
      id: typeof o.id === "string" ? o.id : undefined,
      municipio: String(o.municipio ?? ""),
      uf: String(o.uf ?? "AP"),
      ibge: o.ibge ? String(o.ibge) : undefined,
      responsavelPolitico: {
        nome: String(o.responsavelPolitico?.nome ?? ""),
        telefone: String(o.responsavelPolitico?.telefone ?? ""),
        base: String(o.responsavelPolitico?.base ?? ""),
      },
      coordenadorCampanha: {
        nome: String(o.coordenadorCampanha?.nome ?? ""),
        telefone: String(o.coordenadorCampanha?.telefone ?? ""),
        base: String(o.coordenadorCampanha?.base ?? ""),
      },
      estruturaLocal: String(o.estruturaLocal ?? ""),
      aliados: String(o.aliados ?? ""),
      capacidadeMobilizacao: String(o.capacidadeMobilizacao ?? ""),
      agendaPactuada: String(o.agendaPactuada ?? ""),
      situacaoEleitoral: String(o.situacaoEleitoral ?? ""),
      necessidades: String(o.necessidades ?? ""),
      classificacao: (CLASSIFICACAO_OPERACAO.includes(o.classificacao as ClassificacaoOperacao)
        ? o.classificacao
        : "") as ClassificacaoOperacao | "",
    });
  });
}
