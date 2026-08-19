<?php
session_start();

if (empty($_SESSION['user_id'])) {
    // require login
    header('Location: ../pages/login.php');
    exit;
}

$cfg = require __DIR__ . '/../php/config.php';
$client = $cfg['github_client_id'] ?? '';
$secret = $cfg['github_client_secret'] ?? '';
$redirect = $cfg['github_redirect_uri'] ?? '';

if (!$client || !$secret || !$redirect) {
    die('GitHub OAuth not configured. Set php/config.php.');
}

if (empty($_GET['code']) || empty($_GET['state']) || $_GET['state'] !== ($_SESSION['github_oauth_state'] ?? '')) {
    die('Invalid OAuth state or missing code.');
}

$code = $_GET['code'];

// Exchange code for access token
$ch = curl_init('https://github.com/login/oauth/access_token');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
    'client_id' => $client,
    'client_secret' => $secret,
    'code' => $code,
    'redirect_uri' => $redirect,
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);
$resp = curl_exec($ch);
if ($resp === false) {
    die('Curl error: ' . curl_error($ch));
}
curl_close($ch);

$obj = json_decode($resp, true);
if (empty($obj['access_token'])) {
    die('No access token received: ' . htmlspecialchars($resp));
}
$token = $obj['access_token'];

// Fetch user info
$ch = curl_init('https://api.github.com/user');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: token ' . $token,
    'User-Agent: Orbitfolio-App',
    'Accept: application/vnd.github.v3+json'
]);
$userResp = curl_exec($ch);
if ($userResp === false) {
    die('Curl error fetching user: ' . curl_error($ch));
}
curl_close($ch);

$uobj = json_decode($userResp, true);
$login = $uobj['login'] ?? null;
if (!$login) {
    die('Unable to fetch GitHub login.');
}

// Save token and login to DB
$dbPath = __DIR__ . '/../php/db.php';
if (!file_exists($dbPath)) die('DB helper not found.');
$pdo = require $dbPath;
$stmt = $pdo->prepare('UPDATE usuario SET github_token = ?, github_login = ? WHERE id_user = ?');
$stmt->execute([$token, $login, $_SESSION['user_id']]);

// Clear state
unset($_SESSION['github_oauth_state']);

header('Location: ./portfolio.php');
exit;
