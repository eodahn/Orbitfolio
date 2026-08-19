<?php
session_start();
?>
<!doctype html>
<html lang="pt-BR">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Início - Placeholder</title>
	<style>
		body{font-family:Arial, sans-serif;background:#eef2f5;margin:0;padding:20px}
		.container{max-width:900px;margin:40px auto;background:#fff;padding:24px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.06)}
		header{display:flex;justify-content:space-between;align-items:center}
		a{color:#0366d6;text-decoration:none}
	</style>
</head>
<body>
<div class="container">
	<header style="display:flex;align-items:center;justify-content:space-between">
		<div style="display:flex;align-items:center;gap:12px">
			<?php if (!empty($_SESSION['user_id'])): ?>
				<a href="pages/profile.php" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit">
					<img src="pages/avatar.php?user_id=<?php echo (int)$_SESSION['user_id'] ?>" alt="avatar" style="width:56px;height:56px;border-radius:8px;object-fit:cover;border:1px solid #ddd">
					<div>
						<div style="font-weight:600"><?php echo htmlspecialchars($_SESSION['user_nome']) ?></div>
						<div style="font-size:13px;margin-top:4px"><a href="pages/portfolio.php">Meu Portfólio</a></div>
					</div>
				</a>
			<?php else: ?>
				<h1 style="margin:0">Orbitfolio - Placeholder</h1>
			<?php endif; ?>
		</div>

		<div>
			<?php if (!empty($_SESSION['user_nome'])): ?>
				<a href="pages/login.php?action=logout">Sair</a>
			<?php else: ?>
				<a href="pages/login.php">Entrar / Cadastrar</a>
			<?php endif; ?>
		</div>
	</header>

	<main>
		<?php if (!empty($_SESSION['user_nome'])): ?>
			<h2>Bem-vindo, <?php echo htmlspecialchars($_SESSION['user_nome']) ?>!</h2>
			<p>Esta é uma interface placeholder — você está logado.</p>
		<?php else: ?>
			<h2>Bem-vindo ao Orbitfolio</h2>
			<p>Interface placeholder. Faça login para ver sua área pessoal.</p>
		<?php endif; ?>

		<section>
			<h3>Funcionalidades (placeholder)</h3>
			<ul>
				<li>Perfis de usuário</li>
				<li>Portfólios</li>
				<li>Projetos e competências</li>
			</ul>
		</section>
	</main>
</div>
</body>
</html>
