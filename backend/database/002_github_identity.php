<?php
// Additive, idempotent migration; invoked by backend/migrate.php after base tables exist.
column("orbit_github", "github_name", "VARCHAR(255) NULL");
column("orbit_github", "github_avatar_url", "VARCHAR(2048) NULL");
column("orbit_github", "github_profile_url", "VARCHAR(2048) NULL");
