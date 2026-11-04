ALTER TABLE procurement ADD UNIQUE KEY uq_procurement_ro_no (ro_no);
ALTER TABLE cmr_orders ADD UNIQUE KEY uq_cmr_order_no (order_no);
