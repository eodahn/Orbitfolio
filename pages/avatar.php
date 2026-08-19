<?php
// Serve profile image from DB or a simple SVG placeholder
session_start();

$dbPath = __DIR__ . '/../php/db.php';
if (!file_exists($dbPath)) {
    http_response_code(500);
    exit('DB helper not found.');
}
$pdo = require $dbPath;

$user_id = null;
if (!empty($_GET['user_id'])) $user_id = (int)$_GET['user_id'];
elseif (!empty($_SESSION['user_id'])) $user_id = (int)$_SESSION['user_id'];

if ($user_id) {
    $stmt = $pdo->prepare('SELECT pfp FROM usuario WHERE id_user = ?');
    $stmt->execute([$user_id]);
    $row = $stmt->fetch();
    if ($row && $row['pfp']) {
        $data = $row['pfp'];
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->buffer($data) ?: 'image/jpeg';
        header('Content-Type: ' . $mime);
        echo $data;
        exit;
    }
}

// default SVG placeholder
header('Content-Type: image/svg+xml');
echo '<?xml version="1.0" encoding="UTF-8"?>\n';
?>
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <rect width="100%" height="100%" fill="#e6eef8"/>
  <circle cx="60" cy="40" r="28" fill="#cfe3fb"/>
  <rect x="18" y="78" width="84" height="22" rx="6" fill="#cfe3fb"/>
</svg>
