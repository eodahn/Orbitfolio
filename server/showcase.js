import { ensureOrbits } from "./project-data.js";
export async function seedShowcase(db) {
  return db.transaction(async (tx) => {
    if (tx.dialect === "postgres")
      await tx.exec("SELECT pg_advisory_xact_lock(7430192602)");
    await tx
      .prepare(
        "INSERT INTO users(id,name,username,email,password_hash,bio,is_demo) VALUES(?,?,?,?,NULL,?,1) ON CONFLICT DO NOTHING",
      )
      .run(
        "demo-bruno-simon",
        "Bruno Simon",
        "bruno-simon",
        "bruno-simon@demo.orbitfolio.invalid",
        "Perfil demonstrativo, sem vínculo com o criador. Creative developer especializado em experiências WebGL e interfaces 3D interativas.",
      );
    const user = await tx
      .prepare("SELECT * FROM users WHERE lower(username)=?")
      .get("bruno-simon");
    // Never attach a demo project to an existing real account or rename that account.
    if (!user?.is_demo || user.id !== "demo-bruno-simon")
      return { skipped: true };
    await tx
      .prepare(
        "INSERT INTO projects(id,owner_id,name,description,description_text,github_url,repository_url,demo_url,languages_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",
      )
      .run(
        "demo-folio-2019",
        user.id,
        "Folio 2019",
        "Portfólio interativo em 3D criado com tecnologias web e WebGL.",
        "Portfólio interativo em 3D criado com tecnologias web e WebGL.",
        "https://github.com/brunosimon/folio-2019",
        "https://github.com/brunosimon/folio-2019",
        "https://2019.bruno-simon.com",
        "{}",
      );
    await ensureOrbits(tx);
    return { seeded: true };
  });
}
