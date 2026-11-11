-- Existing values are UTC. Preserve the instant and let MySQL display session time.
SET time_zone = '+00:00';
ALTER TABLE users
  MODIFY COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY COLUMN updated_at TIMESTAMP NULL DEFAULT NULL;
