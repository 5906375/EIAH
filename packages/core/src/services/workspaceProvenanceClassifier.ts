/**
 * EIAH-AUTHZ-WORKSPACE-G2.3-B — classificador GOVERNADO de procedência de vínculos de workspace (lógica pura).
 *
 * Responde, por (usuário, workspace) e em DOIS EIXOS INDEPENDENTES:
 *  - ADMISSÃO  : há evidência independente de que a pessoa foi admitida neste workspace?
 *  - PRIVILÉGIO: o papel e as permissões atuais cabem no que a evidência concedeu?
 * Estados: VERIFIED | UNVERIFIED | CONFLICTING | INSUFFICIENT_EVIDENCE (privilégio também pode ser NOT_APPLICABLE).
 *
 * CONTRATO DE GOVERNANÇA (não negociável):
 *  - Somente leitura e sem efeitos: recebe fatos, devolve registros. Não cria, revoga, regulariza, designa nem concede nada.
 *  - A classificação NÃO é autorização operacional e nunca deve alimentar uma concessão automática.
 *  - Um vínculo ativo NÃO é prova independente (não entra como evidência).
 *  - Bootstrap, perfil autodeclarado e promoção automática NUNCA são raiz de autoridade.
 *  - Nenhum responsável é criado, designado ou presumido (D1 continua pendente).
 *  - O ledger não tem integridade criptográfica: tudo aqui é verificação de COERÊNCIA LÓGICA, não de autenticidade.
 *  - Fonte ausente/erro NUNCA é lida como prova positiva (nem negativa): vira limitação explícita.
 *
 * Decisões ratificadas para este incremento:
 *  - O-1: `tenant.onboarded` prova criação e vínculo com o tenant e o seu workspace INICIAL; não concede membership, gestão
 *         de membros nem autoridade nos workspaces adicionais e não comprova identidade civil nem titularidade societária.
 *  - O-2: declaração humana desacompanhada de evidência independente não produz VERIFIED (este módulo nem recebe declarações).
 *  - O-3: evento confiável de criação automática fundamenta UNVERIFIED para ADMISSÃO; o PRIVILÉGIO é avaliado com a
 *         evidência específica do próprio eixo (não há rebaixamento automático em bloco do histórico).
 */
export const PROVENANCE_CLASSIFIER_VERSION = "provenance-classifier/1" as const;

export type ProvenanceState = "VERIFIED" | "UNVERIFIED" | "CONFLICTING" | "INSUFFICIENT_EVIDENCE";
export type PrivilegeState = ProvenanceState | "NOT_APPLICABLE";

export type ProvenanceSourceName =
  | "memberships" | "users" | "workspaces" | "tokens" | "invitations" | "ledger_creator" | "ledger_bootstrap"
  | "legacy_assignments" | "installations" | "approvals" | "profiles" | "role_catalog";
export type ProvenanceSourceStatus = "available" | "unavailable" | "error";

/** Papéis que dão gestão/ativação (mesma lista de `promoteSoleWorkspaceMemberIfNeeded`). */
export const PROVENANCE_PRIVILEGED_ROLE_KEYS = ["founder", "admin", "gestor", "desenvolvedor", "developer"] as const;
/** Evento de bootstrap deve ser registrado logo depois da criação do vínculo (mesmo relógio do banco). */
export const BOOTSTRAP_EVENT_AFTER_TOLERANCE_MS = 120_000;
/** Folga para arredondamento de relógio/precisão entre colunas. */
export const CLOCK_SLACK_MS = 2_000;
/** Convite aceito mais de X depois da criação do vínculo => o aceite caiu sobre um vínculo já existente (sobrescreve papel/permissões/status). */
export const EXISTING_MEMBERSHIP_GRACE_MS = 120_000;
export const MAX_INVITATION_CHAIN_DEPTH = 5;
export const PRODUCT_ACTIVATION_PERMISSION_KEY = "products.activate";
export const MANAGE_MEMBERS_PERMISSION_KEY = "workspace.manage_members";

