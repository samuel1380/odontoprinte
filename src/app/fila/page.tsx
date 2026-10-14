"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import {
  PrintCardItem,
  PrintCardStatus,
  LabWorkType,
  DuplicateMatch,
  DuplicateCheckResult,
  ActiveRunInfo,
} from "@/types/domain";
import { PrintBatch, PrintItemHistory } from "@/types/database.types";
import {
  LAB_WORK_TYPES,
  LAB_WORK_TYPE_LABELS,
  PRINT_CARD_STATUS_CONFIG,
} from "@/lib/constants";
import {
  deriveBatchStatus,
  BATCH_STATUS_CONFIG,
  batchTitle,
  BatchDerivedStatus,
} from "@/lib/batch-status";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  Plus,
  Upload,
  Search,
  AlertTriangle,
  XCircle,
  SlidersHorizontal,
  ArrowRight,
  Undo2,
  Eye,
  Trash2,
  ChevronDown,
  Play,
  Sparkles,
  FileText,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// Interface do item em processo de upload (somente metadados: o conteúdo
// do arquivo 3D fica na pasta do laboratório e nunca sobe ao banco)
interface PendingUploadFile {
  id: string;
  file_name: string;
  file_size: number;
  file_hash: string;
  patient: string;
  patient_name: string;
  clinic: string;
  cadista: string;
  work_type: LabWorkType | string;
  priority: "NORMAL" | "URGENTE";
  due_date: string;
  material: string;
  quantity: number;
  notes: string;
  // Detecção de duplicidade
  duplicate_match?: DuplicateMatch;
  reprint_decision?: "REPRINT" | "CANCEL" | "OVERRIDE" | "NEW_VERSION";
  reprint_reason?: string;
}

