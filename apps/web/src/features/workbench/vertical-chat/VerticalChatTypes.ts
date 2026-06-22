/**
 * Tipos canônicos para o seletor de verticais — Fase 9.5
 * J-360 NÃO é vertical — é agente especialista dentro de LEGAL.
 * Não adicionar 'j360' ao VerticalId.
 */

export type VerticalId = "imob" | "legal";

export type VerticalState =
  | "active"    // selecionada + entitlement confirmado
  | "inactive"  // disponível, não selecionada
  | "preview"   // sem entitlement formal — visível, não clicável
  | "disabled"; // sem entitlement — ocultar

export interface VerticalSelectorItem {
  id: VerticalId;
  label: string;
  state: VerticalState;
  color: string;
  tooltip?: string;
}

export interface VerticalSelectorBarProps {
  verticals: VerticalSelectorItem[];
  activeVerticalId: VerticalId;
  onSelect: (id: VerticalId) => void;
  className?: string;
}
