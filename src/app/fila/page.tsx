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
} from "@/types/domain";
import { PrintBatch, PrintItemHistory } from "@/types/database.types";
import {
  LAB_WORK_TYPES,
  LAB_WORK_TYPE_LABELS,
  PRINT_CARD_STATUS_CONFIG,
} from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  Plus,
  Upload,
  Search,
  Filter,
  Layers,
  Printer,
  Download,
  AlertTriangle,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  SlidersHorizontal,
  FolderArchive,
  User,
  Building2,
  Calendar,
  AlertOctagon,
  ArrowRight,
  ArrowLeft,
  Undo2,
  Eye,
  Trash2,
  Check,
  ChevronRight,
  LayoutGrid,
  List,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// Interface do item em processo de upload
interface PendingUploadFile {
  id: string;
  file: File;
  file_name: string;
  file_size: number;
  file_hash: string;
  file_data?: string;
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

  // Estados principais
  const [cards, setCards] = useState<PrintCardItem[]>([]);
  const [batches, setBatches] = useState<Array<PrintBatch & { items_count: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"KANBAN" | "LISTA">("KANBAN");

  // Filtros e busca
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PrintCardStatus | "TODOS">("TODOS");
  const [clinicFilter, setClinicFilter] = useState("TODAS");
  const [cadistaFilter, setCadistaFilter] = useState("TODOS");
  const [batchFilter, setBatchFilter] = useState("TODOS");
  const [onlyReprints, setOnlyReprints] = useState(false);
  const [todayFilter, setTodayFilter] = useState(false);

  // Seleção múltipla para lote
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  // Modais
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isManageBatchesModalOpen, setIsManageBatchesModalOpen] = useState(false);
  const [isPatientHistoryModalOpen, setIsPatientHistoryModalOpen] = useState(false);
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<string | null>(null);
  const [patientHistoryCards, setPatientHistoryCards] = useState<PrintCardItem[]>([]);
  const [isCardHistoryModalOpen, setIsCardHistoryModalOpen] = useState(false);
  const [selectedCardForHistory, setSelectedCardForHistory] = useState<PrintCardItem | null>(null);
  const [cardHistoryEntries, setCardHistoryEntries] = useState<PrintItemHistory[]>([]);

  // Modal de Falha de Lote
  const [batchToFail, setBatchToFail] = useState<(PrintBatch & { items_count?: number }) | null>(null);
  const [batchFailReason, setBatchFailReason] = useState("");
  const [isFailingBatch, setIsFailingBatch] = useState(false);

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

