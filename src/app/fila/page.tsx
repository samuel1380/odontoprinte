"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/shell";
import { OdontoPrintService } from "@/services/odontoprint-service";
import {
  PrintCardItem,
  PrintCardStatus,
  LabWorkType,
  DuplicateMatch,
  DuplicateCheckResult,
  ActiveRunInfo,
  PrinterWithStatus,
  EligibleResinOption,
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
import { parseFileName } from "@/lib/parse-filename";
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
  Trash2,
  ChevronDown,
  Play,
  LayoutGrid,
  Clock,
  CheckCircle2,
  ClipboardCheck,
  Hammer,
  RotateCcw,
  History,
  Sparkles,
  FileText,
  Check,
  Printer,
  Layers,
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
  // Clínica/tipo lidos automaticamente do nome do arquivo
  parsed_from_name?: boolean;
}

export interface OrderGroup {
  key: string;
  batchId: string | null;
  title: string;
  batchNumber: number | null;
  printer_name?: string | null;
  printer_id?: string | null;
  createdAt: string;
  items: PrintCardItem[];
  derived: BatchDerivedStatus;
  printableCount: number;
  isPrinting: boolean;
}

export default function FilaPage() {
  const { user } = useAuth();

  // Estados principais (fila organizada em mesas de impressão)
  const [cards, setCards] = useState<PrintCardItem[]>([]);
  const [batches, setBatches] = useState<Array<PrintBatch & { items_count: number }>>([]);
  const [printers, setPrinters] = useState<PrinterWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedBatchIds, setExpandedBatchIds] = useState<string[]>([]);

  // Abas principais do operador: Mesas na Fila | Imprimindo agora | Todas | Concluídas
  type ViewTab = "FILA" | "IMPRIMINDO" | "TODAS" | "CONCLUIDAS";
  const [viewTab, setViewTab] = useState<ViewTab>("FILA");

  // Drag and drop direto na tela
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Filtros e busca
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BatchDerivedStatus | "TODAS">("TODAS");
  const [clinicFilter, setClinicFilter] = useState("TODAS");
  const [onlyReprints, setOnlyReprints] = useState(false);
  const [todayFilter, setTodayFilter] = useState(false);

  // Modais
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [newMesaName, setNewMesaName] = useState("");
  const [newMesaPrinterId, setNewMesaPrinterId] = useState("");

  const [isPatientHistoryModalOpen, setIsPatientHistoryModalOpen] = useState(false);
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<string | null>(null);
  const [patientHistoryCards, setPatientHistoryCards] = useState<PrintCardItem[]>([]);
  const [isCardHistoryModalOpen, setIsCardHistoryModalOpen] = useState(false);
  const [selectedCardForHistory, setSelectedCardForHistory] = useState<PrintCardItem | null>(null);
  const [cardHistoryEntries, setCardHistoryEntries] = useState<PrintItemHistory[]>([]);

  // Modal de Iniciar Impressão Direto na Mesa (vincular impressora + resina)
  const [batchToPrintDirectly, setBatchToPrintDirectly] = useState<OrderGroup | null>(null);
  const [selectedPrinterForBatch, setSelectedPrinterForBatch] = useState<string>("");
  const [selectedResinBatchId, setSelectedResinBatchId] = useState<string>("");
  const [eligibleResins, setEligibleResins] = useState<EligibleResinOption[]>([]);
  const [isLoadingResins, setIsLoadingResins] = useState(false);
  const [isStartingBatchPrint, setIsStartingBatchPrint] = useState(false);

  // Painel de Bancada: Vincular Mesa da Fila à Impressora Disponível
  const [printerToAssignBatch, setPrinterToAssignBatch] = useState<PrinterWithStatus | null>(null);
  const [selectedBatchForFreePrinter, setSelectedBatchForFreePrinter] = useState<string>("");
  const [isAssigningBatch, setIsAssigningBatch] = useState(false);

  // Painel de Bancada: Falha da Mesa Inteira
  const [batchToFailWhole, setBatchToFailWhole] = useState<OrderGroup | null>(null);
  const [failReasonWhole, setFailReasonWhole] = useState("");
  const [isFailingBatch, setIsFailingBatch] = useState(false);

  // Modal de Apagar Mesa
  const [batchToDelete, setBatchToDelete] = useState<OrderGroup | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

  // Modal de Esvaziar Mesa
  const [batchToEmpty, setBatchToEmpty] = useState<OrderGroup | null>(null);
  const [isEmptyingBatch, setIsEmptyingBatch] = useState(false);

  // Modal de Apagar Arquivo Individual
  const [cardToDelete, setCardToDelete] = useState<PrintCardItem | null>(null);
  const [isDeletingCard, setIsDeletingCard] = useState(false);

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

  // Destino do upload: nova mesa ou mesa existente. Falhas pendentes
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

  // Carregar dados (silent = atualização de fundo sem skeleton, p/ polling)
  const loadData = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true);
    try {
      const [cardsData, batchesData, runsData, failedData, printersData] = await Promise.all([
        OdontoPrintService.getPrintCards(),
        OdontoPrintService.getPrintBatches(),
        OdontoPrintService.getActiveRunsWithItems(),
        OdontoPrintService.getFailedPendingItems(),
        OdontoPrintService.getPrinters(),
      ]);
      setCards(cardsData);
      setBatches(batchesData);
      setActiveRuns(runsData);
      setFailedPendingCount(failedData.length);
      setPrinters(printersData);
    } catch {
      if (!opts?.silent) toast.error("Erro ao carregar fila de impressão.");
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
    // FASE 2: recarrega TUDO em segundo plano (mesas/cards de outros aparelhos)
    const refresher = setInterval(() => {
      loadData({ silent: true }).catch(() => {});
    }, 30000);
    // FASE 3: tempo real — outro aparelho mexeu, recarrega (com debounce)
    let rtTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubSync = OdontoPrintService.subscribeSync(() => {
      if (rtTimer) clearTimeout(rtTimer);
      rtTimer = setTimeout(() => {
        loadData({ silent: true }).catch(() => {});
      }, 800);
    });
    return () => {
      clearInterval(timer);
      clearInterval(refresher);
      if (rtTimer) clearTimeout(rtTimer);
      if (unsubSync) unsubSync();
    };
  }, []);

  // Resinas calibradas da impressora escolhida no modal de envio
  useEffect(() => {
    if (!batchToPrintDirectly || !selectedPrinterForBatch) {
      setEligibleResins([]);
      return;
    }
    let cancelled = false;
    setIsLoadingResins(true);
    OdontoPrintService.getEligibleOptions()
      .then((options) => {
        if (cancelled) return;
        const list = (options.resins || []).filter((r) => r.printer_id === selectedPrinterForBatch);
        setEligibleResins(list);
        setSelectedResinBatchId((prev) =>
          list.some((r) => r.calibration_id === prev) ? prev : list[0]?.calibration_id || ""
        );
      })
      .catch(() => {
        if (!cancelled) setEligibleResins([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingResins(false);
      });
    return () => {
      cancelled = true;
    };
  }, [batchToPrintDirectly, selectedPrinterForBatch]);

  // Iniciar impressão direto na mesa
  const handleDirectBatchPrint = async () => {
    if (!batchToPrintDirectly || !batchToPrintDirectly.batchId) return;
    if (!selectedPrinterForBatch) {
      toast.error("Selecione uma impressora para enviar a mesa.");
      return;
    }
    setIsStartingBatchPrint(true);
    try {
      const chosen = printers.find((p) => p.id === selectedPrinterForBatch);
      const chosenResin =
        eligibleResins.find((r) => r.calibration_id === selectedResinBatchId) || eligibleResins[0];
      const res = await OdontoPrintService.startPrintBatchDirectly({
        batch_id: batchToPrintDirectly.batchId,
        printer_id: selectedPrinterForBatch,
        resin_batch_id: chosenResin?.resin_batch_id,
        calibration_id: chosenResin?.calibration_id,
        user_id: user?.id,
        user_name: user?.full_name || "Operador",
      });
      if (res.success) {
        toast.success(
          `Mesa ${batchToPrintDirectly.title} iniciada na impressora ${chosen?.name || ""} (${res.run_code})!`
        );
        setBatchToPrintDirectly(null);
        setSelectedPrinterForBatch("");
        setSelectedResinBatchId("");
        setEligibleResins([]);
        setViewTab("IMPRIMINDO");
        loadData();
      } else {
        toast.error(res.error || "Erro ao iniciar impressão.");
      }
    } catch {
      toast.error("Erro inesperado ao iniciar impressão.");
    } finally {
      setIsStartingBatchPrint(false);
    }
  };

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

  // Mesas de Impressão: cada mesa agrupa os arquivos a serem impressos juntos na impressora.
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
        const cleanTitle =
          b.batch_name?.replace(/^Impressão\b/i, "Mesa") ||
          `Mesa #${(b as any).batch_number ?? ""}`;
        return {
          key: b.id,
          batchId: b.id,
          title: cleanTitle,
          batchNumber: (b as any).batch_number ?? null,
          printer_name: b.printer_name,
          printer_id: b.printer_id,
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
        title: "Arquivos avulsos (sem mesa)",
        batchNumber: null,
        printer_name: null,
        printer_id: null,
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

  // Mapa de Status em Tempo Real por Impressora (Painel de Bancada)
  const printerStatusMap = useMemo(() => {
    return printers.map((p) => {
      const activeGroup = orderGroups.find((g) => {
        const isBatchPrinting = g.isPrinting || g.derived === "IMPRIMINDO";
        if (!isBatchPrinting) return false;
        if (g.printer_id && g.printer_id === p.id) return true;
        if (g.printer_name && g.printer_name.toLowerCase().trim() === p.name.toLowerCase().trim()) return true;
        return false;
      });

      let activeRun = activeRuns.find(
        (r) => r.printer_name.toLowerCase().trim() === p.name.toLowerCase().trim()
      );

      // Descarta run se não houver itens imprimindo nela
      if (activeRun) {
        const runCards = cards.filter((c) => activeRun!.item_ids.includes(c.id));
        const isRunStillPrinting = runCards.some((c) => c.status === "IMPRIMINDO");
        if (runCards.length > 0 && !isRunStillPrinting) {
          activeRun = undefined;
        }
      }

      let groupFromRun = activeGroup;
      if (!groupFromRun && activeRun) {
        groupFromRun = orderGroups.find((g) =>
          (g.isPrinting || g.derived === "IMPRIMINDO") &&
          g.items.some((i) => activeRun!.item_ids.includes(i.id))
        );
      }

      return {
        printer: p,
        activeGroup: groupFromRun || null,
        activeRun: activeRun || null,
      };
    });
  }, [printers, orderGroups, activeRuns, cards]);

  // Ações de Mesa do Painel de Máquinas
  const handleFinishBatch = async (batchId?: string | null, printerId?: string | null) => {
    try {
      let completedCount = 0;
      if (batchId && batchId !== "avulsos") {
        const res = await OdontoPrintService.finishPrintBatch(
          batchId,
          user?.id,
          user?.full_name || "Operador"
        );
        if (!res.success) {
          toast.error(res.error || "Erro ao concluir mesa.");
          return;
        }
        completedCount = res.completed_count;
      }
      if (printerId) {
        await OdontoPrintService.releasePrinter(
          printerId,
          user?.id,
          user?.full_name || "Operador"
        );
      }
      toast.success(
        completedCount > 0
          ? `Mesa concluída e impressora liberada! ${completedCount} modelo(s) finalizados.`
          : "Impressora liberada com sucesso!"
      );
      loadData();
    } catch {
      toast.error("Erro inesperado ao concluir mesa.");
    }
  };

  const handleReleasePrinterDirectly = async (printerId: string) => {
    try {
      const res = await OdontoPrintService.releasePrinter(
        printerId,
        user?.id,
        user?.full_name || "Operador"
      );
      if (res.success) {
        toast.success("Impressora liberada com sucesso!");
        loadData();
      } else {
        toast.error(res.error || "Erro ao liberar impressora.");
      }
    } catch {
      toast.error("Erro ao liberar impressora.");
    }
  };

  const handleConfirmFailWholeBatch = async () => {
    if (!batchToFailWhole || !batchToFailWhole.batchId) return;
    setIsFailingBatch(true);
    try {
      const res = await OdontoPrintService.failPrintBatch(
        batchToFailWhole.batchId,
        failReasonWhole.trim() || "Falha técnica na mesa inteira",
        user?.id,
        user?.full_name || "Operador"
      );
      if (res.success) {
        toast.warning(
          `Mesa ${batchToFailWhole.title} marcada como falha. ${res.affected_count} modelo(s) voltaram para a fila com prioridade URGENTE.`
        );
        setBatchToFailWhole(null);
        setFailReasonWhole("");
        loadData();
      } else {
        toast.error("Erro ao registrar falha na mesa.");
      }
    } catch {
      toast.error("Erro inesperado ao registrar falha.");
    } finally {
      setIsFailingBatch(false);
    }
  };

  const handleAssignBatchToFreePrinter = async () => {
    if (!printerToAssignBatch || !selectedBatchForFreePrinter) return;
    setIsAssigningBatch(true);
    try {
      const chosenGroup = orderGroups.find((g) => g.batchId === selectedBatchForFreePrinter);
      const res = await OdontoPrintService.startPrintBatchDirectly({
        batch_id: selectedBatchForFreePrinter,
        printer_id: printerToAssignBatch.id,
        user_id: user?.id,
        user_name: user?.full_name || "Operador",
      });
      if (res.success) {
        toast.success(
          `Mesa ${chosenGroup?.title || ""} enviada para ${printerToAssignBatch.name} (${res.run_code})!`
        );
        setPrinterToAssignBatch(null);
        setSelectedBatchForFreePrinter("");
        setViewTab("IMPRIMINDO");
        loadData();
      } else {
        toast.error(res.error || "Erro ao iniciar impressão.");
      }
    } catch {
      toast.error("Erro ao vincular mesa à impressora.");
    } finally {
      setIsAssigningBatch(false);
    }
  };

  // Contadores das 4 grandes abas de visão do operador
  const tabCounts = useMemo(() => {
    let fila = 0;
    let imprimindo = 0;
    let todas = orderGroups.length;
    let concluidas = 0;
    for (const g of orderGroups) {
      if (["AGUARDANDO", "PREPARANDO", "ERRO"].includes(g.derived)) fila++;
      if (g.derived === "IMPRIMINDO" || g.isPrinting) imprimindo++;
      if (g.derived === "CONCLUIDO") concluidas++;
    }
    return { fila, imprimindo, todas, concluidas };
  }, [orderGroups]);

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

  // Mesas filtradas por aba + busca + filtros secundários
  const filteredGroups = useMemo(() => {
    return orderGroups.filter((g) => {
      // 1. Filtro principal por Aba
      if (viewTab === "FILA") {
        if (!["AGUARDANDO", "PREPARANDO", "ERRO"].includes(g.derived)) return false;
      } else if (viewTab === "IMPRIMINDO") {
        if (g.derived !== "IMPRIMINDO" && !g.isPrinting) return false;
      } else if (viewTab === "CONCLUIDAS") {
        if (g.derived !== "CONCLUIDO") return false;
      }

      // 2. Filtros secundários
      if (statusFilter !== "TODAS" && g.derived !== statusFilter) return false;
      if (
        clinicFilter !== "TODAS" &&
        !g.items.some((c) => c.clinic_name.toLowerCase() === clinicFilter.toLowerCase())
      )
        return false;
      if (onlyReprints && !g.items.some((c) => c.is_retry)) return false;
      if (todayFilter) {
        const todayStr = new Date().toISOString().split("T")[0];
        if (!g.createdAt.startsWith(todayStr)) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = g.title.toLowerCase().includes(q);
        const inPrinter = g.printer_name ? g.printer_name.toLowerCase().includes(q) : false;
        if (!inTitle && !inPrinter && !g.items.some((c) => cardMatchesQuery(c, q))) return false;
      }
      return true;
    });
  }, [orderGroups, viewTab, statusFilter, clinicFilter, onlyReprints, todayFilter, searchQuery]);

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
    // Clínicas conhecidas para o leitor de nome de arquivo reconhecer
    // "clínica/doutor" dentro do nome (ex: "OdontoPrime_PAC45_Troquel.stl").
    const knownClinics = Array.from(
      new Set([...uniqueClinics, defaultClinic].filter((c) => c && c.trim()))
    );

    let parsedClinics = 0;
    let parsedWorks = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!validExtensions.includes(ext)) {
        toast.warning(`Arquivo ${file.name} ignorado (apenas .stl, .obj, .3mf, .ply aceitos).`);
        continue;
      }

      // Lê clínica/doutor, paciente e tipo de peça direto do nome do arquivo.
      // O conteúdo do arquivo nunca é lido por inteiro (só 1MB p/ hash).
      const parsed = parseFileName(file.name, knownClinics);
      if (parsed.clinic) parsedClinics++;
      if (parsed.workType) parsedWorks++;

      const hash = await computeFileHash(file);

      newItems.push({
        id: crypto.randomUUID(),
        file_name: file.name,
        file_size: file.size,
        file_hash: hash,
        patient: (parsed.patient || file.name.replace(/\.[^/.]+$/, "")).toUpperCase(),
        patient_name: "",
        clinic: parsed.clinic || defaultClinic,
        cadista: defaultCadista,
        work_type: parsed.workType || bulkWorkType,
        parsed_from_name: Boolean(parsed.clinic || parsed.workType),
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
    if (newItems.length > 0 && (parsedClinics > 0 || parsedWorks > 0)) {
      const parts: string[] = [];
      if (parsedClinics > 0) parts.push(`clínica em ${parsedClinics}`);
      if (parsedWorks > 0) parts.push(`tipo de peça em ${parsedWorks}`);
      toast.success(`Nome do arquivo lido: ${parts.join(" e ")} de ${newItems.length} arquivo(s). Confira os campos.`);
    }
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
        toast.success(`${moved} arquivo(s) adicionados à mesa ${dest?.title || ""}!`);
        setExpandedBatchIds([uploadDest]);
      } else {
        // Cada envio vira uma Mesa de Impressão na impressora
        const batchRes = await OdontoPrintService.createOrderBatch({
          item_ids: res.created_ids,
          batch_name: newMesaName.trim() || undefined,
          printer_id: newMesaPrinterId || undefined,
          printer_name: printers.find((p) => p.id === newMesaPrinterId)?.name,
          user_id: user?.id,
          user_name: user?.full_name || bulkCadista,
        });

        if (batchRes.success && batchRes.batch) {
          const title = batchRes.batch.batch_name?.replace(/^Impressão\b/i, "Mesa");
          if (newMesaPrinterId) {
            const printRes = await OdontoPrintService.startPrintBatchDirectly({
              batch_id: batchRes.batch.id,
              printer_id: newMesaPrinterId,
              user_id: user?.id,
              user_name: user?.full_name || bulkCadista,
            });
            const chosenPrinter = printers.find((p) => p.id === newMesaPrinterId);
            if (printRes.success) {
              toast.success(
                `${title} criada e colocada em impressão na ${chosenPrinter?.name || "impressora"} (${printRes.run_code})!`
              );
              setViewTab("IMPRIMINDO");
            } else {
              toast.success(`${title} criada na Fila! (Inicie quando a máquina estiver pronta)`);
              setViewTab("FILA");
            }
          } else {
            toast.success(
              `${res.created_count} arquivo(s) organizados na ${title}!`
            );
            setViewTab("FILA");
          }
          setExpandedBatchIds([batchRes.batch.id]);
        } else {
          toast.success(
            `${res.created_count} arquivo(s) cadastrado(s) com sucesso na Fila!`
          );
        }
      }
      setUploadDest("new");
      setNewMesaName("");
      setNewMesaPrinterId("");
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

  // Apagar mesa (com confirmação; aviso extra se estiver imprimindo)
  const handleConfirmDeleteBatch = async () => {
    if (!batchToDelete || !batchToDelete.batchId) return;
    setIsDeletingBatch(true);
    try {
      const res = await OdontoPrintService.deletePrintBatch(batchToDelete.batchId);
      if (res.success) {
        toast.success(`Mesa apagada (${res.removed_count} arquivo(s) removidos da fila).`);
        setBatchToDelete(null);
        loadData();
      } else {
        toast.error(res.error || "Erro ao apagar mesa.");
        loadData();
      }
    } catch {
      toast.error("Erro ao apagar mesa.");
      loadData();
    } finally {
      setIsDeletingBatch(false);
    }
  };

  // Esvaziar mesa (desvincular todos os arquivos de volta para avulsos)
  const handleConfirmEmptyBatch = async () => {
    if (!batchToEmpty || !batchToEmpty.batchId) return;
    setIsEmptyingBatch(true);
    try {
      const res = await OdontoPrintService.emptyPrintBatch(
        batchToEmpty.batchId,
        user?.id,
        user?.full_name || "Operador"
      );
      if (res.success) {
        toast.success(`Mesa esvaziada (${res.unlinked_count} arquivo(s) retornados para a fila).`);
        setBatchToEmpty(null);
        loadData();
      } else {
        toast.error(res.error || "Erro ao esvaziar mesa.");
        loadData();
      }
    } catch {
      toast.error("Erro ao esvaziar mesa.");
      loadData();
    } finally {
      setIsEmptyingBatch(false);
    }
  };

  // Apagar arquivo individual permanentemente da mesa e fila
  const handleConfirmDeleteCard = async () => {
    if (!cardToDelete) return;
    setIsDeletingCard(true);
    try {
      const res = await OdontoPrintService.deletePrintCard(cardToDelete.id);
      if (res.success) {
        toast.success(`Arquivo "${cardToDelete.file_name}" apagado com sucesso.`);
        setCardToDelete(null);
        loadData();
      } else {
        toast.error(res.error || "Erro ao apagar arquivo.");
        loadData();
      }
    } catch {
      toast.error("Erro ao apagar arquivo.");
      loadData();
    } finally {
      setIsDeletingCard(false);
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
        {/* Cabeçalho */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-semibold text-white tracking-tight flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                Fila de Impressão 3D
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Mesas, produção e falhas — tudo num só lugar.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsUploadModalOpen(true)}
              className="w-full sm:w-auto justify-center bg-white hover:bg-slate-200 text-slate-900 rounded-lg text-xs font-semibold px-3 h-9 gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Mesa de Impressão</span>
            </Button>
          </div>
        </div>

        {/* Zona de Drop direto de arquivos para criar Mesa de Impressão */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingOver(false);
            handleFilesSelected(e.dataTransfer.files);
            setIsUploadModalOpen(true);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-4 sm:p-5 text-center cursor-pointer transition ${
            isDraggingOver
              ? "border-cyan-400 bg-cyan-950/40 ring-2 ring-cyan-400/50 scale-[1.005]"
              : "border-slate-800 hover:border-slate-600 bg-slate-900/40 hover:bg-slate-900/70"
          }`}
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-800 text-cyan-400 flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs sm:text-sm font-semibold text-white">
                  Solte arquivos STL/OBJ aqui para montar uma nova Mesa de Impressão
                </p>
                <p className="text-[11px] text-slate-400">
                  Cada envio agrupa os arquivos na mesa da impressora · Clique para selecionar
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="bg-white hover:bg-slate-200 text-slate-950 font-bold text-xs h-8 px-3.5 gap-1.5 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Selecionar Arquivos
            </Button>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* PAINEL AO VIVO: MÁQUINAS DO LABORATÓRIO — STATUS EM TEMPO REAL */}
        {/* ==================================================================== */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/60 text-cyan-400 flex items-center justify-center">
                <Printer className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white">
                  Impressoras
                </h2>
                <p className="text-[11px] text-slate-400">
                  O que cada máquina está rodando agora.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-xs px-2.5 py-1 rounded-md bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 font-semibold">
                {printerStatusMap.filter((m) => m.activeGroup).length} em produção
              </span>
              <span className="text-xs px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
                {printerStatusMap.filter((m) => !m.activeGroup).length} disponíveis
              </span>
            </div>
          </div>

          {/* Grid de Impressoras */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {printerStatusMap.map(({ printer, activeGroup, activeRun }) => {
              const isPrinting = Boolean(activeGroup);

              return (
                <div
                  key={printer.id}
                  className={`rounded-xl border p-4 flex flex-col justify-between transition ${
                    isPrinting
                      ? "bg-gradient-to-b from-slate-900 to-slate-900/90 border-cyan-500/60 shadow-lg shadow-cyan-950/30 ring-1 ring-cyan-500/30"
                      : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  {/* Topo do Card da Impressora */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                          <Printer className="w-4 h-4 text-cyan-400 shrink-0" />
                          {printer.name}
                        </h3>
                        <p className="text-[11px] text-slate-400 truncate">
                          {printer.brand} {printer.model}
                        </p>
                      </div>

                      {isPrinting ? (
                        <span className="text-[10px] font-bold text-cyan-300 bg-cyan-950 border border-cyan-700 rounded-md px-2 py-0.5 flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          IMPRIMINDO
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/70 border border-emerald-800 rounded-md px-2 py-0.5 flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          DISPONÍVEL
                        </span>
                      )}
                    </div>

                    {/* Conteúdo do Card */}
                    {isPrinting && activeGroup ? (
                      <div className="space-y-2.5 mt-3 pt-2.5 border-t border-slate-800/80">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white flex items-center gap-1 truncate">
                            <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            {activeGroup.title}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono shrink-0">
                            {formatElapsed(activeRun?.started_at || activeGroup.createdAt)}
                          </span>
                        </div>

                        {/* Lista de Modelos na Mesa */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                              Modelos na Mesa ({activeGroup.items.length}):
                            </p>
                            {activeRun && (
                              <span className="text-[10px] text-slate-400 font-semibold">
                                Ordem {activeRun.run_code}
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
                            {activeGroup.items.map((card) => {
                              const isFailed = card.status === "FALHOU";
                              const isConcluded = card.status === "CONCLUIDO";

                              return (
                                <div
                                  key={card.id}
                                  className={`flex items-center justify-between gap-1.5 text-xs p-1.5 rounded-lg border transition ${
                                    isFailed
                                      ? "bg-rose-950/40 border-rose-800/60 text-rose-200"
                                      : isConcluded
                                      ? "bg-emerald-950/30 border-emerald-900/40 text-emerald-200"
                                      : "bg-slate-950/60 border-slate-800 text-slate-200"
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 truncate">
                                      <span className="font-bold text-white truncate">
                                        {card.patient_code}
                                      </span>
                                      <span className="text-[11px] text-slate-400 truncate">
                                        · {card.clinic_name}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 truncate">
                                      {LAB_WORK_TYPE_LABELS[card.work_type] || card.work_type}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    {isFailed ? (
                                      <span className="text-[9px] font-bold text-rose-300 bg-rose-950 border border-rose-700 rounded px-1.5 py-0.5">
                                        FALHOU
                                      </span>
                                    ) : isConcluded ? (
                                      <span className="text-[9px] font-bold text-emerald-300 bg-emerald-950 border border-emerald-800 rounded px-1.5 py-0.5">
                                        CONCLUÍDO
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCardToFail(card);
                                          setCardFailReason("");
                                        }}
                                        className="text-[10px] font-semibold text-rose-300 hover:text-white bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 rounded px-1.5 py-0.5 transition"
                                        title="Marcar falha apenas neste modelo (vira prioridade para próxima mesa)"
                                      >
                                        Falhou
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setCardToDelete(card)}
                                      className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition"
                                      title="Apagar este arquivo da mesa e da fila"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-5 text-center">
                        <p className="text-xs text-slate-400">
                          Nenhuma mesa rodando nesta impressora no momento.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Rodapé / Ações da Impressora */}
                  <div className="pt-3 mt-3 border-t border-slate-800/80">
                    {isPrinting && activeGroup ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleFinishBatch(activeGroup.batchId || null, printer.id)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 rounded-lg gap-1 shadow"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Concluir Mesa
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setBatchToFailWhole(activeGroup);
                            setFailReasonWhole("");
                          }}
                          className="border-rose-800/80 text-rose-300 hover:bg-rose-950/60 text-xs h-8 rounded-lg px-2.5"
                          title="Marcar mesa inteira como falha (modelos viram prioridade)"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Falhou
                        </Button>
                      </div>
                    ) : isPrinting && !activeGroup ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleReleasePrinterDirectly(printer.id)}
                          className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs h-8 rounded-lg gap-1 shadow"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Liberar Impressora
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setPrinterToAssignBatch(printer);
                          const readyBatch = orderGroups.find(
                            (g) => g.batchId && ["AGUARDANDO", "PREPARANDO", "ERRO"].includes(g.derived)
                          );
                          setSelectedBatchForFreePrinter(readyBatch?.batchId || "");
                        }}
                        className="w-full bg-white hover:bg-slate-200 text-slate-950 font-bold text-xs h-8 rounded-lg gap-1.5 shadow"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Carregar Mesa da Fila
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4 Grandes Abas de Visão do Operador */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setViewTab("FILA")}
            className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
              viewTab === "FILA"
                ? "bg-slate-800/90 border-cyan-500/60 ring-1 ring-cyan-500/40"
                : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Mesas na Fila
              </p>
              <p className="text-base font-bold text-white mt-0.5">
                {tabCounts.fila} {tabCounts.fila === 1 ? "mesa" : "mesas"}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setViewTab("IMPRIMINDO")}
            className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
              viewTab === "IMPRIMINDO"
                ? "bg-slate-800/90 border-cyan-400/80 ring-1 ring-cyan-400/50"
                : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                {tabCounts.imprimindo > 0 ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
                  </span>
                ) : (
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                )}
                Em Impressão
              </p>
              <p className="text-base font-bold text-white mt-0.5">
                {tabCounts.imprimindo} {tabCounts.imprimindo === 1 ? "mesa" : "mesas"}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setViewTab("TODAS")}
            className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
              viewTab === "TODAS"
                ? "bg-slate-800/90 border-cyan-500/60 ring-1 ring-cyan-500/40"
                : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5 text-slate-500" />
                Todas as Mesas
              </p>
              <p className="text-base font-bold text-white mt-0.5">
                {tabCounts.todas} {tabCounts.todas === 1 ? "mesa" : "mesas"}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setViewTab("CONCLUIDAS")}
            className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
              viewTab === "CONCLUIDAS"
                ? "bg-slate-800/90 border-emerald-500/60 ring-1 ring-emerald-500/40"
                : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Concluídas
              </p>
              <p className="text-base font-bold text-white mt-0.5">
                {tabCounts.concluidas} {tabCounts.concluidas === 1 ? "mesa" : "mesas"}
              </p>
            </div>
          </button>
        </div>

        {/* Banner de Prioridade Máxima: Falhas aguardando próxima mesa */}
        {!isLoading && failedPendingCount > 0 && (
          <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-900/80 text-rose-300 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-rose-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-bold text-white">
                    {failedPendingCount} arquivo(s) com falha aguardando reimpressão
                  </h3>
                  <Badge variant="outline" className="bg-rose-900/80 text-rose-200 border-rose-600 font-bold text-[10px]">
                    PRIORIDADE
                  </Badge>
                </div>
                <p className="text-xs text-rose-200/80 mt-0.5">
                  Estes modelos falharam na impressora e entram como prioridade urgente na próxima mesa de impressão.
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleCollectFailed}
              className="bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs h-9 px-4 shrink-0 shadow-md gap-1.5"
            >
              <Layers className="w-4 h-4" />
              Nova mesa com falhas
            </Button>
          </div>
        )}

        {/* Barra de busca + filtros secundários */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-2 p-2.5">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar paciente, clínica, arquivo, impressora..."
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

        {/* Andamento das impressões na máquina — ordens ativas */}
        {!isLoading && activeRuns.length > 0 && viewTab === "IMPRIMINDO" && (
          <div className="bg-slate-900/60 border border-cyan-800/60 rounded-xl p-3">
            <div className="flex items-center justify-between px-1 pb-2">
              <h2 className="text-xs font-semibold text-cyan-300 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
                </span>
                Executando na Impressora ({activeRuns.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {activeRuns.map((run) => (
                <div
                  key={run.id}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-white">
                      {run.run_code}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatElapsed(run.started_at)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5 font-medium">
                    <Printer className="w-3.5 h-3.5 text-cyan-400" />
                    {run.printer_name}
                  </p>
                  <div className="pt-2 mt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                    <span>{run.items_count} arquivo(s) na mesa</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estado vazio */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-10 w-full rounded-xl bg-slate-800/60" />
                <Skeleton className="h-32 w-full rounded-xl bg-slate-800/40" />
              </div>
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white">
              {viewTab === "FILA"
                ? "Nenhuma mesa aguardando na fila"
                : viewTab === "IMPRIMINDO"
                ? "Nenhuma mesa imprimindo no momento"
                : viewTab === "CONCLUIDAS"
                ? "Nenhuma mesa concluída ainda"
                : "Nenhuma mesa encontrada"}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
              {hasActiveFilters
                ? "Nenhum item corresponde aos filtros. Ajuste a busca ou limpe os filtros."
                : "Solte arquivos STL na tela ou clique abaixo para montar a primeira Mesa de Impressão."}
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
                Nova Mesa de Impressão
              </Button>
            </div>
          </div>
        ) : (
          /* Lista das Mesas de Impressão */
          <div className="space-y-3">
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
                  className={`bg-slate-900/50 border rounded-2xl overflow-hidden transition ${
                    group.isPrinting
                      ? "border-cyan-500/70 shadow-md shadow-cyan-950/20"
                      : group.derived === "ERRO"
                      ? "border-rose-900/80 bg-rose-950/10"
                      : "border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {/* Cabeçalho da Mesa de Impressão */}
                  <div
                    onClick={() => toggleExpandBatch(group.key)}
                    className="w-full text-left p-3.5 sm:p-4 flex flex-wrap items-center gap-3 hover:bg-slate-800/30 transition cursor-pointer select-none"
                  >
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${
                        expanded ? "" : "-rotate-90"
                      }`}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                          {group.title}
                        </span>

                        {group.printer_name && (
                          <span className="text-[11px] font-semibold text-cyan-300 bg-cyan-950/80 border border-cyan-800 rounded-md px-2 py-0.5 flex items-center gap-1">
                            <Printer className="w-3 h-3 text-cyan-400" />
                            {group.printer_name}
                          </span>
                        )}

                        <span
                          className={`text-[10px] font-bold border rounded-md px-2 py-0.5 ${cfg.chip}`}
                        >
                          {cfg.label}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formatDate(group.createdAt)} · <strong>{group.items.length}</strong>{" "}
                        {group.items.length === 1 ? "arquivo na mesa" : "arquivos na mesa"}
                      </p>

                      {firstRun && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                          Ordem {firstRun.run_code} · em execução
                        </span>
                      )}
                    </div>

                    {/* Botões de Ação na Mesa */}
                    <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
                      {group.isPrinting ? (
                        <Button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGroupConfirmTarget({ group, to: "CONCLUIDO" });
                          }}
                          size="sm"
                          className="h-9 sm:h-8 px-3 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex-1 sm:flex-none flex items-center justify-center gap-1 shadow"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Concluir Mesa
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBatchToPrintDirectly(group);
                            setSelectedPrinterForBatch(
                              group.printer_id || (printers[0]?.id || "")
                            );
                          }}
                          disabled={group.printableCount === 0}
                          size="sm"
                          className="h-9 sm:h-8 px-3.5 text-[11px] font-bold bg-white hover:bg-slate-200 text-slate-950 rounded-lg flex-1 sm:flex-none flex items-center justify-center gap-1.5 shadow disabled:opacity-40"
                          title={`Colocar ${group.printableCount} arquivo(s) na impressora`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Iniciar Impressão
                          {group.printableCount > 0 && <span>({group.printableCount})</span>}
                        </Button>
                      )}

                      {group.batchId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBatchToDelete(group);
                          }}
                          className="h-8 px-2.5 text-[11px] font-medium text-slate-400 hover:text-red-300 hover:bg-slate-800 rounded-lg flex items-center gap-1 transition"
                          title="Apagar mesa de impressão"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Apagar</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Arquivos contidos nesta Mesa (expandido) */}
                  {expanded && (
                    <div className="border-t border-slate-800">
                      {/* Ações em lote na mesa */}
                      <div className="flex items-center flex-wrap gap-1.5 px-3 sm:px-4 py-2 bg-slate-950/60 border-b border-slate-800/80">
                        <button
                          type="button"
                          disabled={
                            isBulkUpdating ||
                            !group.items.some((i) => i.status === "NA_FILA")
                          }
                          onClick={() => setGroupConfirmTarget({ group, to: "PREPARANDO" })}
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5"
                        >
                          <Hammer className="w-3.5 h-3.5" />
                          Preparar todos
                        </button>
                        <button
                          type="button"
                          disabled={
                            isBulkUpdating ||
                            !group.items.some((i) => i.status === "IMPRESSO")
                          }
                          onClick={() => setGroupConfirmTarget({ group, to: "CONCLUIDO" })}
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          Concluir todos
                        </button>
                        {group.batchId && group.items.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setBatchToEmpty(group)}
                            className="px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition flex items-center gap-1.5"
                            title="Tirar todos os arquivos desta mesa e deixá-los avulsos na fila"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                            Esvaziar mesa
                          </button>
                        )}
                        {group.batchId && (
                          <button
                            type="button"
                            onClick={() => setBatchToDelete(group)}
                            className="px-2.5 py-1 text-[11px] font-medium text-rose-300 hover:text-white hover:bg-rose-950/60 rounded-md transition flex items-center gap-1.5"
                            title="Apagar esta mesa e todos os seus arquivos da fila"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Apagar mesa
                          </button>
                        )}
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
                          className="px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-950/60 rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition ml-auto flex items-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Falha na mesa
                        </button>
                      </div>

                      {/* Lista de Arquivos da Mesa */}
                      <div className="divide-y divide-slate-800/60">
                        {[...group.items]
                          .sort((a, b) => Number(b.is_retry || b.status === "FALHOU") - Number(a.is_retry || a.status === "FALHOU"))
                          .map((card) => {
                            const statusCfg = PRINT_CARD_STATUS_CONFIG[card.status];
                            const isFailed = card.status === "FALHOU";
                            const isUrgent = card.priority === "URGENTE";

                            return (
                              <div
                                key={card.id}
                                className={`p-3 pl-4 sm:pl-5 min-w-0 transition ${
                                  isFailed ? "bg-rose-950/20" : ""
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenPatientHistory(card.patient_code)}
                                    className="text-[13px] font-bold text-white hover:underline underline-offset-2 truncate"
                                    title="Ver histórico do paciente"
                                  >
                                    {card.patient_code}
                                  </button>

                                  {card.patient_name && (
                                    <span className="text-xs text-slate-400 truncate">
                                      ({card.patient_name})
                                    </span>
                                  )}

                                  {/* Badges de Destaque / Falha / Prioridade */}
                                  {isFailed ? (
                                    <span className="shrink-0 text-[11px] font-bold text-rose-200 bg-rose-950 border border-rose-500 rounded-md px-2 py-0.5 flex items-center gap-1">
                                      <XCircle className="w-3.5 h-3.5 text-rose-400" />
                                      Falhou · prioridade
                                    </span>
                                  ) : (
                                    <>
                                      {isUrgent ? (
                                        <span className="shrink-0 text-[10px] font-bold text-red-200 bg-red-950 border border-red-700 rounded px-1.5 py-0.5">
                                          PRIORIDADE
                                        </span>
                                      ) : card.is_retry ? (
                                        <span className="shrink-0 text-[10px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-800 rounded px-1.5 py-0.5">
                                          {card.retry_count > 1 ? `${card.retry_count}ª tentativa` : "Reimpressão"}
                                        </span>
                                      ) : null}

                                      <span className="shrink-0 text-[10px] text-slate-300 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5">
                                        {statusCfg.label}
                                      </span>
                                    </>
                                  )}
                                </div>

                                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                                  <span>Clínica: <strong>{card.clinic_name}</strong></span>
                                  <span>·</span>
                                  <span>Tipo: <strong>{LAB_WORK_TYPE_LABELS[card.work_type] || card.work_type}</strong></span>
                                  {card.material && (
                                    <>
                                      <span>·</span>
                                      <span className="text-slate-500 font-mono">{card.material}</span>
                                    </>
                                  )}
                                </div>

                                <p
                                  className="text-[11px] text-slate-500 font-mono truncate mt-0.5 flex items-center gap-1.5"
                                  title={card.file_name}
                                >
                                  <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  {card.file_name}
                                </p>

                                {card.last_failure_reason && (
                                  <p className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-md px-2 py-1 mt-1.5 inline-block">
                                    <strong>Motivo da falha:</strong> {card.last_failure_reason}
                                  </p>
                                )}

                                {/* Barra de ações em linha no arquivo */}
                                <div className="flex items-center flex-wrap gap-1.5 mt-2 min-w-0">
                                  {/* Botão de Marcar Falha com destaque */}
                                  {card.status !== "CONCLUIDO" && !isFailed && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCardToFail(card);
                                        setCardFailReason("");
                                      }}
                                      className="px-2.5 py-1 text-xs font-semibold text-rose-300 bg-rose-950/70 hover:bg-rose-900 border border-rose-800 rounded-md flex items-center gap-1 transition shadow-sm"
                                      title="Marcar este arquivo como falha (vira prioridade para reimpressão)"
                                    >
                                      <XCircle className="w-3.5 h-3.5 text-rose-400" />
                                      Marcar Falha
                                    </button>
                                  )}

                                  {/* Se já falhou, botão para voltar à fila como prioridade */}
                                  {isFailed && (
                                    <button
                                      type="button"
                                      onClick={() => handleQuickAdvanceStatus(card)}
                                      className="px-2.5 py-1 text-xs font-bold text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-md flex items-center gap-1 shadow transition"
                                      title="Retornar arquivo para a fila como prioridade"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      Reimprimir
                                    </button>
                                  )}

                                  {/* Avançar status */}
                                  {card.status !== "CONCLUIDO" && card.status !== "CANCELADO" && !isFailed && (
                                    <button
                                      type="button"
                                      onClick={() => handleQuickAdvanceStatus(card)}
                                      className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-white text-slate-900 rounded-md flex items-center gap-1 whitespace-nowrap transition"
                                    >
                                      Avançar
                                      <ArrowRight className="w-3 h-3 shrink-0" />
                                    </button>
                                  )}

                                  {/* Voltar status */}
                                  {getPreviousStatus(card.status) && (
                                    <button
                                      type="button"
                                      onClick={() => handleGoBackStatus(card)}
                                      className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-md flex items-center gap-1 whitespace-nowrap transition"
                                      title="Desfazer e voltar etapa"
                                    >
                                      <Undo2 className="w-3 h-3 shrink-0" />
                                      Voltar
                                    </button>
                                  )}

                                  {/* Tirar da mesa direto com 1 clique se estiver em uma mesa */}
                                  {card.batch_id && (
                                    <button
                                      type="button"
                                      onClick={() => handleMoveItem(card, "avulsos")}
                                      className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-md flex items-center gap-1 whitespace-nowrap transition"
                                      title="Tirar este arquivo da mesa (fica avulso na fila)"
                                    >
                                      <Undo2 className="w-3 h-3 shrink-0" />
                                      Tirar da mesa
                                    </button>
                                  )}

                                  {/* Mover arquivo para outra mesa */}
                                  <select
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value) handleMoveItem(card, e.target.value);
                                      e.target.value = "";
                                    }}
                                    className="max-w-[130px] bg-slate-950 text-[11px] text-slate-300 border border-slate-800 hover:border-slate-700 rounded-md px-1.5 py-1 focus:outline-none focus:border-slate-600"
                                    title="Mover este arquivo para outra mesa de impressão"
                                  >
                                    <option value="">Mover de mesa…</option>
                                    {orderGroups
                                      .filter((g) => g.batchId && g.batchId !== card.batch_id)
                                      .map((g) => (
                                        <option key={g.key} value={g.batchId || ""}>
                                          {g.title}
                                        </option>
                                      ))}
                                    {card.batch_id && <option value="avulsos">Sem mesa (avulso)</option>}
                                  </select>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenCardHistory(card)}
                                    className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-md transition"
                                    title="Ver histórico de movimentações deste arquivo"
                                  >
                                    <History className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Botão de APAGAR arquivo individual */}
                                  <button
                                    type="button"
                                    onClick={() => setCardToDelete(card)}
                                    className="px-2 py-1 text-[11px] font-semibold text-rose-400 hover:text-white hover:bg-rose-900/60 border border-rose-950 hover:border-rose-800 rounded-md flex items-center gap-1 whitespace-nowrap transition"
                                    title="Apagar este arquivo da mesa e da fila"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                    Apagar
                                  </button>
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
        {/* ==================================================================== */}
        {/* MODAL: NOVA MESA DE IMPRESSÃO (MODO BANCADA / ZERO UPLOAD PESADO) */}
        {/* ==================================================================== */}
        <Dialog
          open={isUploadModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              setPendingFiles([]);
              setUploadDest("new");
              setNewMesaPrinterId("");
              setNewMesaName("");
            }
            setIsUploadModalOpen(open);
          }}
          title="Montar Mesa de Impressão 3D"
        >
          <div className="space-y-4 max-h-[82vh] overflow-y-auto pr-1">
            {/* Aviso de Modo Bancada / Arquivos Locais */}
            <div className="bg-cyan-950/40 border border-cyan-800/80 rounded-xl p-3 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold text-cyan-200">
                  Modo Bancada: Zero Upload Pesado
                </p>
                <p className="text-cyan-300/80 mt-0.5">
                  Os arquivos 3D (.stl) permanecem seguros no seu computador/Drive. O sistema lê apenas os nomes dos arquivos para preencher automaticamente o Doutor/Clínica e Paciente de cada modelo da mesa.
                </p>
              </div>
            </div>

            {/* ÁREA DE DRAG AND DROP */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFilesSelected(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-cyan-400 bg-slate-900/60 hover:bg-slate-900 rounded-2xl p-5 text-center cursor-pointer transition group"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".stl,.obj,.3mf,.ply"
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />
              <div className="w-10 h-10 rounded-full bg-slate-800 text-cyan-400 group-hover:scale-110 flex items-center justify-center mx-auto mb-2 transition">
                <Upload className="w-5 h-5" />
              </div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">
                Arraste seus arquivos STL da pasta da clínica aqui ou clique para selecionar
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Suporta múltiplos arquivos simultâneos (.stl, .obj, .3mf)
              </p>
            </div>

            {/* Configurações Rápidas da Mesa */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-xs font-semibold text-white block mb-1">
                    Nome da Mesa
                  </label>
                  <input
                    type="text"
                    value={newMesaName}
                    onChange={(e) => setNewMesaName(e.target.value)}
                    placeholder={`Mesa #${batches.length + 1}`}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 text-xs font-medium"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Identificação da mesa montada no Halot Box ou ChiTuBox.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-white block mb-1">
                    Impressora da Mesa (Opcional)
                  </label>
                  <select
                    value={newMesaPrinterId}
                    onChange={(e) => setNewMesaPrinterId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400 text-xs"
                  >
                    <option value="">Apenas salvar na Fila (escolher impressora depois)</option>
                    {printers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.brand} {p.model})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Se escolher a impressora agora, a mesa já entra em impressão imediatamente.
                  </p>
                </div>
              </div>
            </div>

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
                          {item.parsed_from_name && (
                            <span
                              className="text-[10px] font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-full"
                              title="Clínica e/ou tipo de peça identificados automaticamente pelo nome do arquivo. Confira os campos abaixo."
                            >
                              Lido do nome
                            </span>
                          )}
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
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setPendingFiles([]);
                  setNewMesaName("");
                  setNewMesaPrinterId("");
                  setUploadDest("new");
                }}
                className="border-slate-700 text-slate-300 rounded-lg text-xs h-9"
              >
                Cancelar
              </Button>

              <Button
                disabled={pendingFiles.length === 0 || isSavingCards || isCheckingDuplicates}
                onClick={handleSaveUpload}
                className="bg-white hover:bg-slate-200 text-slate-950 font-bold rounded-lg text-xs h-9 px-5 gap-1.5 shadow"
              >
                {isSavingCards ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    <span>Salvando mesa...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {newMesaPrinterId
                        ? `Criar e Iniciar Mesa (${pendingFiles.length} modelos)`
                        : `Criar Mesa com ${pendingFiles.length} modelo(s)`}
                    </span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 2: APAGAR MESA DE IMPRESSÃO (COM CONFIRMAÇÃO + AVISO SE IMPRIMINDO) */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(batchToDelete)}
          onOpenChange={(open) => {
            if (!open) setBatchToDelete(null);
          }}
          title="Apagar Mesa de Impressão"
        >
          <div className="space-y-4">
            {batchToDelete?.isPrinting && (
              <div className="bg-red-950/40 border border-red-900 rounded-xl p-3.5 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold text-red-200">
                    Atenção: esta mesa está IMPRIMINDO
                  </p>
                  <p className="text-red-300/80">
                    Apagar agora vai retirar os modelos da impressora em andamento e
                    remover a mesa e seus arquivos da fila.
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-300">
              Tem certeza que deseja apagar{" "}
              <strong className="text-white">{batchToDelete?.title}</strong>? Serão removidos{" "}
              <strong className="text-white">
                {batchToDelete?.items.length}{" "}
                {batchToDelete && batchToDelete.items.length === 1 ? "arquivo" : "arquivos"}
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
                className="bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-xs h-9 px-5 gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeletingBatch ? "Apagando..." : "Sim, apagar mesa e arquivos"}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 2b: ESVAZIAR MESA (DESVINCULA TODOS OS ARQUIVOS PARA AVULSOS) */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(batchToEmpty)}
          onOpenChange={(open) => {
            if (!open) setBatchToEmpty(null);
          }}
          title="Esvaziar Mesa de Impressão"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Deseja tirar todos os{" "}
              <strong className="text-white">{batchToEmpty?.items.length} arquivo(s)</strong> da mesa{" "}
              <strong className="text-white">{batchToEmpty?.title}</strong>?
            </p>
            <p className="text-xs text-slate-400">
              Os arquivos voltarão para a fila como avulsos (&quot;Sem mesa&quot;) e você poderá montá-los em outra mesa depois. A mesa permanecerá vazia.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setBatchToEmpty(null)}
                className="border-slate-700 text-slate-300 rounded-lg text-xs h-9"
              >
                Cancelar
              </Button>

              <Button
                disabled={isEmptyingBatch}
                onClick={handleConfirmEmptyBatch}
                className="bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg text-xs h-9 px-5 gap-1.5"
              >
                <Undo2 className="w-3.5 h-3.5" />
                {isEmptyingBatch ? "Esvaziando..." : "Sim, esvaziar mesa"}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 2c: APAGAR ARQUIVO INDIVIDUAL (DA MESA / FILA) */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(cardToDelete)}
          onOpenChange={(open) => {
            if (!open) setCardToDelete(null);
          }}
          title="Apagar arquivo de impressão"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Tem certeza que deseja apagar o arquivo{" "}
              <strong className="text-white">{cardToDelete?.file_name}</strong>
              {cardToDelete?.patient_code && (
                <> (Paciente: <strong className="text-white">{cardToDelete.patient_code}</strong>)</>
              )}?
            </p>
            <p className="text-xs text-slate-400">
              Esta ação removerá este arquivo permanentemente desta mesa e da fila de impressão. O cadastro do paciente é mantido.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setCardToDelete(null)}
                className="border-slate-700 text-slate-300 rounded-lg text-xs h-9"
              >
                Cancelar
              </Button>

              <Button
                disabled={isDeletingCard}
                onClick={handleConfirmDeleteCard}
                className="bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-xs h-9 px-5 gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeletingCard ? "Apagando..." : "Sim, apagar arquivo"}
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
        {/* MODAL 5: FALHA DE ARQUIVO INDIVIDUAL (MOVE PARA PRIORIDADE) */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(cardToFail)}
          onOpenChange={(open) => {
            if (!open) setCardToFail(null);
          }}
          title="Marcar Arquivo como Falha na Impressão"
        >
          <div className="space-y-4">
            <div className="bg-rose-950/40 border border-rose-900/60 rounded-xl p-3 text-xs text-rose-200">
              <p>
                Você está marcando o modelo <strong>{cardToFail?.file_name}</strong> (Paciente:{" "}
                <strong>{cardToFail?.patient_code}</strong>) como <strong>FALHOU</strong>.
              </p>
              <p className="mt-1.5 text-rose-300 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                Este arquivo entrará automaticamente como PRIORIDADE para a próxima mesa de impressão.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Selecione ou informe o motivo da falha *
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {[
                  "Descolou da mesa",
                  "Suporte quebrou",
                  "Delaminação de camada",
                  "Falta de resina no tanque",
                  "Distorção / erro dimensional",
                  "Peça quebrou no acabamento",
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setCardFailReason(reason)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                      cardFailReason === reason
                        ? "bg-rose-900 border-rose-500 text-white font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={cardFailReason}
                onChange={(e) => setCardFailReason(e.target.value)}
                placeholder="Ex: Descolou da mesa de impressão"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-400"
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
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-full text-xs h-9 px-5 gap-1.5 shadow"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Confirmar Falha & Priorizar
              </Button>
            </div>
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL: INICIAR IMPRESSÃO DIRETO NA MESA */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(batchToPrintDirectly)}
          onOpenChange={(open) => {
            if (!open) {
              setBatchToPrintDirectly(null);
              setSelectedResinBatchId("");
              setEligibleResins([]);
            }
          }}
          title={`Enviar ${batchToPrintDirectly?.title || "Mesa"} para Impressora`}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Você está prestes a colocar a <strong>{batchToPrintDirectly?.title}</strong> em impressão.
              Todos os {batchToPrintDirectly?.printableCount} arquivos prontos desta mesa serão impressos juntos na impressora selecionada.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200 block">
                Selecione a Impressora da Mesa *
              </label>
              {printers.length === 0 ? (
                <p className="text-xs text-amber-400">Nenhuma impressora cadastrada ou ativa.</p>
              ) : (
                <select
                  value={selectedPrinterForBatch}
                  onChange={(e) => setSelectedPrinterForBatch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                >
                  <option value="">Selecione uma impressora...</option>
                  {printers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.brand} {p.model}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200 block">
                Resina da Impressão *
              </label>
              {!selectedPrinterForBatch ? (
                <p className="text-xs text-slate-500">Escolha primeiro a impressora.</p>
              ) : isLoadingResins ? (
                <p className="text-xs text-slate-400">Buscando resinas calibradas...</p>
              ) : eligibleResins.length === 0 ? (
                <p className="text-xs text-amber-400">
                  Nenhuma resina calibrada para esta impressora. Calibre um lote antes para registrar o lote correto na ordem.
                </p>
              ) : (
                <select
                  value={selectedResinBatchId}
                  onChange={(e) => setSelectedResinBatchId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                >
                  {eligibleResins.map((r) => (
                    <option key={`${r.resin_batch_id}-${r.calibration_id}`} value={r.calibration_id}>
                      {r.brand} ({r.resin_type}) — Lote {r.lot} · cal #{r.calibration_number} ({r.layer_height}mm/{r.exposure_time}s)
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setBatchToPrintDirectly(null)}
                  className="border-slate-700 text-slate-300 rounded-full text-xs h-9"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleDirectBatchPrint}
                  disabled={!selectedPrinterForBatch || isStartingBatchPrint}
                  className="bg-white hover:bg-slate-200 text-slate-950 font-bold rounded-full text-xs h-9 px-5 gap-1.5 shadow"
                >
                  {isStartingBatchPrint ? "Iniciando..." : "Iniciar Impressão"}
                </Button>
              </div>
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

        {/* ==================================================================== */}
        {/* MODAL: CARREGAR MESA NA IMPRESSORA (PAINEL DE BANCADA) */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(printerToAssignBatch)}
          onOpenChange={(open) => {
            if (!open) {
              setPrinterToAssignBatch(null);
              setSelectedBatchForFreePrinter("");
            }
          }}
          title={`Carregar Mesa na ${printerToAssignBatch?.name || "Impressora"}`}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Selecione qual mesa de modelos da fila você deseja colocar em impressão nesta máquina:
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200 block">
                Mesas aguardando impressão:
              </label>
              {orderGroups.filter((g) => g.batchId && ["AGUARDANDO", "PREPARANDO", "ERRO"].includes(g.derived)).length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <p className="text-xs text-slate-400">
                    Não há mesas aguardando na fila. Crie uma nova mesa soltando arquivos STL no topo.
                  </p>
                </div>
              ) : (
                <select
                  value={selectedBatchForFreePrinter}
                  onChange={(e) => setSelectedBatchForFreePrinter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                >
                  <option value="">Selecione uma mesa da fila...</option>
                  {orderGroups
                    .filter((g) => g.batchId && ["AGUARDANDO", "PREPARANDO", "ERRO"].includes(g.derived))
                    .map((g) => (
                      <option key={g.key} value={g.batchId!}>
                        {g.title} ({g.items.length} modelos) — {formatDate(g.createdAt)}
                      </option>
                    ))}
                </select>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => {
                  setPrinterToAssignBatch(null);
                  setSelectedBatchForFreePrinter("");
                }}
                className="border-slate-700 text-slate-300 rounded-lg text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                disabled={!selectedBatchForFreePrinter || isAssigningBatch}
                onClick={handleAssignBatchToFreePrinter}
                className="bg-white hover:bg-slate-200 text-slate-950 font-bold rounded-lg text-xs h-9 px-5 gap-1.5 shadow"
              >
                {isAssigningBatch ? "Iniciando..." : "Iniciar Impressão Nesta Máquina"}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL: FALHA DA MESA INTEIRA (PAINEL DE BANCADA) */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(batchToFailWhole)}
          onOpenChange={(open) => {
            if (!open) {
              setBatchToFailWhole(null);
              setFailReasonWhole("");
            }
          }}
          title="Marcar Mesa Inteira como Falha?"
        >
          <div className="space-y-4">
            <div className="bg-rose-950/40 border border-rose-900/60 rounded-xl p-3 text-xs text-rose-200 space-y-1.5">
              <p>
                Você está marcando a <strong>{batchToFailWhole?.title}</strong> inteira como falha técnica.
              </p>
              <p className="text-rose-300 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                Todos os {batchToFailWhole?.items.length} modelos voltarão para a Fila como PRIORIDADE URGENTE para a próxima mesa!
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Motivo da falha da mesa:
              </label>
              <input
                type="text"
                value={failReasonWhole}
                onChange={(e) => setFailReasonWhole(e.target.value)}
                placeholder="Ex: Mesa descolou no meio da impressão / falta de resina"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => {
                  setBatchToFailWhole(null);
                  setFailReasonWhole("");
                }}
                className="border-slate-700 text-slate-300 rounded-lg text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                disabled={isFailingBatch}
                onClick={handleConfirmFailWholeBatch}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs h-9 px-5 gap-1.5 shadow"
              >
                {isFailingBatch ? "Marcando..." : "Confirmar Falha da Mesa"}
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </AppShell>
  );
}
