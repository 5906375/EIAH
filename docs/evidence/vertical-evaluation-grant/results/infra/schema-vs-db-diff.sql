-- RenameForeignKey
ALTER TABLE "financial_authority_designation" RENAME CONSTRAINT "financial_authority_designation_beneficiary_fkey" TO "financial_authority_designation_beneficiary_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "financial_authority_designation" RENAME CONSTRAINT "financial_authority_designation_tenant_fkey" TO "financial_authority_designation_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "governed_case_revisions" RENAME CONSTRAINT "governed_case_revisions_case_scope_fkey" TO "governed_case_revisions_case_id_tenant_id_workspace_id_fkey";

-- RenameForeignKey
ALTER TABLE "run_publish_outbox" RENAME CONSTRAINT "run_publish_outbox_scope_fkey" TO "run_publish_outbox_run_id_tenant_id_workspace_id_command_i_fkey";

-- RenameForeignKey
ALTER TABLE "run_state_transitions" RENAME CONSTRAINT "run_state_transitions_scope_fkey" TO "run_state_transitions_run_id_tenant_id_workspace_id_fkey";

