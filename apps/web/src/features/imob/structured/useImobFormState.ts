import React from "react";
import {
  ApiError,
  apiListImobOwners,
  apiListImobProperties,
  apiLookupImobCep,
  type ImobOwner,
  type ImobProperty,
  type ImobPresentationFormField,
  type ImobPresentationFormFieldOption,
} from "@/lib/api";
import { withInlineDocumentFields } from "@/pages/app/imob/documentAttachForm";
import { buildImobOwnerOptions, matchOptionByName } from "@/pages/app/imob/propertyCreateForm";
import { buildImobPropertyOptions } from "@/pages/app/imob/rentalLeaseForm";
import type { PropertyBulkArchiveState } from "@/pages/app/imob/propertyBulkArchive";
import { normalizeCepValue, normalizeImobFormValue, planImobCepAutofill, resolveFieldAutofillTarget, type StructuredMessage } from "./types";

/** Coordena o lookup interno e descarta respostas de outra edição ou formulário. */
export function createImobCepLookup(dependencies: {
  resolveValues: (message: StructuredMessage) => Record<string, string>;
  isCurrent: (message: StructuredMessage) => boolean;
  updateValue: (messageId: string, field: string, value: string) => void;
  setLoading: (messageId: string, field: string, loading: boolean) => void;
  setError: (messageId: string, field: string, text: string) => void;
}) {
  const sequenceByMessage: Record<string, number> = {};
  return async (message: StructuredMessage, fieldName: string, rawValue: string) => {
    const field = message.form?.fields.find((item) => item.name === fieldName);
    if (field?.lookup?.kind !== "cep") return null;
    const cep = normalizeCepValue(rawValue);
    dependencies.updateValue(message.id, fieldName, cep);
    const sequence = (sequenceByMessage[message.id] ?? 0) + 1;
    sequenceByMessage[message.id] = sequence;
    const isCurrent = () => sequenceByMessage[message.id] === sequence && dependencies.isCurrent(message)
      && normalizeCepValue(dependencies.resolveValues(message)[fieldName] ?? "") === cep;
    if (!/^\d{5}-?\d{3}$/.test(cep)) {
      dependencies.setLoading(message.id, fieldName, false);
      return null;
    }
    dependencies.setLoading(message.id, fieldName, true);
    try {
      const response = await apiLookupImobCep(cep);
      if (!isCurrent()) return null;
      const candidates: Array<[string, string | null]> = [
        [fieldName, response.data.cep],
        [resolveFieldAutofillTarget(field, "city") ?? "", response.data.city],
        [resolveFieldAutofillTarget(field, "address") ?? "", response.data.street ?? response.data.address],
        [resolveFieldAutofillTarget(field, "neighborhood") ?? "", response.data.neighborhood],
      ];
      const { applied, conflicts } = planImobCepAutofill(dependencies.resolveValues(message), candidates, fieldName);
      for (const [target, value] of Object.entries(applied)) dependencies.updateValue(message.id, target, value);
      if (conflicts.length) {
        const details = conflicts.map((conflict) => `${message.form?.fields.find((item) => item.name === conflict.field)?.label ?? "Endereço"}: ${conflict.lookup}`).join("; ");
        dependencies.setError(message.id, fieldName, `O CEP retornou dados diferentes: ${details}. Mantive o que você informou. Confira o endereço e o CEP antes de cadastrar.`);
      }
      return applied;
    } catch (error) {
      if (!isCurrent()) return null;
      const reason = error instanceof ApiError && error.status === 404
        ? "CEP não encontrado." : "Não consegui consultar o CEP agora. Preencha o endereço manualmente.";
      dependencies.setError(message.id, fieldName, reason);
      return null;
    } finally {
      if (sequenceByMessage[message.id] === sequence) dependencies.setLoading(message.id, fieldName, false);
    }
  };
}

/**
 * Estado dos formulários do IMOB numa conversa: valores e erros por mensagem,
 * listas de imóveis/proprietários (carregadas quando um formulário precisa),
 * consulta de CEP e pré-preenchimento do próximo formulário.
 * Usado pelo chat do IMOB e, no front door, pela mesma conversa do EIAH.
 */
