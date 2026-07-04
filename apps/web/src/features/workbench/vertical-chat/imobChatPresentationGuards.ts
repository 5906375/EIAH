export function shouldRenderPendingExecutionSlotCollectionCard(params: {
  hasForm: boolean;
  isLastMessage: boolean;
  isPendingTarget: boolean;
  slotFieldsCount: number;
}) {
  const { hasForm, isLastMessage, isPendingTarget, slotFieldsCount } = params;
  if (hasForm) return false;
  if (!isPendingTarget || !isLastMessage) return false;
  return slotFieldsCount > 0;
}

export function shouldRenderMessageSlotCollectionCard(params: {
  hasForm: boolean;
  hasSlotCollection: boolean;
  isAssistantMessage: boolean;
  isLastMessage: boolean;
  isBusy: boolean;
}) {
  const { hasForm, hasSlotCollection, isAssistantMessage, isLastMessage, isBusy } = params;
  if (hasForm) return false;
  if (!hasSlotCollection || !isLastMessage || !isAssistantMessage) return false;
  return !isBusy;
}
