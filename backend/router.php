<?php
// Development server: only dist assets and the JSON entry point are exposed.
$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH) ?: "/";
if (str_starts_with($path, "/api/")) {
    require __DIR__ . "/public/index.php";
    return;
}
$dist = realpath(__DIR__ . "/../dist");
$file = $dist ? realpath($dist . "/" . ltrim(rawurldecode($path), "/")) : false;
if (
    $file &&
    str_starts_with($file, $dist . DIRECTORY_SEPARATOR) &&
    is_file($file)
) {
    $mime = [
        "js" => "text/javascript",
        "css" => "text/css",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "webp" => "image/webp",
        "html" => "text/html",
    ];
    $ext = pathinfo($file, PATHINFO_EXTENSION);
    if (!isset($mime[$ext])) {
        http_response_code(404);
        return;
    }
    header("Content-Type: " . $mime[$ext]);
    readfile($file);
    return;
}
if (!$dist) {
    http_response_code(503);
    echo "Execute npm run build.";
    return;
}
header("Content-Type: text/html; charset=utf-8");
readfile($dist . "/index.html");