// ------------------------------------------------------------------------------------------------ fatos de entrada
export type MembershipFact = {
  tenantId: string; workspaceId: string; userId: string;
  roleKey: string | null; /** `null` = malformado */ permissions: string[] | null;
  status: string | null; createdAt: Date | null; updatedAt: Date | null;
};
export type UserFact = { id: string; tenantId: string };
export type WorkspaceFact = { id: string; tenantId: string; name: string | null };
export type TokenAccessFact = { tenantId: string; workspaceId: string; userId: string };
export type InvitationFact = {
  id: string; tenantId: string; workspaceId: string;
  inviterUserId: string | null; acceptedByUserId: string | null;
  roleKey: string | null; permissions: string[] | null;
  createdAt: Date | null; acceptedAt: Date | null; expiresAt: Date | null;
  /** o e-mail atual do convidado confere com o do convite? `null` = não avaliável. Nunca carrega o e-mail. */
  emailMatchesCurrent: boolean | null;
};
export type CreatorEventFact = { eventId: string; tenantId: string; workspaceId: string | null; userId: string | null; at: Date | null };
export type BootstrapEventFact = {
  eventId: string; tenantId: string; workspaceId: string | null; actorUserId: string | null;
  observation: string | null; assignedRoleKey: string | null; roleSource: string | null; at: Date | null;
};
export type LegacyAssignmentFact = { tenantId: string; workspaceId: string; userId: string; roleKey: string | null };
export type InstallationFact = { tenantId: string; workspaceId: string; activatedByUserId: string | null };
export type ApprovalFact = { tenantId: string; workspaceId: string; requestedByUserId: string | null; source: string | null; status: string | null };
export type ProfileFact = { userId: string; roleKey: string | null };
export type RoleCatalogFact = { tenantId: string; workspaceId: string; roleKey: string; defaultPermissions: string[] };

export type ProvenanceFacts = {
  sources: Record<ProvenanceSourceName, ProvenanceSourceStatus>;
  memberships: MembershipFact[]; users: UserFact[]; workspaces: WorkspaceFact[]; tokens: TokenAccessFact[];
  invitations: InvitationFact[]; creatorEvents: CreatorEventFact[]; bootstrapEvents: BootstrapEventFact[];
  legacyAssignments: LegacyAssignmentFact[]; installations: InstallationFact[]; approvals: ApprovalFact[];
  profiles: ProfileFact[]; roleCatalog: RoleCatalogFact[];
};

// ------------------------------------------------------------------------------------------------ saída
export type ProvenanceEvidenceRef = { kind: string; ref: string; at: string | null };
export type ProvenanceRecord = {
  tenantId: string; workspaceId: string; userId: string; hasMembership: boolean;
  membership: { roleKey: string | null; status: string | null; permissionsCount: number | null; createdAt: string | null; updatedAt: string | null } | null;
  admission: { state: ProvenanceState; reasons: string[]; evidence: ProvenanceEvidenceRef[] };
  privilege: { state: PrivilegeState; reasons: string[]; evidence: ProvenanceEvidenceRef[] };
  signals: string[]; limitations: string[]; needsHumanReview: boolean;
  /** Sempre `true`: lembrete estrutural de que esta saída não é autorização. */
  classificationIsNotAuthorization: true;
  classifierVersion: typeof PROVENANCE_CLASSIFIER_VERSION;
};
export type ProvenanceClassification = {
  classifierVersion: typeof PROVENANCE_CLASSIFIER_VERSION;
  classifiedAt: string; sources: Record<ProvenanceSourceName, ProvenanceSourceStatus>; degraded: boolean;
  records: ProvenanceRecord[];
};

export type ProvenanceClassifierOptions = {
  now?: Date;
  /** Nome reservado do workspace padrão (onboarding concede `founder` só nele). */
  reservedDefaultWorkspaceName?: string;
  bootstrapAfterToleranceMs?: number;
  existingMembershipGraceMs?: number;
};

// ------------------------------------------------------------------------------------------------ utilitários
const key = (a: string, b: string) => `${a}\u0000${b}`;
const validDate = (d: Date | null | undefined): d is Date => d instanceof Date && Number.isFinite(d.getTime());
const iso = (d: Date | null | undefined) => (validDate(d) ? d.toISOString() : null);
const norm = (value: string | null | undefined) => (typeof value === "string" ? value.trim().toLowerCase() : "");
const isPrivileged = (role: string | null | undefined) => (PROVENANCE_PRIVILEGED_ROLE_KEYS as readonly string[]).includes(norm(role));
const nonEmpty = (value: string | null | undefined): value is string => typeof value === "string" && value.trim().length > 0;
const isSubset = (candidate: string[], allowed: Set<string>) => candidate.every((item) => allowed.has(item));
const sortedUnique = (items: string[]) => [...new Set(items)].sort();

type ValidInvitation = InvitationFact & { acceptedByUserId: string; createdAt: Date; acceptedAt: Date };

/** Fontes cuja indisponibilidade impede concluir a ausência de conflito/derivação. */
const CRITICAL_SOURCES: ProvenanceSourceName[] = ["invitations", "ledger_creator", "ledger_bootstrap", "legacy_assignments"];

