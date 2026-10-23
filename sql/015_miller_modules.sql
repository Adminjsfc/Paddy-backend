CREATE TABLE module_permissions (
 role VARCHAR(30) NOT NULL,
 module_key VARCHAR(40) NOT NULL,
 can_view BOOLEAN NOT NULL DEFAULT FALSE,
 can_add BOOLEAN NOT NULL DEFAULT FALSE,
 can_edit BOOLEAN NOT NULL DEFAULT FALSE,
 updated_by INT UNSIGNED NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (role,module_key),
 FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB;

INSERT INTO module_permissions (role,module_key,can_view,can_add,can_edit) VALUES
 ('MILLER','dashboard',1,0,0),
 ('MILLER','transporters',1,1,1),
 ('MILLER','vehicles',1,1,1),
 ('MILLER','gps-devices',1,1,1),
 ('MILLER','stocks',1,0,0),
 ('MILLER','ledger',1,0,0),
 ('MILLER','reconciliation',1,0,0);
