<?php
session_start();

$cfg = require __DIR__ . '/../php/config.php';
$client = $cfg['github_client_id'] ?? '';
$redirect = $cfg['github_redirect_uri'] ?? '';
if (!$client || !$redirect) {
    die('GitHub OAuth not configured. Set php/config.php.');
}

$state = bin2hex(random_bytes(8));
$_SESSION['github_oauth_state'] = $state;

$scope = urlencode('repo read:user');
$url = "https://github.com/login/oauth/authorize?client_id={$client}&redirect_uri=" . urlencode($redirect) . "&scope={$scope}&state={$state}";
header('Location: ' . $url);
exit;
