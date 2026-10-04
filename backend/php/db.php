<?php
declare(strict_types=1);
// PDO persistence adapted from back1/php/db.php. Schema changes run only via migrate.php.
function database(): PDO
{
    static $pdo;
    if (!$pdo) {
        $host = getenv("DB_HOST") ?: "127.0.0.1";
        $name = getenv("DB_NAME") ?: "orbitfolio";
        $port = getenv("DB_PORT") ?: "3306";
        $socket = getenv("DB_SOCKET");
        $dsn = $socket
            ? "mysql:unix_socket=$socket;dbname=$name;charset=utf8mb4"
            : "mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        if ($ca = getenv("DB_SSL_CA")) {
            $options[PDO::MYSQL_ATTR_SSL_CA] = $ca;
            $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
        }
        $pdo = new PDO(
            $dsn,
            getenv("DB_USER") ?: "orbitfolio",
            getenv("DB_PASSWORD") ?: "",
            $options,
        );
    }
    return $pdo;
}
function query(string $sql, array $params = []): PDOStatement
{
    $s = database()->prepare($sql);
    $s->execute($params);
    return $s;
}
function one(string $sql, array $params = []): ?array
{
    return query($sql, $params)->fetch() ?: null;
}
function rows(string $sql, array $params = []): array
{
    return query($sql, $params)->fetchAll();
}