export default function FilaPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Estados principais (fila organizada em pedidos/lotes)
  const [cards, setCards] = useState<PrintCardItem[]>([]);
  const [batches, setBatches] = useState<Array<PrintBatch & { items_count: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedBatchIds, setExpandedBatchIds] = useState<string[]>([]);

  // Filtros e busca
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BatchDerivedStatus | "TODAS">("TODAS");
  const [clinicFilter, setClinicFilter] = useState("TODAS");
  const [onlyReprints, setOnlyReprints] = useState(false);
  const [todayFilter, setTodayFilter] = useState(false);

  // Modais
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isPatientHistoryModalOpen, setIsPatientHistoryModalOpen] = useState(false);
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<string | null>(null);
  const [patientHistoryCards, setPatientHistoryCards] = useState<PrintCardItem[]>([]);
  const [isCardHistoryModalOpen, setIsCardHistoryModalOpen] = useState(false);
  const [selectedCardForHistory, setSelectedCardForHistory] = useState<PrintCardItem | null>(null);
  const [cardHistoryEntries, setCardHistoryEntries] = useState<PrintItemHistory[]>([]);

  // Modal de Apagar Pedido
  const [batchToDelete, setBatchToDelete] = useState<OrderGroup | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

  // Modal de Falha de Card Individual
  const [cardToFail, setCardToFail] = useState<PrintCardItem | null>(null);
  const [cardFailReason, setCardFailReason] = useState("");

  // Confirmação antes de concluir (evita avanço sem querer) + retorno de etapa
  const [cardToConfirmConclude, setCardToConfirmConclude] = useState<PrintCardItem | null>(null);
  const [isConfirmingConclude, setIsConfirmingConclude] = useState(false);

  // Estado do formulário de Upload em Massa
  const [pendingFiles, setPendingFiles] = useState<PendingUploadFile[]>([]);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [isSavingCards, setIsSavingCards] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Campos do "Aplicar a todos"
  const [bulkClinic, setBulkClinic] = useState("");
  const [bulkCadista, setBulkCadista] = useState("");
  const [bulkWorkType, setBulkWorkType] = useState<LabWorkType>("MODELO_COM_TROQUEL");
  const [bulkPriority, setBulkPriority] = useState<"NORMAL" | "URGENTE">("NORMAL");
  const [bulkDueDate, setBulkDueDate] = useState("");
  const [bulkMaterial, setBulkMaterial] = useState("Resina Standard Cinza");

  // Destino do upload: novo pedido ou pedido existente. Falhas pendentes
  // (prioridade para a próxima impressão) e ações em grupo.
  const [uploadDest, setUploadDest] = useState<string>("new");
  const [failedPendingCount, setFailedPendingCount] = useState(0);
  const [groupFailTarget, setGroupFailTarget] = useState<OrderGroup | null>(null);
  const [groupFailReason, setGroupFailReason] = useState("");
  const [isFailingGroup, setIsFailingGroup] = useState(false);
  const [groupConfirmTarget, setGroupConfirmTarget] = useState<{
    group: OrderGroup;
    to: "PREPARANDO" | "CONCLUIDO";
  } | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Impressões em andamento (ordens EM_IMPRESSAO vinculadas à fila)
  const [activeRuns, setActiveRuns] = useState<ActiveRunInfo[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());

  function formatElapsed(startedAt?: string | null): string {
    if (!startedAt) return "—";
    const diff = Math.max(0, Date.now() - new Date(startedAt).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `há ${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `há ${hours}h${mins % 60 ? ` ${mins % 60}min` : ""}`;
    const days = Math.floor(hours / 24);
    return `há ${days}d ${hours % 24}h`;
  }

  // Carregar dados
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cardsData, batchesData, runsData, failedData] = await Promise.all([
        OdontoPrintService.getPrintCards(),
        OdontoPrintService.getPrintBatches(),
        OdontoPrintService.getActiveRunsWithItems(),
        OdontoPrintService.getFailedPendingItems(),
      ]);
      setCards(cardsData);
      setBatches(batchesData);
      setActiveRuns(runsData);
      setFailedPendingCount(failedData.length);
    } catch {
      toast.error("Erro ao carregar fila de impressão.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const prefs = OdontoPrintService.getLastUsedPreferences();
    setBulkClinic(prefs.clinic);
    setBulkCadista(prefs.cadista);
    // Atualiza o andamento a cada 30s (tempo decorrido + recarrega ordens)
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 30000);
    const refresher = setInterval(() => {
      OdontoPrintService.getActiveRunsWithItems()
        .then(setActiveRuns)
        .catch(() => {});
    }, 30000);
    return () => {
      clearInterval(timer);
      clearInterval(refresher);
    };
  }, []);

  // Mapa código -> ordem ativa e item -> ordem ativa (para o chip "ver impressão")
  const runByCode = useMemo(() => {
    const map = new Map<string, ActiveRunInfo>();
    for (const r of activeRuns) map.set(r.run_code, r);
    return map;
  }, [activeRuns]);

  const runByItemId = useMemo(() => {
    const map = new Map<string, ActiveRunInfo>();
    for (const r of activeRuns) {
      for (const itemId of r.item_ids) {
        if (!map.has(itemId)) map.set(itemId, r);
      }
    }
    return map;
  }, [activeRuns]);

  // Extrair listas únicas para filtros
  const uniqueClinics = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => {
      if (c.clinic_name) set.add(c.clinic_name);
    });
    return Array.from(set).sort();
  }, [cards]);

  interface OrderGroup {
    key: string;
    batchId: string | null;
    title: string;
    batchNumber: number | null;
    createdAt: string;
    items: PrintCardItem[];
    derived: BatchDerivedStatus;
    printableCount: number;
    isPrinting: boolean;
  }

  // Pedidos (lotes): cada pedido agrupa só os itens dele, mais recentes primeiro.
  // Itens sem lote (pedidos antigos) ficam no grupo "Sem lote", por último.
  const orderGroups = useMemo<OrderGroup[]>(() => {
    const byBatch = new Map<string, PrintCardItem[]>();
    const loose: PrintCardItem[] = [];
    for (const card of cards) {
      if (card.batch_id && batches.some((b) => b.id === card.batch_id)) {
        const list = byBatch.get(card.batch_id) || [];
        list.push(card);
        byBatch.set(card.batch_id, list);
      } else {
        loose.push(card);
      }
    }

    const groups: OrderGroup[] = [...batches]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((b) => {
        const items = byBatch.get(b.id) || [];
        return {
          key: b.id,
          batchId: b.id,
          title: batchTitle(b.batch_name, (b as any).batch_number ?? null),
          batchNumber: (b as any).batch_number ?? null,
          createdAt: b.created_at,
          items,
          derived: deriveBatchStatus(items.map((i) => i.status)),
          printableCount: items.filter((i) =>
            ["NA_FILA", "PREPARANDO", "FALHOU"].includes(i.status)
          ).length,
          isPrinting: items.some((i) => i.status === "IMPRIMINDO"),
        };
      });

    if (loose.length > 0) {
      groups.push({
        key: "avulsos",
        batchId: null,
        title: "Sem lote — pedidos antigos",
        batchNumber: null,
        createdAt: loose.map((i) => i.created_at).sort()[0] || new Date().toISOString(),
        items: loose,
        derived: deriveBatchStatus(loose.map((i) => i.status)),
        printableCount: loose.filter((i) =>
          ["NA_FILA", "PREPARANDO", "FALHOU"].includes(i.status)
        ).length,
        isPrinting: loose.some((i) => i.status === "IMPRIMINDO"),
      });
    }
    return groups;
  }, [cards, batches]);

  const cardMatchesQuery = (card: PrintCardItem, q: string): boolean => {
    return (
      card.patient_code.toLowerCase().includes(q) ||
      (card.patient_name && card.patient_name.toLowerCase().includes(q)) ||
      card.clinic_name.toLowerCase().includes(q) ||
      card.cadista_name.toLowerCase().includes(q) ||
      card.file_name.toLowerCase().includes(q) ||
      (LAB_WORK_TYPE_LABELS[card.work_type] || card.work_type).toLowerCase().includes(q)
    );
  };

  // Pedidos filtrados
  const filteredGroups = useMemo(() => {
    return orderGroups.filter((g) => {
      if (statusFilter !== "TODAS" && g.derived !== statusFilter) return false;
      if (clinicFilter !== "TODAS" && !g.items.some((c) => c.clinic_name.toLowerCase() === clinicFilter.toLowerCase())) return false;
      if (onlyReprints && !g.items.some((c) => c.is_retry)) return false;
      if (todayFilter) {
        const todayStr = new Date().toISOString().split("T")[0];
        if (!g.createdAt.startsWith(todayStr)) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = g.title.toLowerCase().includes(q);
        if (!inTitle && !g.items.some((c) => cardMatchesQuery(c, q))) return false;
      }
      return true;
    });
  }, [orderGroups, statusFilter, clinicFilter, onlyReprints, todayFilter, searchQuery]);

  // Contadores por status do pedido
  const statusCounts = useMemo(() => {
    const counts: Record<BatchDerivedStatus, number> = {
      AGUARDANDO: 0,
      PREPARANDO: 0,
      IMPRIMINDO: 0,
      IMPRESSO: 0,
      CONCLUIDO: 0,
      ERRO: 0,
    };
    for (const g of orderGroups) {
      counts[g.derived]++;
    }
    return counts;
  }, [orderGroups]);

  // Helper para calcular SHA-256 do arquivo
  const computeFileHash = async (file: File): Promise<string> => {
    try {
      const buffer = await file.slice(0, 1024 * 1024).arrayBuffer(); // primeiros 1MB para hashing rápido
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return `${file.name}_${file.size}_${file.lastModified}`;
    }
  };

  // Adicionar arquivos ao upload (lê só nome, tamanho e hash; o conteúdo
  // do arquivo permanece na pasta do laboratório)
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validExtensions = [".stl", ".obj", ".3mf", ".ply"];
    const newItems: PendingUploadFile[] = [];

    const prefs = OdontoPrintService.getLastUsedPreferences();
    const defaultClinic = bulkClinic || prefs.clinic;
    const defaultCadista = bulkCadista || prefs.cadista;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!validExtensions.includes(ext)) {
        toast.warning(`Arquivo ${file.name} ignorado (apenas .stl, .obj, .3mf, .ply aceitos).`);
        continue;
      }

      // Extrai sugestão de paciente do nome do arquivo (ex: "PAC123_MODELO.stl" -> "PAC123")
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      const patientSuggestion = nameWithoutExt.split(/[-_]/)[0] || nameWithoutExt;

      const hash = await computeFileHash(file);

      newItems.push({
        id: crypto.randomUUID(),
        file_name: file.name,
        file_size: file.size,
        file_hash: hash,
        patient: patientSuggestion.toUpperCase(),
        patient_name: "",
        clinic: defaultClinic,
        cadista: defaultCadista,
        work_type: bulkWorkType,
        priority: bulkPriority,
        due_date: bulkDueDate,
        material: bulkMaterial,
        quantity: 1,
        notes: "",
      });
    }

    if (newItems.length === 0) return;

    // Faz verificação de duplicidades
    setIsCheckingDuplicates(true);
    try {
      const dupCheck = await OdontoPrintService.checkDuplicates(
        newItems.map((item) => ({
          patient: item.patient,
          clinic: item.clinic,
          work_type: item.work_type,
          file_name: item.file_name,
          file_hash: item.file_hash,
        }))
      );

      // Associa os matches
      for (const item of newItems) {
        const match = dupCheck.matches.find(
          (m) =>
            m.matched_item.file_name.toLowerCase() === item.file_name.toLowerCase() ||
            (m.matched_item.patient_code.toLowerCase() === item.patient.toLowerCase() &&
              m.matched_item.work_type === item.work_type)
        );
        if (match) {
          item.duplicate_match = match;
          if (match.suggested_action === "REPRINT") {
            item.reprint_decision = "REPRINT";
            item.reprint_reason = "Falha no trabalho anterior";
          }
        }
      }
    } catch (err) {
      console.warn("Erro ao verificar duplicidades:", err);
    } finally {
      setIsCheckingDuplicates(false);
    }

    setPendingFiles((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Aplicar dados a todos os itens pendentes
  const handleApplyToAll = () => {
    if (pendingFiles.length === 0) return;
    setPendingFiles((prev) =>
      prev.map((item) => ({
        ...item,
        clinic: bulkClinic || item.clinic,
        cadista: bulkCadista || item.cadista,
        work_type: bulkWorkType,
        priority: bulkPriority,
        due_date: bulkDueDate || item.due_date,
        material: bulkMaterial || item.material,
      }))
    );
    toast.success("Dados aplicados a todos os arquivos da lista!");
  };

  // Salvar cards de upload
  const handleSaveUpload = async () => {
    if (pendingFiles.length === 0) {
      toast.error("Adicione pelo menos um arquivo.");
      return;
    }

    // Validação de campos obrigatórios
    for (const item of pendingFiles) {
      if (!item.patient.trim()) {
        toast.error(`Informe o código do paciente para o arquivo ${item.file_name}.`);
        return;
      }
      if (!item.clinic.trim()) {
        toast.error(`Informe a clínica para o arquivo ${item.file_name}.`);
        return;
      }
      if (!item.cadista.trim()) {
        toast.error(`Informe o cadista para o arquivo ${item.file_name}.`);
        return;
      }

      // Se houver duplicidade com alerta forte e não foi decidido
      if (
        item.duplicate_match &&
        item.duplicate_match.alert_level === "HIGH" &&
        !item.reprint_decision
      ) {
        toast.error(
          `Resolva a pendência de duplicidade para o arquivo ${item.file_name} (escolha se é reimpressão ou confirme).`
        );
        return;
      }
    }

    setIsSavingCards(true);
    try {
      const payload = pendingFiles
        .filter((i) => i.reprint_decision !== "CANCEL")
        .map((item) => ({
          patient: item.patient.trim().toUpperCase(),
          patient_name: item.patient_name.trim() || undefined,
          clinic: item.clinic.trim(),
          cadista: item.cadista.trim(),
          work_type: item.work_type,
          priority: item.priority,
          due_date: item.due_date || undefined,
          material: item.material || undefined,
          quantity: item.quantity,
          notes: item.notes.trim() || undefined,
          file_name: item.file_name,
          file_size: item.file_size,
          file_hash: item.file_hash,
          is_retry: item.reprint_decision === "REPRINT",
          reprint_reason: item.reprint_reason || undefined,
          parent_item_id: item.duplicate_match?.matched_item.id || undefined,
        }));

      const res = await OdontoPrintService.createPrintCards(
        payload,
        user?.id,
        user?.full_name || bulkCadista
      );

      if (!res.success) {
        toast.error(res.error || "Erro ao cadastrar impressões.");
        return;
      }

      if (uploadDest !== "new") {
        // Jogar modelos num pedido existente (mesma impressão da máquina)
        let moved = 0;
        for (const id of res.created_ids) {
          const m = await OdontoPrintService.moveItemToBatch(
            id,
            uploadDest,
            user?.id,
            user?.full_name || bulkCadista
          );
          if (m.success) moved++;
        }
        const dest = orderGroups.find((g) => g.key === uploadDest);
        toast.success(`${moved} arquivo(s) adicionados ao pedido ${dest?.title || ""}!`);
        setExpandedBatchIds([uploadDest]);
      } else {
        // Cada pedido vira um lote separado com somente os itens dele
        const batchRes = await OdontoPrintService.createOrderBatch({
          item_ids: res.created_ids,
          user_id: user?.id,
          user_name: user?.full_name || bulkCadista,
        });

        if (batchRes.success && batchRes.batch) {
          const title = batchTitle(batchRes.batch.batch_name, (batchRes.batch as any).batch_number ?? null);
          toast.success(
            `${res.created_count} arquivo(s) salvos no pedido ${title}!`
          );
          setExpandedBatchIds([batchRes.batch.id]);
        } else {
          toast.success(
            `${res.created_count} arquivo(s) cadastrado(s) com sucesso na Fila de Impressão!`
          );
        }
      }
      setUploadDest("new");
      setPendingFiles([]);
      setIsUploadModalOpen(false);
      loadData();
    } catch {
      toast.error("Erro inesperado ao salvar arquivos na esteira.");
    } finally {
      setIsSavingCards(false);
    }
  };

  // Expandir/recolher pedido
  const toggleExpandBatch = (key: string) => {
    setExpandedBatchIds((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Imprimir pedido: leva ao fatiador somente com os itens deste pedido
  const handlePrintBatch = (group: OrderGroup) => {
    const ids = group.items
      .filter((i) => ["NA_FILA", "PREPARANDO", "FALHOU"].includes(i.status))
      .map((i) => i.id);
    if (ids.length === 0) {
      toast.info("Este pedido não tem itens prontos para imprimir.");
      return;
    }
    router.push(`/fatiador?items=${ids.join(",")}`);
  };

  // Apagar pedido (com confirmação; aviso extra se estiver imprimindo)
  const handleConfirmDeleteBatch = async () => {
    if (!batchToDelete || !batchToDelete.batchId) return;
    setIsDeletingBatch(true);
    try {
      const res = await OdontoPrintService.deletePrintBatch(batchToDelete.batchId);
      if (res.success) {
        toast.success(`Pedido apagado (${res.removed_count} item(ns) removidos da fila).`);
        setBatchToDelete(null);
        loadData();
      } else {
        toast.error(res.error || "Erro ao apagar pedido.");
      }
    } catch {
      toast.error("Erro ao apagar pedido.");
    } finally {
      setIsDeletingBatch(false);
    }
  };

  // Mover modelo para outro pedido
  const handleMoveItem = async (card: PrintCardItem, targetBatchId: string) => {
    const target = targetBatchId === "avulsos" ? null : targetBatchId;
    try {
      const res = await OdontoPrintService.moveItemToBatch(
        card.id,
        target,
        user?.id,
        user?.full_name || "Operador"
      );
      if (res.success) {
        toast.success(`${card.patient_code} movido de pedido.`);
        loadData();
      } else {
        toast.error(res.error || "Erro ao mover modelo.");
      }
    } catch {
      toast.error("Erro ao mover modelo.");
    }
  };

  // Ações no grupo inteiro (preparar / concluir / falhar)
  const handleBulkGroup = async (
    group: OrderGroup,
    to: "PREPARANDO" | "IMPRESSO" | "CONCLUIDO" | "FALHOU",
    reason?: string
  ) => {
    setIsBulkUpdating(true);
    try {
      const res = await OdontoPrintService.bulkUpdateGroupStatus(
        group.items.map((i) => i.id),
        to,
        { reason, user_id: user?.id, user_name: user?.full_name || "Operador" }
      );
      if (res.success) {
        const label = PRINT_CARD_STATUS_CONFIG[to === "FALHOU" ? "FALHOU" : to].label;
        toast.success(
          `Pedido ${group.title}: ${res.moved} modelo(s) → ${label}${res.skipped > 0 ? ` (${res.skipped} já estavam em outra etapa)` : ""}.`
        );
        loadData();
      } else {
        toast.error(res.error || "Nada para mover neste pedido.");
      }
    } catch {
      toast.error("Erro ao mover pedido.");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleConfirmGroupFail = async () => {
    if (!groupFailTarget) return;
    setIsFailingGroup(true);
    try {
      await handleBulkGroup(
        groupFailTarget,
        "FALHOU",
        groupFailReason.trim() || "Falha na impressão"
      );
      setGroupFailTarget(null);
      setGroupFailReason("");
    } finally {
      setIsFailingGroup(false);
    }
  };

  const handleConfirmGroupBulk = async () => {
    if (!groupConfirmTarget) return;
    const { group, to } = groupConfirmTarget;
    setGroupConfirmTarget(null);
    await handleBulkGroup(group, to);
  };

  // Juntar falhas: novo pedido = próxima impressão (prioridade)
  const handleCollectFailed = async () => {
    try {
      const res = await OdontoPrintService.collectFailedIntoNewBatch({
        user_id: user?.id,
        user_name: user?.full_name || "Operador",
      });
      if (res.success && res.batch) {
        const title = batchTitle(res.batch.batch_name, (res.batch as any).batch_number ?? null);
        toast.success(`Próxima impressão criada: ${title} com ${res.count} modelo(s) prioritário(s)!`);
        setExpandedBatchIds([res.batch.id]);
        loadData();
      } else {
        toast.error(res.error || "Erro ao juntar falhas.");
      }
    } catch {
      toast.error("Erro ao juntar falhas.");
    }
  };

  // Mudar status de 1 clique (com confirmação ao concluir + botão de voltar)
  const getNextStatus = (status: PrintCardStatus): PrintCardStatus | null => {
    switch (status) {
      case "NA_FILA":
        return "PREPARANDO";
      case "PREPARANDO":
        return "IMPRIMINDO";
      case "IMPRIMINDO":
        return "IMPRESSO";
      case "IMPRESSO":
        return "CONCLUIDO";
      case "FALHOU":
        return "NA_FILA";
      default:
        return null;
    }
  };

  const getPreviousStatus = (status: PrintCardStatus): PrintCardStatus | null => {
    switch (status) {
      case "PREPARANDO":
        return "NA_FILA";
      case "IMPRIMINDO":
        return "PREPARANDO";
      case "IMPRESSO":
        return "IMPRIMINDO";
      case "CONCLUIDO":
        return "IMPRESSO";
      default:
        return null;
    }
  };

  const doAdvanceStatus = async (card: PrintCardItem, nextStatus: PrintCardStatus) => {
    try {
      const res = await OdontoPrintService.updateCardStatus(
        card.id,
        nextStatus,
        undefined,
        user?.id,
        user?.full_name || "Operador"
      );
      if (res.success) {
        toast.success(`Card ${card.patient_code} movido para "${PRINT_CARD_STATUS_CONFIG[nextStatus].label}".`);
        loadData();
      } else {
        toast.error(res.error || "Erro ao atualizar status.");
      }
    } catch {
      toast.error("Erro ao avançar status.");
    }
  };

  const handleQuickAdvanceStatus = async (card: PrintCardItem) => {
    const nextStatus = getNextStatus(card.status);
    if (!nextStatus) return;
    // Etapa final exige confirmação para evitar toque sem querer
    if (nextStatus === "CONCLUIDO") {
      setCardToConfirmConclude(card);
      return;
    }
    await doAdvanceStatus(card, nextStatus);
  };

  const handleConfirmConclude = async () => {
    if (!cardToConfirmConclude) return;
    setIsConfirmingConclude(true);
    try {
      await doAdvanceStatus(cardToConfirmConclude, "CONCLUIDO");
      setCardToConfirmConclude(null);
    } finally {
      setIsConfirmingConclude(false);
    }
  };

  const handleGoBackStatus = async (card: PrintCardItem) => {
    const prevStatus = getPreviousStatus(card.status);
    if (!prevStatus) return;
    try {
      const res = await OdontoPrintService.updateCardStatus(
        card.id,
        prevStatus,
        `Retornado manualmente de ${PRINT_CARD_STATUS_CONFIG[card.status].label} para ${PRINT_CARD_STATUS_CONFIG[prevStatus].label}`,
        user?.id,
        user?.full_name || "Operador"
      );
      if (res.success) {
        toast.info(`Card ${card.patient_code} voltou para "${PRINT_CARD_STATUS_CONFIG[prevStatus].label}".`);
        loadData();
      } else {
        toast.error(res.error || "Erro ao voltar etapa.");
      }
    } catch {
      toast.error("Erro ao voltar etapa.");
    }
  };

  // Confirmar falha de card individual
  const handleConfirmCardFailure = async () => {
    if (!cardToFail) return;
    try {
      const res = await OdontoPrintService.updateCardStatus(
        cardToFail.id,
        "FALHOU",
        cardFailReason.trim() || "Falha técnica na impressão",
        user?.id,
        user?.full_name || "Operador"
      );
      if (res.success) {
        toast.warning(`Card ${cardToFail.patient_code} marcado como FALHOU.`);
        setCardToFail(null);
        setCardFailReason("");
        loadData();
      }
    } catch {
      toast.error("Erro ao registrar falha.");
    }
  };

  // Abrir histórico do paciente
  const handleOpenPatientHistory = async (patientQuery: string) => {
    setSelectedPatientForHistory(patientQuery);
    setIsPatientHistoryModalOpen(true);
    try {
      const history = await OdontoPrintService.getPatientPrintHistory(patientQuery);
      setPatientHistoryCards(history);
    } catch {
      toast.error("Erro ao carregar histórico do paciente.");
    }
  };

  // Abrir histórico do card
  const handleOpenCardHistory = async (card: PrintCardItem) => {
    setSelectedCardForHistory(card);
    setIsCardHistoryModalOpen(true);
    try {
      const history = await OdontoPrintService.getCardHistory(card.id);
      setCardHistoryEntries(history);
    } catch {
      toast.error("Erro ao carregar histórico do card.");
    }
  };

  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilters =
    statusFilter !== "TODAS" ||
    clinicFilter !== "TODAS" ||
    onlyReprints ||
    todayFilter ||
    searchQuery.trim() !== "";

  const clearFilters = () => {
    setStatusFilter("TODAS");
    setClinicFilter("TODAS");
    setOnlyReprints(false);
    setTodayFilter(false);
    setSearchQuery("");
  };

  return (
    <AppShell>
      <div className="space-y-4 max-w-[1400px] mx-auto">
        {/* Cabeçalho simples */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                Fila de impressão
              </h1>
              <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-md px-2 py-0.5">
                {filteredGroups.length} pedido(s)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Cada pedido é um lote separado. Toque para expandir.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsUploadModalOpen(true)}
              className="bg-white hover:bg-slate-200 text-slate-900 rounded-lg text-xs font-semibold px-3 h-9 gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nova impressão</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </div>
        </div>

        {/* Barra de busca + filtros */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-2 p-2.5">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar paciente, clínica, arquivo..."
                className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-slate-600 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  title="Limpar busca"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 ${
                showFilters || hasActiveFilters
                  ? "bg-slate-800 text-white border-slate-700"
                  : "bg-transparent text-slate-400 border-slate-800 hover:text-white hover:border-slate-700"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filtros</span>
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </button>
          </div>

          {/* Abas de status do pedido — rolagem horizontal no mobile */}
          <div className="flex items-center gap-1 px-2.5 pb-2.5 overflow-x-auto">
            {(
              [
                ["TODAS", `Todos (${orderGroups.length})`],
                ["AGUARDANDO", `Aguardando (${statusCounts.AGUARDANDO})`],
                ["PREPARANDO", `Preparando (${statusCounts.PREPARANDO})`],
                ["IMPRIMINDO", `Imprimindo (${statusCounts.IMPRIMINDO})`],
                ["IMPRESSO", `Impressos (${statusCounts.IMPRESSO})`],
                ["CONCLUIDO", `Concluídos (${statusCounts.CONCLUIDO})`],
                ["ERRO", `Erros (${statusCounts.ERRO})`],
              ] as Array<[BatchDerivedStatus | "TODAS", string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                  statusFilter === value
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-2.5 pb-2.5 pt-1 border-t border-slate-800/80">
              <div className="pt-2">
                <label className="text-[11px] text-slate-500 font-medium mb-1 block">Clínica</label>
                <select
                  value={clinicFilter}
                  onChange={(e) => setClinicFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-slate-600"
                >
                  <option value="TODAS">Todas</option>
                  {uniqueClinics.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-end gap-2 pt-1 sm:pt-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyReprints}
                    onChange={(e) => setOnlyReprints(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-800"
                  />
                  Só reimpressões
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={todayFilter}
                    onChange={(e) => setTodayFilter(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-800"
                  />
                  Só hoje
                </label>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="ml-auto text-xs text-slate-400 hover:text-white underline underline-offset-2"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Andamento das impressões — ordens EM_IMPRESSAO vinculadas à fila */}
        {!isLoading && activeRuns.length > 0 && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-2.5">
            <div className="flex items-center justify-between px-1 pb-2">
              <h2 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                </span>
                Imprimindo agora ({activeRuns.length})
              </h2>
              <Link
                href="/impressoes"
                className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2"
              >
                Ver todas
              </Link>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {activeRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/impressoes/${run.id}`}
                  className="shrink-0 min-w-0 w-[240px] bg-slate-950 border border-slate-800 hover:border-slate-600 rounded-lg p-2.5 transition text-left"
                  title={`Acompanhar ordem ${run.run_code}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-sm font-bold text-white truncate">
                      {run.run_code}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-slate-400 whitespace-nowrap">
                      {formatElapsed(run.started_at)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {run.printer_name} · {run.items_count} modelo(s)
                  </p>
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium text-slate-300">
                    Acompanhar
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Falhas aguardando a próxima impressão (prioridade) */}
        {!isLoading && failedPendingCount > 0 && (
          <div className="bg-amber-950/40 border border-amber-900 rounded-xl px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
            <p className="text-xs text-amber-200 flex-1">
              <strong>{failedPendingCount} modelo(s) com falha</strong> aguardando — entram com
              prioridade na próxima impressão.
            </p>
            <button
              type="button"
              onClick={handleCollectFailed}
              className="shrink-0 px-3 h-8 text-[11px] font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg"
            >
              Criar próxima impressão com as falhas
            </button>
          </div>
        )}

        {/* Estado vazio */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-9 w-full rounded-lg bg-slate-800/60" />
                <Skeleton className="h-28 w-full rounded-lg bg-slate-800/40" />
                <Skeleton className="h-28 w-full rounded-lg bg-slate-800/40" />
              </div>
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center">
            <h3 className="text-sm font-semibold text-white">Nada por aqui</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              {hasActiveFilters
                ? "Nenhum item corresponde aos filtros. Ajuste a busca ou limpe os filtros."
                : "Cadastre um modelo para começar a fila."}
            </p>
            <div className="flex items-center justify-center gap-2">
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  className="border-slate-700 text-slate-300 rounded-lg text-xs h-9"
                >
                  Limpar filtros
                </Button>
              )}
              <Button
                onClick={() => setIsUploadModalOpen(true)}
                className="bg-white hover:bg-slate-200 text-slate-900 rounded-lg text-xs font-semibold px-4 h-9"
              >
                Nova impressão
              </Button>
            </div>
          </div>
        ) : (
          /* Pedidos (lotes) — um cartão por pedido, mais recentes primeiro */
          <div className="space-y-2.5">
            {filteredGroups.map((group) => {
              const cfg = BATCH_STATUS_CONFIG[group.derived];
              const expanded = expandedBatchIds.includes(group.key);
              const batchRuns = group.items
                .map(
                  (i) =>
                    runByItemId.get(i.id) ||
                    (i.last_run_code ? runByCode.get(i.last_run_code) : undefined)
                )
                .filter(Boolean) as ActiveRunInfo[];
              const firstRun = batchRuns[0];

              return (
                <div
                  key={group.key}
                  className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden"
                >
                  {/* Cabeçalho do pedido */}
                  <div
                    onClick={() => toggleExpandBatch(group.key)}
                    className="w-full text-left p-3 flex items-center gap-3 hover:bg-slate-800/30 transition cursor-pointer"
                  >
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${
                        expanded ? "" : "-rotate-90"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{group.title}</span>
                        <span
                          className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${cfg.chip}`}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {formatDate(group.createdAt)} · {group.items.length}{" "}
                        {group.items.length === 1 ? "item" : "itens"}
                      </p>
                      {firstRun && (
                        <Link
                          href={`/impressoes/${firstRun.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-white underline underline-offset-2"
                        >
                          Mesa {firstRun.run_code} · acompanhar
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintBatch(group);
                        }}
                        disabled={group.printableCount === 0}
                        className="h-8 px-3 text-[11px] font-semibold bg-slate-100 hover:bg-white text-slate-900 rounded-lg flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          group.printableCount === 0
                            ? "Nada pronto para imprimir neste pedido"
                            : `Imprimir ${group.printableCount} item(ns) deste pedido`
                        }
                      >
                        <Play className="w-3 h-3" />
                        Imprimir
                        {group.printableCount > 0 && <span>· {group.printableCount}</span>}
                      </button>
                      {group.batchId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBatchToDelete(group);
                          }}
                          className="h-8 px-2.5 text-[11px] font-medium text-slate-400 hover:text-red-300 hover:bg-slate-800 rounded-lg flex items-center gap-1"
                          title="Apagar pedido"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Apagar</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Itens do pedido (recolhidos por padrão) */}
                  {expanded && (
                    <div className="border-t border-slate-800">
                      {/* Ações no grupo inteiro */}
                      <div className="flex items-center flex-wrap gap-1.5 px-3 sm:px-4 py-2 bg-slate-950/50 border-b border-slate-800/60">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mr-1">
                          Grupo
                        </span>
                        <button
                          type="button"
                          disabled={
                            isBulkUpdating ||
                            !group.items.some((i) => i.status === "NA_FILA")
                          }
                          onClick={() => setGroupConfirmTarget({ group, to: "PREPARANDO" })}
                          className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Mover todos os itens Na fila para Preparando"
                        >
                          Preparar todos
                        </button>
                        <button
                          type="button"
                          disabled={
                            isBulkUpdating ||
                            !group.items.some((i) => i.status === "IMPRESSO")
                          }
                          onClick={() => setGroupConfirmTarget({ group, to: "CONCLUIDO" })}
                          className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Mover todos os itens Impressos para Concluído"
                        >
                          Concluir todos
                        </button>
                        <button
                          type="button"
                          disabled={
                            isBulkUpdating ||
                            !group.items.some((i) =>
                              ["NA_FILA", "PREPARANDO", "IMPRIMINDO", "IMPRESSO"].includes(i.status)
                            )
                          }
                          onClick={() => {
                            setGroupFailTarget(group);
                            setGroupFailReason("");
                          }}
                          className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-red-300 hover:bg-slate-800 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Marcar todos como falha (voltam como prioridade)"
                        >
                          Falhar todos
                        </button>
                      </div>
                      <div className="divide-y divide-slate-800/60">
                      {[...group.items]
                        .sort((a, b) => Number(b.is_retry) - Number(a.is_retry))
                        .map((card) => {
                        const statusCfg = PRINT_CARD_STATUS_CONFIG[card.status];
                        const itemRun =
                          runByItemId.get(card.id) ||
                          (card.last_run_code ? runByCode.get(card.last_run_code) : undefined);
                        return (
                          <div key={card.id} className="p-2.5 pl-4 sm:pl-5 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleOpenPatientHistory(card.patient_code)}
                                className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-white hover:underline underline-offset-2"
                                title="Ver histórico do paciente"
                              >
                                {card.patient_code}
                              </button>
                              {card.priority === "URGENTE" && (
                                <span className="shrink-0 text-[10px] font-semibold text-red-300 bg-red-950 border border-red-900 rounded px-1.5 py-0.5">
                                  Urgente
                                </span>
                              )}
                              {card.priority !== "URGENTE" && card.is_retry && (
                                <span className="shrink-0 text-[10px] font-medium text-amber-300 bg-amber-950/60 border border-amber-900 rounded px-1.5 py-0.5">
                                  {card.retry_count > 1 ? `${card.retry_count}ª tent.` : "Reimpressão"}
                                </span>
                              )}
                              <span className="shrink-0 text-[10px] text-slate-300 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5">
                                {statusCfg.label}
                              </span>
                            </div>

                            {card.patient_name && (
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                {card.patient_name}
                              </p>
                            )}
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {card.clinic_name} ·{" "}
                              {LAB_WORK_TYPE_LABELS[card.work_type] || card.work_type}
                            </p>
                            <p
                              className="text-[11px] text-slate-600 font-mono truncate"
                              title={card.file_name}
                            >
                              {card.file_name}
                            </p>

                            <div className="flex items-center flex-wrap gap-y-1 gap-x-1 mt-1.5 min-w-0">
                              {getPreviousStatus(card.status) && (
                                <button
                                  type="button"
                                  onClick={() => handleGoBackStatus(card)}
                                  className="shrink-0 px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-md flex items-center gap-1 whitespace-nowrap"
                                  title={`Voltar para ${
                                    PRINT_CARD_STATUS_CONFIG[getPreviousStatus(card.status)!].label
                                  }`}
                                >
                                  <Undo2 className="w-3 h-3 shrink-0" />
                                  Voltar
                                </button>
                              )}
                              {card.status !== "CONCLUIDO" && card.status !== "CANCELADO" && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickAdvanceStatus(card)}
                                  className="shrink-0 px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-white text-slate-900 rounded-md flex items-center gap-1 whitespace-nowrap"
                                >
                                  Avançar
                                  <ArrowRight className="w-3 h-3 shrink-0" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenCardHistory(card)}
                                className="shrink-0 p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-md transition"
                                title="Histórico"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <select
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) handleMoveItem(card, e.target.value);
                                  e.target.value = "";
                                }}
                                className="shrink-0 max-w-[110px] bg-transparent text-[11px] text-slate-500 hover:text-white border border-transparent hover:border-slate-700 rounded-md px-1 py-1 focus:outline-none focus:border-slate-600"
                                title="Mover modelo para outro pedido"
                              >
                                <option value="">Mover…</option>
                                {orderGroups
                                  .filter((g) => g.batchId && g.batchId !== card.batch_id)
                                  .map((g) => (
                                    <option key={g.key} value={g.batchId || ""}>
                                      {g.title}
                                    </option>
                                  ))}
                                {card.batch_id && <option value="avulsos">Sem lote</option>}
                              </select>
                              {card.status !== "CONCLUIDO" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCardToFail(card);
                                    setCardFailReason("");
                                  }}
                                  className="shrink-0 text-[11px] text-slate-600 hover:text-red-400"
                                >
                                  Marcar falha
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ==================================================================== */}
        {/* MODAL 1: CADASTRAR IMPRESSÃO (UPLOAD RÁPIDO & DRAG AND DROP) */}
        {/* ==================================================================== */}
        <Dialog
          open={isUploadModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              setPendingFiles([]);
              setUploadDest("new");
            }
            setIsUploadModalOpen(open);
          }}
          title="Cadastrar Impressão 3D — Upload Rápido de STL"
        >
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
            {/* ÁREA DE DRAG AND DROP */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFilesSelected(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-cyan-400 bg-slate-900/60 hover:bg-slate-900 rounded-2xl p-6 text-center cursor-pointer transition group"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".stl,.obj,.3mf,.ply"
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-full bg-slate-800 text-cyan-400 group-hover:scale-110 flex items-center justify-center mx-auto mb-2.5 transition">
                <Upload className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-white">
                Arraste seus arquivos STL aqui ou clique para selecionar
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Suporta múltiplos arquivos simultâneos (.stl, .obj, .3mf, .ply de até 250MB cada)
              </p>
            </div>

            {/* PREENCHIMENTO RÁPIDO EM LOTE ("APLICAR A TODOS") */}
            {pendingFiles.length > 0 && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    Preencher UMA vez e aplicar a todos os {pendingFiles.length} arquivos
                  </span>
                  <Button
                    size="sm"
                    onClick={handleApplyToAll}
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs h-7 rounded-full px-3"
                  >
                    Aplicar a Todos
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium block mb-1">Clínica *</label>
                    <input
                      type="text"
                      value={bulkClinic}
                      onChange={(e) => setBulkClinic(e.target.value)}
                      placeholder="Ex: Odonto Dental Prime"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-medium block mb-1">Cadista *</label>
                    <input
                      type="text"
                      value={bulkCadista}
                      onChange={(e) => setBulkCadista(e.target.value)}
                      placeholder="Ex: Lucas Cadista"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-medium block mb-1">Tipo de Trabalho *</label>
                    <select
                      value={bulkWorkType}
                      onChange={(e) => setBulkWorkType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    >
                      {LAB_WORK_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-medium block mb-1">Prioridade</label>
                    <select
                      value={bulkPriority}
                      onChange={(e) => setBulkPriority(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    >
                      <option value="NORMAL">Normal</option>
                      <option value="URGENTE">Urgente</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-medium block mb-1">Material / Resina</label>
                    <input
                      type="text"
                      value={bulkMaterial}
                      onChange={(e) => setBulkMaterial(e.target.value)}
                      placeholder="Ex: Resina Cosmos Dental"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-medium block mb-1">Data de Entrega</label>
                    <input
                      type="date"
                      value={bulkDueDate}
                      onChange={(e) => setBulkDueDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* LISTA EDITÁVEL DE ITENS A CADASTRAR */}
            {pendingFiles.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Arquivos selecionados ({pendingFiles.length})
                </h4>

                <div className="space-y-2.5">
                  {pendingFiles.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`bg-slate-900 border rounded-xl p-3.5 space-y-3 transition ${
                        item.duplicate_match?.alert_level === "HIGH"
                          ? "border-amber-500/80 bg-amber-950/20"
                          : "border-slate-800"
                      }`}
                    >
                      {/* Linha 1: Nome do arquivo, tamanho e exclusão */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-cyan-400" />
                          <span className="text-xs font-bold text-white truncate max-w-[260px] sm:max-w-md">
                            {item.file_name}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            ({(item.file_size / (1024 * 1024)).toFixed(2)} MB)
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setPendingFiles((prev) => prev.filter((p) => p.id !== item.id))}
                          className="text-slate-500 hover:text-rose-400 p-1"
                          title="Remover arquivo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* ALERTA DE DETECÇÃO DE DUPLICIDADE (SE EXISTIR) */}
                      {item.duplicate_match && (
                        <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-3 space-y-2 text-xs">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-amber-200">
                                {item.duplicate_match.alert_level === "HIGH"
                                  ? "Alerta de Duplicidade Detectada"
                                  : "Aviso de Trabalho Existente"}
                              </p>
                              <p className="text-[11px] text-amber-300/80 mt-0.5">
                                {item.duplicate_match.message}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-1">
                                Item anterior: Status{" "}
                                <strong className="text-white">{item.duplicate_match.current_status}</strong> em{" "}
                                {formatDate(item.duplicate_match.created_at)} por{" "}
                                {item.duplicate_match.cadista_name || "Cadista"}
                              </p>
                            </div>
                          </div>

                          {/* 3 Opções Claras pedidas no requisito funcional */}
                          <div className="pt-2 border-t border-amber-500/20 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setPendingFiles((prev) =>
                                  prev.map((p) =>
                                    p.id === item.id
                                      ? {
                                          ...p,
                                          reprint_decision: "REPRINT",
                                          reprint_reason: p.reprint_reason || "Falha técnica no original",
                                        }
                                      : p
                                  )
                                );
                              }}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition ${
                                item.reprint_decision === "REPRINT"
                                  ? "bg-amber-500 text-slate-950 shadow"
                                  : "bg-slate-800 text-amber-300 border border-amber-500/30 hover:bg-slate-700"
                              }`}
                            >
                              É Reimpressão
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setPendingFiles((prev) =>
                                  prev.map((p) =>
                                    p.id === item.id
                                      ? { ...p, reprint_decision: "OVERRIDE" }
                                      : p
                                  )
                                );
                              }}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                                item.reprint_decision === "OVERRIDE"
                                  ? "bg-slate-200 text-slate-950 font-bold"
                                  : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
                              }`}
                            >
                              Salvar Mesmo Assim
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setPendingFiles((prev) => prev.filter((p) => p.id !== item.id));
                              }}
                              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 ml-auto"
                            >
                              Cancelar
                            </button>
                          </div>

                          {/* Se for Reimpressão, pedir o motivo */}
                          {item.reprint_decision === "REPRINT" && (
                            <div className="pt-2">
                              <label className="text-[10px] text-amber-200 block mb-1 font-semibold">
                                Motivo da Reimpressão *
                              </label>
                              <select
                                value={item.reprint_reason || "Falha na impressão"}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPendingFiles((prev) =>
                                    prev.map((p) =>
                                      p.id === item.id ? { ...p, reprint_reason: val } : p
                                    )
                                  );
                                }}
                                className="w-full bg-slate-950 border border-amber-500/40 rounded-lg px-2.5 py-1 text-xs text-white"
                              >
                                <option value="Falha na impressão (descolou/suporte)">Falhou na impressão</option>
                                <option value="Peça quebrou no acabamento">Peça quebrou no acabamento</option>
                                <option value="Ajuste / remodelagem do cadista">Ajuste do cadista</option>
                                <option value="Novo arquivo recebido">Novo arquivo corrigido</option>
                                <option value="Outro motivo técnico">Outro</option>
                              </select>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Campos editáveis por item */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Paciente (Código) *</label>
                          <input
                            type="text"
                            required
                            value={item.patient}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPendingFiles((prev) =>
                                prev.map((p) => (p.id === item.id ? { ...p, patient: val } : p))
                              );
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white uppercase font-semibold"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Nome do Paciente</label>
                          <input
                            type="text"
                            value={item.patient_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPendingFiles((prev) =>
                                prev.map((p) => (p.id === item.id ? { ...p, patient_name: val } : p))
                              );
                            }}
                            placeholder="Opcional"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Clínica *</label>
                          <input
                            type="text"
                            required
                            value={item.clinic}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPendingFiles((prev) =>
                                prev.map((p) => (p.id === item.id ? { ...p, clinic: val } : p))
                              );
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Tipo de Trabalho *</label>
                          <select
                            value={item.work_type}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPendingFiles((prev) =>
                                prev.map((p) => (p.id === item.id ? { ...p, work_type: val } : p))
                              );
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
                          >
                            {LAB_WORK_TYPES.map((t) => (
                              <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BOTÕES DE SALVAMENTO */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-3 border-t border-slate-800">
              <label className="flex items-center gap-2 text-xs text-slate-300 flex-1 min-w-0">
                <span className="shrink-0 text-slate-400">Salvar em:</span>
                <select
                  value={uploadDest}
                  onChange={(e) => setUploadDest(e.target.value)}
                  className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-slate-600"
                  title="Novo pedido ou juntar a um pedido existente"
                >
                  <option value="new">Novo pedido (cria Impressão nova)</option>
                  {orderGroups
                    .filter((g) => g.batchId && g.derived !== "CONCLUIDO")
                    .map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.title} ({g.items.length} itens)
                      </option>
                    ))}
                </select>
              </label>
              <div className="flex items-center justify-end gap-2.5">
              <Button
                variant="outline"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setUploadDest("new");
                }}
                className="border-slate-700 text-slate-300 rounded-full text-xs h-9"
              >
                Cancelar
              </Button>

              <Button
                disabled={pendingFiles.length === 0 || isSavingCards || isCheckingDuplicates}
                onClick={handleSaveUpload}
                className="bg-white hover:bg-slate-200 text-slate-950 font-bold rounded-full text-xs h-9 px-5 gap-1.5"
              >
                {isSavingCards ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    <span>Salvando na esteira...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Cadastrar {pendingFiles.length} item(ns) na Fila</span>
                  </>
                )}
              </Button>
              </div>
            </div>
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 2: APAGAR PEDIDO (COM CONFIRMAÇÃO + AVISO SE IMPRIMINDO) */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(batchToDelete)}
          onOpenChange={(open) => {
            if (!open) setBatchToDelete(null);
          }}
          title="Apagar pedido"
        >
          <div className="space-y-4">
            {batchToDelete?.isPrinting && (
              <div className="bg-red-950/40 border border-red-900 rounded-xl p-3.5 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold text-red-200">
                    Atenção: este pedido está IMPRIMINDO
                  </p>
                  <p className="text-red-300/80">
                    Apagar agora vai retirar os modelos da mesa em andamento e
                    remover o pedido e seus itens da fila.
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-300">
              Tem certeza que deseja apagar{" "}
              <strong>{batchToDelete?.title}</strong>? Serão removidos{" "}
              <strong>
                {batchToDelete?.items.length}{" "}
                {batchToDelete && batchToDelete.items.length === 1 ? "item" : "itens"}
              </strong>{" "}
              da fila
              {batchToDelete && batchToDelete.items.length > 0 && (
                <>
                  {" "}(
                  {batchToDelete.items
                    .slice(0, 5)
                    .map((i) => i.patient_code)
                    .join(", ")}
                  {batchToDelete.items.length > 5 && ", ..."})
                </>
              )}
              . Os pacientes são mantidos.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setBatchToDelete(null)}
                className="border-slate-700 text-slate-300 rounded-lg text-xs h-9"
              >
                Cancelar
              </Button>

              <Button
                disabled={isDeletingBatch}
                onClick={handleConfirmDeleteBatch}
                className="bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-xs h-9 px-5"
              >
                {isDeletingBatch ? "Apagando..." : "Sim, apagar pedido"}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 2b: FALHAR GRUPO INTEIRO (VIRA PRIORIDADE DA PRÓXIMA IMPRESSÃO) */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(groupFailTarget)}
          onOpenChange={(open) => {
            if (!open) setGroupFailTarget(null);
          }}
          title="Marcar pedido inteiro como falha?"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Todos os modelos elegíveis de <strong>{groupFailTarget?.title}</strong> voltarão
              para a fila como <strong>reimpressão prioritária</strong> para a próxima impressão.
            </p>
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Motivo da falha
              </label>
              <input
                type="text"
                value={groupFailReason}
                onChange={(e) => setGroupFailReason(e.target.value)}
                placeholder="Ex: Mesa descolou no meio da impressão"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rose-400"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setGroupFailTarget(null)}
                className="border-slate-700 text-slate-300 rounded-lg text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                disabled={isFailingGroup}
                onClick={handleConfirmGroupFail}
                className="bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-xs h-9 px-5"
              >
                {isFailingGroup ? "Marcando..." : "Confirmar falha do grupo"}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 2c: CONFIRMAR AÇÃO EM GRUPO (PREPARAR / CONCLUIR TODOS) */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(groupConfirmTarget)}
          onOpenChange={(open) => {
            if (!open) setGroupConfirmTarget(null);
          }}
          title={
            groupConfirmTarget?.to === "CONCLUIDO"
              ? "Concluir pedido inteiro?"
              : "Preparar pedido inteiro?"
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              {groupConfirmTarget?.to === "CONCLUIDO" ? (
                <>
                  Todos os modelos <strong>Impressos</strong> de{" "}
                  <strong>{groupConfirmTarget?.group.title}</strong> serão marcados como{" "}
                  <strong>Concluídos</strong>.
                </>
              ) : (
                <>
                  Todos os modelos <strong>Na fila</strong> de{" "}
                  <strong>{groupConfirmTarget?.group.title}</strong> irão para{" "}
                  <strong>Preparando</strong>.
                </>
              )}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setGroupConfirmTarget(null)}
                className="border-slate-700 text-slate-300 rounded-lg text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                disabled={isBulkUpdating}
                onClick={handleConfirmGroupBulk}
                className="bg-white hover:bg-slate-200 text-slate-900 font-semibold rounded-lg text-xs h-9 px-5"
              >
                {isBulkUpdating ? "Movendo..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 5b: CONFIRMAR CONCLUSÃO (evita avanço sem querer) */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(cardToConfirmConclude)}
          onOpenChange={(open) => {
            if (!open) setCardToConfirmConclude(null);
          }}
          title="Concluir este card?"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Você está concluindo o modelo <strong>{cardToConfirmConclude?.file_name}</strong>{" "}
              (Paciente: <strong>{cardToConfirmConclude?.patient_code}</strong>).
              Depois de concluir ainda dá para voltar uma etapa com o botão{" "}
              <span className="font-semibold text-white">Voltar</span>, mas o ideal é conferir antes.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setCardToConfirmConclude(null)}
                className="border-slate-700 text-slate-300 rounded-full text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmConclude}
                disabled={isConfirmingConclude}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-full text-xs h-9 px-5"
              >
                {isConfirmingConclude ? "Concluindo..." : "Sim, concluir"}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 5: FALHA DE CARD INDIVIDUAL */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(cardToFail)}
          onOpenChange={(open) => {
            if (!open) setCardToFail(null);
          }}
          title="Marcar Card Individual como Falhou"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Você está marcando o modelo <strong>{cardToFail?.file_name}</strong> (Paciente:{" "}
              <strong>{cardToFail?.patient_code}</strong>) como FALHOU.
            </p>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Motivo da Falha *
              </label>
              <input
                type="text"
                value={cardFailReason}
                onChange={(e) => setCardFailReason(e.target.value)}
                placeholder="Ex: Dente quebrou / delaminação de camada"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rose-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setCardToFail(null)}
                className="border-slate-700 text-slate-300 rounded-full text-xs h-9"
              >
                Cancelar
              </Button>

              <Button
                onClick={handleConfirmCardFailure}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-full text-xs h-9 px-5"
              >
                Confirmar Falha
              </Button>
            </div>
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 6: HISTÓRICO COMPLETO DO PACIENTE */}
        {/* ==================================================================== */}
        <Dialog
          open={isPatientHistoryModalOpen}
          onOpenChange={setIsPatientHistoryModalOpen}
          title={`Histórico de Impressões — Paciente: ${selectedPatientForHistory || ""}`}
        >
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {patientHistoryCards.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Nenhum registro encontrado para este paciente.
              </p>
            ) : (
              patientHistoryCards.map((c) => {
                const statusCfg = PRINT_CARD_STATUS_CONFIG[c.status];

                return (
                  <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{c.file_name}</span>
                      <Badge className={`${statusCfg.color} text-[10px]`}>
                        {statusCfg.label}
                      </Badge>
                    </div>

                    <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-3">
                      <span>Clínica: {c.clinic_name}</span>
                      <span>Cadista: {c.cadista_name}</span>
                      <span>Data: {formatDate(c.created_at)}</span>
                    </div>

                    {c.is_retry && (
                      <p className="text-[10px] text-amber-300">
                        Tag: Reimpressão ({c.reprint_reason || "Sem motivo"})
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 7: LINHA DO TEMPO / HISTÓRICO DE STATUS DO CARD */}
        {/* ==================================================================== */}
        <Dialog
          open={isCardHistoryModalOpen}
          onOpenChange={setIsCardHistoryModalOpen}
          title={`Auditoria do Card — ${selectedCardForHistory?.file_name || ""}`}
        >
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {cardHistoryEntries.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Nenhum histórico registrado para este card.
              </p>
            ) : (
              <div className="relative border-l-2 border-slate-800 ml-3 space-y-4 py-2">
                {cardHistoryEntries.map((hist) => (
                  <div key={hist.id} className="relative pl-5 text-xs space-y-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 absolute -left-[6px] top-1" />
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">
                        {hist.from_status ? `${hist.from_status} → ${hist.to_status}` : `Início: ${hist.to_status}`}
                      </span>
                      <span className="text-[10px] text-slate-500">{formatDate(hist.created_at)}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Alterado por: <strong className="text-slate-300">{hist.changed_by_name || "Sistema"}</strong>
                    </p>
                    {hist.notes && (
                      <p className="text-[11px] text-slate-300 bg-slate-900 border border-slate-800 rounded p-1.5 mt-1">
                        {hist.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      </div>
    </AppShell>
  );
}
