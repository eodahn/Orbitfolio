import { safeHttpUrl } from '../shared/project-links.js';
import { ensureOrbits } from './project-data.js';
import records from './showcase-data.json' with { type: 'json' };
export const SHOWCASE = Object.freeze(records);
/** Public references, not claimed author accounts. No password, OAuth identity or token. */
export async function seedShowcase(db) {
  return db.transaction(async tx => {
    if (tx.dialect === 'postgres') await tx.exec('SELECT pg_advisory_xact_lock(7430192602)');
    const result={seeded:[],skipped:[]};
    for(const record of SHOWCASE) {
      await tx.prepare('INSERT INTO users(id,name,username,email,password_hash,bio,is_demo) VALUES(?,?,?,?,NULL,?,1) ON CONFLICT DO NOTHING').run(
        record.id,record.name,record.username,`${record.username}@demo.orbitfolio.invalid`,
        'Perfil de demonstração com referência a um projeto público. Sem vínculo ou reivindicação pelo autor.'
      );
      const user=await tx.prepare('SELECT id,is_demo FROM users WHERE lower(username)=?').get(record.username);
      if(user?.id !== record.id || !user.is_demo) {result.skipped.push(record.id);continue;}
      await tx.prepare(`INSERT INTO projects(id,owner_id,name,description,description_text,github_url,repository_url,demo_url,languages_json,language_bytes_json,size_bytes,views,rating)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,0,0) ON CONFLICT DO NOTHING`).run(
        record.projectId,record.id,record.projectName,record.description,record.description,
        record.repositoryUrl,record.repositoryUrl,safeHttpUrl(record.externalUrl),JSON.stringify(record.languages),JSON.stringify(record.languageBytes),record.sizeBytes
      );
      result.seeded.push(record.id);
    }
    await ensureOrbits(tx);
    return result;
  });
}
