ALTER TABLE procurement
 ADD COLUMN district_id INT NULL,
 ADD INDEX idx_procurement_district (district_id);

UPDATE procurement p JOIN facilities f ON f.id=p.facility_id
 SET p.district_id=f.district_id;