export function classifyWorkspaceProvenance(facts: ProvenanceFacts, options: ProvenanceClassifierOptions = {}): ProvenanceClassification {
  const now = options.now ?? new Date();
  const reservedDefault = norm(options.reservedDefaultWorkspaceName ?? "DEFAULT");
  const afterTol = options.bootstrapAfterToleranceMs ?? BOOTSTRAP_EVENT_AFTER_TOLERANCE_MS;
  const existingGrace = options.existingMembershipGraceMs ?? EXISTING_MEMBERSHIP_GRACE_MS;
  const src = facts.sources;
  const available = (name: ProvenanceSourceName) => src[name] === "available";
  const degraded = (Object.keys(src) as ProvenanceSourceName[]).some((name) => src[name] !== "available");

  const usersById = new Map(facts.users.map((u) => [u.id, u]));
  const workspacesById = new Map(facts.workspaces.map((w) => [w.id, w]));
  const profileByUser = new Map(facts.profiles.map((p) => [p.userId, norm(p.roleKey)]));
  const legacyBySubject = new Map(facts.legacyAssignments.map((l) => [key(l.workspaceId, l.userId), l]));
  const activatorSubjects = new Set(facts.installations.filter((i) => nonEmpty(i.activatedByUserId)).map((i) => key(i.workspaceId, i.activatedByUserId!)));
  const requesterSubjects = new Set(facts.approvals.filter((a) => nonEmpty(a.requestedByUserId)).map((a) => key(a.workspaceId, a.requestedByUserId!)));
  const migrationApprovalWorkspaces = new Set(facts.approvals.filter((a) => a.source === "migration" && a.status === "aprovado").map((a) => a.workspaceId));
  const catalog = new Map(facts.roleCatalog.map((r) => [`${r.workspaceId}\u0000${norm(r.roleKey)}`, r.defaultPermissions]));
  const memberKey = (m: { workspaceId: string; userId: string }) => key(m.workspaceId, m.userId);
  const membershipBySubject = new Map(facts.memberships.map((m) => [memberKey(m), m]));

  // ---- 1) criadores (RAIZ 1): válidos, e conflito de criadores por workspace
  const creatorIssuesBySubject = new Map<string, string[]>();
  const addIssue = (map: Map<string, string[]>, k: string, code: string) => { const list = map.get(k) ?? []; if (!list.includes(code)) list.push(code); map.set(k, list); };
  const validCreators: Array<{ ev: CreatorEventFact; at: Date; workspaceId: string; userId: string }> = [];
  for (const ev of facts.creatorEvents) {
    if (!nonEmpty(ev.workspaceId) || !nonEmpty(ev.userId) || !validDate(ev.at)) continue; // dado incompleto: sem efeito (limitação em `MALFORMED_CREATOR_EVENTS_IGNORED`)
    const subject = key(ev.workspaceId, ev.userId);
    const user = usersById.get(ev.userId), ws = workspacesById.get(ev.workspaceId);
    if (!user || !ws || user.tenantId !== ev.tenantId || ws.tenantId !== ev.tenantId) { addIssue(creatorIssuesBySubject, subject, "CREATOR_EVENT_REFERENCE_INCONSISTENT"); continue; }
    validCreators.push({ ev, at: ev.at, workspaceId: ev.workspaceId, userId: ev.userId });
  }
  const malformedCreatorEvents = facts.creatorEvents.filter((ev) => !nonEmpty(ev.workspaceId) || !nonEmpty(ev.userId) || !validDate(ev.at)).length;
  const creatorsByWorkspace = new Map<string, Set<string>>();
  for (const c of validCreators) { const s = creatorsByWorkspace.get(c.workspaceId) ?? new Set<string>(); s.add(c.userId); creatorsByWorkspace.set(c.workspaceId, s); }
  const conflictedCreatorWorkspaces = new Set([...creatorsByWorkspace].filter(([, users]) => users.size > 1).map(([w]) => w));

  // ---- 2) convites aceitos: integridade lógica
  const invitationIssues = new Map<string, string[]>(); // por convite
  const incompleteInvitations = new Set<string>();
  const validInvitations: ValidInvitation[] = [];
  const acceptedBySubject = new Map<string, InvitationFact[]>();
  for (const inv of facts.invitations) {
    if (!nonEmpty(inv.acceptedByUserId)) continue;
    const subject = key(inv.workspaceId, inv.acceptedByUserId);
    const list = acceptedBySubject.get(subject) ?? []; list.push(inv); acceptedBySubject.set(subject, list);
    const issues: string[] = [];
    const incomplete = !validDate(inv.createdAt) || !validDate(inv.acceptedAt) || inv.permissions === null || !nonEmpty(inv.roleKey);
    if (validDate(inv.createdAt) && validDate(inv.acceptedAt)) {
      if (inv.acceptedAt.getTime() + CLOCK_SLACK_MS < inv.createdAt.getTime()) issues.push("INVITATION_ACCEPTED_BEFORE_CREATED");
      if (validDate(inv.expiresAt) && inv.acceptedAt.getTime() > inv.expiresAt.getTime() + CLOCK_SLACK_MS) issues.push("INVITATION_ACCEPTED_AFTER_EXPIRY");
    }
    const ws = workspacesById.get(inv.workspaceId), invitee = usersById.get(inv.acceptedByUserId);
    if (!ws || ws.tenantId !== inv.tenantId) issues.push("INVITATION_WORKSPACE_TENANT_MISMATCH");
    if (invitee && invitee.tenantId !== inv.tenantId) issues.push("INVITATION_INVITEE_TENANT_MISMATCH");
    if (nonEmpty(inv.inviterUserId)) {
      if (inv.inviterUserId === inv.acceptedByUserId) issues.push("INVITATION_SELF_INVITED");
      const inviter = usersById.get(inv.inviterUserId);
      if (inviter && inviter.tenantId !== inv.tenantId) issues.push("INVITATION_INVITER_TENANT_MISMATCH");
    }
    if (issues.length) invitationIssues.set(inv.id, issues);       // contradição lógica => CONFLICTING
    else if (incomplete) incompleteInvitations.add(inv.id);         // dado incompleto => evidência inutilizável (não é prova nem conflito)
    else validInvitations.push(inv as ValidInvitation);
  }

  // ---- 3) enraizamento (recursivo, profundidade limitada): criador (mesmo workspace) → convidado de concedente já admitido ANTES do convite
  type Admitted = { depth: number; via: "creator" | "invitation"; ref: string; at: Date };
  const admitted = new Map<string, Admitted>();
  for (const c of validCreators) {
    if (conflictedCreatorWorkspaces.has(c.workspaceId)) continue; // conservador: criador ambíguo não é raiz
    const k = key(c.workspaceId, c.userId);
    const current = admitted.get(k);
    if (!current || c.at.getTime() < current.at.getTime()) admitted.set(k, { depth: 0, via: "creator", ref: c.ev.eventId, at: c.at });
  }
  const rootedInvitationsBySubject = new Map<string, ValidInvitation[]>();
  for (let depth = 1; depth <= MAX_INVITATION_CHAIN_DEPTH; depth += 1) {
    const additions: Array<[string, Admitted]> = [];
    for (const inv of validInvitations) {
      if (!nonEmpty(inv.inviterUserId)) continue;
      const inviter = admitted.get(key(inv.workspaceId, inv.inviterUserId));
      if (!inviter || inviter.depth >= depth) continue;
      if (inviter.at.getTime() > inv.createdAt.getTime()) continue; // o concedente ainda não era admitido quando emitiu o convite
      const k = key(inv.workspaceId, inv.acceptedByUserId);
      const list = rootedInvitationsBySubject.get(k) ?? [];
      if (!list.some((x) => x.id === inv.id)) { list.push(inv); rootedInvitationsBySubject.set(k, list); }
      const known = admitted.get(k);
      if (!known) additions.push([k, { depth, via: "invitation", ref: inv.id, at: inv.acceptedAt }]);
    }
    if (!additions.length) break;
    for (const [k, adm] of additions) if (!admitted.has(k)) admitted.set(k, adm);
  }

  // ---- 4) assuntos: vínculos ∪ acessos por token sem vínculo
  type Subject = { tenantId: string; workspaceId: string; userId: string; membership: MembershipFact | null };
  const subjects = new Map<string, Subject>();
  for (const m of facts.memberships) subjects.set(memberKey(m), { tenantId: m.tenantId, workspaceId: m.workspaceId, userId: m.userId, membership: m });
  for (const t of facts.tokens) { const k = memberKey(t); if (!subjects.has(k)) subjects.set(k, { tenantId: t.tenantId, workspaceId: t.workspaceId, userId: t.userId, membership: null }); }

  const membersByWorkspace = new Map<string, MembershipFact[]>();
  for (const m of facts.memberships) { const l = membersByWorkspace.get(m.workspaceId) ?? []; l.push(m); membersByWorkspace.set(m.workspaceId, l); }

  const unavailableCritical = CRITICAL_SOURCES.filter((name) => !available(name));
  const records: ProvenanceRecord[] = [];

  for (const subject of [...subjects.values()].sort((a, b) => key(a.tenantId, key(a.workspaceId, a.userId)).localeCompare(key(b.tenantId, key(b.workspaceId, b.userId))))) {
    const k = key(subject.workspaceId, subject.userId);
    const m = subject.membership;
    const reasonsA: string[] = [], evidenceA: ProvenanceEvidenceRef[] = [];
    const reasonsP: string[] = [], evidenceP: ProvenanceEvidenceRef[] = [];
    const signals: string[] = [], limitations: string[] = [];
    const conflictsA: string[] = [];

    // ---- integridade lógica (qualquer violação => CONFLICTING, conservador)
    const user = usersById.get(subject.userId);
    if (!user) limitations.push("USER_NOT_FOUND_IN_SOURCE");
    else if (user.tenantId !== subject.tenantId) conflictsA.push("USER_TENANT_DIFFERS_FROM_MEMBERSHIP_TENANT");
    const ws = workspacesById.get(subject.workspaceId);
    if (!ws) limitations.push("WORKSPACE_NOT_FOUND_IN_SOURCE");
    else if (ws.tenantId !== subject.tenantId) conflictsA.push("WORKSPACE_TENANT_DIFFERS_FROM_MEMBERSHIP_TENANT");
    for (const code of creatorIssuesBySubject.get(k) ?? []) conflictsA.push(code);
    const acceptedInvitations = acceptedBySubject.get(k) ?? [];
    for (const inv of acceptedInvitations) for (const code of invitationIssues.get(inv.id) ?? []) conflictsA.push(code);

    // ---- evidência de admissão
    const adm = admitted.get(k);
    const subjectIsCreator = validCreators.some((c) => key(c.workspaceId, c.userId) === k);
    if (subjectIsCreator && conflictedCreatorWorkspaces.has(subject.workspaceId)) conflictsA.push("MULTIPLE_CREATORS_FOR_WORKSPACE");
    const creatorEv = validCreators.find((c) => key(c.workspaceId, c.userId) === k);
    if (adm?.via === "creator" && creatorEv) { reasonsA.push("CREATOR_LEDGER_INITIAL_WORKSPACE"); evidenceA.push({ kind: "ledger.tenant.onboarded", ref: creatorEv.ev.eventId, at: iso(creatorEv.at) }); }
    const rooted = rootedInvitationsBySubject.get(k) ?? [];
    if (rooted.length) {
      const first = [...rooted].sort((a, b) => a.acceptedAt.getTime() - b.acceptedAt.getTime())[0]!;
      reasonsA.push(`INVITATION_ROOTED_DEPTH_${(admitted.get(key(first.workspaceId, first.inviterUserId ?? ""))?.depth ?? 0) + 1}`);
      for (const inv of rooted) evidenceA.push({ kind: "invitation.accepted", ref: inv.id, at: iso(inv.acceptedAt) });
    }
    const rootedIds = new Set(rooted.map((r) => r.id));
    const unrootedAccepted = acceptedInvitations.filter((inv) => !rootedIds.has(inv.id) && !invitationIssues.has(inv.id));
    for (const inv of unrootedAccepted) {
      reasonsA.push(incompleteInvitations.has(inv.id) ? "INVITATION_EVIDENCE_INCOMPLETE" : nonEmpty(inv.inviterUserId) ? "INVITATION_INVITER_NOT_ROOTED_OR_NOT_ADMITTED_BEFORE_INVITATION" : "INVITATION_INVITER_UNKNOWN");
      evidenceA.push({ kind: "invitation.accepted.unrooted", ref: inv.id, at: iso(inv.acceptedAt) });
    }
    if (acceptedInvitations.some((inv) => inv.emailMatchesCurrent === false)) signals.push("INVITATION_EMAIL_DIFFERS_FROM_CURRENT_EMAIL");

    // tenant.onboarded de OUTRO workspace do mesmo tenant: relação com o tenant, NUNCA admissão (O-1)
    const tenantCreatorElsewhere = validCreators.some((c) => c.ev.tenantId === subject.tenantId && c.userId === subject.userId && c.workspaceId !== subject.workspaceId);
    if (tenantCreatorElsewhere && !subjectIsCreator) { reasonsA.push("TENANT_CREATOR_NO_WORKSPACE_ADMISSION"); evidenceA.push({ kind: "ledger.tenant.onboarded.other_workspace", ref: validCreators.find((c) => c.userId === subject.userId && c.ev.tenantId === subject.tenantId)!.ev.eventId, at: null }); }

    // marcadores de bootstrap (G2.2): confiabilidade pela coerência com a linha do tempo do vínculo
    let creationMarker: BootstrapEventFact | null = null; let promotionMarker: BootstrapEventFact | null = null;
    for (const ev of facts.bootstrapEvents) {
      if (ev.workspaceId !== subject.workspaceId || ev.actorUserId !== subject.userId || ev.tenantId !== subject.tenantId) continue;
      if (!validDate(ev.at) || !m || !validDate(m.createdAt)) { if (!m) continue; signals.push("BOOTSTRAP_EVENT_UNUSABLE_INCOMPLETE_TIMESTAMPS"); continue; }
      const delta = ev.at.getTime() - m.createdAt.getTime();
      if (ev.observation === "membership_bootstrap") {
        if (delta < -CLOCK_SLACK_MS) { signals.push("STALE_BOOTSTRAP_EVENT_BEFORE_CURRENT_MEMBERSHIP"); continue; }
        if (delta > afterTol) { conflictsA.push("BOOTSTRAP_EVENT_AFTER_MEMBERSHIP_TIMELINE_CONFLICT"); continue; }
        creationMarker = ev;
      } else if (ev.observation === "sole_member_promotion") {
        if (delta < -CLOCK_SLACK_MS) { signals.push("STALE_PROMOTION_EVENT_BEFORE_CURRENT_MEMBERSHIP"); continue; }
        promotionMarker = ev;
      }
    }
    if (creationMarker) { reasonsA.push(`BOOTSTRAP_OBSERVED_CREATED_${norm(creationMarker.roleSource) || "unknown"}`.toUpperCase()); evidenceA.push({ kind: "ledger.workspace.bootstrap.shadow_observation", ref: creationMarker.eventId, at: iso(creationMarker.at) }); }
    if (activatorSubjects.has(k)) { reasonsA.push("CORROBORATION_PRODUCT_ACTIVATOR"); }
    if (requesterSubjects.has(k)) { reasonsA.push("CORROBORATION_ACCESS_REQUESTER"); }

    const legacy = legacyBySubject.get(k);
    if (legacy) { reasonsA.push("LEGACY_ASSIGNMENT_PROVENANCE_UNDOCUMENTED"); limitations.push("LEGACY_ASSIGNMENT_HAS_NO_WRITER_OR_PROVENANCE"); }

    // reativação/sobrescrita por convite
    if (m && validDate(m.createdAt) && acceptedInvitations.some((inv) => validDate(inv.acceptedAt) && inv.acceptedAt.getTime() > m.createdAt!.getTime() + existingGrace)) signals.push("INVITATION_ACCEPTED_ON_EXISTING_MEMBERSHIP");
    if (acceptedInvitations.length > 1) signals.push("MULTIPLE_ACCEPTED_INVITATIONS");

    // ---- estado de ADMISSÃO
    const verifiedEvidence = adm !== undefined; // criador não ambíguo OU convidado de concedente enraizado (ver passo 3)
    const admissionState: ProvenanceState = conflictsA.length > 0 ? "CONFLICTING"
      : verifiedEvidence ? "VERIFIED"
      : (creationMarker || unrootedAccepted.length > 0 || tenantCreatorElsewhere || activatorSubjects.has(k) || requesterSubjects.has(k)) ? "UNVERIFIED"
      : "INSUFFICIENT_EVIDENCE";
    if (conflictsA.length) reasonsA.unshift(...sortedUnique(conflictsA));

    // ---- PRIVILÉGIO
    const role = m ? norm(m.roleKey) : "";
    const perms = m?.permissions ?? null;
    let privilegeState: PrivilegeState;
    if (!m) { privilegeState = "NOT_APPLICABLE"; reasonsP.push("NO_MEMBERSHIP"); }
    else if (admissionState === "CONFLICTING") { privilegeState = "CONFLICTING"; reasonsP.push("ADMISSION_CONFLICT"); }
    else if (!nonEmpty(m.roleKey) || perms === null) { privilegeState = "INSUFFICIENT_EVIDENCE"; reasonsP.push("MEMBERSHIP_ROLE_OR_PERMISSIONS_MALFORMED"); }
    else {
      // derivações específicas do eixo de privilégio (O-3): só valem se coincidirem com o papel ATUAL
      const derived: string[] = [];
      if (promotionMarker && norm(promotionMarker.assignedRoleKey) === role) { derived.push("AUTOMATIC_PROMOTION_OBSERVED"); evidenceP.push({ kind: "ledger.workspace.bootstrap.shadow_observation", ref: promotionMarker.eventId, at: iso(promotionMarker.at) }); }
      else if (promotionMarker) signals.push("ROLE_CHANGED_AFTER_AUTOMATIC_PROMOTION");
      if (creationMarker && norm(creationMarker.assignedRoleKey) === role && isPrivileged(role)) {
        const source = norm(creationMarker.roleSource);
        if (source === "profile_role") derived.push("PRIVILEGE_FROM_SELF_DECLARED_PROFILE_ROLE");
        else if (source === "first_member") derived.push("PRIVILEGE_FROM_FIRST_MEMBER_RULE");
        evidenceP.push({ kind: "ledger.workspace.bootstrap.shadow_observation", ref: creationMarker.eventId, at: iso(creationMarker.at) });
      }
      const grantedRoles = new Set<string>(), grantedPerms = new Set<string>();
      let permsComparable = true;
      if (admissionState === "VERIFIED") {
        if (adm?.via === "creator" && subjectIsCreator) {
          grantedRoles.add("gestor"); if (norm(ws?.name) === reservedDefault) grantedRoles.add("founder");
          grantedPerms.add(PRODUCT_ACTIVATION_PERMISSION_KEY);
          for (const r of grantedRoles) { const d = catalog.get(`${subject.workspaceId}\u0000${r}`); if (d) d.forEach((x) => grantedPerms.add(x)); else permsComparable = false; }
          evidenceP.push({ kind: "ledger.tenant.onboarded", ref: adm.ref, at: iso(adm.at) });
        }
        for (const inv of rooted) {
          grantedRoles.add(norm(inv.roleKey)); (inv.permissions ?? []).forEach((x) => grantedPerms.add(x));
          if (activatorSubjects.has(k) && migrationApprovalWorkspaces.has(subject.workspaceId)) grantedPerms.add(PRODUCT_ACTIVATION_PERMISSION_KEY);
          evidenceP.push({ kind: "invitation.accepted", ref: inv.id, at: iso(inv.acceptedAt) });
        }
        if (grantedRoles.has(role) && permsComparable && isSubset(perms, grantedPerms)) { privilegeState = "VERIFIED"; reasonsP.push("WITHIN_EVIDENCE_GRANTED_LEVEL"); }
        else if (grantedRoles.has(role) && !permsComparable) { privilegeState = "INSUFFICIENT_EVIDENCE"; reasonsP.push("ROLE_CATALOG_UNAVAILABLE_PERMISSIONS_NOT_COMPARABLE"); }
        else if (derived.length) { privilegeState = "UNVERIFIED"; reasonsP.push(...derived); }
        else { privilegeState = "CONFLICTING"; reasonsP.push("ROLE_OR_PERMISSIONS_ABOVE_EVIDENCE_GRANTED_LEVEL"); limitations.push("ROLE_CHANGES_ARE_NOT_AUDITED_ABOVE_LEVEL_MAY_BE_A_LEGITIMATE_CHANGE"); }
      } else if (legacy) {
        if (norm(legacy.roleKey) === role) { privilegeState = "INSUFFICIENT_EVIDENCE"; reasonsP.push("LEGACY_ASSIGNMENT_PROVENANCE_UNDOCUMENTED"); }
        else { privilegeState = "CONFLICTING"; reasonsP.push("LEGACY_ASSIGNMENT_ROLE_DIFFERS_FROM_MEMBERSHIP_ROLE"); }
      } else if (isPrivileged(role)) { privilegeState = "UNVERIFIED"; reasonsP.push(...(derived.length ? derived : ["PRIVILEGED_ROLE_WITHOUT_EVIDENCE"])); }
      else { privilegeState = "INSUFFICIENT_EVIDENCE"; reasonsP.push("NO_EVIDENCE_FOR_ROLE"); }
    }

    // ---- sinais de suspeita (nunca decidem sozinhos)
    if (!m) signals.push("TOKEN_ACCESS_WITHOUT_MEMBERSHIP");
    if (m && norm(m.status) !== "active") signals.push("MEMBERSHIP_NOT_ACTIVE");
    if (m && admissionState !== "VERIFIED") {
      const peers = membersByWorkspace.get(subject.workspaceId) ?? [];
      const earliest = peers.map((p) => p.createdAt).filter(validDate).sort((a, b) => a.getTime() - b.getTime())[0];
      if (validDate(m.createdAt) && earliest && m.createdAt.getTime() === earliest.getTime() && role === "gestor") signals.push("FIRST_MEMBER_GESTOR_SUSPECT");
      if (isPrivileged(role) && peers.filter((p) => norm(p.status) === "active").length === 1) signals.push("SOLE_ACTIVE_MEMBER_PRIVILEGED_SUSPECT");
      if (isPrivileged(role) && profileByUser.get(subject.userId) === role) signals.push("PROFILE_ROLE_EQUALS_PRIVILEGED_ROLE");
    }

    // ---- limitações estruturais e de fonte
    if (reasonsA.includes("CREATOR_LEDGER_INITIAL_WORKSPACE")) limitations.push("CREATOR_EVENT_PROVES_ACT_NOT_CIVIL_IDENTITY_OR_CORPORATE_OWNERSHIP");
    if (rooted.length) limitations.push("INVITER_HISTORICAL_PERMISSIONS_UNVERIFIABLE");
    limitations.push("LEDGER_HAS_NO_CRYPTOGRAPHIC_CHAINING_LOGICAL_CONSISTENCY_ONLY");
    for (const name of ["ledger_creator", "invitations", "ledger_bootstrap", "legacy_assignments", "installations", "approvals", "role_catalog", "profiles"] as ProvenanceSourceName[]) {
      if (!available(name)) limitations.push(`${src[name] === "error" ? "SOURCE_ERROR" : "SOURCE_UNAVAILABLE"}:${name}`);
    }
    if (malformedCreatorEvents) limitations.push("MALFORMED_CREATOR_EVENTS_IGNORED");

    const reviewSignals = ["INVITATION_ACCEPTED_ON_EXISTING_MEMBERSHIP", "INVITATION_EMAIL_DIFFERS_FROM_CURRENT_EMAIL", "MEMBERSHIP_NOT_ACTIVE", "TOKEN_ACCESS_WITHOUT_MEMBERSHIP", "MULTIPLE_ACCEPTED_INVITATIONS"];
    const clean = admissionState === "VERIFIED" && privilegeState === "VERIFIED" && m !== null && norm(m.status) === "active"
      && !signals.some((s) => reviewSignals.includes(s)) && unavailableCritical.length === 0;

    records.push({
      tenantId: subject.tenantId, workspaceId: subject.workspaceId, userId: subject.userId, hasMembership: m !== null,
      membership: m ? { roleKey: m.roleKey, status: m.status, permissionsCount: m.permissions ? m.permissions.length : null, createdAt: iso(m.createdAt), updatedAt: iso(m.updatedAt) } : null,
      admission: { state: admissionState, reasons: sortedUnique(reasonsA), evidence: dedupeEvidence(evidenceA) },
      privilege: { state: privilegeState, reasons: sortedUnique(reasonsP), evidence: dedupeEvidence(evidenceP) },
      signals: sortedUnique(signals), limitations: sortedUnique(limitations), needsHumanReview: !clean,
      classificationIsNotAuthorization: true, classifierVersion: PROVENANCE_CLASSIFIER_VERSION,
    });
  }

  return { classifierVersion: PROVENANCE_CLASSIFIER_VERSION, classifiedAt: now.toISOString(), sources: { ...src }, degraded, records };
}

