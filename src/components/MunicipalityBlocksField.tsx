"use client";

import { useEffect, useState } from "react";
import {
  CLASSIFICACAO_OPERACAO,
  emptyMunicipioBlock,
  isMunicipioBlockFilled,
  municipioBlocksProgress,
  parseMunicipioBlocks,
  type ClassificacaoOperacao,
  type MunicipioBlock,
  type PessoaContato,
} from "@/lib/municipios";

type Props = {
  value: unknown;
  defaultUf?: string;
  onCommit: (blocks: MunicipioBlock[]) => void;
};

export function MunicipalityBlocksField({ value, defaultUf = "AP", onCommit }: Props) {
  const [blocks, setBlocks] = useState(() => parseMunicipioBlocks(value));
  const [openId, setOpenId] = useState<string | null>(() => parseMunicipioBlocks(value)[0]?.id ?? null);
  const [newName, setNewName] = useState("");
  const [filterGaps, setFilterGaps] = useState(false);

  useEffect(() => {
    setBlocks(parseMunicipioBlocks(value));
  }, [value]);

  const progress = municipioBlocksProgress(blocks);
  const visible = filterGaps ? blocks.filter((b) => !isMunicipioBlockFilled(b)) : blocks;

  function apply(updater: (prev: MunicipioBlock[]) => MunicipioBlock[], save: boolean) {
    setBlocks((prev) => {
      const next = updater(prev);
      if (save) onCommit(next);
      return next;
    });
  }

  function addMunicipio() {
    const nome = newName.trim();
    if (!nome) return;
    apply((prev) => {
      if (prev.some((b) => b.municipio.toLowerCase() === nome.toLowerCase())) return prev;
      const block = emptyMunicipioBlock({ municipio: nome, uf: defaultUf });
      setOpenId(block.id);
      return [...prev, block];
    }, true);
    setNewName("");
  }

  function removeMunicipio(id: string) {
    apply((prev) => {
      const next = prev.filter((b) => b.id !== id);
      if (openId === id) setOpenId(next[0]?.id ?? null);
      return next;
    }, true);
  }

  return (
    <div className="mun-field">
      <div className="mun-toolbar">
        <div>
          <strong>
            {progress.filled}/{progress.total} municípios com padrão mínimo
          </strong>
          <p className="mun-toolbar-hint">
            Mínimo validado: município + classificação + responsável ou coordenador. Novas cidades entram no mesmo
            padrão — a IA também grava separado por município.
          </p>
        </div>
        <label className="gap-toggle">
          <input type="checkbox" checked={filterGaps} onChange={(e) => setFilterGaps(e.target.checked)} />
          Só lacunas
        </label>
      </div>

      <div className="mini-bar mun-bar">
        <i style={{ width: `${progress.percent}%` }} />
      </div>

      <div className="mun-add">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Novo município"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addMunicipio();
            }
          }}
        />
        <button type="button" className="btn btn-secondary" onClick={addMunicipio}>
          Adicionar município
        </button>
      </div>

      <div className="mun-list">
        {visible.map((block) => {
          const filled = isMunicipioBlockFilled(block);
          const open = openId === block.id;
          return (
            <article key={block.id} className={`mun-card ${filled ? "is-filled" : "is-empty"}`}>
              <button type="button" className="mun-card-head" onClick={() => setOpenId(open ? null : block.id)}>
                <div>
                  <strong>
                    {block.municipio || "Sem nome"}
                    {block.uf ? `/${block.uf}` : ""}
                  </strong>
                  <span>
                    {block.classificacao
                      ? labelClassificacao(block.classificacao)
                      : "sem classificação"}
                    {" · "}
                    {block.responsavelPolitico.nome || block.coordenadorCampanha.nome || "sem responsável"}
                  </span>
                </div>
                <em>{filled ? "ok" : "lacuna"}</em>
              </button>

              {open ? (
                <div className="mun-card-body">
                  <div className="contact-grid">
                    <div className="field">
                      <label>Município *</label>
                      <input
                        value={block.municipio}
                        onChange={(e) =>
                          apply(
                            (prev) => prev.map((b) => (b.id === block.id ? { ...b, municipio: e.target.value } : b)),
                            false,
                          )
                        }
                        onBlur={() => apply((prev) => prev, true)}
                      />
                    </div>
                    <div className="field">
                      <label>UF *</label>
                      <input
                        value={block.uf}
                        maxLength={2}
                        onChange={(e) =>
                          apply(
                            (prev) =>
                              prev.map((b) =>
                                b.id === block.id ? { ...b, uf: e.target.value.toUpperCase() } : b,
                              ),
                            false,
                          )
                        }
                        onBlur={() => apply((prev) => prev, true)}
                      />
                    </div>
                    <div className="field">
                      <label>Classificação *</label>
                      <select
                        value={block.classificacao}
                        onChange={(e) =>
                          apply(
                            (prev) =>
                              prev.map((b) =>
                                b.id === block.id
                                  ? { ...b, classificacao: e.target.value as ClassificacaoOperacao | "" }
                                  : b,
                              ),
                            true,
                          )
                        }
                      >
                        <option value="">Selecionar…</option>
                        {CLASSIFICACAO_OPERACAO.map((c) => (
                          <option key={c} value={c}>
                            {labelClassificacao(c)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <h4 className="mun-subtitle">Responsável político</h4>
                  <PessoaInputs
                    value={block.responsavelPolitico}
                    onChange={(pessoa) =>
                      apply(
                        (prev) =>
                          prev.map((b) => (b.id === block.id ? { ...b, responsavelPolitico: pessoa } : b)),
                        false,
                      )
                    }
                    onBlur={() => apply((prev) => prev, true)}
                  />

                  <h4 className="mun-subtitle">Coordenador da campanha no município</h4>
                  <PessoaInputs
                    value={block.coordenadorCampanha}
                    onChange={(pessoa) =>
                      apply(
                        (prev) =>
                          prev.map((b) => (b.id === block.id ? { ...b, coordenadorCampanha: pessoa } : b)),
                        false,
                      )
                    }
                    onBlur={() => apply((prev) => prev, true)}
                  />

                  {(
                    [
                      ["estruturaLocal", "Estrutura local"],
                      ["aliados", "Aliados locais"],
                      ["capacidadeMobilizacao", "Capacidade de mobilização"],
                      ["agendaPactuada", "Agenda / ações pactuadas"],
                      ["situacaoEleitoral", "Situação eleitoral"],
                      ["necessidades", "Necessidades e demandas"],
                    ] as const
                  ).map(([key, label]) => (
                    <div className="field" key={key}>
                      <label>{label}</label>
                      <textarea
                        rows={2}
                        value={block[key]}
                        onChange={(e) =>
                          apply(
                            (prev) =>
                              prev.map((b) => (b.id === block.id ? { ...b, [key]: e.target.value } : b)),
                            false,
                          )
                        }
                        onBlur={() => apply((prev) => prev, true)}
                      />
                    </div>
                  ))}

                  <div className="mun-card-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => removeMunicipio(block.id)}>
                      Remover município
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PessoaInputs({
  value,
  onChange,
  onBlur,
}: {
  value: PessoaContato;
  onChange: (v: PessoaContato) => void;
  onBlur: () => void;
}) {
  return (
    <div className="contact-grid">
      <div className="field">
        <label>Nome</label>
        <input
          value={value.nome}
          onChange={(e) => onChange({ ...value, nome: e.target.value })}
          onBlur={onBlur}
          placeholder="Nome"
        />
      </div>
      <div className="field">
        <label>Telefone</label>
        <input
          value={value.telefone}
          onChange={(e) => onChange({ ...value, telefone: e.target.value })}
          onBlur={onBlur}
          placeholder="(xx) …"
        />
      </div>
      <div className="field">
        <label>Base</label>
        <input
          value={value.base}
          onChange={(e) => onChange({ ...value, base: e.target.value })}
          onBlur={onBlur}
          placeholder="Comitê / cidade"
        />
      </div>
    </div>
  );
}

function labelClassificacao(c: ClassificacaoOperacao | "") {
  switch (c) {
    case "estruturada":
      return "Estruturada";
    case "em_implantacao":
      return "Em implantação";
    case "fragil":
      return "Frágil";
    case "sem_estrutura":
      return "Sem estrutura";
    default:
      return c;
  }
}
