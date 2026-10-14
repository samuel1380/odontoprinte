// Leitura inteligente do nome do arquivo 3D.
//
// O laboratório recebe os arquivos da pasta Drive da clínica e joga no
// Halot Box / Chitubox. O conteúdo do arquivo NUNCA sobe ao sistema
// (é pesado) — só nome, tamanho e hash. Como o nome do arquivo já contém
// clínica/doutor + paciente, este parser extrai essas informações para
// preencher o upload automaticamente. Tudo continua editável na tela.
//
// Exemplos reais que o parser entende:
//   "OdontoPrime_PAC45_Troquel.stl"      -> clínica OdontoPrime, paciente PAC45, com troquel
//   "DRA MARIA - 102 - PLACA.stl"        -> clínica DRA MARIA, paciente 102, placa
//   "clinicaX_pacienteY_sem_troquel.stl" -> paciente PACIENTEY..., sem troquel
//   "COROA IMPLANTE 205 DR PAULO.stl"    -> coroa sobre implante

export interface ParsedFileName {
  /** Clínica ou doutor identificado no nome (null se não achou). */
  clinic: string | null;
  /** Código do paciente (null se não achou). */
  patient: string | null;
  /** Id de LAB_WORK_TYPES (null = manter o padrão da tela). */
  workType: string | null;
}

const VALID_EXTENSIONS = [".stl", ".obj", ".3mf", ".ply"];

export function stripExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  for (const ext of VALID_EXTENSIONS) {
    if (lower.endsWith(ext)) return fileName.slice(0, -ext.length);
  }
  return fileName.replace(/\.[^/.]+$/, "");
}

/** Maiúsculas sem acento, espaços colapsados. */
export function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function splitTokens(nameWithoutExt: string): string[] {
  return nameWithoutExt
    .split(/[-_–—|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

const CLINIC_PREFIXES = ["DRA", "DR", "DOUTORA", "DOUTOR", "CLINICA", "ODONTO"];

/** Palavras que indicam tipo de peça (ordem importa: checar SEM antes de COM). */
function detectWorkType(normalized: string): string | null {
  const has = (kw: string) => normalized.includes(kw);
  if (has("SEM TROQUEL") || has("SEM TROQUEIS") || has("SOLIDO") || has("MACICO") || has("SEM DENTE")) {
    return "MODELO_SEM_TROQUEL";
  }
  if (has("ANTAGONISTA") || has("OPOSITOR") || has("OPONENTE")) return "ANTAGONISTA";
  if (has("GENGIVA") || has("GENGIVAL") || has("MASCARA") || has("MASK")) return "GENGIVA";
  if (has("MIORRELAXANTE") || has("PLACA") || has("BRUXISMO")) return "PLACA";
  if (has("COROA") && has("IMPLANTE")) return "COROA_SOBRE_IMPLANTE";
  if (has("COROA") && has("DENTE") && !has("TROQUEL")) return "COROA_SOBRE_DENTE";
  if (has("COROA")) return "COROA";
  if (has("CERAMICA") || has("CARGA")) return "CERAMICA_DE_CARGA";
  if (has("TROQUEL") || has("TROQUEIS") || has("COM TROQUEL")) return "MODELO_COM_TROQUEL";
  return null;
}

function detectClinic(
  tokens: string[],
  normalizedFull: string,
  knownClinics: string[]
): string | null {
  // 1. Clínica já cadastrada no sistema (a mais longa ganha).
  let best: string | null = null;
  for (const clinic of knownClinics) {
    const norm = normalizeToken(clinic);
    if (norm.length >= 3 && normalizedFull.includes(norm)) {
      if (!best || norm.length > normalizeToken(best).length) best = clinic.trim();
    }
  }
  if (best) return best;

  // 2. Padrão "DR/DRA/DOUTOR + nome" ou "CLINICA/ODONTO + nome",
  // seja em token próprio ("DR_PAULO") ou no início ("DRA MARIA - ...").
  const upper = tokens.map((t) => normalizeToken(t));
  for (let i = 0; i < upper.length; i++) {
    const cur = upper[i];
    if (CLINIC_PREFIXES.includes(cur) && upper[i + 1]) {
      return `${tokens[i].trim()} ${tokens[i + 1].trim()}`.trim();
    }
    for (const prefix of CLINIC_PREFIXES) {
      if (cur.startsWith(prefix + " ") && cur.length > prefix.length + 2) {
        return tokens[i].trim();
      }
    }
  }
  return null;
}

const CODE_LIKE = /^([A-ZÀ-Ú]*\d+[A-Z0-9]*|\d{2,})$/;

function detectPatient(tokens: string[], clinicTokens: Set<string>): string | null {
  const usable = tokens.filter((t) => !clinicTokens.has(normalizeToken(t)));
  // 1. Token com cara de código (letras+números ou só números).
  for (const t of usable) {
    const n = normalizeToken(t).replace(/\s+/g, "");
    const compact = n.replace(/^(PAC|PCT|PT)/, "");
    if (CODE_LIKE.test(n) || (compact !== n && compact.length >= 1)) {
      // Evita confundir com medidas (ex: "10MM") ou ano.
      if (/^(MM|CM)$/.test(n.slice(-2)) && /^\d/.test(n)) continue;
      if (/^\d{3,4}$/.test(n) && Number(n) >= 1900 && Number(n) <= 2100) continue;
      return t.trim().toUpperCase();
    }
  }
  // 2. Primeiro token útil que não seja tipo de peça.
  const workWords = ["MODELO", "TROQUEL", "TROQUEIS", "PLACA", "COROA", "GENGIVA", "ANTAGONISTA", "PROVA", "PROVISORIO", "SUPERIOR", "INFERIOR"];
  for (const t of usable) {
    const n = normalizeToken(t);
    if (!workWords.includes(n)) return t.trim().toUpperCase();
  }
  return usable.length > 0 ? usable[0].trim().toUpperCase() : null;
}

export function parseFileName(fileName: string, knownClinics: string[] = []): ParsedFileName {
  const base = stripExtension(fileName);
  const tokens = splitTokens(base);
  const normalizedFull = normalizeToken(tokens.join(" "));

  const workType = detectWorkType(normalizedFull);
  const clinic = detectClinic(tokens, normalizedFull, knownClinics);

  const clinicTokens = new Set<string>();
  if (clinic) {
    for (const part of clinic.split(/\s+/)) clinicTokens.add(normalizeToken(part));
  }
  let patient = detectPatient(tokens, clinicTokens);

  // Último recurso: primeiro pedaço do nome (comportamento antigo).
  if (!patient && tokens.length > 0) patient = tokens[0].trim().toUpperCase();
  if (patient && patient.length > 40) patient = patient.slice(0, 40);

  return { clinic, patient, workType };
}