function dedupeEvidence(items: ProvenanceEvidenceRef[]): ProvenanceEvidenceRef[] {
  const seen = new Set<string>();
  return items.filter((e) => { const id = `${e.kind}\u0000${e.ref}`; if (seen.has(id)) return false; seen.add(id); return true; })
    .sort((a, b) => `${a.kind}${a.ref}`.localeCompare(`${b.kind}${b.ref}`));
}

// ------------------------------------------------------------------------------------------------ agregados (sem identificadores)
export type ProvenanceSummary = {
  classifierVersion: typeof PROVENANCE_CLASSIFIER_VERSION; degraded: boolean; sources: Record<ProvenanceSourceName, ProvenanceSourceStatus>;
  totals: { subjects: number; withMembership: number; tokenOnly: number; tenants: number; workspaces: number; needsHumanReview: number };
  admission: Record<ProvenanceState, number>; privilege: Record<PrivilegeState, number>;
  byAdmissionAndPrivilege: Record<string, number>;
  reasons: Record<string, number>; signals: Record<string, number>; limitations: Record<string, number>;
  /** Workspaces SEM nenhuma pessoa elegível a aprovar regularização (admissão e privilégio VERIFIED, vínculo ativo, gestão de membros). */
  workspacesWithoutEligibleApprover: number;
};

