-- All operational block references were removed by migration 068.
-- Retain retired_block_locations as historical data only.
DROP TABLE IF EXISTS tbl_block_master;
