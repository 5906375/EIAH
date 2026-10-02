import {
  ApiError,
  apiArchiveImobOwner,
  apiArchiveImobProperty,
  apiCloseImobRentalLease,
  apiCreateImobCase,
  apiCreateImobOwner,
  apiCreateImobProperty,
  apiCreateImobRentalLease,
  apiGenerateImobRentalContract,
  apiGenerateImobSaleContract,
  apiGetImobActiveRentalLease,
  apiGetImobRentalContractPrefill,
  apiGetImobRentalHistory,
  apiGetImobSaleContractPrefill,
  apiLinkImobDocuments,
  apiListImobOwners,
  apiListImobProperties,
  apiUpdateImobOwner,
  apiUpdateImobProperty,
  apiUpdateImobRentalLease,
  apiUploadDocuments,
} from "@/lib/api";
import type { ImobActionMenuItem } from "@/features/imob/imobActionMenus";
import {
  INLINE_DOCUMENT_CATEGORY_FIELD,
  buildDocumentAttachConfirmationText,
  buildDocumentAttachForm,
  buildDocumentLinkRequest,
  buildInlineDocumentsNote,
  describeDocumentAttachError,
  inlineDocumentSubjectFor,
  isDocumentAttachForm,
  validateDocumentAttachValues,
  validateInlineDocuments,
  withInlineDocumentFields,
  type DocumentAttachSubject,
} from "@/pages/app/imob/documentAttachForm";
import {
  buildOwnerCreateConfirmationText,
  buildOwnerCreateRequest,
  findOwnerDuplicate,
  isOwnerCreateForm,
} from "@/pages/app/imob/ownerCreateForm";
import {
  buildOwnerEditForm,
  buildOwnerPropertiesSummary,
  buildOwnerUpdateConfirmationText,
  buildOwnerUpdateRequest,
  isOwnerEditForm,
  ownerToEditValues,
} from "@/pages/app/imob/ownerEditForm";
import {
  OCCUPANCY_LABELS,
  buildPropertyCreateConfirmationText,
  buildPropertyCreateRequest,
  findDuplicateProperty,
  isPropertyCreateForm,
} from "@/pages/app/imob/propertyCreateForm";
import {
  buildPropertyEditForm,
  buildPropertyUpdateRequest,
  isPropertyEditForm,
  propertyToEditValues,
} from "@/pages/app/imob/propertyEditForm";
import {
  buildContractPdfFile,
  buildRentalContractConfirmationText,
  buildRentalContractForm,
  buildRentalContractRequest,
  describeRentalContractError,
  isRentalContractForm,
  rentalContractPrefillToValues,
} from "@/pages/app/imob/rentalContractForm";
import {
  buildImobPropertyOptions,
  buildRentalLeaseConfirmationText,
  buildRentalLeaseRequest,
  isRentalLeaseForm,
} from "@/pages/app/imob/rentalLeaseForm";
import {
  activeLeaseToFormValues,
  buildRentalCloseConfirmationText,
  buildRentalCloseForm,
  buildRentalCloseRequest,
  buildRentalEditConfirmationText,
  buildRentalEditForm,
  buildRentalEditRequest,
  buildRentalHistoryForm,
  buildRentalHistoryLines,
  buildRentalHistoryText,
  describeRentalLifecycleError,
  isRentalCloseForm,
  isRentalEditForm,
  isRentalHistoryForm,
} from "@/pages/app/imob/rentalLifecycleForms";
import {
  buildSaleContractConfirmationText,
  buildSaleContractForm,
  buildSaleContractRequest,
  describeSaleContractError,
  isSaleContractForm,
  saleContractPrefillToValues,
} from "@/pages/app/imob/saleContractForm";
import {
  buildTokenizationForm,
  buildTokenizationInterestConfirmationText,
  buildTokenizationInterestRequest,
  isTokenizationForm,
  type TokenizationSubject,
} from "@/pages/app/imob/tokenizationForm";
import type { ImobFormState } from "./useImobFormState";
import { formatUploadSize, makeStructuredId, type ImobStructuredFormsHost, type StructuredMessage } from "./types";

/**
 * Abrir, pré-preencher e salvar os formulários estruturados do IMOB
 * (cadastros, edição, documentos, contratos, ciclo da locação, tokenização).
 * Cada envio vai direto para a API do IMOB, sem execução de agente e sem
 * virar texto de conversa; a conversa recebe só a confirmação.
 *
 * Funciona em qualquer chat que implemente `ImobStructuredFormsHost`.
 */