export function summarizeProvenance(result: ProvenanceClassification, facts?: Pick<ProvenanceFacts, "memberships">): ProvenanceSummary {
  const count = (target: Record<string, number>, k: string) => { target[k] = (target[k] ?? 0) + 1; };
  const admission: Record<ProvenanceState, number> = { VERIFIED: 0, UNVERIFIED: 0, CONFLICTING: 0, INSUFFICIENT_EVIDENCE: 0 };
  const privilege: Record<PrivilegeState, number> = { VERIFIED: 0, UNVERIFIED: 0, CONFLICTING: 0, INSUFFICIENT_EVIDENCE: 0, NOT_APPLICABLE: 0 };
  const byBoth: Record<string, number> = {}, reasons: Record<string, number> = {}, signals: Record<string, number> = {}, limitations: Record<string, number> = {};
  const workspaces = new Set<string>(), tenants = new Set<string>(), withApprover = new Set<string>();
  const perms = new Map<string, string[] | null>((facts?.memberships ?? []).map((m) => [key(m.workspaceId, m.userId), m.permissions]));
  for (const r of result.records) {
    admission[r.admission.state] += 1; privilege[r.privilege.state] += 1; count(byBoth, `${r.admission.state}/${r.privilege.state}`);
    r.admission.reasons.forEach((x) => count(reasons, x)); r.privilege.reasons.forEach((x) => count(reasons, `privilege:${x}`));
    r.signals.forEach((x) => count(signals, x)); r.limitations.forEach((x) => count(limitations, x));
    workspaces.add(r.workspaceId); tenants.add(r.tenantId);
    const p = perms.get(key(r.workspaceId, r.userId));
    if (r.admission.state === "VERIFIED" && r.privilege.state === "VERIFIED" && norm(r.membership?.status) === "active" && p?.includes(MANAGE_MEMBERS_PERMISSION_KEY)) withApprover.add(r.workspaceId);
  }
  return {
    classifierVersion: result.classifierVersion, degraded: result.degraded, sources: result.sources,
    totals: { subjects: result.records.length, withMembership: result.records.filter((r) => r.hasMembership).length, tokenOnly: result.records.filter((r) => !r.hasMembership).length, tenants: tenants.size, workspaces: workspaces.size, needsHumanReview: result.records.filter((r) => r.needsHumanReview).length },
    admission, privilege, byAdmissionAndPrivilege: byBoth, reasons, signals, limitations,
    workspacesWithoutEligibleApprover: [...workspaces].filter((w) => !withApprover.has(w)).length,
  };
}
