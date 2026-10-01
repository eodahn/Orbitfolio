<?php
declare(strict_types=1);
ini_set("display_errors", "0");
ini_set("log_errors", "1");
require __DIR__ . "/../php/api.php";
try {
    $path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH) ?: "/";
    $method = $_SERVER["REQUEST_METHOD"];
    if (!str_starts_with($path, "/api/")) {
        http_response_code(404);
        exit();
    }
    $origin = rtrim(getenv("APP_ORIGIN") ?: "", "/");
    if (in_array($method, ["POST", "PATCH", "DELETE", "PUT"], true)) {
        if (($_SERVER["HTTP_SEC_FETCH_SITE"] ?? "") === "cross-site") {
            fail(403, "Origem não permitida.");
        }
        if (
            isset($_SERVER["HTTP_ORIGIN"]) &&
            (!$origin || $_SERVER["HTTP_ORIGIN"] !== $origin)
        ) {
            fail(403, "Origem não permitida.");
        }
    }
    session_name("orbitfolio_php");
    if (
        !session_start([
            "use_strict_mode" => true,
            "use_only_cookies" => true,
            "cookie_httponly" => true,
            "cookie_samesite" => "Lax",
            "cookie_secure" => str_starts_with($origin, "https://"),
            "cookie_path" => "/",
            "gc_maxlifetime" => 2592000,
        ])
    ) {
        fail(503, "Não foi possível iniciar sua sessão.");
    }
    api($path, $method);
} catch (ApiError $e) {
    reply(["error" => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log("Orbitfolio backend failure: " . get_class($e));
    reply(
        [
            "error" =>
                "Falha interna. Verifique a conexão e as migrações do backend.",
        ],
        500,
    );
}