export function createImobStructuredForms(state: ImobFormState, host: ImobStructuredFormsHost) {
  const {
    setFormValuesByMessageId,
    setFormErrorsByMessageId,
    imobPropertyOptions,
    imobOwnerOptions,
    formSubmittingRef,
    ownerNameConfirmedRef,
    ownerRecordsRef,
    ownerArchiveConfirmedRef,
    formFilesRef,
    pendingFormPrefillRef,
    contractAfterLeaseRef,
    propertyRecordsRef,
    resolveFormValuesForMessage,
  } = state;
  const appendMessage = host.appendMessage;
  const updateMessageById = host.updateMessage;
  const persistMessage = host.persistMessage;
  const sendMessageText = (text: string, options: { displayText: string }) => host.sendText(text, options);
  const clearThreadOperationalState = (message: StructuredMessage) => host.onFormClosed?.(message);

  async function handleRentalLeaseFormAction(message: StructuredMessage, actionId: "cancel" | "submit") {
    if (actionId === "cancel") {
      updateMessageById(message.id, { form: undefined });
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
      clearThreadOperationalState(message);
      appendMessage({
        id: makeStructuredId("assistant"),
        role: "assistant",
        text: "Cadastro de locação cancelado. Nada foi gravado.",
        thread: message.thread,
      });
      return;
    }

    if (formSubmittingRef.current.has(message.id)) return;
    const leaseValues = resolveFormValuesForMessage(message);
    const built = buildRentalLeaseRequest(leaseValues);
    if (!built.ok) {
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: built.errors }));
      return;
    }
    if (!checkInlineDocuments(message, leaseValues)) return;

    formSubmittingRef.current.add(message.id);
    setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
    try {
      const response = await apiCreateImobRentalLease(built.request);
      updateMessageById(message.id, { form: undefined });
      clearThreadOperationalState(message);
      const leasePropertyId = response.data.propertyId;
      const documentsNote = await attachInlineDocuments(message, leaseValues, leasePropertyId);
      const openContractNow = contractAfterLeaseRef.current === leasePropertyId;
      contractAfterLeaseRef.current = null;
      const confirmation: StructuredMessage = {
        id: makeStructuredId("assistant"),
        role: "assistant",
        text: [buildRentalLeaseConfirmationText(response.data), documentsNote].filter(Boolean).join(" "),
        thread: message.thread,
        ...(openContractNow
          ? {}
          : { quickReplies: [{ id: "next-contract", label: "Gerar contrato desta locação", onSelect: () => openRentalContractForm(leasePropertyId) }] }),
      };
      appendMessage(confirmation);
      void persistMessage(confirmation, { intent: "rental.lease.registered", action: "imob.rentals.create" });
      if (openContractNow) openRentalContractForm(leasePropertyId);
    } catch (error) {
      const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
      const code = body?.error?.code;
      const status = error instanceof ApiError ? error.status : 0;
      const errors: Record<string, string> =
        code === "RENTAL_LEASE_ALREADY_ACTIVE"
          ? { propertyId: "Este imóvel já tem uma locação ativa." }
          : code === "INVALID_TENANT_DOCUMENT"
            ? { tenantDocument: "CPF inválido: confira os dígitos." }
            : code === "PROPERTY_NOT_FOUND"
              ? { propertyId: "Imóvel não encontrado neste workspace. Atualize a lista e tente de novo." }
              : status === 403
                ? { _form: "Sua função atual não pode cadastrar locações neste workspace. Nada foi gravado." }
                : { _form: `Não foi possível salvar a locação agora${status ? ` (HTTP ${status})` : ""}. Nada foi gravado; tente de novo.` };
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: errors }));
    } finally {
      formSubmittingRef.current.delete(message.id);
    }
  }

  async function handlePropertyCreateFormAction(message: StructuredMessage, actionId: "cancel" | "submit") {
    if (actionId === "cancel") {
      updateMessageById(message.id, { form: undefined });
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
      clearThreadOperationalState(message);
      appendMessage({
        id: makeStructuredId("assistant"),
        role: "assistant",
        text: "Cadastro de imóvel cancelado. Nada foi gravado.",
        thread: message.thread,
      });
      return;
    }

    if (formSubmittingRef.current.has(message.id)) return;
    const values = resolveFormValuesForMessage(message);
    const built = buildPropertyCreateRequest(values);
    if (built.ok && !checkInlineDocuments(message, values)) return;
    if (!built.ok) {
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: built.errors }));
      return;
    }

    formSubmittingRef.current.add(message.id);
    setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
    try {
      const existing = await apiListImobProperties();
      const duplicate = findDuplicateProperty(built.request, existing.data.items ?? []);
      if (duplicate) {
        setFormErrorsByMessageId((prev) => ({
          ...prev,
          [message.id]: { address: "Já existe um imóvel com este endereço e esta identificação de unidade." },
        }));
        return;
      }
      const response = await apiCreateImobProperty(built.request);
      updateMessageById(message.id, { form: undefined });
      clearThreadOperationalState(message);
      const created = response.data;
      const documentsNote = await attachInlineDocuments(message, values, created.id);
      const [label] = buildImobPropertyOptions([created]).map((option) => option.label);
      const occupancy = typeof values.occupancy === "string" ? values.occupancy.trim() : "";
      const confirmation: StructuredMessage = {
        id: makeStructuredId("assistant"),
        role: "assistant",
        text: [
          buildPropertyCreateConfirmationText({
            label: label ?? created.id,
            ownerName: created.owner?.name ?? null,
            occupancyLabel: OCCUPANCY_LABELS[occupancy] ?? null,
          }),
          documentsNote,
        ].filter(Boolean).join(" "),
        thread: message.thread,
        // Próximo passo segue a finalidade escolhida no formulário (temporada ainda não tem contrato);
        // com proprietário, dá para seguir cadastrando a carteira dele.
        quickReplies: [
          ...(built.request.goal === "locacao"
            ? [{ id: "next-rental-contract", label: "Gerar contrato de locação", onSelect: () => startRentalContractFor(created.id) }]
            : built.request.goal === "venda"
              ? [{ id: "next-sale-contract", label: "Gerar contrato de venda", onSelect: () => openSaleContractForm(created.id) }]
              : []),
          ...(created.ownerId && created.owner?.name
            ? [{ id: "next-owner-property", label: `Cadastrar outro imóvel de ${created.owner.name}`, onSelect: () => startPropertyCreateFor(created.ownerId as string) }]
            : []),
        ],
      };
      appendMessage(confirmation);
      void persistMessage(confirmation, { intent: "property.registered", action: "imob.properties.create" });
    } catch (error) {
      const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
      const status = error instanceof ApiError ? error.status : 0;
      const errors: Record<string, string> =
        body?.error?.code === "OWNER_NOT_FOUND"
          ? { ownerId: "Proprietário não encontrado neste workspace. Atualize a lista e tente de novo." }
          : status === 400
            ? { _form: "Algum campo foi recusado pelo servidor. Confira os valores e tente de novo. Nada foi gravado." }
            : { _form: `Não foi possível salvar o imóvel agora${status ? ` (HTTP ${status})` : ""}. Nada foi gravado; tente de novo.` };
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: errors }));
    } finally {
      formSubmittingRef.current.delete(message.id);
    }
  }

  async function handleOwnerCreateFormAction(message: StructuredMessage, actionId: "cancel" | "submit") {
    if (actionId === "cancel") {
      updateMessageById(message.id, { form: undefined });
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
      clearThreadOperationalState(message);
      appendMessage({
        id: makeStructuredId("assistant"),
        role: "assistant",
        text: "Cadastro de proprietário cancelado. Nada foi gravado.",
        thread: message.thread,
      });
      return;
    }

    if (formSubmittingRef.current.has(message.id)) return;
    const ownerValues = resolveFormValuesForMessage(message);
    const built = buildOwnerCreateRequest(ownerValues);
    if (built.ok && !checkInlineDocuments(message, ownerValues)) return;
    if (!built.ok) {
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: built.errors }));
      return;
    }

    formSubmittingRef.current.add(message.id);
    setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
    try {
      const existing = await apiListImobOwners();
      const duplicate = findOwnerDuplicate(built.request, existing.data.items ?? []);
      if (duplicate?.kind === "strong") {
        setFormErrorsByMessageId((prev) => ({
          ...prev,
          [message.id]: { _form: `Este proprietário já está cadastrado: ${duplicate.owner.name} (mesmo documento, telefone ou e-mail). Nada foi gravado.` },
        }));
        return;
      }
      if (duplicate?.kind === "name" && ownerNameConfirmedRef.current[message.id] !== built.request.name) {
        ownerNameConfirmedRef.current[message.id] = built.request.name;
        setFormErrorsByMessageId((prev) => ({
          ...prev,
          [message.id]: { ownerName: `Já existe um proprietário chamado ${duplicate.owner.name}. Se for outra pessoa, clique em Salvar de novo para cadastrar.` },
        }));
        return;
      }
      const response = await apiCreateImobOwner(built.request);
      const documentsNote = await attachInlineDocuments(message, ownerValues, response.data.id);
      updateMessageById(message.id, { form: undefined });
      clearThreadOperationalState(message);
      const confirmation: StructuredMessage = {
        id: makeStructuredId("assistant"),
        role: "assistant",
        text: [
          buildOwnerCreateConfirmationText({
            name: response.data.name,
            personType: built.request.personType,
            document: built.request.document,
            pendingItems: built.request.pendingItems,
          }),
          documentsNote,
        ].filter(Boolean).join(" "),
        thread: message.thread,
        quickReplies: [
          { id: "next-property", label: "Cadastrar imóvel deste proprietário", onSelect: () => startPropertyCreateFor(response.data.id) },
        ],
      };
      appendMessage(confirmation);
      void persistMessage(confirmation, { intent: "owner.registered", action: "imob.owners.create" });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      setFormErrorsByMessageId((prev) => ({
        ...prev,
        [message.id]: {
          _form: status === 400
            ? "Algum campo foi recusado pelo servidor. Confira os valores e tente de novo. Nada foi gravado."
            : `Não foi possível salvar o proprietário agora${status ? ` (HTTP ${status})` : ""}. Nada foi gravado; tente de novo.`,
        },
      }));
    } finally {
      formSubmittingRef.current.delete(message.id);
    }
  }

  function openOwnerEditForm(mode: "edit" | "archive" = "edit") {
    const threadId = host.activeThreadId ?? makeStructuredId("thread");
    appendMessage({
      id: makeStructuredId("assistant"),
      role: "assistant",
      text: mode === "archive" ? "Escolha o proprietário que você quer arquivar." : "Escolha o proprietário que você quer corrigir ou arquivar.",
      form: buildOwnerEditForm(mode),
      thread: { id: threadId, label: "Cadastro", status: "active" },
    });
  }

  function openPropertyEditForm(mode: "edit" | "archive" = "edit") {
    const threadId = host.activeThreadId ?? makeStructuredId("thread");
    appendMessage({
      id: makeStructuredId("assistant"),
      role: "assistant",
      text: mode === "archive" ? "Escolha o imóvel que você quer arquivar." : "Escolha o imóvel que você quer corrigir.",
      form: buildPropertyEditForm(mode),
      thread: { id: threadId, label: "Cadastro", status: "active" },
    });
  }

  function handleActionMenuSelect(item: ImobActionMenuItem) {
    if (item.kind === "prompt") {
      void sendMessageText(item.prompt, { displayText: item.label });
      return;
    }
    if (item.form === "owner_edit") openOwnerEditForm("edit");
    else if (item.form === "owner_archive") openOwnerEditForm("archive");
    else if (item.form === "property_edit") openPropertyEditForm("edit");
    else if (item.form === "property_archive") openPropertyEditForm("archive");
    else if (item.form.startsWith("tokenization_")) {
      openTokenizationForm(item.form.slice("tokenization_".length) as TokenizationSubject);
    } else if (item.form.startsWith("documents_")) {
      openDocumentAttachForm(item.form.slice("documents_".length) as DocumentAttachSubject);
    } else if (item.form === "contract_rental") {
      openRentalContractForm();
    } else if (item.form === "contract_sale") {
      openSaleContractForm();
    } else if (item.form === "rental_edit" || item.form === "rental_close" || item.form === "rental_history") {
      openRentalLifecycleForm(item.form);
    }
  }

  /** Arquivos escolhidos no próprio formulário: valida antes de salvar (com arquivo, o tipo é obrigatório). */
  function checkInlineDocuments(message: StructuredMessage, values: Record<string, string>) {
    const errors = validateInlineDocuments(values, (formFilesRef.current[message.id] ?? []).length);
    if (Object.keys(errors).length === 0) return true;
    setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: errors }));
    return false;
  }

  /** Depois de salvar: sobe e vincula os arquivos ao cadastro criado. Nunca desfaz o cadastro. */
  async function attachInlineDocuments(message: StructuredMessage, values: Record<string, string>, subjectId: string) {
    const files = formFilesRef.current[message.id] ?? [];
    delete formFilesRef.current[message.id];
    const subject = inlineDocumentSubjectFor(message.form);
    if (files.length === 0 || !subject) return null;
    try {
      const formData = new FormData();
      for (const file of files) formData.append("files", file);
      const uploaded = await apiUploadDocuments(formData, "imob");
      const linked = await apiLinkImobDocuments({
        subjectType: subject === "owners" ? "owner" : subject === "properties" ? "property" : "rental",
        subjectId,
        category: (values[INLINE_DOCUMENT_CATEGORY_FIELD] ?? "").trim(),
        documentIds: (uploaded.data ?? []).map((item) => item.id),
      });
      return buildInlineDocumentsNote({ linked: linked.data.added.length, contractPendingCleared: linked.data.contractPendingCleared });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      return buildInlineDocumentsNote({
        linked: 0,
        failed: status === 403 ? "sem permissão" : status === 413 ? "arquivo acima de 5 MB" : status === 415 ? "tipo de arquivo não aceito" : `erro ${status || "de rede"}`,
      });
    }
  }

  function openRentalContractForm(propertyId?: string) {
    const threadId = host.activeThreadId ?? makeStructuredId("thread");
    const messageId = makeStructuredId("assistant");
    appendMessage({
      id: messageId,
      role: "assistant",
      text: "Escolha o imóvel da locação: os dados do contrato vêm dos cadastros.",
      form: buildRentalContractForm(),
      thread: { id: threadId, label: "Contrato", status: "active" },
    });
    if (propertyId) void prefillRentalContractForm(messageId, propertyId);
  }

  function openRentalLifecycleForm(kind: "rental_edit" | "rental_close" | "rental_history", propertyId?: string) {
    const threadId = host.activeThreadId ?? makeStructuredId("thread");
    const messageId = makeStructuredId("assistant");
    const form = kind === "rental_edit"
      ? buildRentalEditForm()
      : kind === "rental_close"
        ? withInlineDocumentFields(buildRentalCloseForm())
        : buildRentalHistoryForm();
    if (kind === "rental_close") {
      const now = new Date();
      const today = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
      setFormValuesByMessageId((prev) => ({ ...prev, [messageId]: { endedOn: today, ...(propertyId ? { propertyId } : {}) } }));
    } else if (propertyId) {
      setFormValuesByMessageId((prev) => ({ ...prev, [messageId]: { propertyId } }));
    }
    appendMessage({
      id: messageId,
      role: "assistant",
      text: kind === "rental_edit"
        ? "Escolha o imóvel da locação que você quer corrigir."
        : kind === "rental_close"
          ? "Escolha o imóvel da locação que terminou."
          : "Escolha o imóvel para ver o histórico de locações.",
      form,
      thread: { id: threadId, label: "Locação", status: "active" },
    });
    if (kind === "rental_edit" && propertyId) void prefillRentalEditForm(messageId, propertyId);
  }

  async function prefillRentalEditForm(messageId: string, propertyId: string) {
    if (!propertyId) return;
    try {
      const response = await apiGetImobActiveRentalLease(propertyId);
      setFormValuesByMessageId((prev) => ({ ...prev, [messageId]: { propertyId, ...activeLeaseToFormValues(response.data) } }));
      setFormErrorsByMessageId((prev) => ({ ...prev, [messageId]: {} }));
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
      setFormValuesByMessageId((prev) => ({ ...prev, [messageId]: { propertyId } }));
      setFormErrorsByMessageId((prev) => ({ ...prev, [messageId]: { _form: describeRentalLifecycleError(status, body?.error?.code, "alterar") } }));
    }
  }

  function closeLifecycleForm(message: StructuredMessage, text: string) {
    delete formFilesRef.current[message.id];
    updateMessageById(message.id, { form: undefined });
    setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
    appendMessage({ id: makeStructuredId("assistant"), role: "assistant", text, thread: message.thread });
  }

  async function handleRentalLifecycleFormAction(message: StructuredMessage, actionId: "cancel" | "submit" | "archive") {
    const form = message.form;
    if (actionId !== "submit") {
      closeLifecycleForm(message, isRentalHistoryForm(form) ? "Histórico fechado." : "Nada foi alterado.");
      return;
    }
    if (formSubmittingRef.current.has(message.id)) return;
    const values = resolveFormValuesForMessage(message);
    const propertyId = (values.propertyId ?? "").trim();
    const propertyLabel = (imobPropertyOptions ?? []).find((option) => option.value === propertyId)?.label ?? "o imóvel";
    const fail = (error: unknown, verb: "alterar" | "encerrar" | "consultar") => {
      const status = error instanceof ApiError ? error.status : 0;
      const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: { _form: describeRentalLifecycleError(status, body?.error?.code, verb) } }));
    };

    if (isRentalHistoryForm(form)) {
      if (!propertyId) {
        setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: { propertyId: "Selecione o imóvel." } }));
        return;
      }
      formSubmittingRef.current.add(message.id);
      try {
        const response = await apiGetImobRentalHistory(propertyId);
        const items = response.data.items;
        updateMessageById(message.id, { form: undefined });
        const documentCtas = items.flatMap((item) => item.documents)
          .filter((doc) => doc.url)
          .slice(0, 8)
          .map((doc) => ({ id: `doc-${doc.documentId}`, label: doc.fileName, kind: "neutral" as const, href: doc.url as string }));
        const hasActive = items.some((item) => item.status === "active");
        // Histórico só na tela: nomes de inquilinos não são gravados na conversa.
        appendMessage({
          id: makeStructuredId("assistant"),
          role: "assistant",
          text: buildRentalHistoryText(propertyLabel, items),
          thread: message.thread,
          ...(items.length > 0
            ? { card: { type: "evidence" as const, chip: "Histórico", title: "Locações do imóvel", thread: message.thread, lines: buildRentalHistoryLines(items), ctas: documentCtas } }
            : {}),
          quickReplies: hasActive
            ? [
                { id: "history-edit", label: "Editar locação", onSelect: () => openRentalLifecycleForm("rental_edit", propertyId) },
                { id: "history-close", label: "Encerrar locação", onSelect: () => openRentalLifecycleForm("rental_close", propertyId) },
              ]
            : [{ id: "history-new", label: "Cadastrar nova locação", onSelect: () => startRentalLeaseFor(propertyId) }],
        });
      } catch (error) {
        fail(error, "consultar");
      } finally {
        formSubmittingRef.current.delete(message.id);
      }
      return;
    }

    if (isRentalEditForm(form)) {
      const built = buildRentalEditRequest(values);
      if (!built.ok) {
        setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: built.errors }));
        return;
      }
      formSubmittingRef.current.add(message.id);
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
      try {
        const response = await apiUpdateImobRentalLease(built.request);
        updateMessageById(message.id, { form: undefined });
        const done: StructuredMessage = {
          id: makeStructuredId("assistant"),
          role: "assistant",
          text: buildRentalEditConfirmationText({ propertyLabel, ...response.data }),
          thread: message.thread,
        };
        appendMessage(done);
        if (!response.data.unchanged) void persistMessage(done, { intent: "rental.lease.updated", action: "imob.rentals.update" });
      } catch (error) {
        fail(error, "alterar");
      } finally {
        formSubmittingRef.current.delete(message.id);
      }
      return;
    }

    if (isRentalCloseForm(form)) {
      const now = new Date();
      const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const built = buildRentalCloseRequest(values, todayIso);
      if (!built.ok) {
        setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: built.errors }));
        return;
      }
      if (!checkInlineDocuments(message, values)) return;
      formSubmittingRef.current.add(message.id);
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
      try {
        // A vistoria/termo vai para a locação antes de encerrar (depois ela deixa de ser a ativa).
        const documentsNote = (formFilesRef.current[message.id] ?? []).length > 0
          ? await attachInlineDocuments(message, values, built.request.propertyId)
          : null;
        const response = await apiCloseImobRentalLease(built.request);
        updateMessageById(message.id, { form: undefined });
        const done: StructuredMessage = {
          id: makeStructuredId("assistant"),
          role: "assistant",
          text: buildRentalCloseConfirmationText({ propertyLabel, endedOn: response.data.endedOn, reason: response.data.reason, documentsNote }),
          thread: message.thread,
          quickReplies: [
            { id: "close-new-lease", label: "Cadastrar nova locação", onSelect: () => startRentalLeaseFor(built.request.propertyId) },
            { id: "close-history", label: "Ver histórico", onSelect: () => openRentalLifecycleForm("rental_history", built.request.propertyId) },
          ],
        };
        appendMessage(done);
        void persistMessage(done, { intent: "rental.lease.closed", action: "imob.rentals.close" });
      } catch (error) {
        fail(error, "encerrar");
      } finally {
        formSubmittingRef.current.delete(message.id);
      }
    }
  }

  /** Nova locação para o mesmo imóvel, com o formulário de cadastro que já existe. */
  function startRentalLeaseFor(propertyId: string) {
    pendingFormPrefillRef.current = { submitTarget: "imob.rentals.create", values: { propertyId } };
    void sendMessageText("cadastrar locatário", { displayText: "Cadastrar locação" });
  }

  function openSaleContractForm(propertyId?: string) {
    const threadId = host.activeThreadId ?? makeStructuredId("thread");
    const messageId = makeStructuredId("assistant");
    appendMessage({
      id: messageId,
      role: "assistant",
      text: "Escolha o imóvel: o vendedor e o imóvel vêm dos cadastros.",
      form: buildSaleContractForm(),
      thread: { id: threadId, label: "Contrato", status: "active" },
    });
    if (propertyId) void prefillSaleContractForm(messageId, propertyId);
  }

  async function prefillSaleContractForm(messageId: string, propertyId: string) {
    if (!propertyId) return;
    try {
      const response = await apiGetImobSaleContractPrefill(propertyId);
      setFormValuesByMessageId((prev) => ({
        ...prev,
        [messageId]: { ...(prev[messageId] ?? {}), propertyId, ...saleContractPrefillToValues(response.data) },
      }));
      setFormErrorsByMessageId((prev) => ({
        ...prev,
        [messageId]: (response.data.gaps.length > 0 ? { _form: response.data.gaps.join(" ") } : {}) as Record<string, string>,
      }));
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
      setFormErrorsByMessageId((prev) => ({ ...prev, [messageId]: { _form: describeSaleContractError(status, body?.error?.code) } }));
    }
  }

  async function handleSaleContractFormAction(message: StructuredMessage, actionId: "cancel" | "submit" | "archive") {
    if (actionId !== "submit") {
      updateMessageById(message.id, { form: undefined });
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
      appendMessage({ id: makeStructuredId("assistant"), role: "assistant", text: "Nenhum contrato foi gerado.", thread: message.thread });
      return;
    }
    if (formSubmittingRef.current.has(message.id)) return;
    const values = resolveFormValuesForMessage(message);
    const built = buildSaleContractRequest(values);
    if (!built.ok) {
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: built.errors }));
      return;
    }
    if (!checkInlineDocuments(message, values)) return;
    const propertyLabel = (imobPropertyOptions ?? []).find((option) => option.value === built.request.propertyId)?.label ?? "selecionado";
    formSubmittingRef.current.add(message.id);
    setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
    try {
      const generated = await apiGenerateImobSaleContract(built.request);
      const pdf = await buildContractPdfFile(generated.data.contractText, generated.data.fileName);
      const formData = new FormData();
      formData.append("files", pdf);
      const uploaded = await apiUploadDocuments(formData, "imob");
      const linked = await apiLinkImobDocuments({
        subjectType: "property",
        subjectId: built.request.propertyId,
        category: "minuta_compra_venda",
        documentIds: (uploaded.data ?? []).map((item) => item.id),
      });
      const documentsNote = await attachInlineDocuments(message, values, built.request.propertyId);
      updateMessageById(message.id, { form: undefined });
      const added = linked.data.added;
      // Só o imóvel e o nome do arquivo vão para a conversa; partes e valores ficam no PDF anexado.
      const done: StructuredMessage = {
        id: makeStructuredId("assistant"),
        role: "assistant",
        text: [
          buildSaleContractConfirmationText({ propertyLabel, fileName: generated.data.fileName, writtenBack: generated.data.writtenBack }),
          documentsNote,
        ].filter(Boolean).join(" "),
        thread: message.thread,
        ...(added.length > 0
          ? {
              card: {
                type: "evidence" as const,
                title: "Minuta de compra e venda",
                thread: message.thread,
                lines: added.map((item) => `${item.fileName} | ${formatUploadSize(item.sizeBytes)}`),
                ctas: added.slice(0, 1).map((item) => ({ id: `doc-${item.documentId}`, label: item.fileName, kind: "neutral" as const, href: item.url })),
              },
            }
          : {}),
      };
      appendMessage(done);
      void persistMessage(done, { intent: "contract.sale.draft", action: "imob.contracts.sale" });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: { _form: describeSaleContractError(status, body?.error?.code) } }));
    } finally {
      formSubmittingRef.current.delete(message.id);
    }
  }

  /** Próximo passo com o formulário que já existe, já ligado ao cadastro anterior. */
  function startPropertyCreateFor(ownerId: string) {
    pendingFormPrefillRef.current = { submitTarget: "imob.properties.create", values: { ownerId } };
    void sendMessageText("cadastrar imóvel", { displayText: "Cadastrar imóvel" });
  }

  /** "Gerar contrato de locação" a partir do imóvel: primeiro os dados da locação, depois o contrato abre sozinho. */
  function startRentalContractFor(propertyId: string) {
    pendingFormPrefillRef.current = { submitTarget: "imob.rentals.create", values: { propertyId } };
    contractAfterLeaseRef.current = propertyId;
    void sendMessageText("cadastrar locatário", { displayText: "Gerar contrato de locação" });
  }

  async function prefillRentalContractForm(messageId: string, propertyId: string) {
    if (!propertyId) return;
    try {
      const response = await apiGetImobRentalContractPrefill(propertyId);
      setFormValuesByMessageId((prev) => ({
        ...prev,
        [messageId]: { ...(prev[messageId] ?? {}), propertyId, ...rentalContractPrefillToValues(response.data) },
      }));
      setFormErrorsByMessageId((prev) => ({
        ...prev,
        [messageId]: (response.data.gaps.length > 0 ? { _form: response.data.gaps.join(" ") } : {}) as Record<string, string>,
      }));
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
      setFormErrorsByMessageId((prev) => ({ ...prev, [messageId]: { _form: describeRentalContractError(status, body?.error?.code) } }));
    }
  }

  async function handleRentalContractFormAction(message: StructuredMessage, actionId: "cancel" | "submit" | "archive") {
    if (actionId !== "submit") {
      updateMessageById(message.id, { form: undefined });
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
      appendMessage({ id: makeStructuredId("assistant"), role: "assistant", text: "Nenhum contrato foi gerado.", thread: message.thread });
      return;
    }
    if (formSubmittingRef.current.has(message.id)) return;
    const values = resolveFormValuesForMessage(message);
    const built = buildRentalContractRequest(values);
    if (!built.ok) {
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: built.errors }));
      return;
    }
    if (!checkInlineDocuments(message, values)) return;
    const propertyLabel = (imobPropertyOptions ?? []).find((option) => option.value === built.request.propertyId)?.label ?? "o imóvel";
    formSubmittingRef.current.add(message.id);
    setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
    try {
      const generated = await apiGenerateImobRentalContract(built.request);
      const pdf = await buildContractPdfFile(generated.data.contractText, generated.data.fileName);
      const formData = new FormData();
      formData.append("files", pdf);
      const uploaded = await apiUploadDocuments(formData, "imob");
      const linked = await apiLinkImobDocuments({
        subjectType: "rental",
        subjectId: built.request.propertyId,
        category: "minuta_contrato",
        documentIds: (uploaded.data ?? []).map((item) => item.id),
      });
      const documentsNote = await attachInlineDocuments(message, values, built.request.propertyId);
      updateMessageById(message.id, { form: undefined });
      const added = linked.data.added;
      // Só o nome do arquivo e o imóvel vão para a conversa; o texto do contrato fica no PDF anexado.
      const done: StructuredMessage = {
        id: makeStructuredId("assistant"),
        role: "assistant",
        text: [
          buildRentalContractConfirmationText({ propertyLabel, fileName: generated.data.fileName, writtenBack: generated.data.writtenBack }),
          documentsNote,
        ].filter(Boolean).join(" "),
        thread: message.thread,
        ...(added.length > 0
          ? {
              card: {
                type: "evidence" as const,
                title: "Minuta de contrato",
                thread: message.thread,
                lines: added.map((item) => `${item.fileName} | ${formatUploadSize(item.sizeBytes)}`),
                ctas: added.slice(0, 1).map((item) => ({ id: `doc-${item.documentId}`, label: item.fileName, kind: "neutral" as const, href: item.url })),
              },
            }
          : {}),
      };
      appendMessage(done);
      void persistMessage(done, { intent: "contract.rental.draft", action: "imob.contracts.rental" });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: { _form: describeRentalContractError(status, body?.error?.code) } }));
    } finally {
      formSubmittingRef.current.delete(message.id);
    }
  }

  function openDocumentAttachForm(subject: DocumentAttachSubject, subjectId?: string) {
    const threadId = host.activeThreadId ?? makeStructuredId("thread");
    const messageId = makeStructuredId("assistant");
    if (subjectId) {
      setFormValuesByMessageId((prev) => ({ ...prev, [messageId]: { [subject === "owners" ? "ownerId" : "propertyId"]: subjectId } }));
    }
    appendMessage({
      id: messageId,
      role: "assistant",
      text: subject === "rentals"
        ? "Escolha o imóvel da locação, o tipo de documento e o arquivo."
        : subject === "owners"
          ? "Escolha o proprietário, o tipo de documento e o arquivo."
          : "Escolha o imóvel, o tipo de documento e o arquivo.",
      form: buildDocumentAttachForm(subject),
      thread: { id: threadId, label: subject === "rentals" ? "Locação" : "Cadastro", status: "active" },
    });
  }

  async function handleDocumentAttachFormAction(message: StructuredMessage, actionId: "cancel" | "submit" | "archive") {
    const subject = (message.form?.action ?? "properties") as DocumentAttachSubject;
    if (actionId !== "submit") {
      delete formFilesRef.current[message.id];
      updateMessageById(message.id, { form: undefined });
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
      appendMessage({ id: makeStructuredId("assistant"), role: "assistant", text: "Nada foi anexado.", thread: message.thread });
      return;
    }
    if (formSubmittingRef.current.has(message.id)) return;
    const values = resolveFormValuesForMessage(message);
    const files = formFilesRef.current[message.id] ?? [];
    const errors = validateDocumentAttachValues(subject, values, files.length);
    if (Object.keys(errors).length > 0) {
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: errors }));
      return;
    }
    const subjectId = subject === "owners" ? values.ownerId : values.propertyId;
    const subjectLabel = (subject === "owners" ? imobOwnerOptions : imobPropertyOptions)?.find((option) => option.value === subjectId)?.label
      ?? (subject === "owners" ? "o proprietário" : "o imóvel");

    formSubmittingRef.current.add(message.id);
    setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
    try {
      const formData = new FormData();
      for (const file of files) formData.append("files", file);
      const uploaded = await apiUploadDocuments(formData, "imob");
      const documentIds = (uploaded.data ?? []).map((item) => item.id);
      const linked = await apiLinkImobDocuments(buildDocumentLinkRequest(subject, values, documentIds));
      delete formFilesRef.current[message.id];
      updateMessageById(message.id, { form: undefined });
      const done: StructuredMessage = {
        id: makeStructuredId("assistant"),
        role: "assistant",
        text: buildDocumentAttachConfirmationText({
          subject,
          subjectLabel,
          category: values.category ?? "",
          fileNames: linked.data.added.map((item) => item.fileName),
          alreadyLinked: documentIds.length - linked.data.added.length,
          contractPendingCleared: linked.data.contractPendingCleared,
        }),
        thread: message.thread,
        ...(linked.data.added.length > 0
          ? {
              card: {
                type: "evidence" as const,
                title: linked.data.added.length === 1 ? "Documento anexado" : "Documentos anexados",
                thread: message.thread,
                lines: linked.data.added.map((item) => `${item.fileName} | ${formatUploadSize(item.sizeBytes)}`),
                ctas: linked.data.added.slice(0, 2).map((item) => ({ id: `doc-${item.documentId}`, label: item.fileName, kind: "neutral" as const, href: item.url })),
              },
            }
          : {}),
      };
      appendMessage(done);
      void persistMessage(done, { intent: "documents.linked", action: "imob.documents.link" });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
      setFormErrorsByMessageId((prev) => ({
        ...prev,
        [message.id]: { _form: describeDocumentAttachError(subject, status, body?.error?.code) },
      }));
    } finally {
      formSubmittingRef.current.delete(message.id);
    }
  }

  function openTokenizationForm(subject: TokenizationSubject) {
    const threadId = host.activeThreadId ?? makeStructuredId("thread");
    appendMessage({
      id: makeStructuredId("assistant"),
      role: "assistant",
      text: "Tokenização de ativos ainda não está disponível. Veja o que seria tokenizado e, se quiser, registre o seu interesse.",
      form: buildTokenizationForm(subject),
      thread: { id: threadId, label: "Tokenização", status: "active" },
    });
  }

  async function handleTokenizationFormAction(message: StructuredMessage, actionId: "cancel" | "submit" | "archive") {
    if (actionId !== "submit") {
      updateMessageById(message.id, { form: undefined });
      appendMessage({ id: makeStructuredId("assistant"), role: "assistant", text: "Nada foi registrado.", thread: message.thread });
      return;
    }
    if (formSubmittingRef.current.has(message.id)) return;
    const subject = (message.form?.action ?? "properties") as TokenizationSubject;
    formSubmittingRef.current.add(message.id);
    try {
      await apiCreateImobCase(buildTokenizationInterestRequest(subject, resolveFormValuesForMessage(message)));
      updateMessageById(message.id, { form: undefined });
      const done: StructuredMessage = {
        id: makeStructuredId("assistant"),
        role: "assistant",
        text: buildTokenizationInterestConfirmationText(subject),
        thread: message.thread,
      };
      appendMessage(done);
      void persistMessage(done, { intent: "tokenization.interest", action: "imob.cases.create" });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      setFormErrorsByMessageId((prev) => ({
        ...prev,
        [message.id]: {
          _form: status === 403
            ? "Sua função atual não pode registrar este interesse neste workspace. Nada foi registrado."
            : `Não foi possível registrar agora${status ? ` (HTTP ${status})` : ""}. Nada foi registrado.`,
        },
      }));
    } finally {
      formSubmittingRef.current.delete(message.id);
    }
  }

  function prefillPropertyEditForm(messageId: string, propertyId: string) {
    const property = propertyRecordsRef.current.find((item) => item.id === propertyId);
    if (!property) return;
    setFormValuesByMessageId((prev) => ({ ...prev, [messageId]: { ...(prev[messageId] ?? {}), ...propertyToEditValues(property) } }));
    setFormErrorsByMessageId((prev) => ({ ...prev, [messageId]: {} }));
  }

  async function handlePropertyEditFormAction(message: StructuredMessage, actionId: "cancel" | "submit" | "archive") {
    if (actionId === "cancel") {
      updateMessageById(message.id, { form: undefined });
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
      appendMessage({ id: makeStructuredId("assistant"), role: "assistant", text: "Nada foi alterado.", thread: message.thread });
      return;
    }
    if (formSubmittingRef.current.has(message.id)) return;
    const values = resolveFormValuesForMessage(message);
    const propertyId = (values.propertyId ?? "").trim();
    if (!propertyId) {
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: { propertyId: "Selecione o imóvel." } }));
      return;
    }
    const label = (imobPropertyOptions ?? []).find((option) => option.value === propertyId)?.label ?? "imóvel";

    if (actionId === "archive") {
      if (ownerArchiveConfirmedRef.current[message.id] !== propertyId) {
        ownerArchiveConfirmedRef.current[message.id] = propertyId;
        setFormErrorsByMessageId((prev) => ({
          ...prev,
          [message.id]: { _form: `Arquivar ${label}? Ele sai das listas, mas o histórico fica guardado. Clique em Arquivar de novo para confirmar.` },
        }));
        return;
      }
      formSubmittingRef.current.add(message.id);
      try {
        await apiArchiveImobProperty(propertyId);
        updateMessageById(message.id, { form: undefined });
        const done: StructuredMessage = { id: makeStructuredId("assistant"), role: "assistant", text: `Imóvel arquivado: ${label}.`, thread: message.thread };
        appendMessage(done);
        void persistMessage(done, { intent: "property.archived", action: "imob.properties.archive" });
      } catch (error) {
        const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
        const status = error instanceof ApiError ? error.status : 0;
        setFormErrorsByMessageId((prev) => ({
          ...prev,
          [message.id]: {
            _form: body?.error?.code === "PROPERTY_DELETE_BLOCKED"
              ? "Não dá para arquivar: há locação ou caso ligado a este imóvel. Nada foi alterado."
              : `Não foi possível arquivar agora${status ? ` (HTTP ${status})` : ""}. Nada foi alterado.`,
          },
        }));
      } finally {
        delete ownerArchiveConfirmedRef.current[message.id];
        formSubmittingRef.current.delete(message.id);
      }
      return;
    }

    const built = buildPropertyUpdateRequest(values, propertyRecordsRef.current);
    if (!built.ok) {
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: built.errors }));
      return;
    }
    formSubmittingRef.current.add(message.id);
    setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
    try {
      const response = await apiUpdateImobProperty(built.propertyId, built.request);
      propertyRecordsRef.current = propertyRecordsRef.current.map((item) => (item.id === built.propertyId ? response.data : item));
      updateMessageById(message.id, { form: undefined });
      const [updatedLabel] = buildImobPropertyOptions([response.data]).map((option) => option.label);
      const done: StructuredMessage = {
        id: makeStructuredId("assistant"),
        role: "assistant",
        text: `Imóvel atualizado: ${updatedLabel ?? label}.`,
        thread: message.thread,
      };
      appendMessage(done);
      void persistMessage(done, { intent: "property.updated", action: "imob.properties.update" });
    } catch (error) {
      const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
      const status = error instanceof ApiError ? error.status : 0;
      setFormErrorsByMessageId((prev) => ({
        ...prev,
        [message.id]: body?.error?.code === "OWNER_NOT_FOUND"
          ? ({ ownerId: "Proprietário não encontrado neste workspace." } as Record<string, string>)
          : {
              _form: status === 404
                ? "Imóvel não encontrado (pode ter sido arquivado). Nada foi alterado."
                : `Não foi possível salvar agora${status ? ` (HTTP ${status})` : ""}. Nada foi alterado; tente de novo.`,
            },
      }));
    } finally {
      formSubmittingRef.current.delete(message.id);
    }
  }

  function prefillOwnerEditForm(messageId: string, ownerId: string) {
    const owner = ownerRecordsRef.current.find((item) => item.id === ownerId);
    if (!owner) return;
    setFormValuesByMessageId((prev) => ({ ...prev, [messageId]: { ...(prev[messageId] ?? {}), ...ownerToEditValues(owner) } }));
    setFormErrorsByMessageId((prev) => ({ ...prev, [messageId]: {} }));
    void showOwnerProperties(messageId, ownerId);
  }

  /** Mostra no formulário os imóveis já ligados ao proprietário e oferece cadastrar mais um. */
  async function showOwnerProperties(messageId: string, ownerId: string) {
    try {
      const response = await apiListImobProperties();
      const items = response.data.items ?? [];
      propertyRecordsRef.current = items;
      const infoLines = buildOwnerPropertiesSummary(ownerId, items, (item) => buildImobPropertyOptions([item])[0]?.label ?? item.id);
      host.patchMessage(messageId, (item) => (
        item.form
          ? {
              ...item,
              form: { ...item.form, infoLines },
              quickReplies: [{ id: "owner-add-property", label: "Cadastrar imóvel deste proprietário", onSelect: () => startPropertyCreateFor(ownerId) }],
            }
          : item
      ));
    } catch {
      // Sem a lista, o formulário de edição continua funcionando normalmente.
    }
  }

  async function handleOwnerEditFormAction(message: StructuredMessage, actionId: "cancel" | "submit" | "archive") {
    if (actionId === "cancel") {
      updateMessageById(message.id, { form: undefined });
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
      appendMessage({ id: makeStructuredId("assistant"), role: "assistant", text: "Edição cancelada. Nada foi alterado.", thread: message.thread });
      return;
    }
    if (formSubmittingRef.current.has(message.id)) return;
    const values = resolveFormValuesForMessage(message);
    const ownerId = (values.ownerId ?? "").trim();
    if (!ownerId) {
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: { ownerId: "Selecione o proprietário." } }));
      return;
    }
    const owner = ownerRecordsRef.current.find((item) => item.id === ownerId);

    if (actionId === "archive") {
      if (ownerArchiveConfirmedRef.current[message.id] !== ownerId) {
        ownerArchiveConfirmedRef.current[message.id] = ownerId;
        setFormErrorsByMessageId((prev) => ({
          ...prev,
          [message.id]: { _form: `Arquivar ${owner?.name ?? "este proprietário"}? Ele sai das listas, mas o histórico fica guardado. Clique em Arquivar de novo para confirmar.` },
        }));
        return;
      }
      formSubmittingRef.current.add(message.id);
      try {
        await apiArchiveImobOwner(ownerId);
        updateMessageById(message.id, { form: undefined });
        const done: StructuredMessage = { id: makeStructuredId("assistant"), role: "assistant", text: `Proprietário arquivado: ${owner?.name ?? ownerId}.`, thread: message.thread };
        appendMessage(done);
        void persistMessage(done, { intent: "owner.archived", action: "imob.owners.archive" });
      } catch (error) {
        const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
        const status = error instanceof ApiError ? error.status : 0;
        setFormErrorsByMessageId((prev) => ({
          ...prev,
          [message.id]: {
            _form: body?.error?.code === "OWNER_DELETE_BLOCKED"
              ? "Não dá para arquivar: há imóveis ou casos ligados a este proprietário. Nada foi alterado."
              : `Não foi possível arquivar agora${status ? ` (HTTP ${status})` : ""}. Nada foi alterado.`,
          },
        }));
      } finally {
        delete ownerArchiveConfirmedRef.current[message.id];
        formSubmittingRef.current.delete(message.id);
      }
      return;
    }

    const built = buildOwnerUpdateRequest(values, ownerRecordsRef.current);
    if (!built.ok) {
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: built.errors }));
      return;
    }
    formSubmittingRef.current.add(message.id);
    setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
    try {
      const response = await apiUpdateImobOwner(built.ownerId, built.request);
      ownerRecordsRef.current = ownerRecordsRef.current.map((item) => (item.id === built.ownerId ? response.data : item));
      updateMessageById(message.id, { form: undefined });
      const done: StructuredMessage = {
        id: makeStructuredId("assistant"),
        role: "assistant",
        text: buildOwnerUpdateConfirmationText({ name: response.data.name, personType: built.request.personType, document: built.request.document }),
        thread: message.thread,
      };
      appendMessage(done);
      void persistMessage(done, { intent: "owner.updated", action: "imob.owners.update" });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      setFormErrorsByMessageId((prev) => ({
        ...prev,
        [message.id]: {
          _form: status === 404
            ? "Proprietário não encontrado (pode ter sido arquivado). Nada foi alterado."
            : `Não foi possível salvar agora${status ? ` (HTTP ${status})` : ""}. Nada foi alterado; tente de novo.`,
        },
      }));
    } finally {
      formSubmittingRef.current.delete(message.id);
    }
  }

  /** Envio de um formulário estruturado. `false` quando o formulário não é do IMOB estruturado. */
  async function handleStructuredFormAction(message: StructuredMessage, actionId: "cancel" | "submit" | "archive"): Promise<boolean> {
    const form = message.form;
    if (!form) return false;
    if (isOwnerEditForm(form)) {
      await handleOwnerEditFormAction(message, actionId);
      return true;
    }
    if (isPropertyEditForm(form)) {
      await handlePropertyEditFormAction(message, actionId);
      return true;
    }
    if (isTokenizationForm(form)) {
      await handleTokenizationFormAction(message, actionId);
      return true;
    }
    if (isDocumentAttachForm(form)) {
      await handleDocumentAttachFormAction(message, actionId);
      return true;
    }
    if (isRentalContractForm(form)) {
      await handleRentalContractFormAction(message, actionId);
      return true;
    }
    if (isRentalEditForm(form) || isRentalCloseForm(form) || isRentalHistoryForm(form)) {
      await handleRentalLifecycleFormAction(message, actionId);
      return true;
    }
    if (isSaleContractForm(form)) {
      await handleSaleContractFormAction(message, actionId);
      return true;
    }
    if (actionId === "archive") return true;
    if (isOwnerCreateForm(form)) {
      await handleOwnerCreateFormAction(message, actionId);
      return true;
    }
    if (isRentalLeaseForm(form)) {
      await handleRentalLeaseFormAction(message, actionId);
      return true;
    }
    if (isPropertyCreateForm(form)) {
      await handlePropertyCreateFormAction(message, actionId);
      return true;
    }
    return false;
  }

  /** Ao escolher o cadastro no formulário, os dados atuais aparecem nos campos. */
  function handleSelectChange(message: StructuredMessage, fieldName: string, value: string) {
    const form = message.form;
    if (!form) return;
    if (isOwnerEditForm(form) && form.action === "update" && fieldName === "ownerId") prefillOwnerEditForm(message.id, value);
    if (isPropertyEditForm(form) && form.action === "update" && fieldName === "propertyId") prefillPropertyEditForm(message.id, value);
    if (isRentalContractForm(form) && fieldName === "propertyId") void prefillRentalContractForm(message.id, value);
    if (isSaleContractForm(form) && fieldName === "propertyId") void prefillSaleContractForm(message.id, value);
    if (isRentalEditForm(form) && fieldName === "propertyId") void prefillRentalEditForm(message.id, value);
  }

  return {
    handleActionMenuSelect,
    handleStructuredFormAction,
    handleSelectChange,
    openRentalContractForm,
    openSaleContractForm,
    openDocumentAttachForm,
    openRentalLifecycleForm,
    startPropertyCreateFor,
    startRentalContractFor,
    startRentalLeaseFor,
  };
}

export type ImobStructuredForms = ReturnType<typeof createImobStructuredForms>;