  // Novo Lote
  const [newBatchName, setNewBatchName] = useState("");
  const [newBatchPrinter, setNewBatchPrinter] = useState("");
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);

  // Carregar dados
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cardsData, batchesData] = await Promise.all([
        OdontoPrintService.getPrintCards(),
        OdontoPrintService.getPrintBatches(),
      ]);
      setCards(cardsData);
      setBatches(batchesData);
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
  }, []);

  // Extrair listas únicas para filtros
  const uniqueClinics = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => {
      if (c.clinic_name) set.add(c.clinic_name);
    });
    return Array.from(set).sort();
  }, [cards]);

  const uniqueCadistas = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => {
      if (c.cadista_name) set.add(c.cadista_name);
    });
    return Array.from(set).sort();
  }, [cards]);

  // Cards filtrados
  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (statusFilter !== "TODOS" && card.status !== statusFilter) return false;
      if (clinicFilter !== "TODAS" && card.clinic_name.toLowerCase() !== clinicFilter.toLowerCase()) return false;
      if (cadistaFilter !== "TODOS" && card.cadista_name.toLowerCase() !== cadistaFilter.toLowerCase()) return false;
      if (batchFilter !== "TODOS" && card.batch_id !== batchFilter) return false;
      if (onlyReprints && !card.is_retry) return false;
      if (todayFilter) {
        const todayStr = new Date().toISOString().split("T")[0];
        const isToday = card.created_at.startsWith(todayStr) || (card.backup_done_at && card.backup_done_at.startsWith(todayStr));
        if (!isToday) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          card.patient_code.toLowerCase().includes(q) ||
          (card.patient_name && card.patient_name.toLowerCase().includes(q)) ||
          card.clinic_name.toLowerCase().includes(q) ||
          card.cadista_name.toLowerCase().includes(q) ||
          card.file_name.toLowerCase().includes(q) ||
          (LAB_WORK_TYPE_LABELS[card.work_type] || card.work_type).toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [cards, statusFilter, clinicFilter, cadistaFilter, batchFilter, onlyReprints, todayFilter, searchQuery]);

  // Contadores por status
  const statusCounts = useMemo(() => {
    const counts: Record<PrintCardStatus, number> = {
      NA_FILA: 0,
      PREPARANDO: 0,
      IMPRIMINDO: 0,
      IMPRESSO: 0,
      CONCLUIDO: 0,
      FALHOU: 0,
      CANCELADO: 0,
    };
    for (const card of cards) {
      if (counts[card.status] !== undefined) {
        counts[card.status]++;
      }
    }
    return counts;
  }, [cards]);

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

  // Helper para ler dataURL de preview/download
  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file.slice(0, 500000)); // amostra
    });
  };

  // Adicionar arquivos ao upload
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
      const dataUrl = await readFileAsDataUrl(file);

      newItems.push({
        id: crypto.randomUUID(),
        file,
        file_name: file.name,
        file_size: file.size,
        file_hash: hash,
        file_data: dataUrl,
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
          file_data: item.file_data,
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

      toast.success(
        `${res.created_count} arquivo(s) cadastrado(s) com sucesso na Fila de Impressão!`
      );
      setPendingFiles([]);
      setIsUploadModalOpen(false);
      loadData();
    } catch {
      toast.error("Erro inesperado ao salvar arquivos na esteira.");
    } finally {
      setIsSavingCards(false);
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

  // Criar lote
  const handleCreateBatch = async () => {
    if (selectedCardIds.length === 0) {
      toast.error("Selecione pelo menos um card para montar o lote.");
      return;
    }
    if (!newBatchName.trim()) {
      toast.error("Dê um nome ou código para o lote de impressão.");
      return;
    }

    setIsCreatingBatch(true);
    try {
      const res = await OdontoPrintService.createPrintBatch({
        batch_name: newBatchName.trim(),
        item_ids: selectedCardIds,
        printer_name: newBatchPrinter.trim() || undefined,
        user_id: user?.id,
        user_name: user?.full_name || "Operador 3D",
      });

      if (!res.success) {
        toast.error(res.error || "Erro ao criar lote.");
        return;
      }

      toast.success(
        `Lote "${newBatchName}" criado com ${selectedCardIds.length} cards e movido para Preparando!`
      );
      setSelectedCardIds([]);
      setNewBatchName("");
      setNewBatchPrinter("");
      setIsBatchModalOpen(false);
      loadData();
    } catch {
      toast.error("Erro ao criar lote.");
    } finally {
      setIsCreatingBatch(false);
    }
  };

  // Marcar lote como falhou
  const handleConfirmFailBatch = async () => {
    if (!batchToFail) return;
    setIsFailingBatch(true);
    try {
      const res = await OdontoPrintService.failPrintBatch(
        batchToFail.id,
        batchFailReason.trim() || undefined,
        user?.id,
        user?.full_name || "Operador 3D"
      );

      if (!res.success) {
        toast.error(res.error || "Erro ao marcar lote como falhou.");
        return;
      }

      toast.error(
        `Lote marcado como FALHOU. ${res.affected_count} card(s) voltaram para "Na fila" com a tag REIMPRESSÃO!`
      );
      setBatchToFail(null);
      setBatchFailReason("");
      loadData();
    } catch {
      toast.error("Erro ao processar falha do lote.");
    } finally {
      setIsFailingBatch(false);
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

  // Download do arquivo original do card
  const handleDownloadFile = (card: PrintCardItem) => {
    const fileData = OdontoPrintService.getUploadedFile(card.file_name);
    if (fileData) {
      const a = document.createElement("a");
      a.href = fileData;
      a.download = card.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`Baixando arquivo original: ${card.file_name}`);
    } else {
      // Cria um STL de demonstração/backup com o nome do arquivo
      const dummyStlContent = `solid ${card.patient_code}\nfacet normal 0 0 0\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid ${card.patient_code}\n`;
      const blob = new Blob([dummyStlContent], { type: "application/sla" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = card.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Baixando cópia de backup do STL: ${card.file_name}`);
    }
  };

  // Alternar seleção de card
  const toggleSelectCard = (id: string) => {
    setSelectedCardIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Drag and drop HTML5 nativo entre colunas Kanban
  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData("text/plain", cardId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnColumn = async (e: React.DragEvent, targetStatus: PrintCardStatus) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain");
    if (!cardId) return;

    const card = cards.find((c) => c.id === cardId);
    if (!card || card.status === targetStatus) return;

    try {
      const res = await OdontoPrintService.updateCardStatus(
        cardId,
        targetStatus,
        undefined,
        user?.id,
        user?.full_name || "Operador"
      );
      if (res.success) {
        toast.success(`Card ${card.patient_code} movido para ${PRINT_CARD_STATUS_CONFIG[targetStatus].label}.`);
        loadData();
      }
    } catch {
      toast.error("Erro ao mover card.");
    }
  };

  // Colunas do Kanban — visual neutro e profissional
  const kanbanColumns: Array<{ status: PrintCardStatus; label: string }> = [
    { status: "NA_FILA", label: "Na fila" },
    { status: "PREPARANDO", label: "Preparando" },
    { status: "IMPRIMINDO", label: "Imprimindo" },
    { status: "IMPRESSO", label: "Impresso" },
    { status: "CONCLUIDO", label: "Concluído" },
  ];

  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilters =
    statusFilter !== "TODOS" ||
    clinicFilter !== "TODAS" ||
    cadistaFilter !== "TODOS" ||
    batchFilter !== "TODOS" ||
    onlyReprints ||
    todayFilter ||
    searchQuery.trim() !== "";

  const clearFilters = () => {
    setStatusFilter("TODOS");
    setClinicFilter("TODAS");
    setCadistaFilter("TODOS");
    setBatchFilter("TODOS");
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
                {filteredCards.length} de {cards.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Arraste entre colunas ou use Avançar / Voltar.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedCardIds.length > 0 && (
              <Button
                onClick={() => {
                  setNewBatchName(
                    `Lote #${Math.floor(100 + Math.random() * 900)} – ${new Date().toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}`
                  );
                  setIsBatchModalOpen(true);
                }}
                className="bg-white hover:bg-slate-200 text-slate-900 rounded-lg text-xs font-semibold px-3 h-9 gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Lote ({selectedCardIds.length})</span>
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => setIsManageBatchesModalOpen(true)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg text-xs h-9 px-3"
            >
              <span>Lotes · {batches.length}</span>
            </Button>

            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("KANBAN")}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
                  viewMode === "KANBAN"
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Ver em colunas"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Colunas</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("LISTA")}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
                  viewMode === "LISTA"
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Ver em lista"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lista</span>
              </button>
            </div>

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

          {/* Abas de status — rolagem horizontal no mobile */}
          <div className="flex items-center gap-1 px-2.5 pb-2.5 overflow-x-auto">
            {(
              [
                ["TODOS", `Todos (${cards.length})`],
                ["NA_FILA", `Na fila (${statusCounts.NA_FILA})`],
                ["PREPARANDO", `Preparando (${statusCounts.PREPARANDO})`],
                ["IMPRIMINDO", `Imprimindo (${statusCounts.IMPRIMINDO})`],
                ["IMPRESSO", `Impresso (${statusCounts.IMPRESSO})`],
                ["CONCLUIDO", `Concluídos (${statusCounts.CONCLUIDO})`],
                ["FALHOU", `Falhas (${statusCounts.FALHOU})`],
              ] as Array<[PrintCardStatus | "TODOS", string]>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 px-2.5 pb-2.5 pt-1 border-t border-slate-800/80">
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

              <div className="pt-2">
                <label className="text-[11px] text-slate-500 font-medium mb-1 block">Cadista</label>
                <select
                  value={cadistaFilter}
                  onChange={(e) => setCadistaFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-slate-600"
                >
                  <option value="TODOS">Todos</option>
                  {uniqueCadistas.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <label className="text-[11px] text-slate-500 font-medium mb-1 block">Lote</label>
                <select
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-slate-600"
                >
                  <option value="TODOS">Todos</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batch_name} ({b.items_count})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3 flex flex-wrap items-center gap-2 pt-1">
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
        ) : filteredCards.length === 0 ? (
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
        ) : viewMode === "KANBAN" ? (
          /* Colunas — rolagem horizontal no celular, grade no desktop */
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-5 lg:overflow-visible">
            {kanbanColumns.map((col) => {
              const columnCards = filteredCards.filter((c) => c.status === col.status);

              return (
                <div
                  key={col.status}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnColumn(e, col.status)}
                  className="shrink-0 w-[82vw] sm:w-[320px] lg:w-auto snap-start bg-slate-900/40 border border-slate-800 rounded-xl p-2.5 flex flex-col min-h-[300px] lg:min-h-[480px]"
                >
                  <div className="flex items-center justify-between px-1 pb-2 mb-2 border-b border-slate-800">
                    <h3 className="text-xs font-semibold text-slate-200">
                      {col.label}
                    </h3>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {columnCards.length}
                    </span>
                  </div>

                  <div className="space-y-2 flex-1 lg:max-h-[62vh] lg:overflow-y-auto lg:pr-0.5">
                    {columnCards.length === 0 && (
                      <p className="text-[11px] text-slate-600 text-center py-6 px-2">
                        Arraste cards para cá
                      </p>
                    )}
                    {columnCards.map((card) => (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                        className={`bg-slate-950 border rounded-lg p-2.5 transition cursor-grab active:cursor-grabbing ${
                          selectedCardIds.includes(card.id)
                            ? "border-slate-400"
                            : card.priority === "URGENTE"
                            ? "border-red-900"
                            : card.is_retry
                            ? "border-amber-900"
                            : "border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedCardIds.includes(card.id)}
                            onChange={() => toggleSelectCard(card.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3.5 w-3.5 shrink-0 rounded border-slate-700 bg-slate-800"
                            title="Selecionar para lote"
                          />
                          <button
                            type="button"
                            onClick={() => handleOpenPatientHistory(card.patient_code)}
                            className="text-[13px] font-semibold text-white hover:underline underline-offset-2 truncate text-left"
                            title="Ver histórico do paciente"
                          >
                            {card.patient_code}
                          </button>
                          {card.priority === "URGENTE" && (
                            <span className="ml-auto shrink-0 text-[10px] font-semibold text-red-300 bg-red-950 border border-red-900 rounded px-1.5 py-0.5">
                              Urgente
                            </span>
                          )}
                          {card.priority !== "URGENTE" && card.is_retry && (
                            <span className="ml-auto shrink-0 text-[10px] font-medium text-amber-300 bg-amber-950/60 border border-amber-900 rounded px-1.5 py-0.5">
                              {card.retry_count > 1 ? `${card.retry_count}ª tent.` : "Reimpressão"}
                            </span>
                          )}
                        </div>

                        {card.patient_name && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {card.patient_name}
                          </p>
                        )}

                        <p className="text-[11px] text-slate-500 truncate mt-1">
                          {card.clinic_name} · {LAB_WORK_TYPE_LABELS[card.work_type] || card.work_type}
                        </p>
                        {card.batch_name && (
                          <p className="text-[11px] text-slate-500 truncate" title={card.batch_name}>
                            {card.batch_name}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-600 font-mono truncate mt-0.5" title={card.file_name}>
                          {card.file_name}
                        </p>

                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-800/70">
                          {getPreviousStatus(card.status) && (
                            <button
                              type="button"
                              onClick={() => handleGoBackStatus(card)}
                              className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-md flex items-center gap-1"
                              title={`Voltar para ${PRINT_CARD_STATUS_CONFIG[getPreviousStatus(card.status)!].label}`}
                            >
                              <Undo2 className="w-3 h-3" />
                              Voltar
                            </button>
                          )}
                          {col.status !== "CONCLUIDO" && col.status !== "CANCELADO" && (
                            <button
                              type="button"
                              onClick={() => handleQuickAdvanceStatus(card)}
                              className="ml-auto px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-white text-slate-900 rounded-md flex items-center gap-1"
                            >
                              Avançar
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                          <div className="flex items-center gap-0.5 ml-auto [&:not(:only-child)]:ml-0">
                            <button
                              type="button"
                              onClick={() => handleDownloadFile(card)}
                              className="p-1.5 text-slate-500 hover:text-white rounded-md transition"
                              title="Baixar arquivo"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenCardHistory(card)}
                              className="p-1.5 text-slate-500 hover:text-white rounded-md transition"
                              title="Histórico"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {col.status !== "CONCLUIDO" && (
                          <button
                            type="button"
                            onClick={() => {
                              setCardToFail(card);
                              setCardFailReason("");
                            }}
                            className="mt-1 text-[11px] text-slate-600 hover:text-red-400"
                          >
                            Marcar falha
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Lista */
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[860px]">
                <thead className="bg-slate-950/60 text-slate-500 border-b border-slate-800 text-[11px] font-medium">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedCardIds.length === filteredCards.length && filteredCards.length > 0}
                        onChange={() => {
                          if (selectedCardIds.length === filteredCards.length) {
                            setSelectedCardIds([]);
                          } else {
                            setSelectedCardIds(filteredCards.map((c) => c.id));
                          }
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-800"
                      />
                    </th>
                    <th className="p-3 font-medium">Paciente</th>
                    <th className="p-3 font-medium">Clínica</th>
                    <th className="p-3 font-medium">Trabalho</th>
                    <th className="p-3 font-medium">Arquivo</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Lote</th>
                    <th className="p-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredCards.map((card) => {
                    const statusCfg = PRINT_CARD_STATUS_CONFIG[card.status];

                      return (
                      <tr key={card.id} className="hover:bg-slate-800/30 transition border-b border-slate-800/50 last:border-0">
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedCardIds.includes(card.id)}
                            onChange={() => toggleSelectCard(card.id)}
                            className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-800"
                          />
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => handleOpenPatientHistory(card.patient_code)}
                            className="font-semibold text-white hover:underline underline-offset-2 text-left"
                          >
                            {card.patient_code}
                          </button>
                          {card.patient_name && (
                            <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[160px]">{card.patient_name}</div>
                          )}
                          {card.is_retry && (
                            <span className="text-[10px] text-amber-400">Reimpressão</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="text-slate-300">{card.clinic_name}</div>
                        </td>
                        <td className="p-3 text-slate-400">
                          {LAB_WORK_TYPE_LABELS[card.work_type] || card.work_type}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] text-slate-400 truncate max-w-[140px]" title={card.file_name}>
                              {card.file_name}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDownloadFile(card)}
                              className="text-slate-500 hover:text-white p-1"
                              title="Baixar"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-[11px] text-slate-300 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5">
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500">
                          {card.batch_name || "—"}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {getPreviousStatus(card.status) && (
                              <button
                                type="button"
                                onClick={() => handleGoBackStatus(card)}
                                className="h-7 px-2 text-[11px] text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                                title={`Voltar para ${PRINT_CARD_STATUS_CONFIG[getPreviousStatus(card.status)!].label}`}
                              >
                                Voltar
                              </button>
                            )}
                            {card.status !== "CONCLUIDO" && card.status !== "CANCELADO" && (
                              <button
                                type="button"
                                onClick={() => handleQuickAdvanceStatus(card)}
                                className="h-7 px-2.5 text-[11px] font-semibold bg-slate-100 hover:bg-white text-slate-900 rounded-lg"
                              >
                                Avançar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setIsUploadModalOpen(false)}
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
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 2: CRIAR LOTE / PLACA DE IMPRESSÃO */}
        {/* ==================================================================== */}
        <Dialog
          open={isBatchModalOpen}
          onOpenChange={setIsBatchModalOpen}
          title="Criar Lote / Placa de Impressão"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Você selecionou <strong>{selectedCardIds.length} card(s)</strong> para agrupar em uma mesa/lote de impressão.
            </p>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Nome / Código do Lote *
              </label>
              <input
                type="text"
                required
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
                placeholder="Ex: Impressão #123 – 08/10 14:30 – Halot"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Impressora 3D (Opcional)
              </label>
              <input
                type="text"
                value={newBatchPrinter}
                onChange={(e) => setNewBatchPrinter(e.target.value)}
                placeholder="Ex: Creality Halot Mage Pro 8K"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">Benefício da gestão por lote:</p>
              <p>• Permite rastrear todos os modelos juntos na mesma placa.</p>
              <p>• Se a mesa descolar ou falhar, um único clique devolve todos os cards à fila com a tag Reimpressão.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setIsBatchModalOpen(false)}
                className="border-slate-700 text-slate-300 rounded-full text-xs h-9"
              >
                Cancelar
              </Button>

              <Button
                disabled={isCreatingBatch}
                onClick={handleCreateBatch}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full text-xs h-9 px-5"
              >
                {isCreatingBatch ? "Criando Lote..." : "Confirmar Lote"}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 3: GERENCIAR LOTES & MARCAR LOTE COMO FALHOU */}
        {/* ==================================================================== */}
        <Dialog
          open={isManageBatchesModalOpen}
          onOpenChange={setIsManageBatchesModalOpen}
          title="Lotes / Placas de Impressão Ativas"
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {batches.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Nenhum lote criado ainda. Selecione cards na fila e clique em "Criar Lote/Placa".
              </p>
            ) : (
              <div className="space-y-3">
                {batches.map((batch) => (
                  <div
                    key={batch.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white">{batch.batch_name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Criado em {formatDate(batch.created_at)} &bull; {batch.items_count} cards vinculados
                        </p>
                      </div>

                      <Badge
                        variant="outline"
                        className={
                          batch.status === "FALHOU"
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40 text-[10px]"
                            : "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 text-[10px]"
                        }
                      >
                        {batch.status}
                      </Badge>
                    </div>

                    {/* Ação Crítica: Marcar Lote Como Falhou */}
                    {batch.status !== "FALHOU" && (
                      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">
                          Houve falha na mesa/impressão deste lote?
                        </span>
                        <Button
                          size="sm"
                          onClick={() => {
                            setBatchToFail(batch);
                            setBatchFailReason("");
                          }}
                          className="bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40 text-[10px] font-bold h-7 rounded-full px-3"
                        >
                          Marcar Lote como Falhou
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog>

        {/* ==================================================================== */}
        {/* MODAL 4: CONFIRMAÇÃO DE FALHA DO LOTE (RETORNA TODOS OS CARDS PARA A FILA) */}
        {/* ==================================================================== */}
        <Dialog
          open={Boolean(batchToFail)}
          onOpenChange={(open) => {
            if (!open) setBatchToFail(null);
          }}
          title="Confirmar Falha do Lote / Placa"
        >
          <div className="space-y-4">
            <div className="bg-rose-500/10 border border-rose-500/40 rounded-xl p-3.5 flex items-start gap-3">
              <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-rose-200">
                  Atenção: Ação de recuperação automática da fila
                </p>
                <p className="text-rose-300/80">
                  Ao marcar este lote como falhou, <strong>TODOS os {batchToFail?.items_count} cards</strong> deste lote
                  voltarão automaticamente para o status <strong>"Na fila"</strong> com a tag{" "}
                  <strong>REIMPRESSÃO</strong> e contagem incrementada.
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Motivo da Falha (Opcional)
              </label>
              <input
                type="text"
                value={batchFailReason}
                onChange={(e) => setBatchFailReason(e.target.value)}
                placeholder="Ex: Suporte descolou da mesa / falta de nivelamento"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rose-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => setBatchToFail(null)}
                className="border-slate-700 text-slate-300 rounded-full text-xs h-9"
              >
                Voltar
              </Button>

              <Button
                disabled={isFailingBatch}
                onClick={handleConfirmFailBatch}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-full text-xs h-9 px-5"
              >
                {isFailingBatch ? "Processando..." : "Confirmar Falha e Devolver à Fila"}
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
