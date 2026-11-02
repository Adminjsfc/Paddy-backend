-- Current references remain unique in procurement.external_ref.
-- Historical aliases and audit records remain in procurement_corrections.
ALTER TABLE procurement_corrections
 ADD INDEX idx_correction_old_reference(old_external_ref,procurement_id),
 ADD INDEX idx_correction_new_reference(new_external_ref,procurement_id);
DROP TABLE IF EXISTS procurement_references;
