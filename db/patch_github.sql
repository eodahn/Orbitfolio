-- Patch: Add GitHub integration columns and adjust auto-increment
-- Run this file against the 'orbitfolio' database (phpMyAdmin or mysql CLI)

USE orbitfolio;

-- ensure senha can hold password_hash values
ALTER TABLE usuario MODIFY senha VARCHAR(255);

-- add columns for GitHub integration (MySQL 8+ supports IF NOT EXISTS)
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS github_token TEXT;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS github_login VARCHAR(100);

-- ensure primary keys are set to auto-increment where appropriate
-- Be careful: if a column is part of a composite key, adjust accordingly
ALTER TABLE usuario MODIFY id_user INT NOT NULL AUTO_INCREMENT PRIMARY KEY;
ALTER TABLE portfolio MODIFY id_portfolio INT NOT NULL AUTO_INCREMENT PRIMARY KEY;
ALTER TABLE projeto MODIFY id_projeto INT NOT NULL AUTO_INCREMENT PRIMARY KEY;

-- Notes:
-- 1) Run this as a user with ALTER privileges (e.g., root in phpMyAdmin).
-- 2) If any ALTER fails, inspect the table structure with
--    SHOW CREATE TABLE usuario; SHOW CREATE TABLE portfolio; SHOW CREATE TABLE projeto;
-- 3) If your MySQL version does not support 'IF NOT EXISTS' for ADD COLUMN,
--    remove 'IF NOT EXISTS' and run carefully after verifying the column absence.
