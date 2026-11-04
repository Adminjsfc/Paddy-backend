ALTER TABLE procurement
 ADD COLUMN miller_id INT UNSIGNED NULL,
 ADD CONSTRAINT fk_procurement_miller FOREIGN KEY (miller_id) REFERENCES facilities(id),
 ADD INDEX idx_procurement_miller (miller_id,facility_id,season_id);

-- Only existing non-cancelled dispatched shipments provide allocation evidence.
-- Unassigned or conflicting legacy ROs remain NULL for operator correction.
UPDATE procurement p JOIN (
 SELECT l.procurement_id,MIN(s.miller_id) miller_id
 FROM shipment_lots l JOIN shipments s ON s.id=l.shipment_id
 JOIN facilities f ON f.id=s.miller_id AND f.kind='MILLER'
 WHERE s.leg='PADDY' AND s.status IN ('DISPATCHED','IN_TRANSIT','ARRIVED','DELIVERED')
 GROUP BY l.procurement_id HAVING COUNT(DISTINCT s.miller_id)=1
) allocation ON allocation.procurement_id=p.id
 SET p.miller_id=allocation.miller_id;

ALTER TABLE procurement_corrections
 ADD COLUMN old_miller_id INT UNSIGNED NULL,
 ADD COLUMN new_miller_id INT UNSIGNED NULL;