export function useImobFormState(messages: StructuredMessage[]) {
  const [formValuesByMessageId, setStoredFormValues] = React.useState<Record<string, Record<string, string>>>({});
  const formValuesRef = React.useRef(formValuesByMessageId);
  const setFormValuesByMessageId = React.useCallback<React.Dispatch<React.SetStateAction<typeof formValuesByMessageId>>>((update) => {
    const next = typeof update === "function" ? update(formValuesRef.current) : update;
    formValuesRef.current = next;
    setStoredFormValues(next);
  }, []);
  const [formErrorsByMessageId, setFormErrorsByMessageId] = React.useState<Record<string, Record<string, string>>>({});
  const [formLookupLoadingByMessageId, setFormLookupLoadingByMessageId] = React.useState<Record<string, Record<string, boolean>>>({});
  const [imobPropertyOptions, setImobPropertyOptions] = React.useState<ImobPresentationFormFieldOption[] | null>(null);
  const [imobOwnerOptions, setImobOwnerOptions] = React.useState<ImobPresentationFormFieldOption[] | null>(null);
  const propertyOptionsLoadedForRef = React.useRef<Set<string>>(new Set());
  const formSubmittingRef = React.useRef<Set<string>>(new Set());
  // Nome igual a um proprietário existente: o segundo clique confirma o cadastro.
  const ownerNameConfirmedRef = React.useRef<Record<string, string>>({});
  const ownerRecordsRef = React.useRef<ImobOwner[]>([]);
  const ownerArchiveConfirmedRef = React.useRef<Record<string, string>>({});
  /** Arquivos escolhidos nos formulários "Anexar documento", por mensagem. */
  const formFilesRef = React.useRef<Record<string, File[]>>({});
  /** Valores a aplicar no próximo formulário com este destino (ex.: proprietário recém-cadastrado no "Cadastrar imóvel"). */
  const pendingFormPrefillRef = React.useRef<{ submitTarget: string; values: Record<string, string>; isCurrent?: () => boolean } | null>(null);
  /** Imóvel cuja locação, ao ser salva, abre direto o contrato. */
  const contractAfterLeaseRef = React.useRef<string | null>(null);
  const propertyRecordsRef = React.useRef<ImobProperty[]>([]);
  // Arquivamento múltiplo: estado por mensagem (leitura síncrona via ref, como os valores do formulário).
  const [bulkArchiveByMessageId, setStoredBulkArchive] = React.useState<Record<string, PropertyBulkArchiveState>>({});
  const bulkArchiveRef = React.useRef(bulkArchiveByMessageId);
  const setBulkArchiveByMessageId = React.useCallback<React.Dispatch<React.SetStateAction<Record<string, PropertyBulkArchiveState>>>>((update) => {
    const next = typeof update === "function" ? update(bulkArchiveRef.current) : update;
    bulkArchiveRef.current = next;
    setStoredBulkArchive(next);
  }, []);
  /** Contexto de autorização em que cada seleção foi carregada; só em memória (o token nunca vai para o estado do painel). */
  const bulkArchiveScopeRef = React.useRef<Record<string, { token?: string; tenantId: string; workspaceId: string }>>({});
  /** Mensagens cujo lote em execução deve parar antes da próxima escrita. */
  const bulkArchiveStopRef = React.useRef<Set<string>>(new Set());

  const resolveFormFieldOptions = React.useCallback(
    (field: ImobPresentationFormField): ImobPresentationFormFieldOption[] =>
      field.optionsSource === "imob_properties"
        ? imobPropertyOptions ?? []
        : field.optionsSource === "imob_owners"
          ? imobOwnerOptions ?? []
          : field.options ?? [],
    [imobOwnerOptions, imobPropertyOptions],
  );

  React.useEffect(() => {
    const pending = messages.filter(
      (message) =>
        message.form?.fields.some((field) => Boolean(field.optionsSource))
        && !propertyOptionsLoadedForRef.current.has(message.id),
    );
    if (pending.length === 0) return;
    for (const message of pending) propertyOptionsLoadedForRef.current.add(message.id);
    const sources = new Set(pending.flatMap((message) => message.form?.fields.map((field) => field.optionsSource) ?? []));
    // Sem cancelamento no cleanup: `messages` muda a cada nova mensagem e a
    // lista precisa chegar mesmo assim (o form já foi marcado como carregado).
    if (sources.has("imob_properties")) {
      void apiListImobProperties()
        .then((response) => {
          propertyRecordsRef.current = response.data.items ?? [];
          setImobPropertyOptions(buildImobPropertyOptions(response.data.items ?? []));
        })
        .catch(() => setImobPropertyOptions((prev) => prev ?? []));
    }
    if (sources.has("imob_owners")) {
      void apiListImobOwners()
        .then((response) => {
          ownerRecordsRef.current = response.data.items ?? [];
          setImobOwnerOptions(buildImobOwnerOptions(response.data.items ?? []));
        })
        .catch(() => setImobOwnerOptions((prev) => prev ?? []));
    }
  }, [messages]);

  const resolveFormValuesForMessage = React.useCallback(
    (message: StructuredMessage) => {
      const form = message.form;
      if (!form) return {} as Record<string, string>;

      const currentThreadId = message.thread?.id ?? message.card?.thread?.id ?? null;
      const values: Record<string, string> = Object.fromEntries(
        form.fields.map((field) => [field.name, String(field.value ?? "")]),
      );
      const localOverrides = formValuesRef.current[message.id] ?? null;
      if (localOverrides) {
        for (const [fieldName, value] of Object.entries(localOverrides)) {
          values[fieldName] = value;
        }
      }

      for (const field of form.fields) {
        if (normalizeImobFormValue(values[field.name] ?? "")) continue;
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const candidate = messages[index];
          if (candidate.id === message.id) continue;
          const candidateForm = candidate.form;
          if (!candidateForm) continue;
          if (candidateForm.entity !== form.entity || candidateForm.action !== form.action) continue;
          const candidateThreadId = candidate.thread?.id ?? candidate.card?.thread?.id ?? null;
          if (candidateThreadId !== currentThreadId) continue;

          const candidateLocalValues = formValuesRef.current[candidate.id] ?? null;
          const candidateValue = normalizeImobFormValue(
            candidateLocalValues?.[field.name] ?? String(candidateForm.fields.find((item) => item.name === field.name)?.value ?? ""),
          );
          if (!candidateValue) continue;
          values[field.name] = candidateValue;
          break;
        }
      }

      // Nome citado no chat ("… no proprietário Carlos"): escolhe o cadastro existente quando há um só compatível.
      for (const field of form.fields) {
        if (!field.preferredOptionLabel || normalizeImobFormValue(values[field.name] ?? "")) continue;
        const matched = matchOptionByName(resolveFormFieldOptions(field), field.preferredOptionLabel);
        if (matched) values[field.name] = matched;
      }

      return values;
    },
    [formValuesByMessageId, messages, resolveFormFieldOptions],
  );

  const updateFormFieldValue = React.useCallback((messageId: string, fieldName: string, value: string) => {
    setFormValuesByMessageId((prev) => ({
      ...prev,
      [messageId]: {
        ...(prev[messageId] ?? {}),
        [fieldName]: value,
      },
    }));
    setFormErrorsByMessageId((prev) => {
      if (!prev[messageId]?.[fieldName]) return prev;
      const nextFieldErrors = { ...(prev[messageId] ?? {}) };
      delete nextFieldErrors[fieldName];
      return { ...prev, [messageId]: nextFieldErrors };
    });
  }, []);

  // A resposta de lookup deve observar edições feitas enquanto a requisição estava em voo.
  const resolveLatestValues = React.useRef(resolveFormValuesForMessage);
  resolveLatestValues.current = resolveFormValuesForMessage;
  const latestMessages = React.useRef(messages);
  latestMessages.current = messages;
  const resolveCurrentFormValues = React.useCallback((message: StructuredMessage) => resolveLatestValues.current(message), []);

  const setFormLookupLoading = React.useCallback((messageId: string, fieldName: string, isLoading: boolean) => {
    setFormLookupLoadingByMessageId((prev) => ({
      ...prev,
      [messageId]: {
        ...(prev[messageId] ?? {}),
        [fieldName]: isLoading,
      },
    }));
  }, []);

  const applyCepLookupToForm = React.useMemo(() => createImobCepLookup({
    resolveValues: resolveCurrentFormValues,
    isCurrent: (message) => latestMessages.current.some((item) => item.id === message.id && Boolean(item.form)),
    updateValue: updateFormFieldValue,
    setLoading: setFormLookupLoading,
    setError: (messageId, field, text) => setFormErrorsByMessageId((prev) => ({
      ...prev, [messageId]: { ...(prev[messageId] ?? {}), [field]: text },
    })),
  }), [resolveCurrentFormValues, setFormLookupLoading, updateFormFieldValue]);

  /** Antes de exibir um formulário: anexos no próprio formulário e valores pendentes para este destino. */
  const prepareIncomingMessage = React.useCallback(<M extends StructuredMessage>(incoming: M): M => {
    // Formulários de cadastro e contrato ganham "Anexar documentos" no próprio formulário.
    const message = incoming.form ? { ...incoming, form: withInlineDocumentFields(incoming.form) } : incoming;
    const pendingPrefill = pendingFormPrefillRef.current;
    if (pendingPrefill?.isCurrent?.() === false) {
      pendingFormPrefillRef.current = null;
      return message;
    }
    if (pendingPrefill && message.form?.submitTarget === pendingPrefill.submitTarget) {
      pendingFormPrefillRef.current = null;
      setFormValuesByMessageId((prev) => ({ ...prev, [message.id]: { ...(prev[message.id] ?? {}), ...pendingPrefill.values } }));
    }
    return message;
  }, []);

  return {
    formValuesByMessageId,
    setFormValuesByMessageId,
    formErrorsByMessageId,
    setFormErrorsByMessageId,
    formLookupLoadingByMessageId,
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
    bulkArchiveByMessageId,
    bulkArchiveRef,
    setBulkArchiveByMessageId,
    bulkArchiveScopeRef,
    bulkArchiveStopRef,
    resolveFormFieldOptions,
    resolveFormValuesForMessage: resolveCurrentFormValues,
    updateFormFieldValue,
    applyCepLookupToForm,
    prepareIncomingMessage,
  };
}

export type ImobFormState = ReturnType<typeof useImobFormState>;
