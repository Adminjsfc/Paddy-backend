ALTER TABLE stock_ledger ADD COLUMN stock_id BIGINT UNSIGNED NULL AFTER id;
UPDATE stock_ledger l JOIN stocks s
  ON s.facility_id=l.facility_id AND s.season_id=l.season_id
  AND s.scheme_code=l.scheme_code AND s.commodity_code=l.commodity_code
  SET l.stock_id=s.id;
ALTER TABLE stock_ledger
  MODIFY COLUMN stock_id BIGINT UNSIGNED NOT NULL,
  ADD INDEX ix_ledger_stock_posting(stock_id,id),
  ADD CONSTRAINT fk_stock_ledger_stock FOREIGN KEY(stock_id) REFERENCES stocks(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;
