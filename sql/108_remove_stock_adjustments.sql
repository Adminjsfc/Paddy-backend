ALTER TABLE stock_ledger ADD COLUMN remarks VARCHAR(500) NULL;
-- Restore any missing manual ledger history without changing the stock balance.
INSERT INTO stock_ledger (
  stock_id,facility_id,season_id,scheme_code,commodity_code,
  on_hand_delta_kg,reserved_delta_kg,reference_type,reference_id,
  remarks,created_at,created_by,created_by_actor
)
SELECT a.stock_id,s.facility_id,s.season_id,s.scheme_code,s.commodity_code,
  a.delta_kg,0,IF(a.old_quantity_kg=0,'STOCK_ADD','STOCK_UPDATE'),a.id,
  a.remarks,a.created_at,a.created_by,a.created_by_actor
FROM stock_adjustments a JOIN stocks s ON s.id=a.stock_id
WHERE NOT EXISTS (
  SELECT 1 FROM stock_ledger l WHERE l.reference_id=a.id
    AND l.reference_type IN ('STOCK_ADD','STOCK_UPDATE')
);
-- Keep manual entry remarks and replace adjustment IDs with the actual stock ID.
UPDATE stock_ledger l JOIN stock_adjustments a ON a.id=l.reference_id
  AND l.reference_type IN ('STOCK_ADD','STOCK_UPDATE')
SET l.remarks=a.remarks,l.reference_id=a.stock_id;
DROP TABLE stock_adjustments;
