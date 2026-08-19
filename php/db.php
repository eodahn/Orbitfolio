<?php
// Simple PDO connection for local XAMPP setup
// Adjust credentials if needed
$DB_HOST = '127.0.0.1';
$DB_NAME = 'orbitfolio';
$DB_USER = 'root';
$DB_PASS = '';

try {
    $pdo = new PDO("mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4", $DB_USER, $DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    // Try to make the senha column large enough for password_hash
    try {
        $pdo->exec("ALTER TABLE usuario MODIFY senha VARCHAR(255)");
    } catch (Exception $e) {
        // ignore if table doesn't exist or mod not permitted
    }
    // Try to make id_user auto increment if not set
    try {
        $pdo->exec("ALTER TABLE usuario MODIFY id_user INT NOT NULL AUTO_INCREMENT");
    } catch (Exception $e) {
        // ignore
    }
    // Add columns for GitHub integration if missing
    try {
        $pdo->exec("ALTER TABLE usuario ADD COLUMN IF NOT EXISTS github_token TEXT");
        $pdo->exec("ALTER TABLE usuario ADD COLUMN IF NOT EXISTS github_login VARCHAR(100)");
    } catch (Exception $e) {
        // ignore
    }
    // Try to make id_portfolio and id_projeto auto increment if possible
    try {
        $pdo->exec("ALTER TABLE portfolio MODIFY id_portfolio INT NOT NULL AUTO_INCREMENT");
    } catch (Exception $e) {
        // ignore
    }
    try {
        $pdo->exec("ALTER TABLE projeto MODIFY id_projeto INT NOT NULL AUTO_INCREMENT");
    } catch (Exception $e) {
        // ignore
    }
} catch (Exception $e) {
    // In production you'd log this
    die('DB connection failed: ' . $e->getMessage());
}

return $pdo;
