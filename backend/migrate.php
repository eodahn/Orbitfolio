<?php
declare(strict_types=1);
if (PHP_SAPI !== "cli") {
    http_response_code(404);
    exit();
}
require __DIR__ . "/php/db.php";
// Preserve back1 entities, IDs, portfolios, projects, competencies and comments.
// Normalize the original script's "auto increment" spelling; never execute CREATE DATABASE/USE.
$sql = file_get_contents(__DIR__ . "/database/back1.sql");
$sql = preg_replace("/auto increment/i", "AUTO_INCREMENT", $sql);
preg_match_all("/create table\s+\w+\s*\(.*?\);/si", $sql, $matches);
foreach ($matches[0] as $ddl) {
    database()->exec(
        preg_replace("/create table/i", "CREATE TABLE IF NOT EXISTS", $ddl, 1),
    );
}
function column(string $table, string $name, string $definition): void
{
    if (
        !one(
            "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
            [$table, $name],
        )
    ) {
        database()->exec("ALTER TABLE `$table` ADD COLUMN `$name` $definition");
    }
}
foreach (
    [
        "github_token" => "TEXT NULL",
        "github_login" => "VARCHAR(100) NULL",
        "username" => "VARCHAR(64) NULL",
        "avatar_url" => "VARCHAR(2048) NOT NULL DEFAULT ''",
    ]
    as $name => $type
) {
    column("usuario", $name, $type);
}
foreach (
    [
        "github_repo" => "VARCHAR(255) NULL",
        "colaboradores" => "TEXT NULL",
        "imagem_previa" => "VARCHAR(255) NULL",
    ]
    as $name => $type
) {
    column("projeto", $name, $type);
}
database()->exec(
    "ALTER TABLE usuario MODIFY nome VARCHAR(80) NOT NULL, MODIFY email VARCHAR(254) NOT NULL, MODIFY senha VARCHAR(300) NOT NULL, MODIFY descricao TEXT NULL",
);
database()->exec(
    "ALTER TABLE projeto MODIFY nome VARCHAR(100) NOT NULL, MODIFY descricao TEXT NOT NULL",
);
query(
    "UPDATE usuario SET username=CONCAT('viajante-',id_user) WHERE username IS NULL OR username=''",
);
if (
    !one(
        "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuario' AND INDEX_NAME='orbit_username'",
    )
) {
    database()->exec("CREATE UNIQUE INDEX orbit_username ON usuario(username)");
}
if (
    !one(
        "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuario' AND INDEX_NAME='orbit_email'",
    )
) {
    database()->exec("CREATE UNIQUE INDEX orbit_email ON usuario(email)");
}
foreach (
    [
        "usuario" => "id_user",
        "portfolio" => "id_portfolio",
        "projeto" => "id_projeto",
    ]
    as $table => $key
) {
    $info = one(
        "SELECT EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
        [$table, $key],
    );
    if (!str_contains($info["EXTRA"], "auto_increment")) {
        database()->exec(
            "ALTER TABLE `$table` MODIFY `$key` INT NOT NULL AUTO_INCREMENT",
        );
    }
}
// Additive companion tables extend the original backend without replacing its data.
foreach (
    [
        "CREATE TABLE IF NOT EXISTS orbit_project (project_id INT PRIMARY KEY, metadata LONGTEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(project_id) REFERENCES projeto(id_projeto) ON DELETE CASCADE)",
        "CREATE TABLE IF NOT EXISTS orbit_follow (follower_id INT NOT NULL, followed_id INT NOT NULL, PRIMARY KEY(follower_id,followed_id), FOREIGN KEY(follower_id) REFERENCES usuario(id_user) ON DELETE CASCADE, FOREIGN KEY(followed_id) REFERENCES usuario(id_user) ON DELETE CASCADE)",
        "CREATE TABLE IF NOT EXISTS orbit_privacy (user_id INT NOT NULL, category VARCHAR(20) NOT NULL, visibility VARCHAR(10) NOT NULL, PRIMARY KEY(user_id,category), FOREIGN KEY(user_id) REFERENCES usuario(id_user) ON DELETE CASCADE)",
        "CREATE TABLE IF NOT EXISTS orbit_import (id VARCHAR(64) PRIMARY KEY, user_id INT NOT NULL, metadata LONGTEXT NOT NULL, expires_at BIGINT NOT NULL, FOREIGN KEY(user_id) REFERENCES usuario(id_user) ON DELETE CASCADE)",
        "CREATE TABLE IF NOT EXISTS orbit_github (user_id INT PRIMARY KEY, github_user_id BIGINT NOT NULL, login VARCHAR(100) NOT NULL, encrypted_token TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES usuario(id_user) ON DELETE CASCADE)",
    ]
    as $ddl
) {
    database()->exec($ddl);
}
// Existing favorites/likes may have non-auto IDs and duplicates; preserve those rows.
// Serialize writes with parent-row locks and assign IDs under a DB advisory lock in the API.
echo "back1 schema and additive Orbitfolio extensions ready.\n";
require_once __DIR__ . "/php/core.php";
lockWrite(function () {
    foreach (projectRows() as $p) {
        $meta = projectMeta($p);
        if (!isset($meta["orbit"])) {
            $meta["orbit"] = newOrbit((float) ($meta["sizeBytes"] ?? 0));
            query(
                "INSERT INTO orbit_project(project_id,metadata) VALUES(?,?) ON DUPLICATE KEY UPDATE metadata=VALUES(metadata)",
                [$p["id_projeto"], json_encode($meta, JSON_THROW_ON_ERROR)],
            );
        }
    }
});

require __DIR__ . "/database/002_github_identity.php";
